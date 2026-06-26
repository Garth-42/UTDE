Universal Toolpath Design Environment.

This is a little project I have been using to learn more about claude code. The intent is to have a way to easily generate GC for toolchangers for processes that aren't FFF.

Think depositing glue on a surface during a build... you need to be able to have a "slicer" that allows you to select an area on a CAD model to deposit material.

For Docs: https://garth-42.github.io/UTDE/

This is very much WIP, and in its current state not tested in any rigorous way and is very much just me playing around with Claude.

## Run as a static web app (no server)

**Hosted:** once deployed, the app is live at **https://garth-42.github.io/UTDE/app/**
— just open the URL; anyone can use it, nothing to install. It's published by
the `Deploy docs + app to GitHub Pages` workflow (docs at `/UTDE/`, app at
`/UTDE/app/`). One-time repo setup: **Settings → Pages → Source → GitHub Actions**.

UTDE can run **entirely in the browser** — no Python server, Docker, SSH, or
tunnels. The toolpath engine runs via [Pyodide](https://pyodide.org) (CPython +
numpy/scipy in WebAssembly) and STEP files are parsed via
[opencascade.js](https://ocjs.org) (the OpenCASCADE CAD kernel in WASM). The
build is a plain static bundle you can host anywhere (GitHub Pages, Netlify, S3,
or any static file server).

```bash
cd utde-app
npm ci
npm run build           # prebuild syncs machines/ and builds the Python wheel
npx serve dist          # or any static host → open the printed URL
```

The first load downloads the WASM runtimes (~tens of MB, cached afterwards;
made a one-time cost by the PWA service worker). Generation, timeline
compilation, linting, machine handling and script execution all run client-side
through the same `toolpath_engine.webapi` core the server uses.

**Notes**

- **Subdirectory hosting** (e.g. GitHub Pages project sites): build with
  `VITE_BASE="/UTDE/" npm run build`.
- **Slicer templates** (`prusaslicer`, `libslic3r`) shell out to external
  binaries and are hidden in the static build (they need a local/server runtime).
- Requires Python with `build` (`pip install build`) at build time to produce
  the `toolpath_engine` wheel — not at runtime.

## Run with Docker

The repo ships a self-contained image that bundles the Python/pythonocc backend
and the compiled React frontend, so the whole app deploys from a fresh clone
with no local toolchain:

```bash
# Build and run (single port serves both the SPA and the API)
docker compose up --build
# → open http://localhost:5174
```

Or with plain Docker:

```bash
docker build -t utde .
docker run --rm -p 5174:5174 utde
# → open http://localhost:5174
```

The image builds the frontend (`npm run build`) at image-build time and serves
the static bundle directly from Flask — Node is **not** needed at runtime. A
single Flask process handles both the `/api/*` requests and the SPA on port
`5174`.

**Configuration** (environment variables):

| Variable | Default | Purpose |
|---|---|---|
| `UTDE_HOST` | `0.0.0.0` | Interface the server binds to inside the container |
| `UTDE_PORT` | `5174` | Port the server listens on |
| `UTDE_STATIC_DIR` | `/app/utde-app/dist` | Compiled frontend bundle to serve |

> This image is the **web** deployment target. The Tauri desktop shell and the
> Xvfb/VNC stack are development-only and live in
> `.devcontainer/devcontainer.json` + `launch.sh`; they are intentionally not
> part of the Docker image.
