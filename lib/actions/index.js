/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var assert = require('assert-plus');
var test = require('./test');
var vm_reboot = require('./vm_reboot');



///--- API

//TODO: build this automagically.
module.exports = {
        test: test,
        vm_reboot: vm_reboot
};
