use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

// ── Server state shared between Rust and the frontend via Tauri commands ─────

pub struct ServerState {
    pub port: u16,
    pub ready: Arc<Mutex<bool>>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Returns the port the Python sidecar is listening on.
#[tauri::command]
fn get_server_port(state: State<ServerState>) -> u16 {
    state.port
}

/// Returns true once the Python sidecar has printed UTDE_SERVER_READY.
#[tauri::command]
fn get_server_status(state: State<ServerState>) -> bool {
    *state.ready.lock().unwrap()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Bind to port 0 to let the OS assign a free port, then release it.
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("failed to bind port 0")
        .local_addr()
        .unwrap()
        .port()
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            get_server_status,
        ])
        .setup(|app| {
            let port = find_free_port();
            let ready = Arc::new(Mutex::new(false));

            // Manage state so commands can read it
            app.manage(ServerState {
                port,
                ready: ready.clone(),
            });

            // Spawn step_server.py directly so the app uses the real UTDE library.
            // CARGO_MANIFEST_DIR is baked in at compile time (utde-app/src-tauri),
            // so ../../step_server.py resolves to the workspace root.
            // For a production release, replace this with a bundled PyInstaller sidecar.
            let server_script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../step_server.py");
            let port_str = port.to_string();

            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                use std::process::{Command, Stdio};

                let mut child = Command::new("python")
                    .args([server_script, "--port", &port_str])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::inherit())
                    .spawn()
                    .expect("failed to spawn step_server.py — is python in PATH?");

                let stdout = child.stdout.take().unwrap();
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(l) => {
                            log::info!("[server] {}", l);
                            if l.contains("UTDE_SERVER_READY") {
                                *ready.lock().unwrap() = true;
                            }
                        }
                        Err(e) => log::error!("[server] stdout read error: {e}"),
                    }
                }

                let _ = child.wait();
                log::warn!("[server] step_server.py terminated");
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
