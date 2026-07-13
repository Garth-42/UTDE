// UTDE desktop shell.
//
// The entire app — the toolpath engine (Pyodide) and STEP parsing
// (opencascade.js) — runs client-side in the webview, so there is no Python
// sidecar to spawn or wait on. This shell just hosts the bundled SPA and exposes
// native file dialogs + file reads to the frontend via the dialog/fs plugins.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
