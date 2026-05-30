# ============================================================================
# UTDE reproducible dev image
#
# This bakes the environment your .devcontainer/devcontainer.json used to build
# at runtime — but into a real Docker image, because RunPod runs a plain image
# and does NOT understand devcontainer.json.
#
# What's baked in here (the slow stuff, installed once at build time):
#   - conda (miniforge) base env: Python 3.12, pythonocc-core, numpy, scipy, ...
#   - the Python libs that don't need the repo (flask, pytest, pyclipper, ...)
#   - your project's Python dependencies + docs requirements
#   - Node 24, Rust + rust-analyzer, GitHub CLI, Claude Code, OpenCode, Ollama
#   - all the webkit/gtk system libraries the Tauri app needs
#   - an SSH server so VS Code Remote-SSH can connect
#
# What is NOT baked in (handled on the pod by entrypoint.sh, because it's tied
# to your live code on the network volume):
#   - cloning the repo into /workspace
#   - `pip install -e` of your package (fast: deps already present)
#   - `npm install` for utde-app (node_modules persists on the volume)
# ============================================================================

FROM condaforge/miniforge3:latest

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=America/Chicago \
    RUSTUP_HOME=/opt/rust/rustup \
    CARGO_HOME=/opt/rust/cargo \
    PATH=/opt/rust/cargo/bin:/root/.opencode/bin:/opt/conda/bin:$PATH

# ---- System packages -------------------------------------------------------
# zstd is required by the Ollama installer (you hit this earlier).
# The lib*-dev packages are the Tauri/webkit GUI build dependencies.
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
      git curl ca-certificates build-essential pkg-config \
      lsof netcat-openbsd zstd pciutils \
      openssh-server \
      xvfb x11vnc openbox novnc websockify \
      libglib2.0-dev libwebkit2gtk-4.1-dev libgtk-3-dev \
      libayatana-appindicator3-dev librsvg2-dev libjavascriptcoregtk-4.1-dev \
    && ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime && echo "$TZ" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# ---- Conda base environment (replaces the miniforge base image + conda step)
RUN conda install -y -n base -c conda-forge \
      python=3.12 pythonocc-core numpy scipy pyyaml gh \
    && conda clean -afy

# ---- Node 24 (replaces the devcontainer "node" feature) --------------------
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ---- Rust + rust-analyzer (replaces the "rust" feature) --------------------
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain stable \
    && rustup component add rust-analyzer

# ---- Claude Code + OpenCode (replaces the "claude-code" feature + your
#      postCreateCommand opencode install) ------------------------------------
RUN npm install -g @anthropic-ai/claude-code \
    && curl -fsSL https://opencode.ai/install | bash

# ---- Ollama ----------------------------------------------------------------
RUN curl -fsSL https://ollama.com/install.sh | sh

# ---- Python libraries (the parts of postCreateCommand that don't need code) -
RUN pip install --no-cache-dir flask flask-cors pytest pyclipper

# ---- Your project's Python dependencies ------------------------------------
# We copy ONLY the dependency sources so this layer is cached unless they change.
# Installing the package here (non-editable) pulls its dependencies into the
# image so they persist; entrypoint.sh later re-installs it editable against
# your live code on the volume (which is fast because deps already exist).
# NOTE: adjust these paths if your repo layout differs.
COPY utde_v0.1.0/ /tmp/utde_pkg/
COPY docs/requirements.txt /tmp/docs-requirements.txt
# docs/requirements.txt ends with `-e ./utde_v0.1.0`, a repo-relative editable
# install that does not resolve inside the build context — and the package is
# already installed from /tmp/utde_pkg above — so strip that self-reference and
# install only the remaining docs deps (mkdocs, etc.).
RUN pip install --no-cache-dir /tmp/utde_pkg/ \
    && grep -v '^[[:space:]]*-e' /tmp/docs-requirements.txt > /tmp/docs-deps.txt \
    && pip install --no-cache-dir -r /tmp/docs-deps.txt \
    && rm -rf /tmp/utde_pkg /tmp/docs-requirements.txt /tmp/docs-deps.txt

# ---- Login-shell environment for SSH sessions ------------------------------
# sshd starts fresh login shells that don't inherit Docker ENV, so write a
# profile snippet that sets everything up for interactive terminals.
RUN printf '%s\n' \
    'export RUSTUP_HOME=/opt/rust/rustup' \
    'export CARGO_HOME=/opt/rust/cargo' \
    'export OLLAMA_MODELS=/workspace/.ollama/models' \
    'export PATH=/opt/rust/cargo/bin:/root/.opencode/bin:/opt/conda/bin:$PATH' \
    'source /opt/conda/etc/profile.d/conda.sh' \
    'conda activate base' \
    > /etc/profile.d/10-utde-env.sh

# ---- Entrypoint ------------------------------------------------------------
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Clear any inherited entrypoint so RunPod's start command (or our CMD) runs cleanly.
ENTRYPOINT []
CMD ["/usr/local/bin/entrypoint.sh"]
