/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');



///--- API

function execute(engine, vm, cb) {
        engine.cmd.onVm(vm, 'touch /var/tmp/foo', cb);
}


function cleanup(engine, vm, cb) {
        engine.cmd.onVm(vm, 'rm /var/tmp/foo', cb);
}


function check(engine, vm, cb) {
        engine.cmd.onVm(vm, '[[ -n /var/tmp/foo ]]', cb);
}


module.exports = {
        type: 'vms',
        execute: execute,
        cleanup: cleanup,
        check: check
};
