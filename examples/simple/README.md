# Simple Example

This is a example for simple Cargo.toml.

## Installation

```
$ npm install
```

## Local invocation

### use "data" option

```
$ npx serverless rust:invoke:local -f hello -d '{"firstName":"Mary"}'
{"greeting":"Good morning","message":"Hi, Mary!","status":"Happy"}

```

### use "path" option

```
$ npx serverless rust:invoke:local -f hello -p event.json
{"greeting":"Good morning","message":"Hi, Mary!","status":"Happy"}
```

### use "env" option

```
$ npx serverless rust:invoke:local -f hello -p event.json -e GREETING="Good evening" -e STATUS=Fine
{"greeting":"Good evening","message":"Hi, Mary!","status":"Fine"}
```

### pipe outputs to other command

```
$ npx serverless rust:invoke:local -f hello -p event.json --stdout 2>/dev/null | jq .message
"Hi, Mary!"
```
