#!/usr/bin/env node
// Copyright (c) 2014, Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var bunyan = require('bunyan');
var fs = require('fs');
var getopt = require('posix-getopt');
var lib = require('../lib');
var path = require('path');
var vasync = require('vasync');

var LOG = bunyan.createLogger({
        'level': (process.env.LOG_LEVEL || 'debug'),
        'name': 'generate_components_config',
        'stream': process.stdout,
        'serializers': bunyan.stdSerializers
});



//--- Helpers

function usage(msg) {
        if (msg) {
                console.error(msg);
        }
        var str  = 'usage: ' + path.basename(process.argv[1]);
        str += ' [-c configFile]';
        str += ' [-f output_file]';
        console.error(str);
        process.exit(1);
}


function parseOptions() {
        var option;
        var opts = {
                'dcs': {}
        };
        var parser = new getopt.BasicParser('a:c:f:n:',
                                            process.argv);
        while ((option = parser.getopt()) !== undefined && !option.error) {
                switch (option.option) {
                case 'c':
                        opts.configFile = option.optarg;
                        break;
                case 'f':
                        opts.outputFilename = option.optarg;
                        break;
                default:
                        usage('Unknown option: ' + option.option);
                        break;
                }
        }

        // Now set some defaults.
        opts.outputFilename = opts.outputFilename ||
                '/opt/smartdc/propeller/etc/components.json';
        //Servers don't have an ip4addr for the nic tagged with 'manta', so
        // we default 'admin' here.
        opts.configFile = opts.configFile ||
                '/opt/smartdc/propeller/etc/config.json';

        //Load config file and pull what we need out of it...
        try {
                var contents = fs.readFileSync(opts.configFile, 'utf-8');
                var config = JSON.parse(contents);
        } catch (e) {
                usage('Error while reading/parsing config file: ' + e.code);
        }

        if (!config.ufds) {
                usage('Config file didn\'t contain a ufds block.');
        }
        opts.ufds = config.ufds;

        if (!config.dnsDomain) {
                usage('Config file didn\'t contain a dnsDomain.');
        }
        opts.dnsDomain = config.dnsDomain;

        if (!config.datacenter) {
                usage('Config file didn\'t contain a datacenter.');
        }
        opts.datacenter = config.datacenter;

        if (!config.region) {
                usage('Config file didn\'t contain a region.');
        }
        opts.region = config.region;

        return (opts);
}


function findVm(instance, cb) {
        var self = this;
        var uuid = instance.uuid;
        if (!instance.metadata || !instance.metadata.DATACENTER) {
                self.log.error({
                        'instance': instance
                }, 'instance has no DATACENTER');
                return (cb(new Error('instance has no DATACENTER: ' + uuid)));
        }
        var dc = instance.metadata.DATACENTER;
        var vmapi = self[dc].vmapi;
        return (vmapi.getVm({ uuid: uuid }, function (err, vm) {
                if (err && err.message === 'socket hang up') {
                        self.log.info({ uuid: uuid, dc: dc },
                                      'socket hangup, trying again');
                        return (findVm.call(self, instance, cb));
                }
                return (cb(err, vm));
        }));
}


function findServer(server, cb) {
        var self = this;
        var dcs = self.datacenters;
        vasync.forEachParallel({
                'inputs': dcs.map(function (dc) {
                        return (self[dc].cnapi);
                }),
                'func': function (client, subcb) {
                        client.getServer(server, subcb);
                }
        }, function (err, results) {
                if (results.successes.length < 1) {
                        cb(new Error('unable to get server for ' + server));
                        return;
                }
                cb(null, results.successes[0]);
        });
}



//--- Main

var _opts = parseOptions();
LOG.debug(_opts);
_opts.log = LOG;

