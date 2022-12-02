# serverless-rust-plugin rust:ps command

Show the status of docker containers for lambda functions.

## Usage

```
$ serverless rust:ps
```

### example

```
$ serverless rust:ps

╔════════════╤══════════════════════╤═════════╤═══════════════════════════╗
║ FUNCTION   │ CONTAINER NAME       │ STATUS  │ PORTS                     ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc0  │ my-service_rustFunc0 │ running │ 0.0.0.0:60701 -> 8080/tcp ║
╟────────────┼──────────────────────┼─────────┼───────────────────────────╢
║ rustFunc1  │ my-service_rustFunc1 │ running │ 0.0.0.0:60702 -> 8080/tcp ║
╚════════════╧══════════════════════╧═════════╧═══════════════════════════╝
```
