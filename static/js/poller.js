define([ 'EventEmitter' ], function(EventEmitter) {
  // Ideally, something like socket.io or some industry-strength comet
  // implementation will replace this.

  // Note that initially, pollers start paused.  You must manually start a
  // poller by calling .resume().
  function poller(pollInterval) {
    var emitter = new EventEmitter();

    pollInterval = pollInterval || 30;

    var timer = null;
    var polling = false;

    function queuePoll() {
      timer = setTimeout(function() {
        // We queue up the next poll immediately, because a callback may e.g.
        // pause the poll loop and this handles such things gracefully.
        queuePoll();

        emitter.emit('poll');
      }, pollInterval);
    }

    function pause() {
      if (polling) {
        clearTimeout(timer);
        polling = false;
      }
    }

    function resume() {
      if (!polling) {
        queuePoll();
        polling = true;
      }
    }

    emitter.pause = pause;
    emitter.resume = resume;

    return emitter;
  }

  return poller;
});
