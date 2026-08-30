use std::{error::Error, time::Duration};

use keyring::Entry;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CREDENTIAL_SERVICE: &str = "shenlun-ai-trainer";
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_SECRET_BYTES: usize = 16 * 1024;
const MAX_PROVIDER_ERROR_CHARS: usize = 600;
const MAX_TRANSPORT_ERROR_CHARS: usize = 900;
const DEEPSEEK_MIN_TIMEOUT_MS: u64 = 240_000;

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
    let url =
        reqwest::Url::parse(raw).map_err(|_| "Remote provider URL is invalid.".to_string())?;
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

fn is_deepseek_url(url: &reqwest::Url) -> bool {
    url.host_str()
        .is_some_and(|host| host.eq_ignore_ascii_case("api.deepseek.com"))
}

fn effective_timeout_ms(requested: u64, deepseek_compat: bool) -> u64 {
    let clamped = requested.clamp(1_000, 300_000);
    if deepseek_compat {
        clamped.max(DEEPSEEK_MIN_TIMEOUT_MS)
    } else {
        clamped
    }
}

fn provider_error_detail(bytes: &[u8]) -> Option<String> {
    let parsed = serde_json::from_slice::<Value>(bytes).ok();
    let message = parsed
        .as_ref()
        .and_then(|value| value.get("error"))
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| {
            parsed
                .as_ref()
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str)
        })
        .map(str::to_owned)
        .or_else(|| String::from_utf8(bytes.to_vec()).ok());

    message
        .map(|value| {
            let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
            compact
                .chars()
                .take(MAX_PROVIDER_ERROR_CHARS)
                .collect::<String>()
        })
        .filter(|value| !value.is_empty())
}

fn reqwest_error_detail(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();
    while let Some(item) = source {
        let text = item.to_string();
        if !text.trim().is_empty() && !parts.iter().any(|existing| existing == &text) {
            parts.push(text);
        }
        if parts.len() >= 5 {
            break;
        }
        source = item.source();
    }
    parts
        .join(" -> ")
        .chars()
        .take(MAX_TRANSPORT_ERROR_CHARS)
        .collect()
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
    credential_entry(secret_ref.as_str())?
        .delete_credential()
        .map_err(|_| "Could not delete provider credential.".to_string())
}

#[tauri::command]
pub async fn secure_post_json(request: SecurePostRequest) -> Result<SecurePostResponse, String> {
    let url = validate_remote_url(&request.url)?;
    let deepseek_compat = is_deepseek_url(&url);
    let secret = load_secret(&request.secret_ref)?;
    let timeout_ms = effective_timeout_ms(request.timeout_ms, deepseek_compat);

    let client_builder = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_millis(timeout_ms));
    let client_builder = if deepseek_compat {
        // Real Shenlun Stage 2 responses can be materially larger than the short
        // provider smoke-test response. Keep DeepSeek on a conservative transport
        // profile so CDN/body compression or HTTP/2 flow-control quirks cannot turn
        // an otherwise valid completion into `error decoding response` in reqwest.
        client_builder.http1_only()
    } else {
        client_builder
    };
    let client = client_builder
        .build()
        .map_err(|_| "Could not initialize secure HTTP client.".to_string())?;

    let response = client
        .post(url)
        .bearer_auth(secret)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .json(&request.body)
        .send()
        .await
        .map_err(|error| {
            format!(
                "Remote provider request failed: {}",
                reqwest_error_detail(&error)
            )
        })?;

    let status = response.status();
    let response_version = format!("{:?}", response.version());
    let content_encoding = response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("identity")
        .to_string();
    let request_id = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("openai-request-id"))
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    if response
        .content_length()
        .is_some_and(|length| length as usize > MAX_RESPONSE_BYTES)
    {
        return Err("Remote provider response exceeded the size limit.".to_string());
    }

    let bytes = response.bytes().await.map_err(|error| {
        format!(
            "Could not read remote provider response [{}; content-encoding={}; timeout={}ms]: {}",
            response_version,
            content_encoding,
            timeout_ms,
            reqwest_error_detail(&error)
        )
    })?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("Remote provider response exceeded the size limit.".to_string());
    }

    if !status.is_success() {
        let detail = provider_error_detail(&bytes);
        return Err(match detail {
            Some(detail) => format!(
                "Remote provider request failed with HTTP {}: {}",
                status.as_u16(),
                detail
            ),
            None => format!(
                "Remote provider request failed with HTTP {}.",
                status.as_u16()
            ),
        });
    }

    let body = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| "Remote provider returned invalid JSON.".to_string())?;

    Ok(SecurePostResponse { body, request_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_provider_error_message() {
        let detail = provider_error_detail(br#"{"error":{"message":"bad request payload"}}"#);
        assert_eq!(detail.as_deref(), Some("bad request payload"));
    }

    #[test]
    fn truncates_provider_error_detail() {
        let long = "x".repeat(MAX_PROVIDER_ERROR_CHARS + 100);
        let detail = provider_error_detail(long.as_bytes()).expect("detail");
        assert_eq!(detail.chars().count(), MAX_PROVIDER_ERROR_CHARS);
    }

    #[test]
    fn detects_deepseek_transport_compatibility_host() {
        let deepseek = reqwest::Url::parse("https://api.deepseek.com/chat/completions").unwrap();
        let other = reqwest::Url::parse("https://api.example.com/v1/chat/completions").unwrap();
        assert!(is_deepseek_url(&deepseek));
        assert!(!is_deepseek_url(&other));
    }

    #[test]
    fn gives_deepseek_real_grading_a_longer_timeout_floor() {
        assert_eq!(effective_timeout_ms(120_000, true), 240_000);
        assert_eq!(effective_timeout_ms(280_000, true), 280_000);
        assert_eq!(effective_timeout_ms(120_000, false), 120_000);
    }
}
