#!/usr/bin/env bash

function start_tests() {
    # decor
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    NC='\033[0m'

    # test suit
    TESTS=0
    FAILED=0
}

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

function show_outputs() {
    for file in "$@"
    do
        echo
        echo "##### ${file} #####"
        cat $file
        echo
    done
}

# verify packaged artifact by invoking it using the amazon/aws-lambda-provided:al2 docker image
function test_package() {
    CONTAINER_NAME="serverless-rust-plugin"
    INVOCATION_PATH="http://localhost:9000/2015-03-31/functions/function/invocations"

    package="$1"
    event="$2"

    unzip -o  \
        target/lambda/release/${package}.zip \
        -d /tmp/lambda > /dev/null 2>&1

    docker run \
        -i -d --rm \
        -v /tmp/lambda:/var/runtime \
        -p 9000:8080 \
        --name=$CONTAINER_NAME \
        --platform linux/arm64/v8 \
        public.ecr.aws/lambda/provided:al2-arm64 \
        bootstrap

    RETRY=30

    # wait until docker container running
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

    curl -XPOST $INVOCATION_PATH \
        -d @${event} \
        1> output.json \
        2> stderr.log

    docker logs $CONTAINER_NAME > docker.log 2>&1

    docker stop $CONTAINER_NAME > /dev/null 2>&1
}
