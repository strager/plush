define(['EventEmitter'], function(EventEmitter) {
  // StringStream is modeled after Node.js's
  // readable and writable streams.
  // Details here: http://nodejs.org/api/stream.html
  function StringStream() {
    EventEmitter.call(this);

    this.buffer = '';
  }

  // Inherit from EventEmitter
  // FIXME This is ugly (but correct).  Should probably be
  // extracted into its own function.
  StringStream.prototype = (function() { function P() { } P.prototype = EventEmitter.prototype; return new P(); }());

  function checkEncoding(encoding) {
    if (encoding !== 'utf8') {
      throw new Error("Only utf8 encoding allowed");
    }
  }

  // ReadableStream members
  StringStream.prototype.readable = true;
  StringStream.prototype.encoding = 'utf8';
  StringStream.prototype.paused = true;

  StringStream.prototype.setEncoding = function(encoding) {
    if (this.encoding !== encoding) {
      checkEncoding();
      this.encoding = encoding;
    }
  };

  StringStream.prototype.pause = function() {
    this.paused = true;
  };

  StringStream.prototype.resume = function() {
    this.paused = false;
    this.checkBufferLater();
  };

  StringStream.prototype.pipe = function(destination, options) {
    throw new Error("StringStream#pipe not supported");
  };

  // WritableStream members
  StringStream.prototype.writable = true;

  StringStream.prototype.write = function(string, encoding, fd) {
    // fd is ignored

    if (typeof encoding !== 'undefined') {
      checkEncoding(encoding);
      // TODO Support encoding
    }

    this.buffer += string;
    this.checkBufferLater();

    return true;
  };

  StringStream.prototype.end = function(string, encoding) {
    throw new Error("StringStream#end not supported");
  }

  // ReadableStream + WritableStream members
  StringStream.prototype.destroy = function() {
    throw new Error("StringStream#destroy not supported");
  };

  StringStream.prototype.destroySoon = function() {
    throw new Error("StringStream#destroySoon not supported");
  };

  // Internal members
  StringStream.prototype.checkBufferLater = function() {
    setTimeout(this.checkBuffer.bind(this), 0);
  };

  StringStream.prototype.checkBuffer = function() {
    if (this.paused) {
      return;
    }

    var buffer = this.buffer;
    if (buffer.length) {
      this.buffer = '';
      this.emit('data', buffer); 
    }
  };

  return StringStream;
});
