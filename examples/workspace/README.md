# Workspace example

## structure

There are 3 binary and 1 library crates.

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
│   └── src
│       └── lib.rs
└── crates
    └── first_and_last
        └── src
            └── main.rs
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

  useFirstAndLastName:
    handler: first_and_last
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

```
$ npx serverless rust:invoke -f useFirstAndLastName -p event.json
{"message":"Hi, Mary Sue!"}
```
