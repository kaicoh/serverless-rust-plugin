# serverless-rust-plugin rust:invoke command

Invoke the lambda function and get outputs according to the given options and the configurations in the serverless.yml.

## Usage

```
$ serverless rust:invoke -f func (-d data -p file --stdout)
```

### example

```
$ serverless rust:invoke -f hello -d '{"firstName":"Mary"}'
    Finished release [optimized] target(s) in 0.13s

{"message":"Hi, Mary!"}
```

### Behavior by the container status

You don't have to start the container via `serverless rust:start` before running this command. But the behavior changes if the container is running or not.

#### If the container is running

This command invokes the lambda function immediately and let the container running after the invocation.

#### If the container is not running

This command starts the container before the invocation according to the configuration in serverless.yml.(See [rust:start](../rust:start).) And after the invocation this command stops and removes the container.

## Options

| option | shortcut | type | required | default| description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| function | f | string | ✅ |  | The name of the function to invoke. Required. |
| path | p | string |  |  | The path to a JSON file holding input data to be passed to the invoked function as the event. This path is relative to the root directory of the service. |
| data | d | string |  |  | String containing data to be passed as an event to your function. Keep in mind that if you pass both --path and --data, the data included in the --path file will overwrite the data you passed with the --data flag. |
| stdout |  | boolean |  | false | By default this command outputs to `stderr`. If you want to change this behavior to `stdout` use this flag. |


```
$ serverless rust:invoke -f hello -d '{"firstName":"Mary"}' --stdout 2>/dev/null | jq .message
"Hi, Mary!"
```
