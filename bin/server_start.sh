#!/usr/bin/env bash
# HotX server start script — location: bin/server_start.sh
# Works regardless of the current working directory (resolves the
# project root from the script location).
set -euo pipefail

# 1. Determine where the HotX project lives on disk (one level up from bin/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="/tmp/hoty-server.pid"
LOG_FILE="/tmp/pg-server.log"

# 2. (Optional) Make 100% sure there is no stale node or listener first
pkill -9 -f 'node (src/)?server.js' 2>/dev/null || true
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