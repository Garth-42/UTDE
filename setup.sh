#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# UTDE pod setup  (Path 2: native install, no Docker / no dev container)
#
# Translates .devcontainer/devcontainer.json into plain install steps that
# run directly on a RunPod pod using the ollama/ollama base image.
#
# USAGE
#   First boot on a fresh volume:   bash /workspace/setup.sh
#   It is safe to re-run — steps that are already done are skipped.
#
# WHAT PERSISTS vs WHAT DOESN'T
#   Persists on the network volume (installed once):
#     - conda + all conda/pip packages   -> /workspace/miniforge3
#     - node + npm global packages        -> /workspace/.nvm
#     - rust toolchain                     -> /workspace/.cargo, /workspace/.rustup
#     - the repo's node_modules            -> lives in the repo on the volume
#   Reinstalls every fresh container (cannot live on the volume):
#     - apt system libraries (the webkit/gtk build deps)
#
# AFTER RUNNING: in every new shell, run  `source /workspace/env.sh`
# (or have your pod start command do it — see the notes I sent in chat).
# ───────────────────────────────────────────────────────────────────────────

set -eo pipefail   # note: no -u, because conda's activation scripts trip on it

REPO=/workspace/UTDE
MINIFORGE=/workspace/miniforge3
export CARGO_HOME=/workspace/.cargo
export RUSTUP_HOME=/workspace/.rustup
export NVM_DIR=/workspace/.nvm
export DEBIAN_FRONTEND=noninteractive
export TZ=America/Chicago

echo "==> 1/8  System packages (apt) — these reinstall on each fresh container"
apt-get update -qq
apt-get install -y \
  git curl build-essential pkg-config lsof netcat-openbsd \
  xvfb x11vnc openbox novnc websockify \
  libglib2.0-dev libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libjavascriptcoregtk-4.1-dev

echo "==> 2/8  Timezone"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone

echo "==> 3/8  Miniforge (conda)"
if [ ! -d "$MINIFORGE" ]; then
  curl -fsSL -o /tmp/miniforge.sh \
    "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh"
  bash /tmp/miniforge.sh -b -p "$MINIFORGE"
else
  echo "    already installed, skipping"
fi
source "$MINIFORGE/etc/profile.d/conda.sh"
conda activate base

echo "==> 4/8  Conda base env packages (python 3.12, pythonocc, gh, etc.)"
if [ ! -f /workspace/.setup_conda_done ]; then
  conda install -y -n base -c conda-forge \
    python=3.12 pythonocc-core numpy scipy pyyaml gh
  touch /workspace/.setup_conda_done
else
  echo "    already installed, skipping (delete /workspace/.setup_conda_done to redo)"
fi

echo "==> 5/8  Python project dependencies"
cd "$REPO"
pip install flask flask-cors pytest pyclipper
pip install -e utde_v0.1.0/
[ -f docs/requirements.txt ] && pip install -r docs/requirements.txt

echo "==> 6/8  Node 24 (nvm) + frontend dependencies"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  mkdir -p "$NVM_DIR"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
source "$NVM_DIR/nvm.sh"
nvm install 24
nvm use 24
cd "$REPO/utde-app"
npm install
npm install @uiw/react-codemirror @codemirror/lang-python

echo "==> 7/8  Rust toolchain + rust-analyzer"
if [ ! -d "$RUSTUP_HOME" ]; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path
fi
source "$CARGO_HOME/env"
rustup component add rust-analyzer || true

echo "==> 8/8  CLIs: Claude Code + OpenCode"
npm install -g @anthropic-ai/claude-code || true
curl -fsSL https://opencode.ai/install | bash || true

# ── Write an env file that every new shell can source ──────────────────────
cat > /workspace/env.sh <<'EOF'
# Source this in each new shell:  source /workspace/env.sh
export CARGO_HOME=/workspace/.cargo
export RUSTUP_HOME=/workspace/.rustup
export NVM_DIR=/workspace/.nvm
export OLLAMA_MODELS=/workspace/.ollama/models
source /workspace/miniforge3/etc/profile.d/conda.sh
conda activate base
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
[ -s "$CARGO_HOME/env" ] && source "$CARGO_HOME/env"
export PATH="$HOME/.opencode/bin:$PATH"
EOF

echo
echo "============================================================"
echo " Setup complete."
echo " In each new shell run:   source /workspace/env.sh"
echo " Then check things work:  python -c 'import OCC; print(\"OCC ok\")'"
echo "                          node --version"
echo "                          cargo --version"
echo "============================================================"
