define(['EventEmitter'], function(EventEmitter) {
  // JsonStream is modeled after Node.js's
  // readable and writable streams.
  // Details here: http://nodejs.org/api/stream.html
  //
  // TODO Support writing utf8 (JSON text) for piping
  // TODO Support reading utf8 (JSON text) for piping
  function JsonStream() {
    EventEmitter.call(this);

    this.buffer = [];
  }

  // Inherit from EventEmitter
  // FIXME This is ugly (but correct).  Should probably be
  // extracted into its own function.
  JsonStream.prototype = (function() { function P() { } P.prototype = EventEmitter.prototype; return new P(); }());

  function checkEncoding(encoding) {
    if (encoding !== 'json') {
      throw new Error("Only json encoding allowed");
    }
  }

  // ReadableStream members
  JsonStream.prototype.readable = true;
  JsonStream.prototype.encoding = 'json';
  JsonStream.prototype.paused = true;

  JsonStream.prototype.setEncoding = function(encoding) {
    if (this.encoding !== encoding) {
      checkEncoding();
      this.encoding = encoding;
    }
  };

  JsonStream.prototype.pause = function() {
    this.paused = true;
  };

  JsonStream.prototype.resume = function() {
    this.paused = false;
    this.checkBufferLater();
  };

  JsonStream.prototype.pipe = function(destination, options) {
    throw new Error("JsonStream#pipe not supported");
  };

  // WritableStream members
  JsonStream.prototype.writable = true;

  JsonStream.prototype.write = function(data, encoding, fd) {
    // fd is ignored

    if (typeof encoding !== 'undefined') {
      checkEncoding(encoding);
      // TODO Support encoding
    }

    this.buffer.push(data);
    this.checkBufferLater();

    return true;
  };

  JsonStream.prototype.end = function(string, encoding) {
    throw new Error("JsonStream#end not supported");
  }

  // ReadableStream + WritableStream members
  JsonStream.prototype.destroy = function() {
    throw new Error("JsonStream#destroy not supported");
  };

  JsonStream.prototype.destroySoon = function() {
    throw new Error("JsonStream#destroySoon not supported");
  };

  // Internal members
  JsonStream.prototype.checkBufferLater = function() {
    setTimeout(this.checkBuffer.bind(this), 0);
  };

  JsonStream.prototype.checkBuffer = function() {
    if (this.paused) {
      return;
    }

    var buffer = this.buffer;
    if (buffer.length) {
      this.buffer = [];
      this.emit('data', buffer); 
    }
  };

  return JsonStream;
});
