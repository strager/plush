define(['models/jobManager', 'commandPoller'], function(jobManager, commandPoller) {
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

  var $fileTree = $('#file-tree');

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

      // TODO Super smart algorithms which don't kill the GC
      // by baleting and creating a zillion DOM nodes each
      // update.
      var $list = $('<ul>').append(entries.map(function(entry) {
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

        return $('<li>').append($link).get(0);
      }));

      $fileTree.empty().append($list);
    });
  });

  lsPoller.resume();
  jobManager.on('jobexit', function(job, exitcode) {
    lsPoller.resume();
  });
});
