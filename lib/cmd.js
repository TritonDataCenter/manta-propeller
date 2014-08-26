/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var util = require('util');



//--- Functions

function Cmd(opts) {
        assert.object(opts, 'opts');
        assert.object(opts.log, 'opts.log');
        assert.object(opts.sdc, 'opts.sdc');
        assert.object(opts.servers, 'opts.servers');

        var self = this;
        self.log = opts.log;
        self.sdc = opts.sdc;
        self.servers = opts.servers;
}
module.exports = Cmd;



//--- API

Cmd.prototype.onServer = function onServer(server, cmd, cb) {
        assert.object(server, 'server');
        assert.string(cmd, 'cmd');
        assert.func(cb, 'cb');

        var self = this;
        var log = self.log;
        var uuid = server.uuid;
        var dc = server.datacenter;
        var cnapi = self.sdc[dc].cnapi;

        log.info({
                serverUuid: uuid,
                cmd: cmd
        }, 'running cmd on server');

        cnapi.commandExecute(uuid, cmd, function (err, res) {
                if (err) {
                        log.error(err, 'failed to execute command on %s', uuid);
                        return (cb(err));
                }

                log.info('executed command on %s', uuid);
                return (cb(null, res));
        });
};


Cmd.prototype.onVm = function onVm(vm, cmd, cb) {
        assert.object(vm, 'vm');
        assert.string(cmd, 'cmd');
        assert.func(cb, 'cb');

        var self = this;
        var log = self.log;
        var uuid = vm.uuid;
        var server = self.servers[vm.server];
        var serverUuid = server.uuid;
        var dc = server.datacenter;
        var cnapi = self.sdc[dc].cnapi;

        var scmd = util.format('/usr/sbin/zlogin %s "%s"', uuid, cmd);

        log.info({
                serverUuid: serverUuid,
                vmUuid: uuid,
                cmd: cmd,
                scmd: scmd
        }, 'running cmd on vm');

        cnapi.commandExecute(serverUuid, scmd, function (err, res) {
                if (err) {
                        log.error(err, 'failed to execute command on %s', uuid);
                        return (cb(err));
                }

                log.info('executed command on %s', uuid);
                return (cb(null, res));
        });
};
