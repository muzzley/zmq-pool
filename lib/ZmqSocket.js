var _ = require('lodash');
var zmq = require('zmq');
var uuid = require('uuid');

function getSocket (type, uri, options) {
  function Socket (uri, options) {
    this._callbacks = {};
    this.id = uuid.v4();
    this.connected = false;
    this.uri = uri;
    this.on = _onEvent.bind(this, false);
    this.once = _onEvent.bind(this, true);
    this.connect = _connect.bind(this);
    this.timeout = options.timeout || 5000;
  }

  function _connect (callback) {
    var self = this;
    if (self.connected) {
      return callback();
    }
    var timedOut = false;
    self.once('connect', function () {
      self.connected = true;
      self.once('disconnect', function () {
        self.connected = false;
      });
      // Hack, we need to timeout callbacks
      if (!timedOut) {
        clearTimeout(timeout);
        return callback();
      }
    });
    var timeout = setTimeout(function () {
      timedOut = true;
      return callback('Connection request to - ' + self.uri + ' timed out.');
    }, self.timeout);
    Socket.prototype.connect.call(self, self.uri);
  }

  function _onEvent (once, event, func) {
    var self = this;
    self._callbacks[event] = self._callbacks[event] || [];
    self._callbacks[event].push(func);

    var method = once ? Socket.prototype.once : Socket.prototype.on;
    if (event === 'error') {
      method.call(self, 'bind_error', func);
      method.call(self, 'accept_error', func);
      method.call(self, 'close_error', func);
      return;
    }
    method.call(self, event, func);
  }

  var prototype = {
    done: function (options) {
      options = options || {};
      var self = this;
      _.each(self._callbacks, function (listeners, event) {
        if (event === 'done') {
          return;
        }
        _.each(listeners, function (listener) {
          self.removeListener(event, listener);
        });
        self._callbacks[event] = [];
      });
      self.emit('done', self.uri, self.id, options);
    }
  };

  Socket.prototype = zmq.socket(type);
  _.extend(Socket.prototype, prototype);

  return new Socket(uri, options);
}

module.exports = getSocket;
