import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "./src/lib/pwa/config";

export default defineConfig({
  plugins: [
    react(),
    // Disabled under Vitest so the SW build doesn't run during unit tests.
    VitePWA({ ...pwaOptions, disable: !!process.env.VITEST }),
  ],
  // Deploy base path. Default "/" suits a domain root or RunPod proxy; set
  // VITE_BASE="/UTDE/" (repo name) when publishing to GitHub Pages project sites.
  base: process.env.VITE_BASE || "/",
  // The app is fully static (no backend). The Pyodide worker and opencascade.js
  // load from a CDN; nothing proxies to a server anymore. The /api proxy below
  // is retained only as a dev convenience if a legacy server is run alongside.
  server: {
    host: true,        // bind 0.0.0.0 so the devcontainer's port forward works
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5174",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        proxyTimeout: 45000,
        timeout: 45000,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
