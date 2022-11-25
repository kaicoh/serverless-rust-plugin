# Multi Binary Example

For multi binary project.

## Settings

### Cargo.toml

There are some `[[bin]]` sections.

```
[package]
name = "multi-binary"
...

[[bin]]
name = "first"
path = "src/first.rs"

[[bin]]
name = "last"
path = "src/last.rs"

[dependencies]
lambda_runtime = "0.7"
...
```

### serverless.yml

The `handler` is set to be `{cargo-package-name}.{bin-name}`.

```
provider:
  name: aws
  runtime: provided.al2

plugins:
  - serverless-rust-plugin

functions:
  useFirstName:
    handler: multi-binary.first

  useLastName:
    handler: multi-binary.last
```

## Installation

```
$ npm install
```

## Local invocation

```
$ npx serverless rust:invoke:local -f useFirstName -p event.json
{"message":"Hi, Mary!"}
```

```
$ npx serverless rust:invoke:local -f useLastName -p event.json
{"message":"Hi, Sue!"}
```
