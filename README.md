# ZMQ Connection Pool JS

[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)
[![Dependency Status](https://david-dm.org/muzzley/zmq-pool.svg)](https://david-dm.org/muzzley/zmq-pool)
[![devDependency Status](https://david-dm.org/muzzley/zmq-pool/dev-status.svg)](https://david-dm.org/muzzley/zmq-pool#info=devDependencies)

## Warning - work in progress, the API may drastically change in the upcoming weeks

Establish a pool of ZMQ connections.

### Example

```javascript
var zmq = require('zmq');
var ZmqPool = require('./lib/ZmqPool');
var uri = 'tcp://127.0.0.1:12345';

var socket = zmq.socket('rep');
socket.bind(uri, function (err) {
  if (err) throw err;

  console.log('Server bound to ' + uri);

  socket.on('message', function (data) {
    var send = data.toString().toLowerCase();
    console.log('[SERVER] Received:', data.toString());
    socket.send(send);
  });
});

var pool = new ZmqPool({monitor: true});
var count = 0;

for (var i = 0; i < 10; i++) {
  (function () {
    var j = i;
    var connection = pool.borrow(uri, {pattern: 'req'});
    connection.connect(function (err) {
      if (err) throw err;
      connection.send('IM SENDING MSG NUM ' + j + ' AND MY ID IS ' + connection.id);
      connection.on('message', function (response) {
        console.log('[CLIENT] Received:', response.toString());
        connection.done();
        if (++count >= 10) {
          console.log('Closing...');
          pool.killAll();
          socket.close();
        }
      });
    });
  })();
}

```
