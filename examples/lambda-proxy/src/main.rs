use lambda_http::{
    http::StatusCode, service_fn, Error, IntoResponse, Request, RequestExt, Response,
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_http::run(func).await
}

async fn func(event: Request) -> Result<impl IntoResponse, Error> {
    let params = event.path_parameters();

    let response = match params.first("firstName") {
        Some(first_name) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(json!({ "message": format!("Hi, {}!", first_name) }).to_string())
            .map_err(Box::new)?,
        None => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header("Content-Type", "application/json")
            .body(json!({ "message": "I can't find your name" }).to_string())
            .map_err(Box::new)?,
    };

    Ok(response)
}
