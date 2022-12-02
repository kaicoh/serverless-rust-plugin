# serverless-rust-plugin rust:start command

Start docker containers for lambda functions according to the configurations in the serverless.yml.

## Usage

```
$ serverless rust:start (-f func0 -f func1 ...)
```

### example

```
$ serverless rust:start
...
    Finished release [optimized] target(s) in 0.83s

╔════════════╤══════════════════════╤═════════╤═══════════════════════════╗
║ FUNCTION   │ CONTAINER NAME       │ STATUS  │ PORTS                     ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc0  │ myContainer          │ running │ 0.0.0.0:9000 -> 8080/tcp  ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc1  │ my-service_rustFunc1 │ running │ 0.0.0.0:60702 -> 8080/tcp ║
╚════════════╧══════════════════════╧═════════╧═══════════════════════════╝
```


## Configuration

```
service: my-service

provider:
  name: aws

  # The docker image is determined by this.
  architecture: arm64

  # The environment variables in this section are passed to all containers.
  environment:
    VAR0: VAL0

custom:
  rust:
    local:

      # The relative path from serverless.yml to env file.
      # The environment variables in this file are passed to all containers
      # but overwritten if each function has its own envFile configuration.
      envFile: .env

      # Additional arguments pass to the docker run command.
      # The arguments in this section are passed to all containers
      # but overwritten if each function has its own dockerArgs configuration.
      dockerArgs: --network my-network

functions:
  rustFunc0:
    handler: cargo-package.bin0

    # The environment variables in this secrion are passed to the container for rustFunc0.
    environment:
      VAR1: VAL1

    rust:

      # The container name for rustFunc0. If not defined, this plugin uses default container name.
      containerName: myContainer

      # The port number of the localhost binding to the container's 8080 port.
      # If not defined, this plugin searches a free port and use it.
      port: 9000

      # The relative path from serverless.yml to env file.
      # The environment variables in this file are passed to the container for rustFunc0.
      envFile: .env.func0

      # Additional arguments pass to the docker run command.
      # The arguments in this section are passed to the container for rustFunc0.
      dockerArgs: --network my-network-func0

  rustFunc1:
    handler: cargo-package.bin1
```

### docker image

The docker image for lambda containers is determined by the `provider.architecture`. Default is [public.ecr.aws/lambda/provided:al2-x86_64](https://gallery.ecr.aws/lambda/provided) and if `provider.architecture` is `arm64`, the [public.ecr.aws/lambda/provided:al2-arm64](https://gallery.ecr.aws/lambda/provided) is used.

### container name

Default is `{service-name}_{function-name}` but you can name it by setting `rust.containerName` in each function configuration.

For example, if you run `serverless rust:start` using the above serverless.yml the container name for rustFunc0 is `myContainer` and for rustFunc1 is `my-service_rustFunc1`.

### port binding

The localhost's port binding to the each container's 8080 port is defined by setting `rust.port` in each function configuration.

### environment variables

The environment variables passed to the containers is what is merged from the followings.

- `provider.environment`
- `custom.rust.local.envFile`
- `environment` in each function configuration
- `rust.envFile` in each function configuration

If both `custom.rust.local.envFile` and each function's `rust.envFile` are defined, the latter is used.

For example, if you run `serverless rust:start` using the above serverless.yml, the container for rustFunc0 starts by

```
docker run ... --env VAR0=VAL0 --env VAR1=VAL1 --env-file .env.func0 ...
```

and the container for rustFunc1 starts by

```
docker run ... --env VAR0=VAL0 --env-file .env ...
```

### additional arguments for docker run command

The additional arguments passed to docker run command for each container. If both `custom.rust.localdockerArgs` and each function's `rust.dockerArgs` are defined, the latter is used.

For example, if you run `serverless rust:start` using the above serverless.yml, the container for rustFunc0 start by

```
docker run ... --network my-network-func0 ...
```

and the container for rustFunc1 starts by

```
docker run ... --network my-network ...
```

## Options

| option | shortcut | type | required | default| description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| function | f | string |  |  | The name of the function that you want to start the container. If not provided this plugin starts all the containers for rust functions. |
