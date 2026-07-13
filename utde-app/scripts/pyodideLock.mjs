/**
 * Resolve which Pyodide package files to download for a set of wanted packages,
 * following the `depends` graph in a pyodide-lock.json.
 *
 * Pure (no I/O) so it can be unit-tested; used by scripts/fetch-pyodide.mjs.
 */

/** Packages the worker loads via loadPackage — keep in sync with worker.js. */
export const WANTED_PACKAGES = ["micropip", "numpy", "scipy", "pyyaml"];

/**
 * @param {{packages?: Record<string, {file_name?: string, depends?: string[]}>}} lock
 * @param {string[]} wanted
 * @returns {{files: string[], packages: string[], missing: string[]}}
 */
export function resolvePackageFiles(lock, wanted) {
  const packages = (lock && lock.packages) || {};
  const byName = new Map();
  for (const key of Object.keys(packages)) {
    byName.set(key.toLowerCase(), packages[key]);
  }

  const seen = new Set();
  const files = new Set();
  const missing = new Set();
  const stack = [...(wanted || [])];

  while (stack.length) {
    const name = String(stack.pop()).toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const pkg = byName.get(name);
    if (!pkg) {
      missing.add(name);
      continue;
    }
    if (pkg.file_name) files.add(pkg.file_name);
    for (const dep of pkg.depends || []) stack.push(dep);
  }

  return {
    files: [...files].sort(),
    packages: [...seen].filter((n) => !missing.has(n)).sort(),
    missing: [...missing].sort(),
  };
}
