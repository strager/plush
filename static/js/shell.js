// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

define(['keys', 'history', 'cwd', 'jquery', 'models/jobManager', 'commandPoller'], function(keys, historyApi, cwd, $, jobManager, commandPoller){
  "use strict";
  
  var key = (function initializeKey() {
    var key = window.location.hash.slice(1);
    if ('' == key) {
      key = sessionStorage.getItem("key");
    } else {
      sessionStorage.setItem("key", key);
    }
    window.location.hash = "";
    return key;
  })();
  
  var screen = $('#screen');
  var scrollback = $('#scrollback');  
  var totalHeight = screen.outerHeight();
  function repeat(s,n) {
    while (s.length < n) { s = s + s; }
    return s.substr(0,n);
  }

  function repeatSpan(s,n) {
    while (s.length < n) { s = s + s; }
    var e = $('<pre></pre>');
    e.text(s.substr(0,n));
    return e;
  }

  function JobView() {
    var $node = $('<div></div>', { 'class': 'job' });
    $node.bind('click', function() {
        if($(this).children(":nth-child(2)").is(':hidden')) {
          $('#scrollback .job').children(":nth-child(2)").slideUp(); 
          $(this).children(":nth-child(2)").slideDown('normal');
        }
    });
    $node.appendTo(scrollback);

    // Folding
    $('#scrollback .job').children(":nth-child(2)").slideUp();
    $node.children(":first").slideDown('normal');

    this.$node = $node;
    this.job = null;
  }

  JobView.prototype.setJob = function(job) {
    if (this.job) {
      // API should probably be redesigned to prevent this.
      throw new Error("JobView already has a job set");
    }

    this.job = job;
    var $node = this.$node;

    this.setJobClass("running");

    var self = this;
    job.on('exit', function(exitcode) {
      self.setJobClass(exitcode === 0 ? "complete" : "failed");
    });

    job.stdout.on('data', this.addOutput.bind(this, 'stdout'));
    job.stderr.on('data', this.addOutput.bind(this, 'stdin'));

    job.jsonout.on('data', function(data) {
      self.addOutput('stdout', data.reduce(function(acc, json) {
        return acc + JSON.stringify(j, null, 4) + "\n";
      }));
    });
  };

  JobView.prototype.setJobClass = function(cls) {
    this.$node.removeClass('running complete').addClass(cls);
  };

  JobView.prototype.addOutput = function(cls, txt) {
    var $txt = $('<pre></pre>', { 'class': cls }).text(txt);
    $txt.appendTo(this.$node);

    totalHeight += $txt.outerHeight();
    scrollback.animate({ scrollTop: totalHeight });

    // TODO(jasvir): Almost certainly the wrong place to do this
    // $("#commandline")[0].scrollIntoView(true);
  }
  
  function updateContext(ctx) {
    if (ctx.cwd) {
      var partialCmd = $('#commandline').val();
      $('#context-cwd').empty().append(
        cwd.parseToDom(ctx.cwd,
          function(event) { 
            runCommand($('#commandline'), "cd " + event.data.dir); 
            $('#commandline').val(partialCmd);
          })
      );
    }
    var envList = $('#context-env');
    var shList = $('#context-shell');
    envList.empty();
    shList.empty();
    var vars = ctx.vars || [];
    vars.forEach(function(v) {
      var dt = $('<dt></dt>', { class: v.mode });
      var dd = $('<dd></dd>', { class: v.mode });
      dt.text(v.name);
      dd.text(v.value);
      if (v.scope === 'env') { envList.append(dt); envList.append(dd); }
      if (v.scope === 'shell') { shList.append(dt); shList.append(dd); }
    });
  }
  
  function updateAnnotations(comp) {
    var annoElem = $('#annotations');
    annoElem.empty();
    
    var i = 1;
    var spans = comp.spans || [];
    spans.forEach(function(span) {
      var m = "";
      span.annotations.forEach(function(anno) {
        if (anno.expansion) {
          m += 'expands to ' + anno.expansion;
        }
        else if (anno.commandType) {
          m += anno.commandType + " command"
          if (anno.path) {
            m += " @ " + anno.path
          }
        }
        else if (anno.command) {
          m += anno.command + "\n" + anno.synopsis + "\n";
        }
        else if (anno.option) {
          m += anno.option ;
        }
        else if (anno.unused) {
          m += "unused";
        }
        m += "\n";
      });
      
      m = m.trim()
      if (m) {
        if (i < span.start) {
          annoElem.append(repeatSpan(' ', span.start - i));
          i = span.start;
        }
        var blockElem = repeatSpan(' ', span.end - span.start);
        blockElem.addClass('annotation');
        annoElem.append(blockElem);
        i = span.end;
        
        var msgElem = $('<span></span>', { "class": "message" });
        msgElem.text(m);
        blockElem.append(msgElem);
      }
    });
  }
  
  function prevCommand(that, cmd, e) {
    that.val(historyApi.previous(cmd));
  }

  function nextCommand(that, cmd, e) {
    that.val(historyApi.next(cmd));
  }

  function runCommand(that, cmd, e) {
    that.val('');
    historyApi.add(cmd);
    $('#annotations').text('')
    $("#commandline").focus();

    var jobView = new JobView();
    jobManager.run(cmd, function(err, job) {
      if (err) throw err;

      jobView.setJob(job);
      jobView.addOutput('stdin', cmd);
    });
  }

  var checkTimer = null;
  $('#commandline').keyup(function(e) {
    if (checkTimer) { clearTimeout(checkTimer); checkTimer = null; }
    keys(e, {
      runCommand: runCommand,
      nextCommand: nextCommand,
      prevCommand: prevCommand,
      default: function() { checkTimer = setTimeout(runComplete, 1000); }
    })($(this), $(this).val());
  });

  var contextPoller = commandPoller('context', function(err, job) {
    if (err) throw err;

    job.jsonout.on('data', function(data) {
      data.forEach(updateContext);
    });
  });
  contextPoller.resume();

  jobManager.on('jobexit', function(job, exitcode) {
    contextPoller.resume();
  });
  
  function runComplete() {
    var cmd = $('#commandline').val();
    cmd.replace(/'/g,"'\\''");
    cmd = "complete '" + cmd + "'";
    jobManager.run(cmd, function(err, job) {
      if (err) throw err;

      job.jsonout.on('data', function(data) {
        data.forEach(updateAnnotations);
      });
    });
  }
});
