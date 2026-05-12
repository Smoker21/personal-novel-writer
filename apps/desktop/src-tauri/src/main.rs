#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fs_watcher;
mod sidecar;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_api_port,
            commands::detect_git,
            commands::open_directory_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
