#!/bin/sh
# Preview supervisor.
#
# PID 1 of the sandbox. Keeps a single child process on :8080:
# - static: /opt/preview/server.mjs (root from .atoms/runtime.json serveDir)
# - node:   project start command (e.g. `node server/index.js`)
#
# Reload protocol: `touch /workspace/.atoms/restart` makes the supervisor
# stop the child and re-read runtime.json. WorkspaceDO uses this after seed,
# build and start_preview.

cd /workspace || exit 1
mkdir -p /workspace/.atoms
: >/tmp/preview.log

read_field() {
  node -e '
    const fs = require("node:fs");
    const key = process.argv[1];
    try {
      const runtime = JSON.parse(fs.readFileSync("/workspace/.atoms/runtime.json", "utf8"));
      const value = runtime[key];
      if (value !== undefined && value !== null) process.stdout.write(String(value));
    } catch {}
  ' "$1"
}

while true; do
  rm -f /workspace/.atoms/restart

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
    if [ -f /workspace/.atoms/restart ]; then
      rm -f /workspace/.atoms/restart
      kill "$CHILD" 2>/dev/null
      break
    fi
    sleep 1
  done

  wait "$CHILD" 2>/dev/null
  # Avoid a tight crash loop if the app exits immediately.
  sleep 1
done
