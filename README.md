# Joyent Engineering Guide

Repository: <git@git.joyent.com:propeller.git>
Browsing: <https://mo.joyent.com/propeller>
Who: Nate Fitch
Docs: <https://mo.joyent.com/docs/propeller>
Tickets/bugs: <https://devhub.joyent.com/jira/browse/MANTA>


# Overview

Propeller is a Manta component that wreaks havoc, causing components to fail
and otherwise seeing if Manta can stand up to abuse.

# Repository

    deps/           Git submodules and/or commited 3rd-party deps should go
                    here. See "node_modules/" for node.js deps.
    docs/           Project docs (restdown)
    lib/            Source files.
    node_modules/   Node.js deps, either populated at build time or commited.
                    See Managing Dependencies.
    smf/manifests   SMF manifests
    smf/methods     SMF method scripts
    test/           Test suite (using node-tap)
    tools/          Miscellaneous dev/upgrade/deployment tools and data.
    Makefile
    package.json    npm module info (holds the project version)
    README.md


# Development

TODO


# Testing

    ./build/node/bin/node server.js -c etc/config.json -p 8080

Though it's going to be kinda difficult to test outside of an sdc deployment...
