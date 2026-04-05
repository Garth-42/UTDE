# Development Guide

This page covers everything you need to run, test, and work on UTDE locally.

---

## Prerequisites

| Tool | Minimum version | Purpose |
|---|---|---|
| Python | 3.9 | Library and Flask server |
| Node.js | 18 | React frontend |
| npm | 9 | Frontend package management |
| Rust + Cargo | stable | Tauri desktop build (optional) |

---

## Initial setup

```bash
# 1. Install the Python library in editable mode
pip install -e utde_v0.1.0/

# 2. Install server dependencies
pip install flask flask-cors

# 3. Install frontend dependencies
cd utde-app && npm install

# 4. (Optional) Install docs dependencies
pip install -r docs/requirements.txt
```

---

## Running the application

UTDE has two processes that need to run simultaneously: the Flask API server and the Vite dev server.

### 1. Start the Flask server

```bash
# From the repo root
python step_server.py
```

The server starts at **http://localhost:5174**. You should see:

```
UTDE STEP Server → http://localhost:5174
pythonocc-core: available   # or NOT FOUND if not installed
```

!!! note "STEP file parsing requires pythonocc-core"
    The `/parse-step` endpoint requires `pythonocc-core`. Without it, all other endpoints (`/generate-toolpath`, `/run-script`, `/health`) still work.

    ```bash
    conda install -c conda-forge pythonocc-core
    # or
    pip install pythonocc-core
    ```

### 2. Start the frontend dev server

```bash
cd utde-app
npm run dev
```

The app is available at **http://localhost:3000**. The dev server proxies all `/api/*` requests to the Flask server at port 5174.

### Verifying the connection

Open **http://localhost:3000** in a browser. If the Flask server is running, the app will be fully functional. If not, you can still open the UI but toolpath generation and STEP parsing will fail with network errors.

You can check server health directly:

```bash
curl http://localhost:5174/health
# {"ok": true, "occ_available": true}
```

---

## Running as a Tauri desktop app

The Tauri build bundles the React frontend with a Rust shell that spawns the Python backend as a sidecar process. This produces a signed native installer (`.deb`, `.exe`, `.dmg`, `.app`).

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Linux system dependencies
sudo apt-get update && sudo apt-get install -y \
  pkg-config libglib2.0-dev \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libjavascriptcoregtk-4.1-dev patchelf
```

!!! note "Dev container"
    These packages are already installed in the dev container via `postCreateCommand`. Do not install them manually — manual installs are lost on container rebuild.

### Hot-reload dev mode

```bash
cd utde-app && npx tauri dev
```

Tauri starts the Vite dev server, spawns `step_server.py` directly via the Rust setup function, and opens the WebView. Changes to React files hot-reload (though HMR over WebSocket can be unreliable in WebKitGTK — restart if changes don't appear).

The Tauri dev build does **not** require a PyInstaller sidecar binary. It uses `python step_server.py --port <PORT>` directly, with the path resolved at compile time via `CARGO_MANIFEST_DIR`.

### VNC / noVNC desktop access

When running in a headless dev container, use the noVNC stack to see the Tauri window in a browser:

```bash
# Start a virtual display
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99

# Start a minimal window manager
openbox &

# Start VNC server (password: utde)
x11vnc -display :99 -forever -nopw -quiet &

# Expose via WebSocket for noVNC
websockify --web=/usr/share/novnc 6080 localhost:5900 &

# Now start the Tauri app — it will render in the virtual display
cd utde-app && npx tauri dev
```

Open **http://localhost:6080** (forwarded port) to view the desktop. The noVNC UI appears in the browser; the Tauri window is visible inside it.

If `websockify` crashes, restart it:
```bash
websockify --web=/usr/share/novnc 6080 localhost:5900
```

### Production build

```bash
cd utde-app
npx tauri build   # installer in src-tauri/target/release/bundle/
```

### How the server starts

The Rust `setup()` function in `src-tauri/src/lib.rs`:

1. Finds a free TCP port using `TcpListener::bind("127.0.0.1:0")`
2. Spawns `step_server.py` directly via `std::process::Command("python")` with `--port <PORT>`
3. Watches stdout for the `UTDE_SERVER_READY` signal
4. Sets a ready flag exposed to the frontend via `invoke("get_server_status")`

The frontend renders a splash screen until the server is ready, then resolves `getBaseUrl()` from `src/lib/backend.js` to `http://127.0.0.1:<PORT>`.

