###This is boilerplate for an Island REST API riding on [Restify](https://github.com/mcavage/node-restify).

Installation:

```npm install git+https://github.com/The-Island/island-api.git#develop```

Example usage:

```
// start.js

var api = require('island-api');
var zmq = require('zmq');

api.createInterface({
  port: 8000,
  resources: {  // API routes  
    foo: require('./lib/resources/foo'),
    /* ... */
  },
  collections: {  // MongoDB collections to make available within API routes
    foo: {/* indexes, uniques, sparses */},
    /* ... */
  },
  mongoURI: 'mongodb://localhost:27017/test'  // only needed if specifying collections
  socketClient: function (pid) { // client socket generator
    var client = zmq.socket('req');
    client.identity = 'c' + pid;
    client.connect(3000);
    return client;
  }
}, function (err) { if (err) throw err; });
```

```
// foo.js

var Foo = exports.Foo = function (opts) {
  Resource.call(this, opts);
}
Foo.prototype = Object.create(Resource.prototype);
Foo.prototype.constructor = Foo;

Foo.prototype.routes = function () {

  // create
  this.server.post('/foos', _.bind(function (req, res, next) {
  	/* ... this.db.Foo.create() ... */
    res.send();
    next();
  }, this));

  // read
  this.server.get('/foos/:id', _.bind(function (req, res, next) {
    /* ... this.db.Foo.read() ... */
    res.send();
    next();
  }, this));

  // update
  this.server.put('/foos/:id', _.bind(function (req, res, next) {
	/* ... this.db.Foo.update() ... */
    res.send();
    next();
  }, this));

  // delete
  this.server.del('/foos/:id', _.bind(function (req, res, next) {
	/* ... this.db.Foo.delete() ... */
    res.send();
    next();
  }, this));

  // list
  this.server.post('/foos/list', _.bind(function (req, res, next) {
  	/* ... this.db.Foo.list() ... */
    res.send();
    next();
  }, this));

  return this;
}
```
