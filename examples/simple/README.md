# Simple Example

For single binary.

## Settings

### Cargo.toml

There are no `[[bin]]` sections.

```
[package]
name = "simple"
...

[dependencies]
lambda_runtime = "0.7"
...
```

### serverless.yml

The `handler` is set to be the cargo package name.

```
provider:
  name: aws
  runtime: provided.al2

plugins:
  - serverless-rust-plugin

functions:
  hello:
    handler: simple
```

## Installation

```
$ npm install
```

## Local invocation

### "data" option

```
$ npx serverless rust:invoke:local -f hello -d '{"firstName":"Mary"}'
{"greeting":"Good morning","message":"Hi, Mary!","status":"Happy"}

```

### "path" option

```
$ npx serverless rust:invoke:local -f hello -p event.json
{"greeting":"Good morning","message":"Hi, Mary!","status":"Happy"}
```

### "env" option

```
$ npx serverless rust:invoke:local -f hello -p event.json -e GREETING="Good evening" -e STATUS=Fine
{"greeting":"Good evening","message":"Hi, Mary!","status":"Fine"}
```

### "env-file" option

```
$ npx serverless rust:invoke:local -f hello -p event.json --env-file .env
{"greeting":"Good evening","message":"Hi, Mary!","status":"Fine"}
```

### pipe outputs to other command

```
$ npx serverless rust:invoke:local -f hello -p event.json --stdout 2>/dev/null | jq .message
"Hi, Mary!"
```
