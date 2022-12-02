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

## Example projects

See [examples](examples).

## Usage

### Deployment

```
$ serverless deploy
```

By default this plugin uses docker container to build. Make sure you have a docker daemon running. But if your local machine installs cargo lambda, you can use it by the following configuration.

#### Configuration for build

```
provider:
  name: aws
  architecture: arm64

custom:
  rust:
    cargoLambda:
      docker: false
      profile: debug
```

| option | path in serverless.yml | values | description |
| :--- | :--- | :---: | :--- |
| architecture | provider.architecture | x86_64, arm64 | The architecture cargo lambda compiles for. default is x86_64. |
| docker | custom.rust.cargoLambda.docker | boolean | Use docker to compile or not. If true, this plugin uses [calavera/cargo-lambda](https://hub.docker.com/r/calavera/cargo-lambda) otherwise cargo lambda in your local machine. |
| profile | custom.rust.cargoLambda.profile | release, debug | The mode cargo lambda compiles. default is release. |

### Local Test

Using docker, this plugin has some commands for testing your lambda functions locally. These commands use docker regardless of the setting for cargo lambda build.
(Local testing is nothing to do with `custom.rust.cargoLambda.docker` in serverless.yml.) For more info, see [this](docs).

```
service: my-service

provider:
  name: aws
  runtime: provided.al2
  architecture: arm64

plugins
  - serverless-rust-plugin

custom:
  rust:
    cargoLambda:
      docker: false
    local:
      envFile: .env.global
      dockerArgs: --network my-network-global

functions:
  rustFunc0:
    handler: cargo-package.bin0
    rust:
      port: 8080
      envFile: .env.local
      dockerArgs: --network my-network-local

  rustFunc1:
    handler: cargo-package.bin1

  nonRustFunc:
    handler: non-of-the-above
```

#### rust:start

Start the docker container according to the configuration in serverless.yml and show the status for each container. For more information about configurations and options for this command see [this](docs/rust:start).

```
$ serverless rust:start
...
    Finished release [optimized] target(s) in 0.83s

╔════════════╤══════════════════════╤═════════╤═══════════════════════════╗
║ FUNCTION   │ CONTAINER NAME       │ STATUS  │ PORTS                     ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc0  │ my-service_rustFunc0 │ running │ 0.0.0.0:8080 -> 8080/tcp  ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc1  │ my-service_rustFunc1 │ running │ 0.0.0.0:60702 -> 8080/tcp ║
╚════════════╧══════════════════════╧═════════╧═══════════════════════════╝
```

#### rust:ps

Show the status for each container. For more information about configurations and options for this command see [this](docs/rust:ps).

```
$ serverless rust:ps

╔════════════╤══════════════════════╤═════════╤═══════════════════════════╗
║ FUNCTION   │ CONTAINER NAME       │ STATUS  │ PORTS                     ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc0  │ my-service_rustFunc0 │ running │ 0.0.0.0:8080 -> 8080/tcp  ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc1  │ my-service_rustFunc1 │ running │ 0.0.0.0:60702 -> 8080/tcp ║
╚════════════╧══════════════════════╧═════════╧═══════════════════════════╝
```

#### rust:invoke

Invoke lambda function and show output. For more information about configurations and options for this command see [this](docs/rust:invoke).

```
$ serverless rust:invoke -f rustFunc0 -d '{"firstName":"Mary"}'
...
    Finished release [optimized] target(s) in 0.39s

{"message":"Hi, Mary!"}
```

#### rust:logs

Show logs of lambda functions. For more information about configurations and options for this command see [this](docs/rust:logs).

```
$ serverless rust:logs
rustFunc1  | START RequestId: 67394de9-1577-4ebd-be58-ba4237b71ef1 Version: $LATEST
rustFunc1  | END RequestId: 67394de9-1577-4ebd-be58-ba4237b71ef1
rustFunc1  | REPORT RequestId: 67394de9-1577-4ebd-be58-ba4237b71ef1	Init Duration: 4.09 ms	Duration: 237.96 ms	Billed Duration: 238 ms	Memory Size: 3008 MB	Max Memory Used: 3008 MB
rustFunc0  | START RequestId: e85bd375-77cf-411a-b31b-08170a454a62 Version: $LATEST
rustFunc0  | END RequestId: e85bd375-77cf-411a-b31b-08170a454a62
rustFunc0  | REPORT RequestId: e85bd375-77cf-411a-b31b-08170a454a62	Init Duration: 4.28 ms	Duration: 240.70 ms	Billed Duration: 241 ms	Memory Size: 3008 MB	Max Memory Used: 3008 MB
rustFunc0  | START RequestId: 0a3e927b-8ff2-456a-9691-5003b7e1004e Version: $LATEST
rustFunc0  | END RequestId: 0a3e927b-8ff2-456a-9691-5003b7e1004e
rustFunc0  | REPORT RequestId: 0a3e927b-8ff2-456a-9691-5003b7e1004e	Duration: 40.65 ms	Billed Duration: 41 ms	Memory Size: 3008 MB	Max Memory Used: 3008 MB
```

#### rust:stop

Stop containers and show the status. For more information about configurations and options for this command see [this](docs/rust:stop).

```
$ serverless rust:stop

╔════════════╤════════════════╤═══════════╤═══════╗
║ FUNCTION   │ CONTAINER NAME │ STATUS    │ PORTS ║
╟────────────┼────────────────┼───────────┼───────╢
║ rustFunc0  │                │ not exist │       ║
╟────────────┼────────────────┼───────────┼───────╢
║ rustFunc1  │                │ not exist │       ║
╚════════════╧════════════════╧═══════════╧═══════╝
```

## License

This software is released under the [MIT License](LICENSE).
