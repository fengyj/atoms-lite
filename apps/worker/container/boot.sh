#!/bin/sh
# Preview supervisor.
#
# PID 1 of the sandbox. Keeps a single child process on :8080:
# - static: /opt/preview/server.mjs (root from .atoms-lite/runtime.json serveDir)
# - node:   project start command (e.g. `node server/index.js`)
#
# Reload protocol: `touch /workspace/.atoms-lite/restart` makes the supervisor
# stop the child and re-read runtime.json. WorkspaceDO uses this after seed,
# build and start_preview. `.atoms/` is the legacy location kept for old
# snapshots; new workspaces only use `.atoms-lite/`.

cd /workspace || exit 1
: >/tmp/preview.log

runtime_file() {
  for file in /workspace/.atoms-lite/runtime.json /workspace/.atoms/runtime.json; do
    if [ -f "$file" ]; then
      echo "$file"
      return
    fi
  done
  echo /workspace/.atoms-lite/runtime.json
}

read_field() {
  node -e '
    const fs = require("node:fs");
    const key = process.argv[1];
    const file = process.argv[2];
    try {
      const runtime = JSON.parse(fs.readFileSync(file, "utf8"));
      const value = runtime[key];
      if (value !== undefined && value !== null) process.stdout.write(String(value));
    } catch {}
  ' "$1" "$(runtime_file)"
}

restart_requested() {
  [ -f /workspace/.atoms-lite/restart ] || [ -f /workspace/.atoms/restart ]
}

clear_restart() {
  rm -f /workspace/.atoms-lite/restart /workspace/.atoms/restart
}

# 只在启动时清理一次。循环顶部不再清理，避免刚好在启动子进程时
# 吞掉 DO 刚写入的 restart 信号。
clear_restart
while true; do
  KIND="$(read_field kind)"
  [ -z "$KIND" ] && KIND="static"

  if [ "$KIND" = "node" ]; then
    START="$(read_field startCommand)"
    [ -z "$START" ] && START="node /opt/preview/server.mjs"
    sh -c "$START" >>/tmp/preview.log 2>&1 &
    CHILD=$!
  else
    ROOT="$(read_field serveDir)"
    [ -z "$ROOT" ] && ROOT="."
    PREVIEW_ROOT="/workspace/$ROOT" node /opt/preview/server.mjs >>/tmp/preview.log 2>&1 &
    CHILD=$!
  fi

  # Wait for the child to exit or a restart request.
  while kill -0 "$CHILD" 2>/dev/null; do
    if restart_requested; then
      clear_restart
      kill "$CHILD" 2>/dev/null
      sleep 2
      kill -9 "$CHILD" 2>/dev/null
      break
    fi
    sleep 1
  done

  wait "$CHILD" 2>/dev/null
  # Avoid a tight crash loop if the app exits immediately.
  sleep 1
done
