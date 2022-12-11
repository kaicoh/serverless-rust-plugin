use lambda_http::{
    http::StatusCode, service_fn, Error, IntoResponse, Request, RequestExt, Response,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Person {
    first_name: String,
    last_name: String,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let func = service_fn(func);
    lambda_http::run(func).await
}

async fn func(event: Request) -> Result<impl IntoResponse, Error> {
    let res = match event.payload::<Person>()? {
        Some(Person { first_name, last_name }) => {
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(json!({
                    "message": format!("Hi, {} {}!", first_name, last_name)
                }).to_string())
                .map_err(Box::new)?
        },
        None => {
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(json!({
                    "message": "No one found"
                }).to_string())
                .map_err(Box::new)?
        }
    };

    Ok(res)
}
