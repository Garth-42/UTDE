# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UTDE (Universal Toolpath Design Environment)** — a process-agnostic, programmable platform for multi-axis toolpath generation. It combines a Python library for toolpath computation with a React/Three.js web UI for interactive visualization.

## Dev Container Environment

This project runs inside a **VS Code Dev Container** (`.devcontainer/devcontainer.json`). The container is ephemeral — anything installed manually at the shell is lost on rebuild. All environment changes must be made in `devcontainer.json` and committed so they survive a rebuild.

### Where things live in devcontainer.json

| What you need | Where to add it |
|---|---|
| CLI tools / system packages (apt) | `postCreateCommand` |
| Language runtimes (Node, Rust, Python, etc.) | `"features": {}` — prefer `ghcr.io/devcontainers/features/*` |
| Claude Code | `"features": { "ghcr.io/anthropics/devcontainer-features/claude-code:1": {} }` |
| Python packages | `postCreateCommand` via `pip install` or `conda install` |
| npm globals | `postCreateCommand` via `npm install -g` |
| Environment variables | `"remoteEnv": {}` |
| Forwarded ports | `"forwardPorts": []` and `"portsAttributes": {}` |
| VS Code extensions | `"customizations": { "vscode": { "extensions": [] } }` |

### Rules

- **Never `sudo apt-get install` or `pip install` a tool as a one-off fix** — add it to `postCreateCommand` (or a feature) instead.
- **Never `export VAR=value` to fix a missing env var** — add it to `remoteEnv`.
- **Never manually forward a port** — add it to `forwardPorts`.
- After editing `devcontainer.json`, the container must be **rebuilt** (`Dev Containers: Rebuild Container`) for changes to take effect.
- The current `postCreateCommand` installs all Python/conda deps and runs `npm install` — append new install steps there rather than creating a separate script, unless complexity warrants it.

### Currently installed via devcontainer

- **Runtimes**: Python 3.12 (conda/miniforge), Node 24
- **Rust**: `ghcr.io/devcontainers/features/rust:1`
- **Python packages**: pythonocc-core, numpy, scipy, pyyaml, flask, pytest, mkdocs stack, utde library (editable)
- **System tools**: xvfb, x11vnc, openbox, novnc, websockify, netcat-openbsd, lsof (for VNC/GUI support)
- **Frontend**: `npm install` run in `utde-app/`

## Development Commands

### Backend (Python library + Flask server)

```bash
# Install the Python library in editable mode
pip install -e utde_v0.1.0/

# Start the Flask API server (listens on http://localhost:5174)
# IMPORTANT: must be running for browser dev mode (localhost:3000) to work.
# The Vite proxy forwards /api → localhost:5174. The Tauri sidecar binds a
# random port instead and does NOT serve the browser proxy — always start
# this separately before opening localhost:3000.
python step_server.py

# Run the full workflow example
python utde_v0.1.0/toolpath_engine/examples/demo_5axis_ded.py

# Run Python tests (library + server)
cd /workspaces/files && python -m pytest utde_v0.1.0/tests/ tests/ -v

# Run a single test file
python -m pytest tests/test_server.py -v
```

### Frontend (React + Vite)

```bash
cd utde-app

npm install
npm run dev      # Dev server on http://localhost:3000 (proxies /api → localhost:5174)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm test         # Run all 90 Vitest tests
npm run test:watch  # Vitest in watch mode
```

### Tauri Desktop App

```bash
cd utde-app

# Note: Rust and system deps (libwebkit2gtk, libgtk-3, etc.) are provisioned
# via devcontainer.json — do not install them manually.

npx tauri dev    # Hot-reload dev build (starts React + spawns sidecar)
npx tauri build  # Signed installer to src-tauri/target/release/bundle/
```

**Building the Python sidecar manually:**
```bash
# Install pythonocc via conda first (required)
conda install -c conda-forge pythonocc-core numpy scipy pyyaml
pip install flask pyinstaller && pip install -e utde_v0.1.0/
pyinstaller step_server.spec   # outputs dist/utde-server/
```

### Documentation (MkDocs)

```bash
pip install -r docs/requirements.txt
mkdocs serve     # http://localhost:8000
```

## Architecture

The system has four layers (three in browser mode, four in desktop mode):

**1. Python Core Library** (`utde_v0.1.0/toolpath_engine/`)

