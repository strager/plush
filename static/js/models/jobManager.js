define(['EventEmitter', 'poller', 'StringStream', 'JsonStream'], function(EventEmitter, poller, StringStream, JsonStream) {
  function hasOwn(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  // The Job class is modeled after Node.js's
  // ChildProcess class.
  // Details here: http://nodejs.org/api/child_process.html
  function Job(name, fids) {
    EventEmitter.call(this);

    this.name = name;
    this.running = false;

    if (typeof fids === 'undefined') {
      this.stdin = new StringStream();
      this.stdout = new StringStream();
      this.stderr = new StringStream();
      this.jsonin = new JsonStream();
      this.jsonout = new JsonStream();

      this.stdin.resume();
      this.stdout.resume();
      this.stderr.resume();
      this.jsonin.resume();
      this.jsonout.resume();
    } else {
      this.stdin = fids.stdin;
      this.stdout = fids.stdout;
      this.stderr = fids.stderr;
      this.jsonin = fids.jsonin;
      this.jsonout = fids.jsonout;
    }
  }

  // Inherit from EventEmitter
  // FIXME This is ugly (but correct).  Should probably be
  // extracted into its own function.
  Job.prototype = (function() { function P() { } P.prototype = EventEmitter.prototype; return new P(); }());

  // The job manager fires the following events:
  //
  // jobrun(job, cmd) when a job begins to run.
  // jobexit(job, exitcode) when a job terminates.
  var jobManager = new EventEmitter();

  var runningJobs = { };
  jobManager.runningJobs = runningJobs;

  // Hidden jobs are jobs which do not have global
  // notifications.  In other words, jobrun and jobexit
  // are not emitted on jobManager for hidden jobs.
  var hiddenJobs = [ ];

  // The unknown job is where data for unknown jobs is sent.
  var unknownJob = new Job('unknown');
  jobManager.unknownJob = unknownJob;

  // Each time we start a new job, we need to give it a unique
  // name with which to identify it.  I personally think the
  // server should generate the job name, but whatever.
  var latestJobNameInc = 0;

  function newJobName() {
    ++latestJobNameInc;
    return 'job_' + latestJobNameInc;
  }

  function getJobByName(jobName) {
    if (typeof jobName !== 'string') {
      // Invalid job names yield the unknown job.
      return unknownJob;
    }

    if (hasOwn(runningJobs, jobName)) {
      return runningJobs[jobName];
    }

    return unknownJob;
  }

  // FIXME This is definitely not the right place for this
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

  function api(call, req, callback) {
    $.ajax({
      contentType: 'application/json',
      data: JSON.stringify({key: key, req: req}),
      dataType: 'json',
      error: function(xhr, stat, err) {
        callback(err);
      },
      processData: false,
      success: function(data, stat, xhr) {
        callback(null, data);
      },
      type: 'POST',
      url: '/api/' + call
    });
  }

  function processJobUpdate(job, jobUpdate) {
    if ('stdout' in jobUpdate) {
      job.stdout.write(jobUpdate.stdout);
    }
    if ('stderr' in jobUpdate) {
      job.stderr.write(jobUpdate.stderr);
    }
    if ('jsonout' in jobUpdate) {
      jobUpdate.jsonout.forEach(function(data) {
        job.jsonout.write(data, 'json');
      });
    }

    if ('running' in jobUpdate) {
      job.running = !!jobUpdate.running;
      if (!job.running) {
        delete runningJobs[job.name];

        var exitcode = jobUpdate.exitcode || 0;
        job.emit('exit', exitcode);

        var hiddenIndex = hiddenJobs.indexOf(job);
        if (hiddenIndex >= 0) {
          // Job is hidden; don't emit jobexit
          hiddenJobs.splice(hiddenIndex, 1);
        } else {
          jobManager.emit('jobexit', job, exitcode);
        }
      }
    }
  }

  var isPolling = false;

  var jobUpdatePoller = poller();
  jobUpdatePoller.on('poll', function() {
    jobUpdatePoller.pause();

    api('poll', null, function(err, jobUpdates) {
      if (err) {
        // What do?
        console.error(err);
        jobUpdatePoller.resume();
        return;
      }

      jobUpdates.forEach(function(jobUpdate) {
        var job = getJobByName(jobUpdate.job);
        processJobUpdate(job, jobUpdate);
      });

      var jobsRunning = jobUpdates.forEach(function(jobUpdate) {
        return jobUpdate.running;
      });

      if (jobsRunning) {
        jobUpdatePoller.resume();
      }
    });
  });

  function runRaw(cmd, callback) {
    var jobName = newJobName();
    api('run', {job: jobName, cmd: cmd}, function(err, data) {
      if ('parseError' in data) {
        return callback(new SyntaxError(data.parseError));
      }

      callback(null, data);
    });
  }

  function run(cmd, callback) {
    var jobName = newJobName();
    api('run', {job: jobName, cmd: cmd}, function(err, data) {
      if (err) return callback(err);

      jobName = data.job;

      jobUpdatePoller.resume();

      var job = new Job(jobName);
      runningJobs[jobName] = job;
      jobManager.emit('jobrun', job, cmd);

      if (typeof callback === 'function') {
        callback(null, job);
      }
    });
  }

  function runHidden(cmd, callback) {
    runRaw(cmd, function(err, data) {
      if (err) return callback(err);

      jobName = data.job;

      jobUpdatePoller.resume();

      var job = new Job(jobName);
      runningJobs[jobName] = job;
      hiddenJobs.push(job);

      if (typeof callback === 'function') {
        callback(null, job);
      }
    });
  }

  jobManager.run = run;
  jobManager.runHidden = runHidden;
  return jobManager;
});
