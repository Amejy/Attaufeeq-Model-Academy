#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:4000}"
BACKEND_STARTED_BY_SCRIPT="0"
BACKEND_PID=""
DISCOVERED_BACKEND_BASE_URL=""

find_ready_backend() {
  local explicit_base="${1:-}"
  local candidates=()

  if [ -n "$explicit_base" ]; then
    candidates+=("${explicit_base%/}")
  fi

  candidates+=(
    "http://127.0.0.1:4000"
    "http://127.0.0.1:4001"
    "http://127.0.0.1:4002"
    "http://127.0.0.1:4003"
    "http://127.0.0.1:4004"
    "http://127.0.0.1:4005"
  )

  for candidate in "${candidates[@]}"; do
    if curl --connect-timeout 1 --max-time 1 -fsS "${candidate}/api/health/ready" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

echo "Checking backend readiness..."

cleanup() {
  if [ "$BACKEND_STARTED_BY_SCRIPT" = "1" ] && [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

if DISCOVERED_BACKEND_BASE_URL="$(find_ready_backend "$BACKEND_BASE_URL")"; then
  echo "Backend already running at $DISCOVERED_BACKEND_BASE_URL"
else
  echo "Starting backend at $BACKEND_BASE_URL"
  (
    cd "$ROOT_DIR/backend"
    npm run dev
  ) &
  BACKEND_PID=$!
  BACKEND_STARTED_BY_SCRIPT="1"

  for _ in $(seq 1 30); do
    if DISCOVERED_BACKEND_BASE_URL="$(find_ready_backend "$BACKEND_BASE_URL")"; then
      break
    fi
    sleep 1
  done

  if [ -z "$DISCOVERED_BACKEND_BASE_URL" ]; then
    echo "Backend did not become ready on ports 4000-4005."
    echo "Check backend terminal logs for database, Redis, or port startup errors."
    exit 1
  fi
fi

echo "Using backend at $DISCOVERED_BACKEND_BASE_URL"
echo "Starting frontend (Vite)..."
cd "$ROOT_DIR"
export VITE_BACKEND_PROXY_TARGET="$DISCOVERED_BACKEND_BASE_URL"
npm run dev:web
