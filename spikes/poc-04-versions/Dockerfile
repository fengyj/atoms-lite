# alpine/git 自带 git，镜像小、拉取快（Debian apt 在这网络下不可用）
FROM alpine/git:latest

RUN git config --global user.email "poc@atoms-lite.local" \
 && git config --global user.name "atoms-lite poc" \
 && git config --global init.defaultBranch main

WORKDIR /workspace

# alpine/git 自带 ENTRYPOINT=git，必须清掉，否则 CMD 会被拼成 `git sleep infinity`
ENTRYPOINT []

CMD ["sleep", "infinity"]
