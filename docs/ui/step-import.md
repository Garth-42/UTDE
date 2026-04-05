# STEP Import

The **STEP FILE** panel at the top of the sidebar handles all file loading.

## Loading a file

**Browser mode:** Drag a `.step` or `.stp` file onto the drop zone, or click it to open a file-picker.

**Tauri desktop mode:** Click the drop zone to open a native OS file dialog filtered to `.step` and `.stp` files (both upper and lowercase extensions). Alternatively, drag a file onto the drop zone — Tauri provides the file path directly to the server.

The file name is shown in the drop zone once geometry has been loaded.

## Mesh quality

The **Mesh** slider (1–10) controls the tessellation tolerance passed to the server-side OpenCASCADE parser.

| Slider value | Label | Deflection (mm) | Use when |
|---|---|---|---|
| 1–2 | **Draft** | 2.0–1.0 | Initial exploration, fast load |
| 3–5 | **Med** | 0.67–0.4 | General use |
| 6–8 | **Fine** | 0.33–0.25 | Curved surfaces, normal-based orientation rules |
| 9–10 | **Max** | 0.22–0.2 | Maximum accuracy |

The default is **2 (Draft)** for fast initial load. Release the slider to automatically re-parse the loaded file at the new quality level — no manual reload needed.

!!! tip
    Start at Draft to inspect geometry and verify face/edge selection. Increase quality only when computing surface-normal orientation rules or toolpaths that follow curved faces closely.

## Server requirement

STEP parsing runs on a local Python server powered by `pythonocc-core`.

**Browser mode:** If the server is not running, start it manually:
```bash
python step_server.py
```

**Tauri desktop mode:** The server is started automatically at app launch. A splash screen is shown while the server initialises (~2 seconds on first run).

## Session management

The **Import Session** button loads a previously exported `.json` session file. This restores selection state (selected face IDs, edge IDs) and strategy configuration. Because geometry is stored on the server, the STEP file itself must be re-uploaded after importing a session.

To export a session, use the **Export Session** button in the Toolpath sidebar.
