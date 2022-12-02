# Workspace example

## structure

There are 2 binary and 1 library crates.

```
root
├── Cargo.toml
├── first
│   └── src
│       └── main.rs
├── last
│   └── src
│       └── main.rs
└── model
    └── src
        └── lib.rs
```

### serverless.yml

The `handler` is set to be `{binary-crate-name}`.

```
provider:
  name: aws
  runtime: provided.al2

plugins:
  - serverless-rust-plugin

functions:
  useFirstName:
    handler: first

  useLastName:
    handler: last
```

## Installation

```
$ npm install
```

## Test

```
$ npx serverless rust:invoke -f useFirstName -p event.json
{"message":"Hi, Mary!"}
```

```
$ npx serverless rust:invoke -f useLastName -p event.json
{"message":"Hi, Sue!"}
```
