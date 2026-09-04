use std::process::Command;

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let validated = crate::public_source::validate_public_source_url(&url)?;
    let value = validated.to_string();

    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", value.as_str()])
        .spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&value).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&value).spawn();

    result
        .map(|_| ())
        .map_err(|_| "无法打开官方原文，请检查系统默认浏览器设置。".to_string())
}
