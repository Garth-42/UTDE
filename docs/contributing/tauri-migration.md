# Tauri Desktop Integration

UTDE runs as a native desktop app using [Tauri v2](https://tauri.app/). This page documents the architecture of the desktop build and the decisions made during implementation.

## Status

**Migration is complete.** The Tauri shell, Python server lifecycle, native file dialogs, and splash screen are all implemented and working.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  Tauri desktop shell (Rust)                         │
│                                                     │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │  WebView             │  │  Python server       │  │
│  │                     │  │                      │  │
│  │  React + Three.js   │◄─┤  step_server.py      │  │
│  │  (existing UI)      │  │  (spawned directly   │  │
│  │                     │  │   via std::process)  │  │
│  │  Zustand stores     │  │                      │  │
│  │  api/client.js      │  │  Flask + flask-cors  │  │
│  └─────────────────────┘  │  toolpath_engine lib │  │
│           │               │  pythonocc-core      │  │
│           │  Tauri IPC    └──────────────────────┘  │
│           ▼                                         │
│  Rust commands                                      │
│  • get_server_port()                                │
│  • get_server_status()                              │
│  • open_step_file_dialog()                          │
│  • save_gcode_dialog()                              │
└─────────────────────────────────────────────────────┘
```

**Key decisions:**

- The React + Three.js frontend is **unchanged** — it runs inside Tauri's WebView exactly as in browser mode
- The Python Flask server is **spawned directly** via `std::process::Command` in the Rust setup function — no PyInstaller sidecar needed in development
- The frontend talks to Flask over **localhost HTTP** as it does in browser mode — no IPC rewrite needed for the core API
- A small set of **Tauri IPC commands** replaces browser APIs: native file dialogs, dynamic port discovery, server health
- **CORS is required** — WebKitGTK enforces cross-origin policy even for localhost requests. `flask-cors` with `origins="*"` is used in all modes

---

## Rust server lifecycle (`src-tauri/src/lib.rs`)

The Rust `setup()` function:

1. **Finds a free TCP port** — `TcpListener::bind("127.0.0.1:0")` allocates an OS-assigned port, then the listener is dropped to free the socket before Python binds it.

2. **Spawns `step_server.py` directly** — using `std::process::Command` with the path resolved at compile time via `CARGO_MANIFEST_DIR`:
   ```rust
   let server_script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../step_server.py");
   std::process::Command::new("python")
       .args([server_script, "--port", &port_str])
       .stdout(Stdio::piped())
       .stderr(Stdio::inherit())
       .spawn()
   ```
   This path (`src-tauri/../../step_server.py`) resolves correctly in both `npx tauri dev` and `npx tauri build` within the dev container.

3. **Watches stdout for the ready signal** — a background thread reads the server's stdout line by line. When it sees `UTDE_SERVER_READY`, it sets `Arc<Mutex<bool>>` to `true`.

4. **Exposes IPC commands** — `get_server_port` and `get_server_status` are Tauri commands the frontend polls during startup.

### Why not use `tauri-plugin-shell` with a sidecar binary?

The original plan was to bundle `step_server.py` via PyInstaller as a sidecar binary. In practice for development in the dev container:

- pythonocc-core is already installed in the conda environment
- Direct Python spawn is simpler and eliminates the PyInstaller build step
- The sidecar binary approach remains valid for production releases where a self-contained installer is needed

For a production build on a user's machine (without Python), the PyInstaller approach documented in the original migration plan still applies.

---

## CORS requirement

WebKitGTK (the GTK WebView used by Tauri on Linux) enforces cross-origin resource sharing even when both origins are on `localhost`. The WebView loads `http://localhost:3000` (Vite) and fetches `http://127.0.0.1:<port>` (Flask). These are treated as different origins.

**Fix:** `flask-cors` must be installed and enabled with `origins="*"`:

```python
from flask_cors import CORS as _CORS
_CORS(flask_app, origins="*")
```

Do **not** pass `--no-cors` when spawning the server. The `--no-cors` flag disables flask-cors, which causes all fetch calls from the WebView to fail with a CORS error.

`flask-cors` is included in `devcontainer.json`:
```
conda run -n base pip install flask flask-cors pytest
```

---

## Frontend: platform branching

`src/lib/backend.js` centralises all platform differences:

```js
export const IS_TAURI = "__TAURI_INTERNALS__" in window;

export async function getBaseUrl() {
  if (!IS_TAURI) return "/api";           // Vite proxy → localhost:5174
  const port = await invoke("get_server_port");
  return `http://127.0.0.1:${port}`;      // dynamic port assigned at startup
}
```

`App.jsx` waits for the server before rendering when in Tauri mode:

```js
await waitForServer();   // polls get_server_status every 300ms, times out after 30s
```

`StepUpload.jsx` uses the native file dialog in Tauri mode:

```js
if (IS_TAURI) {
  const path = await openStepFileDialog();  // invoke("open_step_file_dialog")
  if (path) uploadPath(path);               // POST /parse-step-path with { path, deflection }
}
```

---

## System dependencies

The following packages must be installed for the Tauri build to compile. They are included in `devcontainer.json` `postCreateCommand`:

```
pkg-config
libglib2.0-dev
libwebkit2gtk-4.1-dev
libgtk-3-dev
libayatana-appindicator3-dev
librsvg2-dev
libjavascriptcoregtk-4.1-dev
```

**Never install these manually with `sudo apt-get install` in a running container** — they will be lost on rebuild. Add them to `postCreateCommand` in `devcontainer.json` instead.

---

## Running the desktop app

### Dev mode (hot reload)

```bash
cd utde-app
npx tauri dev
```

This starts Vite (port 3000), spawns `step_server.py` via Rust, and opens the WebView. Changes to React files hot-reload in the WebView.

!!! warning "Stale Vite processes"
    If port 3000 is already occupied by a previous Vite instance, Tauri will open the old frontend in the WebView — changes to source files won't appear. Before starting `npx tauri dev`, check and kill any stale Vite processes:
    ```bash
    pkill -f vite
    ```

### Production build

```bash
cd utde-app
npx tauri build   # installer in src-tauri/target/release/bundle/
```

---

## Known issues and gotchas

| Issue | Notes |
|---|---|
| **WebKitGTK HMR** | Vite HMR over WebSocket is unreliable in the WebKitGTK WebView. Changes to some files may not hot-reload. Restart `npx tauri dev` if the UI appears stale. |
| **CARGO_MANIFEST_DIR in production** | The compile-time path to `step_server.py` is correct for the dev container layout but will not resolve on a user's machine without Python + deps installed. Production builds need the PyInstaller sidecar approach. |
| **pythonocc API quirks** | `TransferRoots()` silently fails; use `for i in range(1, reader.NbRootsForTransfer() + 1): reader.TransferRoot(i)`. `BRepMesh_IncrementalMesh` requires 5 arguments (not 4) in the version installed via conda-forge. |
| **Cargo build cache corruption** | Killing a Rust build mid-compile can corrupt the incremental cache. Symptom: hundreds of unrelated compile errors on next build. Fix: `cargo clean` inside `utde-app/src-tauri/` then rebuild. |

---

## Production packaging plan (future)

For a self-contained installer that ships to users without Python:

1. Build PyInstaller bundle: `pyinstaller step_server.spec --distpath src-tauri/binaries/`
2. Rename with target triple: `mv utde-server utde-server-x86_64-unknown-linux-gnu`
3. Register in `tauri.conf.json` `bundle.externalBin`
4. Replace the `std::process::Command("python")` spawn in `lib.rs` with `tauri_plugin_shell` sidecar spawn
5. Remove `flask-cors` / `origins="*"` and use `--no-cors` since same-machine requests don't need CORS headers in a bundled install (no Vite WebSocket origin)

CI workflows (`build-sidecar.yml`, `release.yml`) build the sidecar on all platforms via PyInstaller+conda.
