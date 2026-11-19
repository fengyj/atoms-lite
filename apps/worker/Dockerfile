# syntax=docker/dockerfile:1

# Sandbox image for atoms-lite generated apps.
#
# Node 24 on Debian (glibc) avoids musl/native-module surprises for pnpm packages.
# sandbox-shim is required by the Cloudflare Sandbox Files API.

FROM cloudflare/sandbox:1.0.3 AS shim

FROM node:24-bookworm-slim

COPY --from=shim /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN chmod +x /usr/local/bin/sandbox-shim

RUN apt-get update \
 && apt-get install -y --no-install-recommends -o Acquire::Retries=3 \
      git ca-certificates procps \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@11.6.0 \
 && git config --global user.email "sandbox@atoms-lite.local" \
 && git config --global user.name "atoms-lite sandbox" \
 && git config --global init.defaultBranch main

RUN printf 'registry=https://registry.npmmirror.com\n' > /root/.npmrc

# 先只复制 package 清单安装依赖，源码改动不会让依赖安装层失效。
COPY container/templates/react-vite/package.json container/templates/react-vite/pnpm-lock.yaml container/templates/react-vite/pnpm-workspace.yaml /opt/templates/react-vite/
COPY container/templates/fullstack-hono/package.json container/templates/fullstack-hono/pnpm-lock.yaml container/templates/fullstack-hono/pnpm-workspace.yaml /opt/templates/fullstack-hono/

RUN --mount=type=cache,target=/pnpm-store \
    cd /opt/templates/react-vite \
 && pnpm install --frozen-lockfile --store-dir /pnpm-store \
 && cd /opt/templates/fullstack-hono \
 && pnpm install --frozen-lockfile --store-dir /pnpm-store

# 模板源码 + 预构建 starter dist
COPY container/templates/ /opt/templates/
RUN cd /opt/templates/react-vite \
 && pnpm build \
 && cd /opt/templates/fullstack-hono \
 && pnpm build

COPY container/server.mjs /opt/preview/server.mjs
COPY container/boot.sh /opt/preview/boot.sh
RUN chmod +x /opt/preview/boot.sh

# Fail the image build early if node:sqlite is unavailable.
RUN node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/tmp/atoms-check.db"); db.exec("CREATE TABLE t (id INTEGER)"); db.close();' \
 && rm -f /tmp/atoms-check.db

WORKDIR /workspace
ENTRYPOINT []

CMD ["sleep", "infinity"]
