#!/usr/bin/env bash

source ../commands.sh

if [ "$RUN_ALL" != "true" ]
then
    start_tests
fi

# install build deps
echo "npm i -D --silent"
npm i -D --silent

echo "start s3 service in background"
npm run s3:start

####################################
#  Local invocation test
####################################
echo "Test rust:invoke command"

npx serverless rust:invoke \
    -f putS3Object \
    -p event.json \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked locally, it produces expected output" \
    diff output.json expects/lambdaOutput.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

assert_success "and it uploads expected file to S3 bucket" \
    diff buckets/local-bucket/output._S3rver_object expects/upload.json

if [ $STATUS -ne 0 ]
then
    show_outputs buckets/local-bucket/output._S3rver_object
fi

echo "stop s3 service in background"
npm run s3:stop

if [ "$RUN_ALL" != "true" ]
then
    end_tests
fi
