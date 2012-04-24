define(['models/jobManager', 'poller'], function(jobManager, poller) {
  function commandPoller(cmd, callback) {
    var myPoller = poller();
    var runningJob = null;
    myPoller.on('poll', function() {
      if (runningJob) {
        //runningJob.kill();  // TODO
      }
      runningJob = null;

      myPoller.pause();

      var cmdString = typeof cmd === 'function' ? cmd() : cmd;
      jobManager.runHidden(cmdString, function(err, job) {
        if (err) return callback(err);

        if (runningJob) {
          // Another job already running
          //job.kill();  // TODO
          return;
        }

        runningJob = job;

        job.on('exit', function(exitcode) {
          setTimeout(function() { // HACK
            if (runningJob === job) {
              runningJob = null;
            }
          }, 0);
        });

        callback(null, job);
      });
    });

    return myPoller;
  }

  return commandPoller;
});
