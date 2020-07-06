#!/bin/bash

#----------------------------------------------
# private functions
#----------------------------------------------

_colorizeprint() {
    if [ "$2" == "-n" ] ; then
        echo -n -e "$1${@:3}\e[39m"
    else
        echo -e "$1${@:2}\e[39m"
    fi
}


#----------------------------------------------
# public global constants
#----------------------------------------------

GC_PROJECT="tileak"
ROOT_DIR="$(dirname -- $BASH_SOURCE)/.."


#----------------------------------------------
# public functions
#----------------------------------------------

error() {
    _colorizeprint "\e[31m" $@
}

info() {
    _colorizeprint "\e[35m" $@
}

success() {
    _colorizeprint "\e[32m" $@
}