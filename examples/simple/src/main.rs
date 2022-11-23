use lambda_runtime::{service_fn, LambdaEvent, Error};
use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_runtime::run(func).await?;
    Ok(())
}

async fn func(event: LambdaEvent<Value>) -> Result<Value, Error> {
    let (event, _context) = event.into_parts();
    let first_name = event["firstName"].as_str().unwrap_or("world");

    Ok(json!({
        "message": format!("Hi, {}!", first_name),
        "greeting": std::env::var("GREETING").ok().unwrap_or("Good morning".to_string()),
        "status": std::env::var("STATUS").ok().unwrap_or("Happy".to_string()),
    }))
}