Data flows through a pipeline of composable components:
- **Primitives** (`core/`): Immutable types — `Position`, `Orientation`, `Frame`, `Variable`, `Vector3`
- **Geometry** (`geometry.py`): `Surface`, `Curve`, `GeometryModel` — parametric and mesh-based shapes
- **Strategies** (`strategies/`): Answer "where does the tool go?" — `FollowCurve`, `RasterFill`, `ContourParallel`
- **Orientation Rules** (`orient/rules.py`): Composable, chainable rules — `to_normal`, `fixed`, `lead`, `lag`, `side_tilt`, `blend`, `avoid_collision`
- **Toolpath** (`toolpath.py`): `ToolpathPoint` (position + orientation + process params), `Toolpath`, `ToolpathCollection`
- **Kinematics** (`kinematics/machine.py`): `Machine` defined as `Linear`/`Rotary` joint chains; IK solved via `scipy.optimize`
- **Post-processor** (`post/processor.py`): Converts toolpaths to G-code

**2. Flask API Server** (`step_server.py`)

Three main endpoints:
- `POST /parse-step` — Tessellates uploaded STEP files using pythonocc → JSON (faces + edges)
- `POST /generate-toolpath` — Receives strategy + orientation rule config, calls Python backend, returns toolpath points + G-code
- `POST /run-script` — Executes arbitrary user Python code for custom workflows

**3. React Frontend** (`utde-app/src/`)

Two-mode UI connected to Flask via `api/client.js`:
- **STEP Import Mode**: Upload CAD file, inspect geometry, select faces/edges, set workspace origin
- **Toolpath Mode**: Configure strategy & orientation rules, visualize paths, view generated Python/G-code

State managed with Zustand across four stores:
- `stepStore` — Geometry, face/edge selection, workspace origin
- `strategyStore` — Active strategy parameters + orientation rule chain
- `toolpathStore` — Generated toolpath points
- `uiStore` — Active mode and panel visibility

The 3D viewport (`components/viewport/`) uses React Three Fiber. The sidebar (`components/sidebar/`) renders panels contextually based on `uiStore` mode.

**Browser vs Tauri branching**: `IS_TAURI = "__TAURI_INTERNALS__" in window` gates all desktop-specific code. `src/lib/backend.js` abstracts platform differences: `getBaseUrl()` calls `invoke("get_server_port")` in Tauri vs returns `/api` in browser; `openStepFileDialog()` / `saveGcodeDialog()` use native dialogs in Tauri vs browser fallbacks.

**4. Tauri Shell** (`src-tauri/`)

The Rust `setup()` function in `src/lib.rs`:
1. Binds a free TCP port (`TcpListener::bind("127.0.0.1:0")`)
2. Spawns `binaries/utde-server` (PyInstaller bundle) with `--port` and `--no-cors` args
3. Watches sidecar stdout for `UTDE_SERVER_READY` signal before marking server ready
4. Exposes `get_server_port` and `get_server_status` Tauri commands to the frontend

The frontend `App.jsx` calls `waitForServer()` on mount in Tauri mode and renders `<SplashScreen>` until the sidecar is ready. The `/parse-step-path` endpoint accepts a native file path directly (no multipart upload), used by `StepUpload.jsx` when `IS_TAURI=true`.

CI workflows (`build-sidecar.yml`, `release.yml`) build the sidecar on all platforms via PyInstaller+conda, rename with target-triple suffix, and pass them to `tauri-apps/tauri-action`.

## Design Principles

These are active decision filters, not background philosophy. Apply them before writing any code.

### The process-agnosticism litmus test

> **The app does not know about processes.** When a process-specific feature is proposed for the core library, ask: *can this be built from existing primitives by a user?* If **yes** → build it as a template in `templates/`, not a feature in the core. If **no** → identify the missing primitive and add that instead. Never add welding, printing, coating, or any other process-specific logic to `toolpath_engine/`.

### Axis count is emergent, not a mode

> Never add a "3-axis mode" or "5-axis mode" switch. Axis count is determined by the orientation logic the user applies. Fixed orientation → 3-axis output. Surface-normal orientation → 5-axis output. A mode toggle is always the wrong design.

### One representation, two views

> The visual node graph and the Python script are two interfaces to the same underlying data. Every node must correspond to exactly one Python API call. The graph serializes to JSON that round-trips to/from a Python script. Never build a node graph feature that has no Python API equivalent, and vice versa.

### Plain-text everything

> Process definitions, machine kinematics, post-processor configs, and templates are always `.py` or `.yaml`. Never introduce binary or proprietary formats for user-authored content.

### Wrapper pattern for external engines

> When integrating LibSlic3r, CuraEngine, or any other external engine: translate app primitives → engine format → call engine → translate back to native `ToolpathCollection`. Expose hooks at `before_slice`, `after_slice`, `on_each_layer`, `on_each_point`. Never call an external engine directly from core library code. See `integration/wrapper.py`.

