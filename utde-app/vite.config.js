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
  // opencascade.js (OCCT WASM) is bundled here. Treat .wasm as an asset URL so
  // its `import wasm from "*.wasm"` resolves to a URL string (Vite's default
  // wasm handling would otherwise hand back an init function), and keep the
  // huge kernel out of the dependency optimizer.
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["opencascade.js"],
  },
  build: {
    // three.js (the 3D viewport engine) is a legitimately large, rarely-changing
    // vendor chunk (~195 kB gzipped) needed on load, so allow up to 800 kB before
    // warning — after the manualChunks split below there's no actionable monolith.
    chunkSizeWarningLimit: 800,
    // Split heavy vendors into separate, long-term-cacheable chunks instead of
    // one ~1.1 MB monolith. Order matters: match the react-* libs before the
    // bare "react" bucket so their paths don't fall through to it.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/three") || id.includes("@react-three")) return "three";
          if (id.includes("reactflow") || id.includes("@reactflow")) return "reactflow";
          if (
            id.includes("codemirror") ||
            id.includes("@uiw") ||
            id.includes("@lezer")
          )
            return "codemirror";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          )
            return "react";
          return "vendor";
        },
      },
    },
  },
  // The app is fully static (no backend). Pyodide loads from a CDN and
  // opencascade.js is bundled; nothing proxies to a server. The /api proxy
  // below is retained only as a dev convenience if a legacy server is run.
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
