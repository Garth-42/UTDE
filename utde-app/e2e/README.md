# Desktop E2E (WebdriverIO + tauri-driver)

End-to-end smoke test that launches the **packaged Tauri app** and asserts the
bundled SPA renders inside the native webview — the one runtime check CI can
give for the browser-only desktop architecture (WebKitGTK on Linux, WebView2 on
Windows). It runs in the `e2e-linux` job of `.github/workflows/desktop.yml`.

> **macOS is intentionally excluded.** WKWebView has no WebDriver support, so the
> "Pyodide boots in the webview" check on macOS is a **manual** smoke test:
> `npx tauri dev`, import a STEP file, confirm geometry appears.

## Run locally (Linux)

```bash
# System deps: webkit2gtk-driver provides WebKitWebDriver
sudo apt-get install -y webkit2gtk-driver xvfb
cargo install tauri-driver --locked

cd utde-app
npm ci
# Build via the Tauri CLI so the binary serves the embedded dist/ (a raw
# `cargo build` loads devUrl / localhost:3000 instead). → target/release/app
npx tauri build --no-bundle

cd e2e
npm install
xvfb-run -a npm test
```

## Status & next step

This harness is a **scaffold**: the `e2e-linux` CI job is `continue-on-error`
until the first real run confirms the tauri-driver capability shape and the
selectors. Once green:

1. Flip `continue-on-error: false` in `desktop.yml`.
2. Extend `specs/smoke.e2e.cjs` to exercise the **engine**: drive a timeline
   compile (or the Script runner), then assert the Pyodide runtime reaches
   "ready" and G-code appears. That upgrades the test from "webview loads the
   SPA" to "Pyodide + opencascade.js actually run on the desktop." Use the
   self-hosted Pyodide assets (the job already runs `npm run fetch-pyodide` and
   builds with `VITE_PYODIDE_INDEX_URL=/pyodide/`) so the run stays hermetic.
