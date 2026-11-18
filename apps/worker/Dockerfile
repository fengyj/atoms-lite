# Alpine + git 自带 git/shell；只补 node。sandbox-shim 从官方镜像拷入。
FROM cloudflare/sandbox:1.0.3 AS shim

FROM alpine/git:latest

COPY --from=shim /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN chmod +x /usr/local/bin/sandbox-shim

RUN apk add --no-cache nodejs \
 && git config --global user.email "sandbox@atoms-lite.local" \
 && git config --global user.name "atoms-lite sandbox" \
 && git config --global init.defaultBranch main

COPY container/server.mjs /opt/preview/server.mjs
COPY container/template/ /opt/template/

WORKDIR /workspace
ENTRYPOINT []

CMD ["sleep", "infinity"]
