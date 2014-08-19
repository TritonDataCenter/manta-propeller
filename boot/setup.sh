#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-

set -o xtrace

SOURCE="${BASH_SOURCE[0]}"
if [[ -h $SOURCE ]]; then
    SOURCE="$(readlink "$SOURCE")"
fi
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
SVC_ROOT=/opt/smartdc/propeller

source ${DIR}/scripts/util.sh
source ${DIR}/scripts/services.sh


export PATH=$SVC_ROOT/build/node/bin:/opt/local/bin:/usr/sbin/:/usr/bin:$PATH

function manta_add_propeller_to_path {
    while IFS='' read -r line
    do
        if [[ $line == export\ PATH=* ]]
        then
            B=$(echo "$line" | cut -d '=' -f 1)
            E=$(echo "$line" | cut -d '=' -f 2)
            echo $B=/opt/smartdc/propeller/bin:$E
        else
            echo "$line"
        fi
    done < /root/.bashrc >/root/.bashrc_new
    mv /root/.bashrc_new /root/.bashrc
}

function manta_setup_propeller {
    local SIZE=$(json -f ${METADATA} SIZE)

    ln -f -s /opt/smartdc/propeller/etc/processes-$SIZE.json \
        /opt/smartdc/propeller/etc/processes.json
    if [[ $? != 0 ]]; then
        echo "Unable to link /opt/smartdc/propeller/etc/processes-$SIZE.json."
        exit 1;
    fi

    /opt/smartdc/propeller/bin/generate_components_config.js
    if [[ $? != 0 ]]; then
        echo "Unable to generate /opt/smartdc/propeller/etc/components.json."
        exit 1;
    fi

    #Server
    svccfg import /opt/smartdc/propeller/smf/manifests/propeller.xml \
        || fatal "unable to import propeller manifest"
    svcadm enable propeller || fatal "unable to start propeller"

    manta_add_logadm_entry "propeller"
}


# Mainline

echo "Running common setup scripts"
manta_common_presetup

echo "Adding local manifest directories"
manta_add_manifest_dir "/opt/smartdc/propeller"

manta_common_setup "propeller"

manta_ensure_zk

manta_add_propeller_to_path

echo "Setting up propeller crons"
manta_setup_propeller

manta_common_setup_end

exit 0
