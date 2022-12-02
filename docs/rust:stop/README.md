# serverless-rust-plugin rust:stop command

Stop and remove the containers.

## Usage

```
$ serverless rust:stop ( -f func0 -f func1 ...)
```

### example

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

## Options

| option | shortcut | type | required | default| description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| function | f | string |  |  | The name of the function that you want to stop the container. If not provided this plugin stops all the containers for rust functions. |
