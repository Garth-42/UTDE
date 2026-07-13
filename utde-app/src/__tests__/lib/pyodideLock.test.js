import { describe, it, expect } from "vitest";
import { resolvePackageFiles, WANTED_PACKAGES } from "../../../scripts/pyodideLock.mjs";

// Minimal synthetic pyodide-lock.json: scipy depends on numpy + openblas,
// micropip on packaging. Mirrors the real lock's { packages: { name: {...} } }.
const LOCK = {
  packages: {
    micropip: { name: "micropip", file_name: "micropip-0.1-py3-none-any.whl", depends: ["packaging"] },
    packaging: { name: "packaging", file_name: "packaging-23-py3-none-any.whl", depends: [] },
    numpy: { name: "numpy", file_name: "numpy-1.26.whl", depends: [] },
    scipy: { name: "scipy", file_name: "scipy-1.12.whl", depends: ["numpy", "openblas"] },
    openblas: { name: "openblas", file_name: "openblas-0.3.whl", depends: [] },
    pyyaml: { name: "pyyaml", file_name: "pyyaml-6.0.whl", depends: [] },
  },
};

describe("resolvePackageFiles", () => {
  it("collects a package and its transitive dependencies", () => {
    const { files, packages, missing } = resolvePackageFiles(LOCK, ["scipy"]);
    expect(missing).toEqual([]);
    // scipy → numpy, openblas
    expect(packages).toEqual(["numpy", "openblas", "scipy"]);
    expect(files).toEqual(["numpy-1.26.whl", "openblas-0.3.whl", "scipy-1.12.whl"]);
  });

  it("resolves the full worker package set without duplicates", () => {
    const { files, missing } = resolvePackageFiles(LOCK, WANTED_PACKAGES);
    expect(missing).toEqual([]);
    // Deduped even though numpy is reached via both scipy and directly.
    expect(new Set(files).size).toBe(files.length);
    expect(files).toContain("pyyaml-6.0.whl");
    expect(files).toContain("micropip-0.1-py3-none-any.whl");
    expect(files).toContain("packaging-23-py3-none-any.whl");
  });

  it("reports unknown packages as missing rather than throwing", () => {
    const { missing, files } = resolvePackageFiles(LOCK, ["numpy", "ghost-pkg"]);
    expect(missing).toEqual(["ghost-pkg"]);
    expect(files).toEqual(["numpy-1.26.whl"]);
  });

  it("is safe on an empty/garbage lock", () => {
    expect(resolvePackageFiles({}, ["numpy"]).missing).toEqual(["numpy"]);
    expect(resolvePackageFiles(null, []).files).toEqual([]);
  });
});
