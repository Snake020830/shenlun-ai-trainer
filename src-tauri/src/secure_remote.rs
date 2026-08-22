use std::time::Duration;

use keyring::Entry;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CREDENTIAL_SERVICE: &str = "shenlun-ai-trainer";
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_SECRET_BYTES: usize = 16 * 1024;

fn validate_secret_ref(secret_ref: &str) -> Result<(), String> {
    let valid_len = !secret_ref.is_empty() && secret_ref.len() <= 96;
    let valid_chars = secret_ref
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'));
    if valid_len && valid_chars {
        Ok(())
    } else {
        Err("Invalid credential reference.".to_string())
    }
}

fn credential_entry(secret_ref: &str) -> Result<Entry, String> {
    validate_secret_ref(secret_ref)?;
    Entry::new(CREDENTIAL_SERVICE, secret_ref)
        .map_err(|_| "System credential store is unavailable.".to_string())
}

fn load_secret(secret_ref: &str) -> Result<String, String> {
    credential_entry(secret_ref)?
        .get_password()
        .map_err(|_| "Provider credential is unavailable.".to_string())
}

fn validate_remote_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Remote provider URL is invalid.".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Remote provider URL must not contain embedded credentials.".to_string());
    }

    let host = url.host_str().unwrap_or_default();
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    let allowed_scheme = url.scheme() == "https" || (local && url.scheme() == "http");
    if !allowed_scheme {
        return Err("Remote provider must use HTTPS except for localhost development.".to_string());
    }
    Ok(url)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurePostRequest {
    pub url: String,
    pub body: Value,
    pub secret_ref: String,
    pub timeout_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurePostResponse {
    pub body: Value,
    pub request_id: Option<String>,
}

#[tauri::command]
pub fn store_provider_secret(secret_ref: String, secret: String) -> Result<(), String> {
    validate_secret_ref(&secret_ref)?;
    if secret.is_empty() || secret.len() > MAX_SECRET_BYTES {
        return Err("Provider credential length is invalid.".to_string());
    }
    credential_entry(&secret_ref)?
        .set_password(&secret)
        .map_err(|_| "Could not save provider credential.".to_string())
}

#[tauri::command]
pub fn delete_provider_secret(secret_ref: String) -> Result<(), String> {
    credential_entry(&secret_ref)?
        .delete_credential()
        .map_err(|_| "Could not delete provider credential.".to_string())
}

#[tauri::command]
pub async fn secure_post_json(request: SecurePostRequest) -> Result<SecurePostResponse, String> {
    let url = validate_remote_url(&request.url)?;
    let secret = load_secret(&request.secret_ref)?;
    let timeout_ms = request.timeout_ms.clamp(1_000, 300_000);

    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|_| "Could not initialize secure HTTP client.".to_string())?;

    let response = client
        .post(url)
        .bearer_auth(secret)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&request.body)
        .send()
        .await
        .map_err(|_| "Remote provider request failed.".to_string())?;

    let status = response.status();
    let request_id = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("openai-request-id"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    if !status.is_success() {
        return Err(format!("Remote provider request failed with HTTP {}.", status.as_u16()));
    }
    if response.content_length().is_some_and(|length| length as usize > MAX_RESPONSE_BYTES) {
        return Err("Remote provider response exceeded the size limit.".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Could not read remote provider response.".to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Remote provider response exceeded the size limit.".to_string());
    }
    let body = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| "Remote provider returned invalid JSON.".to_string())?;

    Ok(SecurePostResponse { body, request_id })
}
