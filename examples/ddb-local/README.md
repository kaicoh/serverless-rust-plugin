# Dynamodb Local Example (Using Docker Compose)

Using Dynamodb local.

## Settings

### docker-compose.yml

Get docker network name the dynamodb-local container runs on. In this example the network name is `sls-rust-network`. The lambda function container is going to run on the network.

```
version: '3'

services:
  # The service name `ddb` is used as the hostname from the container running on the same docker network.
  # In this case, lambda function container have to call dynamodb api to `ddb` host.
  ddb:
    image: amazon/dynamodb-local:latest
    container_name: ddb_local
    ports:
      - 8000:8000
    networks:
      - default

networks:
  default:
    # This names default network as `sls-rust-network`
    name: sls-rust-network
```

### main.rs

In rust code, you have to set endpoint to aws config. And the hostname of it needs to match the service name of the dynamodb-local container. In this case `ddb`.

```
use aws_sdk_dynamodb::Endpoint;
use http::Uri;

// If env `ENV` is set to be local, use config for local invocation.
async fn create_aws_config() -> aws_config::SdkConfig {
    let env = std::env::var("ENV").unwrap_or_else(|_| "dev".to_string());

    if env.eq("local") {
        // For `local` use
        aws_config::from_env()
            // NOTE:
            // `hostname` should be equal to service name in docker-compose.
            .endpoint_resolver(Endpoint::immutable(Uri::from_static("http://ddb:8000")))
            .load()
            .await
    } else {
        // For `production` use
        aws_config::load_from_env().await
    }
}
```

### serverless.yml

This example passes `--network sls-rust-network` arguments to the lambda function container to run on the same network with dynamodb-local container.
And in this case, we also pass environment variables via `.env` file using envFile setting.

```
custom:
  rust:
    local:
      envFile: .env
      # Adding this setting, the lambda function container can access services
      # running on the same docker network.
      dockerArgs: --network sls-rust-network
```

## Installation

```
$ npm install
```

## Start docker compose

Start dynamodb-local container.

```
$ docker-compose up -d
```

## Setup Dynamodb

Create table and seed data.

```
$ npm run ddb:setup
```

## Test

```
$ npx serverless rust:invoke -f query -p event.json --stdout 2>/dev/null | jq .
[
  {
    "albumTitle": "Songs About Life",
    "artist": "Acme Band",
    "awards": 10,
    "songTitle": "Happy Day"
  },
  {
    "albumTitle": "Another Album Title",
    "artist": "Acme Band",
    "awards": 8,
    "songTitle": "PartiQL Rocks"
  }
]
```
