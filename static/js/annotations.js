define(['models/jobManager', 'EventEmitter'], function(jobManager, EventEmitter) {
  // The annotations manager fires the following events:
  //
  // update(annotationData, cmd) when annotation data arrives
  // reset(cmd) when annotation data starts arriving
  var annotations = new EventEmitter();

  function checkAnnotations(cmd) {
    var completeCmd = "complete '" + cmd.replace(/'/g,"'\\''") + "'";
    jobManager.runHidden(completeCmd, function(err, job) {
      if (err) throw err;

      annotations.emit('reset', cmd);

      job.jsonout.on('data', function(data) {
        data.forEach(function(annotationData) {
          annotations.emit('update', annotationData, cmd);
        });
      });
    });
  }

  annotations.check = checkAnnotations;
  return annotations;
});
