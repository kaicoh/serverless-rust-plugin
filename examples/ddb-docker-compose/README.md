# Dynamodb Local Example (Using Docker Compose)

Using Dynamodb local.

## Settings

### docker-compose.yml

Get docker network name the dynamodb-local container runs on. In this example the network name is `sls-rust-network`.

```
version: '3'

services:
  # The service name `ddb` is used as the hostname used from the container running on the same docker network.
  # In this case, lambda function container have to call dynamodb api to `ddb` host.
  ddb:
    image: amazon/dynamodb-local:latest
    ports:
      - 8000:8000
    networks:
      - default

networks:
  default:
    # This names default network as `sls-rust-network`
    name: sls-rust-network
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

When invoked, you have to pass network argument as --docker-args option. And this example also passes aws credentials from .env file.

```
$ npx serverless rust:invoke:local -f query -p event.json --env-file .env --docker-args "--network sls-rust-network" --stdout 2>/dev/null | jq .
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
