/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var once = require('once');
var vasync = require('vasync');



//--- Globals

// How long after the last full iteration this will start the next set of
// actions
var ENGINE_RUN_RATE = 30000;
var MANTA_POLL_RATE = 15000;


//--- Server

function Engine(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.log, 'opts.log');
        assert.object(opts.sdc, 'opts.sdc');
        assert.object(opts.servers, 'opts.servers');
        assert.object(opts.vms, 'opts.vms');
        assert.object(opts.manta, 'opts.manta');
        assert.object(opts.mantaConfig, 'opts.mantaConfig');

        var self = this;

        self.running = false;
        self.runTimeout = undefined;

        self.log = opts.log;
        self.sdc = opts.sdc;

        self.servers = opts.servers;
        self.vms = opts.vms;
        self.manta = opts.manta;
        self.mantaConfig = opts.mantaConfig;

        self.outstandingActions = [];
        self.previousActions = [];
        self.status = {
                error: undefined,
                mantaHealthy: 'unknown',
                mantaErr: undefined,
                outstandingActions: self.oustandingActions,
                previousActions: self.previousActions
        };
}

module.exports = Engine;



///--- Helpers

//Should probably go through a suite of things since this only would test one
// index shard (plus the services above it)
function healthCheckManta(cb) {
        cb = once(cb);
        var self = this;
        var user = self.mantaConfig.user;
        var path = '/' + user + '/public';
        self.manta.ls(path, {}, function (err, res) {
                if (err) {
                        return (cb(err));
                }
                res.on('error', function (err2) {
                        return (cb(err2));
                });
                res.on('end', function () {
                        return (cb());
                });
        });
}


function waitForManta(_, cb) {
        if (!this.running) {
                setImmediate(cb);
        }

        var self = this;
        self.status.mantaHealthy = 'unknown';
        self.status.mantaErr = undefined;
        self.log.info('checking manta');
        healthCheckManta.call(self, function (err) {
                if (err) {
                        self.log.info(err, 'manta not healthy');
                        self.status.mantaHealthy = false;
                        self.status.mantaErr = err;
                        return (setTimeout(waitForManta.bind(self, _, cb),
                                           MANTA_POLL_RATE));
                }
                self.status.mantaHealthy = true;
                self.status.mantaErr = undefined;
                self.log.info('manta healthy');
                return (cb());
        });
}


function testAction(_, cb) {
        var self = this;
        var cmd = require('./cmd');
        var server = self.servers[Object.keys(self.servers)[0]];
        var c = 'ls /var/tmp';

        self.log.info({
                server: server,
                command: c
        }, 'performing test something...');

        var opts = { log: self.log, server: server, cmd: c, sdc: self.sdc };
        cmd.serverCmd(opts, function (err, res) {
                return (cb());
        });
}


// Runs once, then schedules itself for ENGINE_RUN_RATE
function nextIter() {
        if (!this.running) {
                return;
        }

        var self = this;
        self.log.info('starting next iteration');

        vasync.pipeline({
                'funcs': [
                        // Check manta before we get started in case stop/start
                        waitForManta.bind(self),
                        testAction.bind(self),
                        // Check manta as last step
                        waitForManta.bind(self)
                ]
        }, function (err) {
                if (err) {
                        self.status.error = err;
                        self.log.error(err, 'error on engine iteration');
                }
                self.status.error = undefined;
                if (self.running) {
                        self.log.info('iteration complete: scheduling next');
                        self.runTimeout = setTimeout(nextIter.bind(self),
                                                     ENGINE_RUN_RATE);
                } else {
                        self.log.info('iteration complete');
                }
        });
}



///--- API

Engine.prototype.start = function (cb) {
        var self = this;

        if (self.running) {
                return (setImmediate(cb));
        }

        self.running = true;
        nextIter.call(self);
        setImmediate(cb);
};


Engine.prototype.stop = function (cb) {
        var self = this;
        self.running = false;
        if (self.runTimeout) {
                clearTimeout(self.runTimeout);
                self.runTimeout = undefined;
        }
        setImmediate(cb);
};