!!! note "CORS is always required"
    WebKitGTK enforces cross-origin policy even for localhost requests. The server must run with `flask-cors` enabled (`origins="*"`). Do **not** pass `--no-cors` when spawning the server.

!!! warning "Stale Vite processes"
    If port 3000 is occupied by a previous Vite instance, the WebView will load the old frontend and source changes won't appear. Kill stale Vite processes before starting:
    ```bash
    pkill -f vite
    ```

---

## Building for production (browser)

```bash
cd utde-app
npm run build     # outputs to utde-app/dist/
npm run preview   # serves the built output locally
```

---

## Running tests

### Python tests

Tests live in two locations:

- `utde_v0.1.0/tests/` — unit tests for the core library
- `tests/` — integration tests for the Flask server

Run all Python tests from the repo root:

```bash
python -m pytest utde_v0.1.0/tests/ tests/ -v
```

Run a specific test file:

```bash
python -m pytest utde_v0.1.0/tests/test_primitives.py -v
```

Run a single test by name:

```bash
python -m pytest utde_v0.1.0/tests/test_orient_rules.py::TestLeadLag::test_lead_tilts_forward -v
```

Run only server tests:

```bash
python -m pytest tests/ -v
```

#### What's tested

| Test file | Covers |
|---|---|
| `test_primitives.py` | `Vector3`, `Position`, `Orientation`, `Frame`, `Variable` |
| `test_geometry.py` | `Curve`, `Surface`, `GeometryModel` |
| `test_toolpath.py` | `ToolpathPoint`, `Toolpath`, `ToolpathCollection` |
| `test_orient_rules.py` | All orientation rules: `fixed`, `to_normal`, `lead`, `lag`, `side_tilt`, `blend`, `avoid_collision` |
| `test_strategies.py` | `FollowCurve`, `RasterFill`, `ContourParallel` strategies |
| `test_post.py` | `PostConfig`, `PostProcessor`, G-code output, modal suppression |
| `tests/test_server.py` | All Flask endpoints — `/health`, `/parse-step`, `/generate-toolpath`, `/run-script` |

The server tests mock `OCC_AVAILABLE = False` so they run without pythonocc-core installed.

---

### React / frontend tests

Tests live in `utde-app/src/__tests__/` and use [Vitest](https://vitest.dev/) with [Testing Library](https://testing-library.com/).

```bash
cd utde-app

# Run all tests once
npm test

# Run in watch mode (re-runs on file changes)
npm run test:watch
```

Run a specific test file:

```bash
cd utde-app
npx vitest run src/__tests__/store/stepStore.test.js
```

#### What's tested

| Test file | Covers |
|---|---|
| `store/stepStore.test.js` | Geometry loading, face/edge selection, origin modes, Z override |
| `store/strategyStore.test.js` | Strategy config, orientation rule CRUD (add, remove, reorder, update), reset |
| `store/uiStore.test.js` | Mode switching, panel state, script output state |
| `api/client.test.js` | `parseStep`, `generateToolpath`, `runScript`, `checkHealth` with fetch mocks |
| `components/StepUpload.test.jsx` | File validation, upload flow, drag-and-drop, loading/error state |

---

## Running the documentation site

```bash
pip install -r docs/requirements.txt
mkdocs serve
```

The docs site is available at **http://localhost:8000** and hot-reloads on file changes.

To build a static site:

```bash
mkdocs build   # outputs to site/
```

---

## Project structure at a glance

```
utde_v0.1.0/              Python library (pip-installable)
  toolpath_engine/
    core/                 Primitives, geometry, toolpath data structures
    strategies/           Path generation algorithms
    orient/               Composable orientation rules
    kinematics/           Machine definitions and IK solver
    post/                 G-code post-processor
  tests/                  Python unit tests

tests/                    Flask server integration tests

step_server.py            Flask API server (port 5174)
step_server.spec          PyInstaller spec for sidecar bundle

utde-app/                 React + Vite frontend (port 3000)
  src/
    api/                  API client (fetch wrappers)
    lib/backend.js        Platform abstraction (Tauri vs browser)
    components/           React components
    store/                Zustand state stores
    __tests__/            Frontend tests
  src-tauri/              Rust Tauri shell
    src/lib.rs            Sidecar lifecycle, port discovery, IPC commands
    tauri.conf.json       App config, window sizes, bundle settings
    capabilities/         Tauri permission grants

docs/                     MkDocs documentation source
```
