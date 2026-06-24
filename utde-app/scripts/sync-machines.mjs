/**
 * Copy the repo's machine definitions into the app's bundled assets so the
 * static (no-server) build can enumerate them. Run via `npm run sync-machines`
 * (wired into prebuild). Keeps the repo `machines/` as the single source.
 */
import { readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "machines");
const dstDir = join(here, "..", "src", "assets", "machines");

mkdirSync(dstDir, { recursive: true });
let n = 0;
for (const f of readdirSync(srcDir)) {
  if (f.endsWith(".yaml") || f.endsWith(".yml")) {
    copyFileSync(join(srcDir, f), join(dstDir, f));
    n++;
  }
}
console.log(`sync-machines: copied ${n} machine file(s) → src/assets/machines/`);
