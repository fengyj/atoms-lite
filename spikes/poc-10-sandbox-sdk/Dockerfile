# 官方镜像只包含 sandbox-shim（无 shell），把它拷进完整镜像
FROM cloudflare/sandbox:1.0.3 AS shim

FROM node:22-bookworm-slim

COPY --from=shim /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN chmod +x /usr/local/bin/sandbox-shim \
 && mkdir -p /workspace \
 && echo "base-image" > /workspace/base.txt

WORKDIR /workspace
ENTRYPOINT []

CMD ["sleep", "infinity"]
