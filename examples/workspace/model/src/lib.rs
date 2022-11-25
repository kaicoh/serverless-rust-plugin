use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}
