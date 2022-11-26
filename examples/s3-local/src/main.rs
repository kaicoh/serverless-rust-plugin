use aws_sdk_s3::{types::ByteStream, Client, Endpoint};
use http::Uri;
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_runtime::run(func).await?;
    Ok(())
}

async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (event, _context) = event.into_parts();

    let config = create_aws_config().await;
    let client = Client::new(&config);

    let bucket_name = "local-bucket";
    let key = "output";

    client
        .put_object()
        .bucket(bucket_name)
        .key(key)
        .body(ByteStream::from(serde_json::to_vec(&event)?))
        .send()
        .await?;

    Ok(json!({ "status": "uploaded" }))
}

// If env `ENV` is set to be local, use config for local invocation.
async fn create_aws_config() -> aws_config::SdkConfig {
    let env = std::env::var("ENV").unwrap_or_else(|_| "dev".to_string());

    if env.eq("local") {
        // For `local` use
        aws_config::from_env()
            // NOTE:
            // `hostname` should be equal to localhost name.
            .endpoint_resolver(Endpoint::immutable(Uri::from_static(
                "http://host.docker.internal:4569",
            )))
            .load()
            .await
    } else {
        // For `production` use
        aws_config::load_from_env().await
    }
}
