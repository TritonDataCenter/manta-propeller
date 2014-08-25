/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');



//--- Functions

function serverCmd(opts, cb) {
        assert.object(opts, 'opts');
        assert.object(opts.log, 'opts.log');
        assert.object(opts.sdc, 'opts.sdc');
        assert.object(opts.cmd, 'opts.cmd');
        assert.object(opts.server, 'opts.server');

        var log = opts.log;
        var server = opts.server;
        var uuid = server.uuid;
        var dc = server.datacenter;
        var cnapi = opts.sdc[dc].cnapi;
        var cmd = opts.cmd;

        log.info({
                serverUuid: uuid,
                cmd: cmd
        }, 'running cmd on remote host');

        cnapi.commandExecute(uuid, cmd, function (err, res) {
                if (err) {
                        log.error(err, 'failed to execute command on %s', uuid);
                        return (cb(err));
                }

                log.info('executed command on %s', server.uuid);
                return (cb(null, res));
        });
}


function vmCmd(opts, cb) {
        assert.object(opts, 'opts');
        assert.object(opts.sdc, 'opts.sdc');
        assert.object(opts.cmd, 'opts.cmd');
        assert.object(opts.servers, 'opts.servers');
        assert.object(opts.server, 'opts.vm');


}


module.exports = {
        serverCmd: serverCmd,
        vmCmd: vmCmd
};