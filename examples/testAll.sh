#!/usr/bin/env bash

# Directory of the examples
HERE="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

for project in simple
do
    cd "${HERE}"/"${project}"
    echo "🚀 Running tests for $project"

    source test.sh
done
