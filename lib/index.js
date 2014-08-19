// Copyright (c) 2014, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var once = require('once');
var Propeller = require('./propeller');
var SDC = require('./sdc');



///--- Functions

function createAndStartServer(opts, cb) {
        assert.object(opts, 'opts');
        assert.func(cb, 'cb');
        var propeller = new Propeller(opts);
        propeller.start(function (err) {
                cb(err, propeller);
        });
        return (propeller);
}


function initSdcClients(opts, cb) {
        assert.object(opts, 'opts');
        assert.func(cb, cb);

        cb = once(cb);

        var sdc = new SDC(opts);
        sdc.on('error', cb);
        sdc.on('ready', function () {
                return (cb(null, sdc));
        });
}



///--- API

module.exports = {
        createAndStartServer: createAndStartServer,
        initSdcClients: initSdcClients
};
