import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
