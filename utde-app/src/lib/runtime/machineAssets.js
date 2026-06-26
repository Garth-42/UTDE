/**
 * Bundled machine definitions for the static (no-server) build.
 *
 * Vite inlines every YAML under src/assets/machines as a raw string at build
 * time (kept in sync from the repo `machines/` dir by scripts/sync-machines.mjs).
 * The id is the file basename, matching the server's /machines behaviour.
 */

const raw = import.meta.glob("../../assets/machines/*.{yaml,yml}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function basename(path) {
  const file = path.split("/").pop() || path;
  return file.replace(/\.(ya?ml)$/i, "");
}

/** Array of { id, text } for every bundled machine YAML. */
export const machineYamls = Object.entries(raw)
  .map(([path, text]) => ({ id: basename(path), text }))
  .sort((a, b) => a.id.localeCompare(b.id));
