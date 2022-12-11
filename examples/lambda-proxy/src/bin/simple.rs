use lambda_http::{
    http::StatusCode, service_fn, Error, IntoResponse, Request, Response,
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_http::run(func).await
}

async fn func(_: Request) -> Result<impl IntoResponse, Error> {
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(json!({ "message": "Hello World!" }).to_string())
        .map_err(Box::new)?;

    Ok(response)
}
