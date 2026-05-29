# syntax=docker/dockerfile:1
#
# UTDE — Universal Toolpath Design Environment
# Self-contained deployment image: a single container that serves the compiled
# React frontend and the Flask/pythonocc API from one port (5174).
#
#   docker build -t utde .
#   docker run --rm -p 5174:5174 utde
#   → open http://localhost:5174
#
# This is the "web only" deployment target. It does NOT include the Tauri
# desktop shell or the Xvfb/VNC stack used by the dev container — those are for
# local development (see .devcontainer/devcontainer.json and launch.sh).

# ───────────────────────────────────────────────────────────────────────────
# Stage 1 — build the React frontend into a static bundle
# ───────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS frontend

WORKDIR /app/utde-app

# Install dependencies first so this layer caches across source-only changes.
COPY utde-app/package.json utde-app/package-lock.json ./
RUN npm ci

COPY utde-app/ ./
RUN npm run build          # → /app/utde-app/dist

# ───────────────────────────────────────────────────────────────────────────
# Stage 2 — Python/CAD runtime (mirrors the dev container's conda base env)
# ───────────────────────────────────────────────────────────────────────────
FROM condaforge/miniforge3:latest AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    UTDE_HOST=0.0.0.0 \
    UTDE_PORT=5174 \
    UTDE_STATIC_DIR=/app/utde-app/dist

# CAD / numerics stack — only available from conda-forge (pythonocc-core).
RUN conda install -y -n base -c conda-forge \
        python=3.12 pythonocc-core numpy scipy pyyaml && \
    conda clean -afy

WORKDIR /app

# Install the toolpath engine (editable) plus the server's runtime deps.
COPY utde_v0.1.0/ ./utde_v0.1.0/
RUN conda run -n base pip install --no-cache-dir flask flask-cors pyclipper && \
    conda run -n base pip install --no-cache-dir -e ./utde_v0.1.0/

# Application code. step_server.py resolves machines/ and utde_v0.1.0/ relative
# to its own location, so this layout must be preserved.
COPY step_server.py ./
COPY machines/ ./machines/

# Compiled frontend from stage 1 (served from $UTDE_STATIC_DIR).
COPY --from=frontend /app/utde-app/dist ./utde-app/dist

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD conda run -n base python -c \
        "import os,urllib.request,sys; \
         urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('UTDE_PORT','5174')+'/health'); \
         sys.exit(0)" || exit 1

# `conda run` ensures the base env's interpreter and shared libs (pythonocc) are
# on PATH. --no-capture-output streams logs straight to the container's stdout.
CMD ["conda", "run", "--no-capture-output", "-n", "base", \
     "python", "step_server.py", "--host", "0.0.0.0"]
