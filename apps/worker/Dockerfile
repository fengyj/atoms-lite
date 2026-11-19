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

COPY container/server.mjs /opt/preview/server.mjs
COPY container/boot.sh /opt/preview/boot.sh
RUN chmod +x /opt/preview/boot.sh

COPY container/templates/ /opt/templates/

# 依赖在镜像构建时安装一次；项目首次初始化只复制源码并软链 node_modules。
RUN cd /opt/templates/react-vite \
 && npm ci --no-audit --no-fund \
 && npm run build \
 && cd /opt/templates/fullstack-hono \
 && npm ci --no-audit --no-fund \
 && npm run build

WORKDIR /workspace
ENTRYPOINT []

CMD ["sleep", "infinity"]
