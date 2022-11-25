#!/usr/bin/env bash

source ../commands.sh

if [ "$RUN_ALL" != "true" ]
then
    start_tests
fi

# install build deps
echo "npm i -D --silent"
npm i -D --silent

# If we pull dynamodb-local image in docker-compose up process, it's difficult to set RETRY count because how long pulling image takes depends on the network status.
# So we pull the image first and eliminate unpredictable matters as much as possible.
echo "start dynamodb-local using docker-compose"

# We pull docker image if is not installed.
IMAGE=amazon/dynamodb-local:latest
if [[ "$(docker images -q $IMAGE 2>/dev/null)" == "" ]]
then
    docker pull $IMAGE
fi
docker-compose up -d

echo "wait until dynamodb-local is running"
# We have to specify container name because default naming rule is defferent from mac and linux. See: https://github.com/docker/for-mac/issues/6035
CONTAINER_NAME=ddb_local # defined in docker-compose.yml
RETRY=30
until [ "$( docker container inspect -f '{{.State.Running}}' $CONTAINER_NAME )" == "true" ]
do
    if [ $RETRY -ge 0 ]
    then
        echo -e "dynamodb-local is unavailable -- sleeping"
        sleep 1

        ((--RETRY))
    else
        echo -e "Failed to start dynamodb-local container"
        exit 1
    fi
done

echo "setup dynamodb table"
npm run ddb:setup

####################################
#  Local invocation test
####################################
echo "Test rust:invoke:local command"

npx serverless rust:invoke:local \
    -f query \
    -p event.json \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked locally, it produces expected output" \
    diff output.json expected.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

echo "shutdown docker-compose"
docker-compose down

if [ "$RUN_ALL" != "true" ]
then
    end_tests
fi
