#!/usr/bin/env bash

source ../commands.sh

# install build deps
assert_success "it installs with npm" \
    npm i -D --silent

##############################################
#  Packaging test
##############################################
CONTAINER_NAME="packaging-test"

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
    -e GREETING=Good\ morning \
    --name=$CONTAINER_NAME \
    --platform linux/arm64/v8 \
    public.ecr.aws/lambda/provided:al2-arm64 \
    bootstrap

wait_until_docker_running

curl -XPOST $INVOCATION_PATH \
    -d @event.json \
    1> output.json \
    2> stderr.log

assert_success "when invoked from package, it produces expected output" \
    diff output.json expects/package.json

if [ $STATUS -ne 0 ]
then
    echo
    echo "##### docker logs #####"
    docker logs $CONTAINER_NAME
    echo

    show_outputs output.json stderr.log
fi

docker stop $CONTAINER_NAME > /dev/null 2>&1

####################################
#  Local invocation test
####################################
echo "Test rust:invoke:local command"

# Test -d option
npx serverless rust:invoke:local \
    -f hello \
    -d '{"firstName":"Mary"}' \
    --port 8080 \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked locally with -d option, it produces expected output" \
    diff output.json expects/dataOption.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

# Test -p option
npx serverless rust:invoke:local \
    -f hello \
    -p event.json \
    --port 8088 \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked locally with -p option, it produces expected output" \
    diff output.json expects/pathOption.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

# Test -e option
npx serverless rust:invoke:local \
    -f hello \
    -p event.json \
    -e GREETING="Good evening" \
    -e STATUS=Fine \
    --port 8888 \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked locally with -e option, it produces expected output" \
    diff output.json expects/envOption.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

end_tests
