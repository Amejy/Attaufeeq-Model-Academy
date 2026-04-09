#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:4000}"
HEALTH_URL="${BACKEND_BASE_URL%/}/api/health"
BACKEND_STARTED_BY_SCRIPT="0"
BACKEND_PID=""

cleanup() {
  if [ "$BACKEND_STARTED_BY_SCRIPT" = "1" ] && [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Backend already running at $BACKEND_BASE_URL"
else
  echo "Starting backend at $BACKEND_BASE_URL"
  (
    cd "$ROOT_DIR/backend"
    npm run dev
  ) &
  BACKEND_PID=$!
  BACKEND_STARTED_BY_SCRIPT="1"

  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Backend did not become ready at $HEALTH_URL"
    echo "Check backend terminal logs for port conflicts or startup errors."
    exit 1
  fi
fi

echo "Starting frontend (Vite)..."
cd "$ROOT_DIR"
npm run dev:web
