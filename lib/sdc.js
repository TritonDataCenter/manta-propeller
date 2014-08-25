/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var events = require('events');
var sdc = require('sdc-clients');
var util = require('util');
var vasync = require('vasync');



//--- Functions

/**
 * This will have cnapi and vmapi clients per DC.  They can be accessed
 * with:
 *    sdc[datacenter].vmapi
 *    sdc[datacenter].cnapi
 *
 * This will also have a sapi and ufds client for the local datacenter:
 *    sdc.sapi
 *    sdc.ufds
 */
function SDC(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.log, 'opts.log');
        assert.string(opts.dnsDomain, 'opts.dnsDomain');
        assert.string(opts.region, 'opts.region');
        assert.string(opts.datacenter, 'opts.datacenter');
        assert.object(opts.ufds, 'opts.ufds');

        var self = this;
        self.log = opts.log;
        self.dnsDomain = opts.dnsDomain;
        self.region = opts.region;
        self.datacenter = opts.datacenter;
        self.ufdsConfig = opts.ufds;

        // These will be filled in as part of init
        self.datacenters = null;

        // Clients for the local DC (cause remote DC info is already "there")
        self.ufds = null;
        self.sapi = null;
}

util.inherits(SDC, events.EventEmitter);
module.exports = SDC;



//--- Helpers

function getDcClients(opts, cb) {
        var self = this;
        var clients = {};

        function url(svc) {
                return ('http://' + svc + '.' + opts.dc + '.' + opts.dnsDomain);
        }

        vasync.pipeline({
                'funcs': [
                        function cnapi(_, subcb) {
                                self.log.debug({
                                        'client': 'cnapi',
                                        'dc': opts.dc,
                                        'url': url('cnapi')
                                });
                                clients.cnapi = new sdc.CNAPI({
                                        log: self.log,
                                        url: url('cnapi'),
                                        agent: false
                                });
                                subcb();
                        },
                        function vmapi(_, subcb) {
                                self.log.debug({
                                        'client': 'vmapi',
                                        'dc': opts.dc,
                                        'url': url('vmapi')
                                });
                                clients.vmapi = new sdc.VMAPI({
                                        log: self.log,
                                        url: url('vmapi'),
                                        agent: false
                                });
                                subcb();
                        }
                ]
        }, function (err) {
                cb(err, clients);
        });
}


function setupSingleDcClients(_, cb) {
        var self = this;
        vasync.pipeline({
                'funcs': [
                        function ufds(_2, subcb) {
                                self.log.debug({
                                        'ufdsConfig': self.ufdsConfig
                                }, 'connecting to ufds');

                                self.ufds = new sdc.UFDS(self.ufdsConfig);

                                self.ufds.on('ready', function (err) {
                                        self.log.debug({
                                                'ufdsConfig': self.ufdsConfig,
                                                'err': err
                                        }, 'ufds onReady');
                                        return (subcb(err));
                                });
                        },
                        function sapi(_2, subcb) {
                                var url = 'http://sapi.' + self.datacenter +
                                        '.' + self.dnsDomain;
                                self.log.debug({
                                        'client': 'sapi',
                                        'url': url
                                });
                                self.sapi = new sdc.SAPI({
                                        log: self.log,
                                        url: url,
                                        agent: false
                                });
                                subcb();
                        }
                ]
        }, function (err) {
                cb(err);
        });
}


function getDcs(_, cb) {
        var self = this;
        var ufds = self.ufds;
        ufds.listDatacenters(self.region, function (err, res) {
                if (err) {
                        return (cb(err));
                }
                if (res.length === 0) {
                        self.log.info({
                                res: res,
                                region: self.region
                        }, 'ufds listDatacenters result');
                        return (cb(new Error('no datacenters found')));
                }
                var dcs = [];
                res.forEach(function (datacenter) {
                        //Take the first sdc resolver we come across.
                        if (dcs.indexOf(datacenter.datacenter) === -1) {
                                dcs.push(datacenter.datacenter);
                        }
                });
                self.datacenters = dcs;
                return (cb());
        });
}


function setupXDcClients(_, cb) {
        var self = this;
        var dcs = self.datacenters;
        var i = 0;

        function setupNextClient() {
                var dc = dcs[i];
                if (dc === undefined) {
                        return (cb());
                }
                var opts = {
                        'dc': dc,
                        'dnsDomain': self.dnsDomain
                };
                getDcClients.call(self, opts, function (err, clients) {
                        if (err) {
                                cb(err);
                                return;
                        }
                        self[dc] = clients;
                        ++i;
                        setupNextClient();
                });
        }
        setupNextClient();
}


//--- API

SDC.prototype.init = function init(cb) {
        var self = this;
        vasync.pipeline({
                'funcs': [
                        setupSingleDcClients.bind(self),
                        getDcs.bind(self),
                        setupXDcClients.bind(self)
                ]
        }, function (err) {
                return (cb(err));
        });
};
