#!/usr/bin/env bash
# Build the toolpath_engine wheel and place it where the Pyodide worker loads
# it (src/lib/pyodide/wheels/). Pure-Python, so the wheel runs as-is in Pyodide.
#
# Requires Python with `build` (pip install build). Run via `npm run build-wheel`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"
WHEELS_DIR="$APP_DIR/src/lib/pyodide/wheels"

PY="${PYTHON:-python3}"

mkdir -p "$WHEELS_DIR"
rm -f "$WHEELS_DIR"/toolpath_engine-*.whl

"$PY" -m build --wheel "$REPO_ROOT/utde_v0.1.0" --outdir "$WHEELS_DIR"

echo "build-wheel: wrote $(ls "$WHEELS_DIR"/toolpath_engine-*.whl)"
