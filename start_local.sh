#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"

cleanup() {
  echo ""
  echo "Stopping local services..."
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

if [[ ! -x "$BACKEND_VENV/bin/uvicorn" ]]; then
  cat <<EOF >&2
Backend virtualenv not found or uvicorn missing.
Run:
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt
EOF
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting backend on http://localhost:8000 ..."
(
  cd "$BACKEND_DIR"
  DATABASE_URL="${DATABASE_URL:-sqlite:///./revume.db}" \
    "$BACKEND_VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

echo "Starting frontend (Vite) on http://localhost:5173 ..."
(
  cd "$FRONTEND_DIR"
  VITE_API_BASE="${VITE_API_BASE:-http://localhost:8000}" \
    npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

echo "Waiting for frontend to become available..."
for _ in {1..40}; do
  if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

APP_URL="http://localhost:5173"
echo "Opening $APP_URL in Chrome..."
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$APP_URL" >/dev/null 2>&1 &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser "$APP_URL" >/dev/null 2>&1 &
elif command -v chromium >/dev/null 2>&1; then
  chromium "$APP_URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 &
else
  echo "Could not find Chrome; open $APP_URL manually." >&2
fi

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both services."

wait
