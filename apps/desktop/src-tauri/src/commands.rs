use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Deserialize)]
pub(crate) struct RuntimeInfo {
    pub port: u16,
}

fn runtime_json_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".novel-writer").join(".runtime.json"))
}

/// 讀取 ~/.novel-writer/.runtime.json 取得 sidecar port。
/// 檔案不存在或解析失敗時 fallback 到 3001（dev 預設）。
#[tauri::command]
pub async fn get_api_port() -> u16 {
    runtime_json_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<RuntimeInfo>(&s).ok())
        .map(|info| info.port)
        .unwrap_or(3001)
}

#[derive(Serialize)]
pub struct GitInfo {
    pub path: String,
    pub version: String,
}

/// 解析 "git version 2.44.0.windows.1" → "2.44.0"
pub(crate) fn extract_version(s: &str) -> Option<String> {
    s.split_whitespace()
        .find(|w| w.starts_with(|c: char| c.is_ascii_digit()))
        .map(|ver| {
            ver.splitn(4, '.')
                .take(3)
                .collect::<Vec<_>>()
                .join(".")
        })
}

/// 偵測系統 git 二進位路徑與版本。
#[tauri::command]
pub async fn detect_git() -> Result<GitInfo, String> {
    let which_cmd = if cfg!(windows) { "where" } else { "which" };

    let output = Command::new(which_cmd)
        .arg("git")
        .output()
        .map_err(|e| format!("failed to run {which_cmd}: {e}"))?;

    if !output.status.success() {
        return Err("git not found".to_string());
    }

    let git_path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    let version_output = Command::new("git")
        .arg("--version")
        .output()
        .map_err(|e| format!("git --version failed: {e}"))?;

    let version_str = String::from_utf8_lossy(&version_output.stdout);
    let version = extract_version(&version_str)
        .ok_or_else(|| "cannot parse git version".to_string())?;

    Ok(GitInfo { path: git_path, version })
}

/// 開啟系統資料夾選擇對話框，回傳使用者選取的路徑。
/// 使用者取消時回傳 Ok(None)。
#[tauri::command]
pub async fn open_directory_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog().file().blocking_pick_folder();
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_version_standard() {
        assert_eq!(extract_version("git version 2.44.0"), Some("2.44.0".into()));
    }

    #[test]
    fn extract_version_windows_suffix() {
        assert_eq!(
            extract_version("git version 2.44.0.windows.1"),
            Some("2.44.0".into()),
        );
    }

    #[test]
    fn extract_version_no_digits() {
        assert_eq!(extract_version("git not found"), None);
    }

    #[test]
    fn runtime_info_deserializes() {
        let json = r#"{"port": 3001, "pid": 1234, "startedAt": "2024-01-01T00:00:00Z"}"#;
        let info: RuntimeInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.port, 3001);
    }
}
