import { describe, it, expect } from "vitest";
import { manifest, workbox, pwaOptions } from "../../lib/pwa/config";

describe("PWA manifest", () => {
  it("is installable (standalone, name, icons)", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toMatch(/UTDE/);
    expect(manifest.short_name).toBe("UTDE");
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBeTruthy();
  });

  it("registers as a .step/.stp file handler", () => {
    const accept = manifest.file_handlers[0].accept["application/step"];
    expect(accept).toEqual(expect.arrayContaining([".step", ".stp"]));
  });
});

describe("PWA workbox config", () => {
  it("precaches the WASM and wheel assets", () => {
    expect(workbox.globPatterns.join(",")).toMatch(/wasm/);
    expect(workbox.globPatterns.join(",")).toMatch(/whl/);
    // The wheel + vendor chunks exceed Workbox's 2 MB default.
    expect(workbox.maximumFileSizeToCacheInBytes).toBeGreaterThan(2 * 1024 * 1024);
  });

  it("runtime-caches the CDN WASM runtimes (Pyodide / opencascade.js)", () => {
    const rule = workbox.runtimeCaching.find((r) =>
      r.urlPattern.test("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js")
    );
    expect(rule).toBeTruthy();
    expect(rule.handler).toBe("CacheFirst");
    expect(rule.urlPattern.test("https://cdn.jsdelivr.net/npm/opencascade.js/dist/x.wasm")).toBe(true);
  });
});

describe("pwaOptions", () => {
  it("auto-updates and auto-injects the SW registration", () => {
    expect(pwaOptions.registerType).toBe("autoUpdate");
    expect(pwaOptions.injectRegister).toBe("auto");
    expect(pwaOptions.manifest).toBe(manifest);
    expect(pwaOptions.workbox).toBe(workbox);
  });
});
