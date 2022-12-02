# S3 Example

S3 example using serverless-s3-local.

## Settings

### serverless.yml

This example passes `--add-host host.docker.internal:host-gateway` argument. And the lambda function container can find the localhost as hostname `host.docker.internal` which serves S3 service.
And in this case, we also pass environment variables via `.env` file using envFile setting.

```
provider:
  name: aws
  runtime: provided.al2

plugins:
  - serverless-rust-plugin
  - serverless-s3-local

custom:
  rust
    local:
      envFile: .env
      # Using this option, the lambda function container can access to services
      # running on the local machine.
      dockerArgs: --add-host host.docker.internal:host-gateway
  s3:
    address: 0.0.0.0
    directory: ./buckets
    # [[important]]
    # Without this option, the hostname "host.docker.internal" is interpreted as a bucket name
    # regardless of the setting.
    # For more info, see: https://github.com/jamhall/s3rver/pull/632
    vhostBuckets: false

resources:
  Resources:
    NewResource:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: local-bucket
```

## Installation

```
$ npm install
```

## Start S3 service

```
$ npx serverless s3 start
```

## Test

After running this command, you can find the uploaded file in the buckets/local-bucket directory.

```
$ npx serverless rust:invoke -f putS3Object -p event.json
{"status":"uploaded"}
```
