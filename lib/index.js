// Copyright (c) 2014, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var Propeller = require('./propeller');



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


///--- API

module.exports = {
        createAndStartServer: createAndStartServer
};
