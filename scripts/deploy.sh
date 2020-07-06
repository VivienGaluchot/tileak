#!/bin/bash

source "$(dirname $0)/base.sh"
info "[$0]"
(
    set -e
    cd $ROOT_DIR

    PROMOTE="--no-promote"
    if [ "$1" == "--promote" ] ; then
        PROMOTE="--promote"
    fi

    GIT_VERSION=$(git rev-parse --short HEAD)-$(git describe --all --dirty --broken)
    echo GIT_VERSION $GIT_VERSION
    echo ""

    info "Deploy with $PROMOTE"
    echo "gcloud --project=$GC_PROJECT app deploy --quiet $PROMOTE"
    gcloud --project=$GC_PROJECT app deploy --quiet $PROMOTE
    echo "done"
    echo ""

    info "Done, go to https://console.cloud.google.com/ to try, promote the deployed version and delete old one."
)
if [ $? == 0 ] ; then
    info "[$0 OK]"
else
    error "[$0 FAILED]"
fi