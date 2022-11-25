use lambda_runtime::{service_fn, LambdaEvent, Error};
use model::Person;
use serde_json::{json, Value};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_runtime::run(func).await?;
    Ok(())
}

async fn func(event: LambdaEvent<Person>) -> Result<Value, Error> {
    let (person, _context) = event.into_parts();
    let last_name = person.last_name.unwrap_or_else(|| "Tanaka".to_string());
    Ok(json!({ "message": format!("Hi, {}!", last_name) }))
}
