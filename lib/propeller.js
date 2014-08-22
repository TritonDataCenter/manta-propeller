// Copyright (c) 2014, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var http = require('http');
var Engine = require('./engine');
var fs = require('fs');
var manta = require('manta');
var once = require('once');
var restify = require('restify');
var SDC = require('./sdc');
var vasync = require('vasync');



//--- Globals

var DEFAULT_PORT = 8080;



//--- Server

function Propeller(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.log, 'opts.log');
        assert.arrayOfString(opts.configFiles, 'opts.configFiles');
        assert.optionalNumber(opts.port, 'opts.port');

        var self = this;
        self.log = opts.log;
        self.configFiles = opts.configFiles;
        self.port = opts.port || DEFAULT_PORT;

        //Filled in at start...
        self.config = null;
        self.sdc = null;
        self.manta = null;
        self.server = null;
}

module.exports = Propeller;


///--- Helpers

/*
 * Deep merges o2 into o1.  Note that it doesn't do deep copying, it assumes
 * that the two objects shouldn't be used independently foreverafter.
 */
function _merge(o1, o2) {
        Object.keys(o2).forEach(function (k) {
                if (o1[k] === undefined) {
                        o1[k] = o2[k];
                } else {
                        if ((typeof (o1[k])) === 'object') {
                                _merge(o1[k], o2[k]);
                        } else { // Last property wins!
                                o1[k] = o2[k];
                        }
                }
        });
}


/*
 * Merges the set of objects into a single object.  Last property wins.  Only
 * objects are merged, not arrays (that may need to change at some point).
 */
function merge() {
        assert.object(arguments[0]);
        var obj = {};
        for (var i = 0; i < arguments.length; ++i) {
                _merge(obj, arguments[i]);
        }
        return (obj);
}


function loadAndMergeFiles(files, cb) {
        var self = this;
        var res = {};
        var i = 0;
        function loadNextConfig() {
                var f = files[i];
                if (f === undefined) {
                        return (cb(null, res));
                }
                fs.readFile(f, 'utf8', function (err, j) {
                        if (err) {
                                return (cb(err));
                        }
                        try {
                                var c = JSON.parse(j);
                                self.log.debug({ config: c, file: f },
                                               'read config file');
                        } catch (e) {
                                return (cb(e));
                        }
                        self.log.info({ file: f }, 'merged config file');
                        res = merge(res, c);
                        ++i;
                        loadNextConfig();
                });
        }
        loadNextConfig();
}


function createServer(opts) {
        var self = this;
        var server = restify.createServer({
                'name': 'propeller',
                'log': opts.log
        });

        server.use(restify.acceptParser(server.acceptable));
        server.use(restify.authorizationParser());
        server.use(restify.dateParser());
        server.use(restify.queryParser());
        server.use(restify.bodyParser());
        server.use(restify.requestLogger());
        server.on('after', function (req, res, route, err) {
                // Skip logging some high frequency or unimportant endpoints to
                // keep log noise down.
                var method = req.method;
                var pth = req.path();
                if (pth === '/ping') {
                        return;
                }
                // Successful GET res bodies are uninteresting and *big*.
                var body = !(method === 'GET' &&
                             Math.floor(res.statusCode / 100) === 2);

                restify.auditLogger({
                        log: req.log.child(
                                { route: route && route.name || route }, true),
                        body: body
                })(req, res, route, err);
        });

        // Attach endpoints here

        //TODO: This should only return healthy if propeller isn't stopped.
        var pingopts = { path: '/ping', name: 'Ping'};
        server.get(pingopts, function (req, res, next) {
                res.send(200);
                return (next());
        });

        var configopts = { path: '/config', name: 'Config' };
        server.get(configopts, function (req, res, next) {
                res.send(self.config);
                return (next());
        });

        server.on('uncaughtException', function (req, res, route, err) {
                req.log.error({
                        req: req,
                        res: res,
                        route: route,
                        err: err
                }, 'uncaught exception');
                if (!res.headersSent) {
                        req.log.error('sending error response from uncaught ' +
                                      'exception');
                        res.send(err);
                }
        });

        return (server);
}



///--- API

Propeller.prototype.start = function (cb) {
        var self = this;
        var funcs = [
                function loadConfigs(_, subcb) {
                        var f = loadAndMergeFiles.bind(self);
                        f(self.configFiles, function (err, c) {
                                if (err) {
                                        return (subcb(err));
                                }
                                self.log.info(c, 'config');
                                self.config = c;
                                return (subcb());
                        });
                },
                function initSdcClients(_, subcb) {
                        subcb = once(subcb);
                        try {
                                // Need to put a log in the config so that SDC
                                // will take it.
                                var cfg = merge({}, self.config);
                                cfg.log = self.log;

                                self.sdc = new SDC(cfg);
                                self.sdc.init(subcb);
                        } catch (e) {
                                return (subcb(e));
                        }
                },
                function initMantaClient(_, subcb) {
                        var cfg = self.config.manta;
                        // config.manta will be replaced down the line...
                        self.config.mantaConfig = self.config.manta;
                        self.manta = manta.createClient(cfg);
                        setImmediate(subcb);
                },
                function startEngine(_, subcb) {
                        var cfg = merge({}, self.config);
                        cfg.log = self.log;
                        cfg.sdc = self.sdc;
                        cfg.manta = self.manta;
                        self.engine = new Engine(cfg);
                        self.engine.start(function (err) {
                                if (err) {
                                        return (subcb(err));
                                }
                                self.log.info('Engine started.');
                                return (subcb());
                        });
                },
                function startServer(_, subcb) {
                        self.server = createServer.call(self, {
                                'log': self.log
                        });
                        self.server.listen(self.port, function (err) {
                                if (err) {
                                        return (subcb(err));
                                }
                                self.log.info({ port: self.port },
                                              'Server listening.');
                                return (subcb());
                        });
                }
        ];

        vasync.pipeline({
                'funcs': funcs
        }, cb);
};