### Every strategy node inspector must include a Preview Toolpath section

> The inspector panel for any node of type `strategy` **must** render a `<PreviewToolpathSection>` below its parameter fields. This section provides a `▶ Preview Toolpath` button that generates and visualises the toolpath for that node in isolation — using the three-level geometry resolution (wired source → stored selection → global selection), runs the full orient rule chain, stores the result in `toolpathStore`, enables `showToolpaths`, and switches to the 3D view. On error it falls back to Python code preview. When adding a new strategy type, do not skip this section — it is how the user validates that a strategy is working correctly without leaving the node graph.

### Geometry-capable nodes always expose a geometry input port

> Any node that allows manual geometry selection (via the "Select geometry" button) **must** also expose a `surface_in` input port of type `Surface`. This lets users wire a geometry source node directly instead of picking manually — the wired connection takes priority over a stored selection, which takes priority over the global viewport selection. When creating a new node type that needs geometry input, always add `{ id: "surface_in", type: "Surface" }` to its `input_ports` array and render the corresponding `<Handle>` alongside the selection button.

### Orientation rules are composable

> Rules chain and blend — never modify a strategy to encode orientation logic. Orientation is a separate, first-class operation applied *after* path generation.

### Machine definitions are declarative

> Define axes as joint chains in YAML/code; IK is solved automatically. Machine files live in `machines/` and are human-readable, diffable, and version-controlled.

## Primitive Type System

All data in the system flows through these typed primitives:

| Primitive | Description |
|---|---|
| `Position` | Named XYZ point in a coordinate frame |
| `Orientation` | Named direction vector / rotation for tool axis |
| `Frame` | Named coordinate system (origin + X, Y, Z axes) |
| `Curve` | Path in 3D space — NURBS, polyline, or parametric |
| `Surface` | Face or region from CAD model |
| `Toolpath` | Curve with orientation + process params at each sample |
| `Variable` | Named value (number, string, boolean) for process logic |
| `OrientRule` | Composable orientation strategy, chainable |

When adding a new feature, map its inputs and outputs to these types first. Node graph connections are typed — a position port connects only to position inputs. If a new primitive type seems genuinely needed, discuss it before adding it.

## Technology Targets

- **Server**: Architecture document targets **FastAPI**; current implementation uses **Flask**. Migrate to FastAPI when refactoring the server — do not add new Flask-specific patterns in the meantime.
- **Node graph**: Target library is **litegraph.js**. The node graph JSON schema is defined in `docs/node_graph_schema.md`. All node graph work must keep the Python API and the graph in sync.
- **Collision detection**: `trimesh` (Python) and `three-mesh-bvh` (JavaScript) for bounding-volume-hierarchy checks.

## Change History

All notable codebase changes are logged in [`history.md`](history.md) at the repo root.

**When to add an entry:** After completing any of the following, prepend a new entry under the current session heading in `history.md`:
- A new feature or component
- A bug fix
- A refactor that changes public APIs or store shape
- A new design rule added to this file
- A new TODO added to `TODO.md`

Each entry should include: what changed, which files were touched, and *why* (the motivation or bug being fixed). Keep entries concise — two to five sentences is enough. Do not log purely mechanical edits (typo fixes, formatting, test-only changes with no behaviour change).

## How I Work With You

Before implementing any feature, I will:
1. **Apply the litmus test** — state whether this is a template or a core primitive, and why.
2. **Map the primitive types** — describe what types the feature consumes and produces.
3. **Check the technology targets** — flag if a proposed approach conflicts with the targets above.

## Testing Requirements

**Every new feature must include tests.** This is a hard rule, not a suggestion.

- **Python library / Flask server changes** → add or update tests in `utde_v0.1.0/tests/` (unit) and/or `tests/` (server integration). Run with `python -m pytest utde_v0.1.0/tests/ tests/ -v`.
- **React frontend changes** → add or update Vitest tests in `utde-app/src/__tests__/`. Run with `cd utde-app && npm test`.
- **New strategy** → test `generate()` output: point count, positions, feed rates, path_type metadata.
- **New orientation rule** → test the rule's effect on orientation vectors, including edge cases (zero-length normal, degenerate geometry).
- **New store action** → test state transitions in the relevant store test file.
- **New API client function** → test with fetch mocks in `api/client.test.js`.
- **New Tauri IPC / backend.js function** → test with `vi.mock("@tauri-apps/api/core")` in `lib/backend.test.js`.

Do not mark a feature complete until its tests pass.
