#!/usr/bin/env bash
# ============================================================================
# UTDE pod entrypoint — runs on EVERY pod start (it's the image's CMD).
#
# The heavy environment is already baked into the image, so this only does the
# fast, per-pod things that depend on the network volume or on RunPod's runtime:
#   1. Start the SSH server (so VS Code Remote-SSH can connect)
#   2. Start Ollama (models cached on the volume)
#   3. Clone the repo into /workspace if it isn't there yet
#   4. Install the repo-coupled bits once (editable package + npm deps)
#   5. Stay alive
#
# Nothing here should be slow on a warm volume — the slow installs live in the
# image. If SSH ever fails, you can still get in via RunPod's web terminal.
# ============================================================================
set -eo pipefail

REPO=/workspace/UTDE
export OLLAMA_MODELS=/workspace/.ollama/models

echo "==> [1/4] Starting SSH server"
mkdir -p ~/.ssh
# $PUBLIC_KEY is injected by RunPod from your account's SSH key.
if [ -n "${PUBLIC_KEY:-}" ]; then
  echo "$PUBLIC_KEY" >> ~/.ssh/authorized_keys
fi
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys 2>/dev/null || true
ssh-keygen -A
mkdir -p /run/sshd
/usr/sbin/sshd
echo "    sshd started"

echo "==> [2/4] Starting Ollama"
mkdir -p "$OLLAMA_MODELS"
ollama serve > /var/log/ollama.log 2>&1 &
# Pull qwen3.6 (~24GB) once. It lands on the /workspace volume (OLLAMA_MODELS),
# so it persists across pods and only downloads on the first boot of a volume.
( sleep 5; ollama pull qwen3.6 ) > /var/log/ollama-pull.log 2>&1 &

echo "==> [3/4] Ensuring repo is present"
if [ ! -d "$REPO" ]; then
  git clone https://github.com/Garth-42/UTDE.git "$REPO"
fi

echo "==> [4/4] Installing repo-coupled dependencies (once per volume)"
# Activate conda base for pip/python.
source /opt/conda/etc/profile.d/conda.sh
conda activate base
cd "$REPO"

# Editable install so Python picks up your live edits. Fast: deps are baked.
pip install -e utde_v0.1.0/ || echo "WARN: editable install failed (check path)"

# npm deps live in the repo on the volume, so they persist across pods.
# Only install if node_modules is missing.
if [ -d utde-app ] && [ ! -d utde-app/node_modules ]; then
  ( cd utde-app \
    && npm install \
    && npm install @uiw/react-codemirror @codemirror/lang-python ) \
    || echo "WARN: npm install failed"
fi

echo "============================================================"
echo " Pod is up. SSH is ready; environment is baked into the image."
echo "   Ollama log:     tail -f /var/log/ollama.log"
echo "   Model pull log: tail -f /var/log/ollama-pull.log"
echo "============================================================"

sleep infinity
