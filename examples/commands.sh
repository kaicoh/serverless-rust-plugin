#!/usr/bin/env bash

# decor
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# test state
TESTS=0
FAILED=0

INVOCATION_PATH="http://localhost:9000/2015-03-31/functions/function/invocations"
RETRY=30

# Verify that a command succeeds
function assert_success() {
    MESSAGE="$1"
    shift
    COMMAND="$@"

    ((++TESTS))

    $COMMAND
    STATUS=$?

    if [ $STATUS -eq 0 ]
    then
        echo -e "👍  ${GREEN} $MESSAGE: success${NC}"
    else
        echo -e "👎  ${RED} ${MESSAGE}: fail${NC}"
        ((++FAILED))
    fi
}

function end_tests() {
    if ((FAILED > 0))
    then
        echo
        echo -e "💀  ${RED} Ran ${TESTS} tests, ${FAILED} failed.${NC}"
        exit $FAILED
    else
        echo
        echo -e "👌  ${GREEN} ${TESTS} tests passed.${NC}"
        exit 0
    fi
}

function wait_until_docker_running() {
    until curl -XPOST $INVOCATION_PATH -d '{"health":true}' > /dev/null 2>&1
    do
        ((--RETRY))

        if [ $RETRY -ge 0 ]
        then
            echo -e "Container is unavailable - sleeping"
            sleep 1
        else
            echo -e "💀 Failed to run docker container"
            exit 1
        fi
    done
}

function show_outputs() {
    for file in "$@"
    do
        echo
        echo "##### ${file} #####"
        cat $file
        echo
    done
}
