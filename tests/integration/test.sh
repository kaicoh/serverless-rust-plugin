#!/usr/bin/env bash

# decor
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# test state
TESTS=0
FAILED=0

INVOCATION_PATH="http://localhost:9000/2015-03-31/functions/function/invocations"

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
    container_name="$1"

    until curl -XPOST $INVOCATION_PATH -d '{}' > /dev/null 2>&1
    do
        echo -e "Container is unavailable - sleeping"
        sleep 1
    done
}

# Directory of the integration test
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
# Root directory of the repository
DIST=$(cd $HERE/../..; pwd)
export SILENT=1
# uncomment below to debug serverless framework
#export SLS_DEBUG=*

CONTAINER_NAME=integration-test


echo "😀  Running integration tests"

# install build deps
assert_success "it installs with npm" \
    npm ci "$DIST" --silent

# integration test `package` command
assert_success "it packages with serverless" \
    npx serverless package

# verify packaged artifact by invoking it using the amazon/aws-lambda-provided:al2 docker image
unzip -o  \
    target/lambda/release/hello.zip \
    -d /tmp/lambda > /dev/null 2>&1

docker run \
    -i -d --rm \
    -v /tmp/lambda:/var/runtime \
    -p 9000:8080 \
    --name=$CONTAINER_NAME \
    --platform linux/arm64/v8 \
    public.ecr.aws/lambda/provided:al2-arm64 \
    bootstrap

wait_until_docker_running $CONTAINER_NAME

curl -XPOST $INVOCATION_PATH \
    -d @event.json \
    1> output.json \
    2> stderr.log

assert_success "when invoked, it produces expected output" \
    diff output.json expected.json

if [ $STATUS -ne 0 ]
then
    echo "### output.json ###"
    cat output.json

    echo "### docker logs ###"
    docker logs $CONTAINER_NAME

    echo "### curl stderr ###"
    cat stderr.log
fi

docker stop $CONTAINER_NAME > /dev/null 2>&1

end_tests
