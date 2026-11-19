# syntax=docker/dockerfile:1

# Sandbox image for atoms-lite generated apps.
#
# - alpine/git: git + shell
# - nodejs/npm: static server + React/Vite builds
# - sandbox-shim: required by the Cloudflare Sandbox Files API
# - templates: static, React/Vite and Hono + SQLite, dependencies preinstalled

FROM cloudflare/sandbox:1.0.3 AS shim

FROM alpine/git:latest

COPY --from=shim /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN chmod +x /usr/local/bin/sandbox-shim

RUN apk add --no-cache nodejs npm \
 && git config --global user.email "sandbox@atoms-lite.local" \
 && git config --global user.name "atoms-lite sandbox" \
 && git config --global init.defaultBranch main

# 先只复制 package 清单安装依赖，源码改动不会让 npm ci 层失效。
COPY container/templates/react-vite/package.json container/templates/react-vite/package-lock.json /opt/templates/react-vite/
COPY container/templates/fullstack-hono/package.json container/templates/fullstack-hono/package-lock.json /opt/templates/fullstack-hono/

RUN --mount=type=cache,target=/root/.npm \
    cd /opt/templates/react-vite \
 && npm ci --no-audit --no-fund \
 && cd /opt/templates/fullstack-hono \
 && npm ci --no-audit --no-fund

# 模板源码 + 预构建 starter dist
COPY container/templates/ /opt/templates/
RUN cd /opt/templates/react-vite \
 && npm run build \
 && cd /opt/templates/fullstack-hono \
 && npm run build

COPY container/server.mjs /opt/preview/server.mjs
COPY container/boot.sh /opt/preview/boot.sh
RUN chmod +x /opt/preview/boot.sh

# Fail the image build early if node:sqlite is unavailable.
RUN node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/tmp/atoms-check.db"); db.exec("CREATE TABLE t (id INTEGER)"); db.close();' \
 && rm -f /tmp/atoms-check.db

WORKDIR /workspace
ENTRYPOINT []

CMD ["sleep", "infinity"]
