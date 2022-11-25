use aws_sdk_dynamodb::model::{AttributeValue, Select};
use aws_sdk_dynamodb::{Client, Endpoint};
use http::Uri;
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_runtime::run(func).await?;
    Ok(())
}

async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (event, _context) = event.into_parts();
    let artist = match event["artist"].as_str() {
        Some(val) => AttributeValue::S(val.to_string()),
        None => return Ok(json!([])),
    };

    let config = create_aws_config().await;
    let client = Client::new(&config);
    let table_name = "Music".to_string();

    let songs: Vec<Song> = client
        .query()
        .table_name(table_name)
        .key_condition_expression("#key = :value".to_string())
        .expression_attribute_names("#key".to_string(), "Artist".to_string())
        .expression_attribute_values(":value".to_string(), artist)
        .select(Select::AllAttributes)
        .send()
        .await
        .map(|res| {
            res.items()
                .unwrap_or_default()
                .iter()
                .map(Song::from)
                .collect()
        })
        .unwrap_or_default();

    let json_songs = serde_json::to_value(songs)?;

    Ok(json_songs)
}

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

type DynamoDbItem = HashMap<String, AttributeValue>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Song {
    artist: String,
    song_title: String,
    album_title: String,
    awards: usize,
}

impl From<&DynamoDbItem> for Song {
    fn from(item: &DynamoDbItem) -> Song {
        Song {
            artist: get_s_value(item, "Artist"),
            song_title: get_s_value(item, "SongTitle"),
            album_title: get_s_value(item, "AlbumTitle"),
            awards: get_n_value(item, "Awards"),
        }
    }
}

fn get_s_value(item: &DynamoDbItem, key: &str) -> String {
    match item.get(key) {
        Some(AttributeValue::S(val)) => val.to_string(),
        _ => "".to_string(),
    }
}

fn get_n_value(item: &DynamoDbItem, key: &str) -> usize {
    match item.get(key) {
        Some(AttributeValue::N(val)) => val.parse::<usize>().unwrap(),
        _ => 0,
    }
}
