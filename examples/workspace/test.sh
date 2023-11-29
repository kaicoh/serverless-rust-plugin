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

test_package useFirstName event.json

assert_success "when invoked from package \"useFirstName\", it produces expected output" \
    diff output.json expects/first.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log docker.log
fi

test_package useLastName event.json

assert_success "when invoked from package \"useLastName\", it produces expected output" \
    diff output.json expects/last.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log docker.log
fi

test_package useFirstAndLastName event.json

assert_success "when invoked from package \"useFirstAndLastName\", it produces expected output" \
    diff output.json expects/first_and_last.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log docker.log
fi

####################################
#  Local invocation test
####################################
echo "Test rust:invoke command"

# Test useFirstName
npx serverless rust:invoke \
    -f useFirstName \
    -p event.json \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked useFirstName function locally, it produces expected output" \
    diff output.json expects/first.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

# Test useLastName
npx serverless rust:invoke \
    -f useLastName \
    -p event.json \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked useLastName function locally, it produces expected output" \
    diff output.json expects/last.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

# Test useFirstAndLastName
npx serverless rust:invoke \
    -f useFirstAndLastName \
    -p event.json \
    --stdout \
    1>output.json \
    2>stderr.log

assert_success "when invoked useFirstAndLastName function locally, it produces expected output" \
    diff output.json expects/first_and_last.json

if [ $STATUS -ne 0 ]
then
    show_outputs output.json stderr.log
fi

if [ "$RUN_ALL" != "true" ]
then
    end_tests
fi
