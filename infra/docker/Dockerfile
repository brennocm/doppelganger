# Doppelgänger Pro engine (local-runtime Requirement 5). Three stages:
#   web      Node: build the web app for /app/ from pnpm-lock.yaml
#   python   install the engine's runtime dependencies from uv.lock (hashes required)
#   runtime  slim Python with only the virtualenv and the web build, as UID 10001
# Base images are pinned by digest; bump the tag and the digest together.

FROM node:26.13.0-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS web
WORKDIR /src
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/landing/package.json apps/landing/
COPY packages/model-lab/bench-web/package.json packages/model-lab/bench-web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/detector/package.json packages/detector/
COPY packages/tokens/package.json packages/tokens/
RUN pnpm install --frozen-lockfile --filter @doppelganger/web... --ignore-scripts
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/detector packages/detector
COPY packages/tokens packages/tokens
RUN pnpm --filter @doppelganger/web exec vite build --base=/app/ --outDir /out/web --emptyOutDir

FROM python:3.12.16-slim-trixie@sha256:8523d6abeb48ceae0b7240d30c5808fc26cb79c1a635bacdf19cf3baecfbec07 AS python
COPY --from=ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 /uv /usr/local/bin/uv
WORKDIR /src
ENV UV_PYTHON_DOWNLOADS=never UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
COPY apps/engine apps/engine
COPY packages/contracts packages/contracts
COPY packages/model-lab packages/model-lab
COPY packages/doppelganger-mcp/pyproject.toml packages/doppelganger-mcp/
# Runtime dependencies only (no dev group, no "lab" extra), with hashes from uv.lock.
RUN uv export --locked --package doppelganger-engine --no-dev --no-emit-workspace \
      --format requirements-txt --quiet > /tmp/requirements.txt \
 && uv venv /opt/venv --python /usr/local/bin/python3.12 \
 && uv pip install --python /opt/venv/bin/python --require-hashes --no-deps -r /tmp/requirements.txt \
 && uv pip install --python /opt/venv/bin/python --no-deps \
      ./packages/contracts ./packages/model-lab ./apps/engine

FROM python:3.12.16-slim-trixie@sha256:8523d6abeb48ceae0b7240d30c5808fc26cb79c1a635bacdf19cf3baecfbec07 AS runtime
LABEL org.opencontainers.image.title="doppelganger-engine" \
      org.opencontainers.image.licenses="MIT"
# No compilers or build tools: only the virtualenv and the static web build are copied.
COPY --from=python /opt/venv /opt/venv
COPY --from=web /out/web /srv/web
RUN groupadd --system --gid 10001 engine \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin engine
ENV PATH=/opt/venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PORT=8787 MODEL_DIR=/models LOG_LEVEL=info
USER 10001:10001
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8787/healthz', timeout=2).status == 200 else 1)"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["python", "-m", "doppelganger_engine"]
