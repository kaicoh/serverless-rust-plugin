#!/usr/bin/env bash

# Directory of the examples
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

RUN_ALL="true"

source ./commands.sh

start_tests

for project in simple multi-binary ddb-local workspace s3-local
do
    cd "${HERE}"/"${project}"
    echo
    echo "🚀 Running tests for $project"
    echo

    source test.sh
done

end_tests
