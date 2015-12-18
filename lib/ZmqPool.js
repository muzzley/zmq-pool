var zmq = require('zmq');
var _ = require('lodash');
var Socket = require('./ZmqSocket');

function ZmqPool (options) {
  options = options || {};
  this.monitors = {};
  this.connections = {};
  this.availableConnections = {};
  this.concurrency = {};

  // TODO match with selected patterns on options
  this._patterns = {
    push: true,
    pull: true,
    pub: true,
    sub: true,
    req: true,
    rep: true
  };
  this.monitor = options.monitor;
  this.logger = options.logger || console;
  this.timeout = options.timeout || 5000;
  this.minimumConcurrent = options.minimumConcurrent || 10;
}

ZmqPool.prototype.events = _.invert(zmq.events);
// Add new event "error"
_.extend(ZmqPool.prototype.events, {error: -1});

ZmqPool.prototype.borrow = function (uri, options) {
  var pattern = options.pattern || 'req';
  this._checkPattern(uri, pattern);
  // this.logger.debug('Borrowing connection num ' + ((this.concurrency[uri] || 0) + 1));
  return this._getConnection(uri, pattern, options);
};

ZmqPool.prototype.killAll = function () {
  var self = this;
  _.each(self.connections, function (connection) {
    connection.unmonitor();
    connection.close();
  });
  self.monitors = {};
  self.connections = {};
  self.availableConnections = {};
};

// ZmqPool.prototype.on = function (event, callback) {
//   var self = this;
//   if (!self.events[event]) {
//     throw new Error('Invalid event selected - ' + event);
//   }
//   self.monitors[event] = self.monitors[event] || [];
//   self.monitors[event].push(callback);
//   _.each(self.connections, function (connection) {
//     // Add new event "error"
//     if (event === 'error') {
//       connection.on('bind_error', callback);
//       connection.on('accept_error', callback);
//       connection.on('close_error', callback);
//       return;
//     }
//     connection.on(event, callback);
//   });
// };

// ZmqPool.prototype.killMonitors = function () {
//   var self = this;
//   _.each(self.monitors, function (monitors, event) {
//     _.each(monitors, function (monitor) {
//       _.each(self.connections, function (connection) {
//         connection.removeListener(event, monitor);
//       });
//     });
//   });
// };

ZmqPool.prototype._getConnection = function (uri, type, options) {
  var self = this;
  var connection;
  var connectionId;
  if (self.availableConnections[uri] && self.availableConnections[uri].length > 0) {
    connectionId = self.availableConnections[uri].shift();
    connection = self.connections[connectionId];
  } else {
    connection = new Socket(type, uri, {timeout: options.timeout || this.timeout});
    connectionId = connection.id;
    connection.on('done', self._onDone.bind(self));
    self.connections[connectionId] = connection;
    self.concurrency[uri] = self.concurrency[uri] || 0;
    self.concurrency[uri]++;
    if (self.monitor) {
      if (!connection.monitoring) {
        connection.monitoring = true;
        self.setMonitors(connection);
        connection.monitor();
      }
    }
  }
  return connection;
};

ZmqPool.prototype._onDone = function (uri, connectionId, options) {
  var self = this;
  if (options.kill || self.concurrency[uri] > self.minimumConcurrent) {
    self.connections[connectionId].unmonitor();
    self.connections[connectionId].close();
    delete self.connections[connectionId];
    self.concurrency[uri]--;
    // this.logger.debug('Killing connection num ' + this.concurrency[uri]);
    return;
  }
  self.availableConnections[uri] = self.availableConnections[uri] || [];
  self.availableConnections[uri].push(connectionId);
};

ZmqPool.prototype.setMonitors = function (connection) {
  var self = this;
  connection.on('error', self._onError.bind(self));
  connection.on('connect', self._onConnect.bind(self));
  connection.on('disconnect', self._onDisconnect.bind(self));
  connection.on('connect', function () {
    connection.once('close', self._onClose.bind(self));
  });

  // TODO review all this monitoring
  var attempts = 0;
  connection.on('monitor_error', function (err) {
    attempts++;
    connection.monitoring = false;
    self.logger.error('Error in monitoring, will restart monitoring in ' + self.timeout + ' ms', {err: err});
    if (attempts > 5) {
      attempts = 0;
      return;
    }
    setTimeout(function () {
      connection.monitoring = true;
      connection.monitor();
    }, self.timeout);
  });
  return connection;
};

ZmqPool.prototype._checkPattern = function (uri, type) {
  if (!this._patterns[type]) {
    throw new Error('Invalid type selected - ' + type);
  }
  if (this.connections[uri] && this.connections[uri].type !== type) {
    throw new Error('Selected connection is already being used with another type - ' + this.connections[uri].type);
  }
};

ZmqPool.prototype._onClose = function (value, addr) {
  this.logger.trace('Connection closed on: ' + addr);
};

ZmqPool.prototype._onError = function (value, addr) {
  this.logger.error('Connection error on: ' + addr, value);
};

ZmqPool.prototype._onDisconnect = function (value, addr) {
  this.logger.trace('Disconected from: ' + addr);
};

ZmqPool.prototype._onConnect = function (value, addr) {
  this.logger.trace('Connected to: ' + addr);
};

module.exports = ZmqPool;
