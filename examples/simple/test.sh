#!/usr/bin/env bash

source ../commands.sh

if [ "$RUN_ALL" != "true" ]
then
    start_tests
fi

# install build deps
echo "npm i -D --silent"
npm i -D --silent

##############################################
#  Packaging test
##############################################
assert_success "it packages with serverless" \
    npx serverless package

test_package hello event.json

assert_success "when invoked from package \"hello\", it produces expected output" \
    diff output.json expects/package.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log docker.log
fi

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

if [ "$RUN_ALL" != "true" ]
then
    end_tests
fi
