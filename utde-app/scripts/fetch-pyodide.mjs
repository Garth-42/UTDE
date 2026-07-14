#!/usr/bin/env node
/**
 * Download a self-hosted Pyodide runtime into public/pyodide/ so the app can
 * boot without the jsDelivr CDN (offline / air-gapped / privacy). Run it with:
 *
 *     npm run fetch-pyodide
 *
 * Then build/serve with VITE_PYODIDE_INDEX_URL=/pyodide/ (see .env.example).
 *
 * It grabs the core runtime files plus exactly the packages the worker loads
 * (WANTED_PACKAGES) and their transitive dependencies, resolved from the
 * distribution's pyodide-lock.json — not the whole ~300 MB package set.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePackageFiles, WANTED_PACKAGES } from "./pyodideLock.mjs";

// Keep this version in sync with src/lib/pyodide/client.js (CDN_PYODIDE_INDEX).
const PYODIDE_VERSION = process.env.PYODIDE_VERSION || "0.26.2";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const CORE_FILES = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "pyodide");

async function download(name) {
  const res = await fetch(CDN + name);
  if (!res.ok) throw new Error(`fetch ${name} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(OUT_DIR, name), buf);
  return buf;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Fetching Pyodide ${PYODIDE_VERSION} → ${OUT_DIR}`);

  for (const f of CORE_FILES) {
    process.stdout.write(`  core ${f} … `);
    await download(f);
    console.log("ok");
  }

  const lock = JSON.parse(await readFile(join(OUT_DIR, "pyodide-lock.json"), "utf8"));
  const { files, packages, missing } = resolvePackageFiles(lock, WANTED_PACKAGES);
  if (missing.length) {
    console.warn(`  WARNING: not found in lock: ${missing.join(", ")}`);
  }
  console.log(`  packages (${packages.length}): ${packages.join(", ")}`);

  for (const f of files) {
    process.stdout.write(`  pkg ${f} … `);
    await download(f);
    console.log("ok");
  }

  console.log(
    `\nDone (${CORE_FILES.length + files.length} files). ` +
      `Build with VITE_PYODIDE_INDEX_URL=/pyodide/ to use it.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
