#!/usr/bin/env bash
# HotX server start script — location: bin/server_start.sh
# Works regardless of the current working directory (resolves the
# project root from the script location).
set -euo pipefail

# 1. Determine where the HotX project lives on disk (one level up from bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="/tmp/hotx-server.pid"
LOG_FILE="/tmp/pg-server.log"

# 2. (Optional) Make 100% sure there is no stale node or listener first.
#    Graceful SIGTERM first — server's SIGTERM handler (see src/server.js lines 483-495)
#    ROLLBACKs open txns and drain-calls pool.end() on every session pool so clients
#    disconnect politely instead of being -9'd mid-query.
echo "[pre] Checking for stale HotX 'node server.js' processes before starting new..."
stale_before="$(pgrep -af 'node (src/)?server\.js' | grep -v 'pgrep' || true)"
if [[ -n "${stale_before}" ]]; then
  echo "--- stale processes found; SIGTERM then wait up to 5s then SIGKILL ---"
  echo "${stale_before}"
  pkill -TERM -f 'node (src/)?server\.js' 2>/dev/null || true
  waited=0
  while (( waited < 50 )) && pgrep -f 'node (src/)?server\.js' >/dev/null 2>&1; do
    sleep 0.1
    (( waited++ )) || true
  done
  if pgrep -f 'node (src/)?server\.js' >/dev/null 2>&1; then
    echo "[TIMEOUT] stales still alive after 5s — escalating SIGKILL -9"
    pkill -9 -f 'node (src/)?server\.js' 2>/dev/null || true
    sleep 0.5
  fi
fi
sleep 1

# 3. Launch from the project root. PID + LOG paths kept in /tmp so a fresh
#    clone can run without needing project-write permissions on disk.
( cd "$PROJECT_DIR"
  PORT=3001 nohup node src/server.js > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE" )

# 4. Wait for HTTP-ready
sleep 3

# 5. Verify
echo "--- PID ---" ; cat "$PID_FILE"
echo "--- port ---" ; ss -tlnp 2>/dev/null | grep 3001 || echo '(ss unavailable, curl tests the same thing next)'
echo "--- /api/version ---" ; curl -s http://localhost:3001/api/version ; echo
echo "--- tail log ---" ; tail -n 5 "$LOG_FILE"
