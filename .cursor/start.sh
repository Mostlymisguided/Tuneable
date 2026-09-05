#!/usr/bin/env bash
# Per-boot startup for the Tuneable Cloud Agent environment.
# Launches the local MongoDB daemon and waits until it is ready to serve.
# Idempotent: a running mongod is detected and reused.
set -euo pipefail

DBPATH="$HOME/.tuneable/mongodb"
LOGPATH="$HOME/.tuneable/log/mongod.log"
mkdir -p "$DBPATH" "$(dirname "$LOGPATH")"

if mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
  echo "==> MongoDB already running on 127.0.0.1:27017"
  exit 0
fi

echo "==> Starting MongoDB (dbpath=$DBPATH)"
mongod --dbpath "$DBPATH" --bind_ip 127.0.0.1 --port 27017 \
       --logpath "$LOGPATH" --logappend --fork

echo "==> Waiting for MongoDB to accept connections"
for _ in $(seq 1 30); do
  if mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    echo "==> MongoDB is ready"
    exit 0
  fi
  sleep 1
done

echo "!! MongoDB did not become ready in time" >&2
tail -n 40 "$LOGPATH" >&2 || true
exit 1
