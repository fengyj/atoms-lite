# 用体积较小的官方镜像做 base，避免拉取大镜像
FROM node:22-bookworm-slim

WORKDIR /workspace
RUN echo "atoms-lite poc-00" > /workspace/poc.txt

CMD ["sleep", "infinity"]
