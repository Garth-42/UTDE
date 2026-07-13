// WebdriverIO config for the UTDE desktop E2E smoke test.
//
// tauri-driver bridges WebDriver to the native webview (WebKitWebGTK on Linux,
// WebView2 on Windows). It must be on PATH: `cargo install tauri-driver`.
// macOS is unsupported by design (WKWebView has no WebDriver).
//
// SCAFFOLD: this is validated on its first CI run; expect to tune the
// capability shape / selectors once. See ./README.md.

const { spawn } = require("node:child_process");
const path = require("node:path");

// The compiled debug binary (Cargo [package] name = "app").
const application = path.resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "app.exe" : "app"
);

let tauriDriver;

exports.config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.cjs"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": { application },
    },
  ],
  hostname: "127.0.0.1",
  port: 4444,
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120000 },

  // Start/stop tauri-driver around the session.
  onPrepare: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
    });
  },
  afterSession: () => {
    if (tauriDriver) tauriDriver.kill();
  },
};
