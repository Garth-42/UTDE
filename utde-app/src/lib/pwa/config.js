/**
 * Progressive Web App configuration for UTDE.
 *
 * Kept as a plain, importable module so it can be unit-tested and shared with
 * vite.config.js. Goals:
 *   - Installable, standalone-window app (a no-Rust alternative to the Tauri shell).
 *   - Offline after first load: precache the app bundle + the Python wheel, and
 *     runtime-cache the large CDN WASM runtimes (Pyodide, opencascade.js) so the
 *     heavy first download becomes a one-time cost.
 *   - Register as a handler for .step/.stp files (Chromium File Handling API).
 */

export const manifest = {
  name: "UTDE — Universal Toolpath Design Environment",
  short_name: "UTDE",
  description:
    "Process-agnostic, programmable multi-axis toolpath generation — runs entirely in the browser.",
  theme_color: "#0b0f14",
  background_color: "#0b0f14",
  display: "standalone",
  start_url: ".",
  scope: ".",
  icons: [
    { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
  ],
  // Let the OS hand .step/.stp files to the installed app (Chromium).
  file_handlers: [
    {
      action: ".",
      accept: {
        "application/step": [".step", ".stp", ".STEP", ".STP"],
      },
    },
  ],
};

export const workbox = {
  // Precache the built app, including the WASM/wheel assets we ship.
  globPatterns: ["**/*.{js,css,html,svg,wasm,whl,json,ico}"],
  // The toolpath_engine wheel + large vendor chunks exceed the 2 MB default.
  maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      // Pyodide + opencascade.js (and their packages) load from jsdelivr.
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "utde-cdn-wasm",
        expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};

export const pwaOptions = {
  registerType: "autoUpdate",
  injectRegister: "auto", // injects SW registration into index.html — no app code change
  includeAssets: ["icon.svg"],
  manifest,
  workbox,
};

export default pwaOptions;
