// Copyright (c) 2014, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var http = require('http');
var fs = require('fs');
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
}

module.exports = Propeller;



///--- API

Propeller.prototype.start = function (cb) {
        var self = this;

        // TODO: Replace later... and don't forget a ping!
        self.server = http.createServer(function (request, response) {
                self.log.info({
                        url: request.url
                }, 'request received');
                response.writeHead(204);
                response.end();
        });

        var funcs = [
                function loadConfigs(_, subcb) {
                        var i = 0;
                        // A no-op for now, but we'll need it later.
                        function loadNextConfig() {
                                var f = self.configFiles[i];
                                if (f === undefined) {
                                        return (subcb());
                                }
                                try {
                                        var j = fs.readFileSync(f);
                                        var c = JSON.parse(j);
                                        self.log.info({ config: c, file: f },
                                                      'read config file');
                                } catch (e) {
                                        return (subcb(e));
                                }
                                function reged(err) {
                                        if (err) {
                                                return (subcb(err));
                                        }
                                        ++i;
                                        loadNextConfig();
                                }
                                // This should load it into something.  As it
                                // is, that hasn't been written yet.  So...
                                setImmediate(reged);
                        }
                        loadNextConfig();
                },
                function startServer(_, subcb) {
                        self.log.info({ port: self.port },
                                      'Starting server...');
                        self.server.on('listen', subcb);
                        self.server.on('error', subcb);
                        self.server.listen(self.port);
                }
        ];

        vasync.pipeline({
                'funcs': funcs
        }, cb);

};
