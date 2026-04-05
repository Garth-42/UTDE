#!/usr/bin/env bash
# launch.sh — Start the UTDE virtual display, backend, and frontend
#
# Usage:
#   ./launch.sh          # browser dev mode (full functionality, no Tauri shell)
#   ./launch.sh --tauri  # Tauri desktop mode (uses stub sidecar)
#
# View the UI:
#   Browser dev mode: open http://localhost:3000 in your browser
#   Tauri mode:       open http://localhost:6080/vnc.html → Connect

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$REPO_ROOT/utde-app"
LOG_DIR="$REPO_ROOT/logs"
DISPLAY_NUM=99
VNC_PORT=5900
NOVNC_PORT=6080
FLASK_PORT=5174
VITE_PORT=3000
MODE="browser"

for arg in "$@"; do
  [[ "$arg" == "--tauri" ]] && MODE="tauri"
done

mkdir -p "$LOG_DIR"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[utde]${NC} $*"; }
success() { echo -e "${GREEN}[utde]${NC} $*"; }
warn()    { echo -e "${YELLOW}[utde]${NC} $*"; }
die()     { echo -e "${RED}[utde] ERROR:${NC} $*" >&2; exit 1; }

# ── Cleanup on exit ───────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  info "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
  pkill -f "x11vnc.*:${DISPLAY_NUM}" 2>/dev/null || true
  pkill -f "websockify.*${NOVNC_PORT}" 2>/dev/null || true
  pkill openbox 2>/dev/null || true
  info "Done."
}
trap cleanup EXIT INT TERM

# ── Helper: wait for a TCP port to open ──────────────────────────────────────
wait_for_port() {
  local name="$1" port="$2" timeout="${3:-30}"
  local elapsed=0
  printf "${CYAN}[utde]${NC} Waiting for %s on port %s" "$name" "$port"
  while ! nc -z localhost "$port" 2>/dev/null; do
    sleep 1; elapsed=$((elapsed + 1))
    printf "."
    if [[ $elapsed -ge $timeout ]]; then
      echo ""
      die "$name did not start within ${timeout}s (port $port)"
    fi
  done
  echo ""
  success "$name is ready"
}

# ── 1. Virtual display ────────────────────────────────────────────────────────
info "Setting up virtual display :${DISPLAY_NUM}..."

if pgrep -f "Xvfb :${DISPLAY_NUM}" > /dev/null 2>&1; then
  warn "Xvfb :${DISPLAY_NUM} already running — reusing"
else
  Xvfb ":${DISPLAY_NUM}" -screen 0 1400x900x24 > "$LOG_DIR/xvfb.log" 2>&1 &
  PIDS+=($!)
  sleep 1
fi
export DISPLAY=":${DISPLAY_NUM}"

# ── 2. VNC server ─────────────────────────────────────────────────────────────
if pgrep -f "x11vnc.*:${DISPLAY_NUM}" > /dev/null 2>&1; then
  warn "x11vnc already running — reusing"
else
  x11vnc -display ":${DISPLAY_NUM}" -nopw -listen localhost \
    -xkb -forever -bg -quiet \
    -o "$LOG_DIR/x11vnc.log" 2>/dev/null
  sleep 1
fi

# ── 3. noVNC websocket proxy ──────────────────────────────────────────────────
if pgrep -f "websockify.*${NOVNC_PORT}" > /dev/null 2>&1; then
  warn "noVNC already running on port ${NOVNC_PORT} — reusing"
else
  NOVNC_WEB="$(find /usr/share -name vnc.html 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo /usr/share/novnc)"
  websockify --web "$NOVNC_WEB" "$NOVNC_PORT" "localhost:${VNC_PORT}" \
    --daemon --log-file "$LOG_DIR/novnc.log" 2>/dev/null
fi

# ── 4. Window manager ─────────────────────────────────────────────────────────
if ! pgrep openbox > /dev/null 2>&1; then
  DISPLAY=":${DISPLAY_NUM}" openbox --sm-disable > "$LOG_DIR/openbox.log" 2>&1 &
  PIDS+=($!)
  sleep 0.5
fi

# ── 5. Flask backend ──────────────────────────────────────────────────────────
info "Starting Flask backend on port ${FLASK_PORT}..."
if lsof -ti ":${FLASK_PORT}" > /dev/null 2>&1; then
  warn "Port ${FLASK_PORT} already in use — killing existing process"
  kill "$(lsof -ti ":${FLASK_PORT}")" 2>/dev/null || true
  sleep 1
fi

cd "$REPO_ROOT"
python step_server.py --port "$FLASK_PORT" > "$LOG_DIR/flask.log" 2>&1 &
FLASK_PID=$!
PIDS+=($FLASK_PID)
wait_for_port "Flask backend" "$FLASK_PORT" 15

# ── 6. Frontend ───────────────────────────────────────────────────────────────
cd "$APP_DIR"

if [[ "$MODE" == "tauri" ]]; then
  info "Starting Tauri desktop app..."
  warn "Note: Tauri sidecar is a stub — STEP parsing requires the real sidecar build"
  warn "      See CLAUDE.md for sidecar build instructions"
  DISPLAY=":${DISPLAY_NUM}" npx tauri dev > "$LOG_DIR/tauri.log" 2>&1 &
  PIDS+=($!)
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${GREEN}UTDE is starting in Tauri mode${NC}"
  echo -e "  View desktop: ${CYAN}http://localhost:${NOVNC_PORT}/vnc.html${NC} → Connect"
  echo -e "  Flask logs:   ${LOG_DIR}/flask.log"
  echo -e "  Tauri logs:   ${LOG_DIR}/tauri.log"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
  info "Starting Vite dev server on port ${VITE_PORT}..."
  if lsof -ti ":${VITE_PORT}" > /dev/null 2>&1; then
    warn "Port ${VITE_PORT} already in use — killing existing process"
    kill "$(lsof -ti ":${VITE_PORT}")" 2>/dev/null || true
    sleep 1
  fi
  npm run dev > "$LOG_DIR/vite.log" 2>&1 &
  PIDS+=($!)
  wait_for_port "Vite dev server" "$VITE_PORT" 30

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${GREEN}UTDE is running in browser dev mode${NC}"
  echo -e "  App URL:      ${CYAN}http://localhost:${VITE_PORT}${NC}"
  echo -e "  VNC viewer:   ${CYAN}http://localhost:${NOVNC_PORT}/vnc.html${NC}"
  echo -e "  Flask API:    ${CYAN}http://localhost:${FLASK_PORT}${NC}"
  echo -e "  Logs:         ${LOG_DIR}/"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

echo ""
info "Press Ctrl+C to stop all services"
wait
