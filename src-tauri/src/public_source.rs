use std::{net::IpAddr, time::Duration};

use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};

const MAX_PUBLIC_SOURCE_BYTES: usize = 4 * 1024 * 1024;
const ALLOWED_PUBLIC_SOURCE_HOSTS: &[&str] = &[
    "www.gwybs.com",
    "gwybs.com",
    "gwy.gkzhenti.cn",
    "www.132gk.com",
    "132gk.com",
    "edu.people.com.cn",
    "cpc.people.com.cn",
    "www.people.com.cn",
    "people.com.cn",
    "www.ah.gov.cn",
    "ah.gov.cn",
    "www.gov.cn",
    "gov.cn",
    "www.news.cn",
    "news.cn",
    "csj.news.cn",
];

pub(crate) fn validate_public_source_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "Public source URL is invalid.".to_string())?;
    if url.scheme() != "https" {
        return Err("Public source URL must use HTTPS.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Public source URL must not contain embedded credentials.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Public source URL must contain a host.".to_string())?
        .to_ascii_lowercase();
    if host.parse::<IpAddr>().is_ok() {
        return Err(
            "Public source URL must use an allow-listed hostname, not an IP address.".to_string(),
        );
    }
    if !ALLOWED_PUBLIC_SOURCE_HOSTS
        .iter()
        .any(|allowed| *allowed == host)
    {
        return Err("Public source host is not allow-listed.".to_string());
    }
    Ok(url)
}

fn validate_content_type(content_type: Option<&str>) -> Result<(), String> {
    let normalized = content_type.unwrap_or("text/html").to_ascii_lowercase();
    if normalized.starts_with("text/html")
        || normalized.starts_with("text/plain")
        || normalized.starts_with("application/xhtml+xml")
    {
        return Ok(());
    }
    if normalized.starts_with("application/pdf") {
        return Err(
            "PDF source detected. Use the PDF import pipeline instead of HTML extraction."
                .to_string(),
        );
    }
    Err("Public source returned an unsupported content type.".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSourceFetchRequest {
    pub url: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSourceFetchResponse {
    pub url: String,
    pub content_type: Option<String>,
    pub body: String,
}

#[tauri::command]
pub async fn fetch_public_source_text(
    request: PublicSourceFetchRequest,
) -> Result<PublicSourceFetchResponse, String> {
    let url = validate_public_source_url(&request.url)?;
    let timeout_ms = request.timeout_ms.unwrap_or(20_000).clamp(2_000, 60_000);
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|_| "Could not initialize public source HTTP client.".to_string())?;

    let response = client
        .get(url.clone())
        .header(
            reqwest::header::USER_AGENT,
            "ShenlunTrainer/0.1 local-public-source-importer",
        )
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,text/plain;q=0.9",
        )
        .send()
        .await
        .map_err(|_| "Public source request failed.".to_string())?;

    let status = response.status();
    if status.is_redirection() {
        return Err(
            "Public source redirected. Add and review the final HTTPS source URL explicitly."
                .to_string(),
        );
    }
    if !status.is_success() {
        return Err(format!(
            "Public source request failed with HTTP {}.",
            status.as_u16()
        ));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    validate_content_type(content_type.as_deref())?;

    if response
        .content_length()
        .is_some_and(|length| length as usize > MAX_PUBLIC_SOURCE_BYTES)
    {
        return Err("Public source exceeded the 4 MB text limit.".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Could not read public source response.".to_string())?;
    if bytes.len() > MAX_PUBLIC_SOURCE_BYTES {
        return Err("Public source exceeded the 4 MB text limit.".to_string());
    }
    let body = String::from_utf8(bytes.to_vec()).map_err(|_| {
        "Public source text was not UTF-8. A source-specific decoder is required.".to_string()
    })?;

    Ok(PublicSourceFetchResponse {
        url: url.to_string(),
        content_type,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_allow_listed_https_sources() {
        assert!(validate_public_source_url("https://www.gwybs.com/").is_ok());
        assert!(validate_public_source_url("https://gwy.gkzhenti.cn/path").is_ok());
        assert!(validate_public_source_url("https://edu.people.com.cn/n1/test.html").is_ok());
        assert!(validate_public_source_url("https://www.ah.gov.cn/zwyw/jryw/index.html").is_ok());
        assert!(validate_public_source_url("https://www.gov.cn/zhengce/index.htm").is_ok());
        assert!(validate_public_source_url("https://www.news.cn/local/index.html").is_ok());
        assert!(validate_public_source_url("https://csj.news.cn/index.htm").is_ok());
    }

    #[test]
    fn rejects_unlisted_hosts_and_ip_literals() {
        assert!(validate_public_source_url("https://example.com/exam").is_err());
        assert!(validate_public_source_url("https://127.0.0.1/exam").is_err());
    }

    #[test]
    fn rejects_http_and_embedded_credentials() {
        assert!(validate_public_source_url("http://www.gwybs.com/").is_err());
        assert!(validate_public_source_url("https://user:pass@www.gwybs.com/").is_err());
    }

    #[test]
    fn routes_pdf_to_a_separate_pipeline() {
        assert!(validate_content_type(Some("application/pdf")).is_err());
        assert!(validate_content_type(Some("text/html; charset=utf-8")).is_ok());
    }
}
