define(['models/jobManager', 'commandPoller', 'annotations'], function(jobManager, commandPoller, annotations) {
  function hasOwn(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  var TYPE_DIRECTORY = 'd';
  var TYPE_FILE = 'f';
  var TYPE_UNKNOWN = '?';

  function parseLSPermissions(rawPerms) {
    // TODO Actual permissions
    return {
      directory: /^d/.test(rawPerms)
    };
  }

  var STR_RE_SPLIT_COLUMNS = '^' + Array(9).join('(.*?)\\s+') + '(.*)$';
  var RE_SPLIT_COLUMNS = new RegExp(STR_RE_SPLIT_COLUMNS);

  function parseLSOutput(rawOutput) {
    var rawEntries = rawOutput.split(/[\r\n]+/g);
    if (/^total/.test(rawOutput)) {
      rawEntries.splice(0, 1);
    }

    return rawEntries.filter(function(x) {
      return x;
    }).map(function(rawEntry) {
      // Array#split sucks and doesn't let us split the
      // entire string into N columns.  (Using split's
      // argument is equivalent to calling slice after
      // split.)
      var rawColumns = RE_SPLIT_COLUMNS.exec(rawEntry);
      if (!rawColumns) {
        return {
          type: TYPE_UNKNOWN,
          perms: { },
          subEntryCount: NaN,
          owner: null,
          group: null,
          size: NaN,
          mtime: null,
          name: "Error parsing: " + rawEntry
        };
      }
      rawColumns.splice(0, 1);

      var perms = parseLSPermissions(rawColumns[0]);
      var subEntries = Number(rawColumns[1]);
      var owner = rawColumns[2];
      var group = rawColumns[3];
      var size = Number(rawColumns[4]);
      var rawMonth = rawColumns[5];
      var rawDay = rawColumns[6];
      var rawTime = rawColumns[7];
      var name = rawColumns[8];

      return {
        type: perms.directory ? TYPE_DIRECTORY : TYPE_FILE,
        perms: perms,
        subEntryCount: subEntries,
        owner: owner,
        group: group,
        size: size,
        mtime: new Date(),  // TODO
        name: name
      };
    });
  }

  function FileTreeView($node) {
    this.$node = $node;
    this.$list = $('<ul>').appendTo($node.empty());  // HACK
    this.entries = [];

    // Each <li> contains a jQuery data object keyed
    // 'entry'.
    this.liByName$ = {};
  }

  FileTreeView.prototype.setEntries = function(entries) {
    // TODO Super smart algorithms which don't kill the GC by
    // baleting and creating a zillion DOM nodes each update.
    var lis$ = entries.map(this.makeLi$, this);

    this.$list.empty().append(lis$.map(function($li) {
      // jQuery([...]) only accepts raw DOM nodes as array
      // elements.  It does not concatenate jQuery objects.
      return $li.get(0);
    }));

    this.entries = entries;
    this.liByName$ = {};
    this.entries.forEach(function(entry, i) {
      this.liByName$[entry.name] = lis$[i];
    }, this);
  };

  FileTreeView.prototype.clearAnnotations = function() {
    fileTreeView.$list.find('.expanded').removeClass('expanded');
  };

  FileTreeView.prototype.annotateNames = function(names) {
    names.forEach(function(name) {
      var parts = name.split(/\//g);
      var $li = this.makeLiPath$(parts);
      $li.addClass('expanded');
    }, this);
  };

  FileTreeView.prototype.makeLi$ = function(entry) {
      var $link;
      if (entry.type === TYPE_DIRECTORY) {
        $link = $('<a>')
          .attr('href', 'run:cd ' + entry.name)
          .text(entry.name + '/')
          .click(function() {
            // TODO Escape!!!
            jobManager.run('cd \'' + entry.name + '\'');
            return false;
          });
      } else {
        $link = $('<span>').text(entry.name);
      }

      var $li = $('<li>').append($link);
      $li.data('entry', entry);
      return $li;
  };

  FileTreeView.prototype.getLiUl$ = function($li) {
    var $ul = $li.children('ul');
    if ($ul.length === 0) {
      $ul = $('<ul>').appendTo($li);
    }
    return $ul;
  };

  // `parts` can be either a list of strings (i.e. a path
  // split on '/') or a list of entries.
  FileTreeView.prototype.makeLiPath$ = function(parts) {
    var names = parts.map(function(part) {
      if (typeof part === 'string') {
        return part;
      } else {
        return part.name;
      }
    });

    // Find an existing <li>.
    var $existing = null;
    var i = names.length;
    while (i --> 0) {
      var name = names.slice(0, i + 1).join('/');
      if (hasOwn(this.liByName$, name)) {
        $existing = this.liByName$[name];
        break;
      }
    }

    var consumed = i + 1;

    if (consumed === names.length) {
      // An <li> at the full path already exists.  (Woot!)
      return $existing;
    }

    var entries = parts.map(function(part, i, array) {
      if (typeof part === 'string') {
        var isDir = false;  // TODO figure this out somehow?
        return {
          type: isDir ? TYPE_DIRECTORY : TYPE_FILE,
          perms: { },
          subEntryCount: NaN,
          owner: null,
          group: null,
          size: NaN,
          mtime: null,
          name: part
        };
      } else {
        return part;
      }
    });

    var $ul = $existing ? this.getLiUl$($existing) : this.$list;
    var $li;
    for (i = consumed; i < entries.length; ++i) {
      $li = this.makeLi$(entries[i]);
      var fullName = names.slice(0, i + 1).join('/');
      this.liByName$[fullName] = $li;

      // TODO Insert in sorted order
      $ul.append($li);

      $ul = this.getLiUl$($li);
    }

    return $li;
  };

  FileTreeView.prototype.getEntryByName$ = function(name) {
    for (var i = 0; i < this.entries.length; ++i) {
      if (this.entries[i].name === name) {
        return this.$list.children().eq(i);
      }
    }

    return $([]);
  };

  var fileTreeView = new FileTreeView($('#file-tree'));

  var lsPoller = commandPoller('ls -la', function(err, job) {
    var buffer = '';
    job.stdout.on('data', function(data) {
      buffer += data;
    });

    job.on('exit', function(exitcode) {
      if (exitcode !== 0) {
        return;
      }

      var entries = parseLSOutput(buffer);
      fileTreeView.setEntries(entries);
    });
  });

  lsPoller.resume();
  jobManager.on('jobexit', function(job, exitcode) {
    lsPoller.resume();
  });

  annotations.on('reset', function() {
    fileTreeView.clearAnnotations();
  });

  annotations.on('update', function(annotationData) {
    // XXX Note that we push onto the accumulator, mutating the
    // array, for efficiency reasons.
    var spans = annotationData.spans || [];
    var names = spans.reduce(function(acc, spanData) {
      spanData.annotations.reduce(function(acc, annoData) {
        if (annoData.expansion) {
          acc.push(annoData.expansion);
        }

        return acc;
      }, acc);

      return acc;
    }, []);

    fileTreeView.annotateNames(names);
  });
});
