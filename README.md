# serverless-rust-plugin

[![Serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![main](https://github.com/kaicoh/serverless-rust-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/kaicoh/serverless-rust-plugin/actions)

A [Serverless Framework](https://www.serverless.com/) plugin for [Rust](https://www.rust-lang.org/) using [Cargo Lambda](https://www.cargo-lambda.info/)

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
