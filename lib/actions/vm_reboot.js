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
        // Compute nodes can't be rebooted manually since they are controlled
        // by the marlin agent.
        if (vm.role === 'compute') {
                return (setImmediate(cb));
        }

        var dc = vm.datacenter;
        var vmapi = engine.sdc[dc].vmapi;
        if (!vmapi) {
                engine.log.error({
                        vm: vm
                }, 'no vmapi for vm.  Not rebooting.');
                return (setImmediate(cb));
        }
        vmapi.rebootVm({ 'uuid': vm.uuid }, function (err) {
                if (err) {
                        return (cb(err));
                }
                //We won't always know if the reboot made it through since
                // vmapi doesn't always see the state change.  There may be
                // a better way...
                engine.log.info('sleeping for 20 seconds to let reboot go' +
                               'through');
                return (setTimeout(cb, 20000));
        });
}


function check(engine, vm, cb) {
        var dc = vm.datacenter;
        var vmapi = engine.sdc[dc].vmapi;
        vmapi.getVm({ 'uuid': vm.uuid }, function (err, vmg) {
                engine.log.info({
                        err: err,
                        vmg: vmg.uuid
                }, 'got vm');
                if (err) {
                        return (cb(err));
                }
                if (vmg.state !== 'running') {
                        return (new Error('vm is in state ' + vmg.state));
                }
                return (cb());
        });
}


module.exports = {
        type: 'vms',
        execute: execute,
        check: check
};