vasync.pipeline({
        'arg': _opts,
        'funcs': [
                function setupSdcClients(_, subcb) {
                        lib.initSdcClients(_opts, function (err, sdc) {
                                if (err) {
                                        return (subcb(err));
                                }
                                _.sdc = sdc;
                                return (subcb());
                        });
                },
                function lookupPoseidon(_, subcb) {
                        _.log.debug({
                                'datacenter': _.datacenter
                        }, 'connecting to ufds in dc');
                        var ufds = _.sdc.ufds;
                        ufds.getUser('poseidon', function (err, user) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                _.poseidon = user;
                                _.log.debug({
                                        'uuid': _.poseidon.uuid
                                }, 'found poseidon');
                                subcb();
                        });
                },
                function lookupMantaApplication(_, subcb) {
                        _.log.debug({
                                'datacenter': _.datacenter
                        }, 'connecting to sapi in dc to get manta application');
                        var sapi = _.sdc.sapi;
                        var search = {
                                'name': 'manta',
                                'owner_uuid':  _.poseidon.uuid,
                                'include_master': true
                        };
                        sapi.listApplications(search, function (err, apps) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                if (apps.length < 1) {
                                        subcb(new Error('unable to find the ' +
                                                        'manta application'));
                                        return;
                                }
                                _.manta = apps[0];
                                _.log.debug({
                                        'manta': _.manta.uuid
                                }, 'found the manta application');
                                subcb();
                        });
                },
                function lookupInstances(_, subcb) {
                        _.log.debug({
                                'datacenter': _.datacenter
                        }, 'connecting to sapi in dc to lookup instances');
                        var sapi = _.sdc.sapi;
                        function onr(err, objs) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }

                                _.sapiInstances = {};
                                var svcs = Object.keys(objs.instances);
                                for (var i = 0; i < svcs.length; ++i) {
                                        var svc_uuid = svcs[i];
                                        var ins = objs.instances[svc_uuid];
                                        for (var j = 0; j < ins.length; ++j) {
                                                var o = ins[j];
                                                var k = o.uuid;
                                                _.sapiInstances[k] = o;
                                        }
                                }
                                _.log.debug({
                                        'instances': Object.keys(
                                                _.sapiInstances).sort()
                                }, 'found sapi instances');
                                subcb();
                        }

                        var op = {
                                'include_master': true
                        };
                        sapi.getApplicationObjects(_.manta.uuid, op, onr);
                },
                function lookupVms(_, subcb) {
                        _.log.debug('looking up vms');
                        var inputs = Object.keys(_.sapiInstances).map(
                                function (k) {
                                        return (_.sapiInstances[k]);
                                });
                        vasync.forEachParallel({
                                'inputs': inputs,
                                'func': findVm.bind(_.sdc)
                        }, function (err, results) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                _.vmapiVms = {};
                                var opers = results.operations;
                                for (var i = 0; i < opers.length; ++i) {
                                        var uuid = inputs[i].uuid;
                                        var res = opers[i].result;
                                        _.vmapiVms[uuid] = res;
                                }
                                _.log.debug({
                                        'vms': Object.keys(_.vmapiVms).sort()
                                }, 'found vmapi vms');
                                subcb();
                        });
                },
                function lookupServers(_, subcb) {
                        _.log.debug('looking up servers');
                        var servers = [];
                        var vms = Object.keys(_.vmapiVms);
                        for (var i = 0; i < vms.length; ++i) {
                                var vm = _.vmapiVms[vms[i]];
                                var server = vm.server_uuid;
                                if (servers.indexOf(server) === -1) {
                                        servers.push(server);
                                }
                        }
                        vasync.forEachParallel({
                                'inputs': servers,
                                'func': findServer.bind(_.sdc)
                        }, function (err, results) {
                                if (err) {
                                        subcb(err);
                                        return;
                                }
                                var opers = results.operations;
                                _.cnapiServers = {};
                                for (var j = 0; j < opers.length; ++j) {
                                        var uuid = servers[j];
                                        var res = opers[j].result;
                                        _.cnapiServers[uuid] = res;
                                }
                                _.log.debug({
                                        'servers': Object.keys(
                                                _.cnapiServers).sort()
                                }, 'found cnapi servers');
                                subcb();
                        });
                },
                function gatherComponents(_, subcb) {
                        _.log.debug('gathering components');
                        var instances = Object.keys(_.sapiInstances);
                        _.components = {
                                'servers': {},
                                'vms': {}
                        };

                        //First the regular applications...
                        for (var i = 0; i < instances.length; ++i) {
                                var uuid = instances[i];
                                var instance = _.sapiInstances[uuid];
                                var vm = _.vmapiVms[uuid];
                                var server_uuid = vm.server_uuid;
                                var sv = _.cnapiServers[server_uuid];

                                //Not something we're interested in...
                                if (!vm.tags ||
                                    !vm.tags.manta_role ||
                                    vm.tags.manta_role === 'propeller') {
                                        continue;
                                }

                                LOG.trace({
                                        uuid: uuid,
                                        instance: instance,
                                        vm: vm,
                                        server_uuid: server_uuid,
                                        server: sv
                                });

                                // Add vm
                                var vmdet = {
                                        'uuid': uuid,
                                        'role': instance.params.tags.manta_role,
                                        'datacenter': sv.datacenter,
                                        'server': server_uuid,
                                        'shard': instance.metadata.SHARD,
                                        'manta_ip': instance.metadata.MANTA_IP,
                                        'admin_ip': instance.metadata.ADMIN_IP
                                };

                                _.components.vms[uuid] = vmdet;

                                // Add server (if it's not already there)
                                var serdet = {
                                        'uuid': server_uuid,
                                        'datacenter': sv.datacenter,
                                        'hostname': sv.hostname,
                                        'headnode': sv.headnode
                                };

                                var nis = sv.sysinfo['Network Interfaces'];
                                Object.keys(nis).forEach(function (nic_name) {
                                        var nic = nis[nic_name];
                                        var ip = nic.ip4addr;
                                        if (!nic['NIC Names'] || !ip) {
                                                return;
                                        }
                                        nic['NIC Names'].forEach(function (n) {
                                                serdet[n + '_ip'] = ip;
                                        });
                                });

                                if (!_.components.servers[server_uuid]) {
                                        var svs = _.components.servers;
                                        svs[server_uuid] = serdet;
                                }
                        }

                        subcb();
                },
                function writeFile(_, subcb) {
                        var serialized = JSON.stringify(_.components, null, 2);
                        fs.writeFileSync(_.outputFilename, serialized);
                        return (subcb());
                }
        ]
}, function (err) {
        if (err) {
                LOG.fatal(err);
                process.exit(1);
        }

        LOG.debug('Done.');
        process.exit(0);
});
