# serverless-rust-plugin

[![Serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![main](https://github.com/kaicoh/serverless-rust-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/kaicoh/serverless-rust-plugin/actions)
[![Coverage Status](https://coveralls.io/repos/github/kaicoh/serverless-rust-plugin/badge.svg?branch=main)](https://coveralls.io/github/kaicoh/serverless-rust-plugin?branch=main)

A [Serverless Framework](https://www.serverless.com/) plugin for [Rust](https://www.rust-lang.org/) using [Cargo Lambda](https://www.cargo-lambda.info/)

## Requirement

This plugin has peer dependency, `serverless framework v3`.

## Installation

Run this command.

```
$ npm install --save-dev serverless-rust-plugin
```

And add the following to your serverless.yml file

```
provider:
  name: aws
  runtime: provided.al2
  # this plugin reads this property and passes it to cargo lambda.
  # default is x86_64.
  architecture: arm64
plugins
  - serverless-rust-plugin
functions:
  hello:
    # handler value syntax is `{cargo-package-name}.{bin-name}`
    # or `{cargo-package-name}` for short when you are building a
    # default bin for a given package.
    handler: your-cargo-package-name
```

In [documents of AWS Lambda Runtime](https://github.com/awslabs/aws-lambda-rust-runtime) the handler is set to be `bootstrap`. This plugin renames the handler in deployment process so you don't have to worry about it.

## Deployment

```
$ serverless deploy
```

By default this plugin uses docker container to build. Make sure you have a docker daemon running.

### Using local cargo lambda

If your local machine installs cargo-lambda you can use it by the following.

```
custom:
  rust:
    useDocker: false
```

## Sample settings

See [this wiki page](https://github.com/kaicoh/serverless-rust-plugin/wiki/Sample).

## Usage

### Invoke your lambda locally

At the time of writing, you have to choose architecture `x86_64` to run lambda function locally via the following command because serverless framework uses docker image [lambci/lambda](https://hub.docker.com/r/lambci/lambda) whose architecture is `amd64` internally.

```
$ serverless invoke local -f hello -d '{"firstName":"Mary"}'
```

For more info about local invocation see [this doc](https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local).
Or if your local machine installs docker, you can invoke your lambda by the following regardless of the architecture.

```
$ serverless rust:invoke:local -f hello -d '{"firstName":"Mary"}'
```

#### rust:invoke:local command options

| option | shortcut | type | required | description |
| :--- | :---: | :--- | :---: | :--- |
| function | f | string | ✅ | The name of the function in your service that you want to invoke locally. Required. |
| path | p | string |  | The path to a JSON file holding input data to be passed to the invoked function as the event. This path is relative to the root directory of the service. |
| data | d | string |  | String containing data to be passed as an event to your function. Keep in mind that if you pass both --path and --data, the data included in the --path file will overwrite the data you passed with the --data flag. |
| env | e | string[] |  | String representing an environment variable to set when invoking your function, in the form `<name>=<value>`. Can be repeated for more than one environment variable. |
| stdout |  | boolean |  | By default this command outputs to `stderr`. If you want to change this behavior to `stdout` use this flag. |

#### examples

##### input from JSON file

```
$ serverless rust:invoke:local -f hello -p event.json
{"message":"Hello, Mary!"}
```

##### pipe outputs to other command

```
$ serverless rust:invoke:local -f hello -p event.json --stdout 2>/dev/null | jq .message
"Hello, Mary!"
```
