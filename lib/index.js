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
        sdc.init(function (err) {
                return (cb(err, sdc));
        });
}



///--- API

module.exports = {
        createAndStartServer: createAndStartServer,
        initSdcClients: initSdcClients
};
