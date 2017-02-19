/*
 * index.js: Skyline REST API boilerplate
 *
 */

var cluster = require('cluster');
var restify = require('restify');
var util = require('util');
var iutil = require('island-util');
var fs = require('fs');
var Step = require('step');
var _ = require('underscore');
var _s = require('underscore.string');
var db = require('mongish');
var zmq = require('zmq');

var createInterface = exports.createInterface = function (opts, cb) {
  cb = cb || function(){};

  var clusterFrontPort = 'ipc:///tmp/cluster';
  var clusterBackPort = 'ipc:///tmp/queue';

  if (cluster.isMaster) {
    var cpus = require('os').cpus().length;
    for (var i = 0; i < cpus; ++i) {
      cluster.fork();
    }
    cluster.on('exit', function (worker) {
      util.log('Worker ' + worker.id + ' died');
      cluster.fork();
    });

    // Optionally create a worker client for the interface.
    var client;
    if (opts.workerClient) {
      client = opts.workerClient(process.pid);
      client.on('message', function (data) {

        // Inform dealer.
        queue.send(data);
      });
    }

    // Create a router and dealer for cluster messages.
    var clusterFrontSock = zmq.socket('router');
    var clusterBackSock = zmq.socket('dealer');
    clusterFrontSock.identity = 'cr' + process.pid;
    clusterBackSock.identity = 'cd' + process.pid;

    // Router handling.
    clusterFrontSock.bindSync(clusterFrontPort);
    clusterFrontSock.on('message', function () {

      // Inform server.
      clusterBackSock.send(Array.prototype.slice.call(arguments));
    });

    // Dealer handling.
    clusterBackSock.bindSync(clusterBackPort);
    clusterBackSock.on('message', function (id, del, data) {

      // Send message receipt to appropriate client.
      clusterFrontSock.send(Array.prototype.slice.call(arguments));
    });

    // Create a queue for cluster messages.
    var queue = zmq.socket('rep');
    queue.identity = 'cq' + process.pid;

    // Queue handling.
    queue.on('message', function (data) {
      if (client) {

        // Forward message with client.
        client.send(data);
      } else {

        // Inform dealer.
        queue.send(data);
      }
    });

    // Connect to router.
    queue.connect(clusterBackPort, function (err) {
      if (err) throw err;
    });
  } else {

    // Create a client for cluster messages.
    var sock = zmq.socket('req');
    sock.identity = 'cc' + process.pid;
    sock.connect(clusterFrontPort);

    // Create server.
    var server = restify.createServer();
    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.authorizationParser());
    server.use(restify.dateParser());
    server.use(restify.queryParser());
    server.use(restify.jsonp());
    server.use(restify.gzipResponse());
    server.use(restify.bodyParser());
    server.use(restify.throttle({burst: 100, rate: 50, ip: true,
      overrides: {
        '192.168.1.1': {rate: 0, burst: 0}
      }
    }));
    server.use(restify.conditionalRequest());
    if (_.isArray(opts.allowOrigins)) {
      server.use(restify.CORS({'origins': opts.allowOrigins}));
    }

    // Healthcheck
    server.get('/__hc__', function (req, res, next) {
      res.send();
      next();
    });

    Step(
      function () {

        // Open DB connection if URI is present in opts.
        if (opts.mongoURI) {
          new db.Connection(opts.mongoURI, {ensureIndexes: opts.indexDb &&
              cluster.worker.id === 1}, this);
        } else {
          this();
        }
      },
      function (err, connection) {
        if (err) return this(err);

        // Init collections.
        if (!connection || _.size(opts.collections) === 0) {
          return this();
        }
        _.each(opts.collections, _.bind(function (c, name) {
          connection.add(name, c, this.parallel());
        }, this));
      },
      function (err) {
        if (err) return this(err);

        // Init resources.
        if (_.size(opts.resources) === 0) {
          return this();
        }
        _.each(opts.resources, _.bind(function (r, name) {
          var tmp = new r[_s.capitalize(name)]({sock: sock, server: server,
              db: db, config: opts}).init(this.parallel());
        }, this));
      },
      function (err) {
        if (err) return cb(err);

        // Start server.
        server.listen(opts.port, function () {
          if (cluster.worker.id === 1) {
            util.log('REST API listening on port ' + opts.port);
          }
        });
        cb(null, server);
      }
    );
  }
}

// Parent class for resources (not to be used directly)
var Resource = exports.Resource = function (opts) {
  this.sock = opts.sock;
  this.server = opts.server;
  this.db = opts.db;
  this.config = opts.config;

  // Handle socket callbacks.
  if (this.sock) {
    this.callbacks = {};
    this.sock.on('message', _.bind(function (data) {
      data = JSON.parse(data.toString());
      var __cb = data.__cb;
      delete data.__cb;
      this.callbacks[__cb](data.msg || data.error);
      delete this.callbacks[__cb];
    }, this));

    // Send over socket w/callback support.
    this.send = _.bind(function (msg, cb) {
      var __cb = iutil.createId_32();
      this.callbacks[__cb] = cb;
      this.sock.send(JSON.stringify({__cb: __cb, msg: msg}));
    }, this);
  }
}

Resource.prototype.init = function (cb) {
  this.routes();
  cb(null, this);
}

Resource.prototype.routes = function () {
  return this;
}
