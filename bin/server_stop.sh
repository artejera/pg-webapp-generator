#!/usr/bin/env bash
# HotX server stop script — paired with server_start.sh
# Graceful SIGTERM first, escalate to SIGKILL only if stuck.
# Safe for the Postgres connection pools in memory Map — TERM lets Express shut them down.
set -euo pipefail

PID_FILE="/tmp/hotx-server.pid"
LOG_FILE="/tmp/hotx-server.log"
PORT=3001

FORCE=0
ALL=0
for a in "$@"; do
  case "$a" in
    --force|-9) FORCE=1 ;;
    --all)       ALL=1 ;;
    -h|--help)
      echo "Usage: $0 [--force|-9] [--all]"
      echo "  --force     skip 8s graceful wait, SIGKILL immediately"
      echo "  --all       also kill any stray HotX-related node processes"
      exit 0
      ;;
    *) echo "Unknown flag: $a (try --help)"; exit 2 ;;
  esac
done

echo "=== HotX server stop ==="
echo "  PID_FILE = $PID_FILE"
echo "  LOG_FILE = $LOG_FILE"
echo "  PORT     = $PORT"
echo

# --- 1. Read PID if file exists ---
pid=""
if [[ -r "$PID_FILE" ]]; then
  pid="$(<"$PID_FILE")"
  pid="${pid//[[:space:]]/}"
fi

# --- 2. If FORCE, skip graceful and go straight to SIGKILL ---
killed_any=0

if [[ -n "${pid}" ]]; then
  # PID file present, sanity check it is actually node server.js and not pid=0/1
  if [[ "$pid" == "0" || "$pid" == "1" ]]; then
    echo "[WARN] pid file contained '$pid' — ignoring (would be destructive)."
    pid=""
  elif ! kill -0 "$pid" 2>/dev/null; then
    echo "[INFO] PID $pid from pidfile is already dead (stale pidfile). Removing pidfile."
    rm -f "$PID_FILE"
    pid=""
  else
    if [[ $FORCE == 1 ]]; then
      echo "[HARD] Sending SIGKILL -9 to pid=$pid (--force mode)"
      kill -9 "$pid" 2>/dev/null || true
      killed_any=1
    else
      echo "[GRACEFUL] Sending SIGTERM to HotX server pid=$pid — allowing it to drain PG pools, release session clients, close Express keep-alives."
      kill -TERM "$pid" 2>/dev/null || true
      killed_any=1
      # Wait up to 8 seconds, checking every 500ms
      waited=0
      while kill -0 "$pid" 2>/dev/null && (( waited < 80 )); do
        sleep 0.1
        (( waited++ )) || true
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "[TIMEOUT] pid=$pid still alive after 8s — escalating to SIGKILL -9"
        kill -9 "$pid" 2>/dev/null || true
      else
        echo "[OK] pid=$pid terminated gracefully after $(( waited / 10 )).$(( (waited % 10) ))s"
      fi
    fi
  fi
fi

# --- 3. Belt-and-braces fallback: also pkill any matching node server.js if PID file was stale ---
# (Only use if NO pidfile was present, OR if --all / --force)
if [[ $FORCE == 1 || $ALL == 1 || -z "${pid}" ]]; then
  echo
  echo "[SCAN] Checking for stray HotX 'node server.js' processes..."
  stray="$(pgrep -af 'node (src/)?server\.js' | grep -v 'pgrep' || true)"
  if [[ -n "${stray}" ]]; then
    echo "--- found stray HotX node processes ---"
    echo "$stray"
    pkill -TERM -f 'node (src/)?server\.js' 2>/dev/null || true
    sleep 1
    still="$(pgrep -af 'node (src/)?server\.js' | grep -v 'pgrep' || true)"
    if [[ -n "${still}" ]]; then
      echo "[WARN] some still alive, sending SIGKILL:"
      echo "$still"
      pkill -9 -f 'node (src/)?server\.js' 2>/dev/null || true
    fi
  else
    echo "[OK] no stray node server.js processes."
  fi
fi

# --- 4. Clean up PID file (always) ---
rm -f "$PID_FILE"
echo
echo "[CLEANUP] Removed $PID_FILE"

# --- 5. Confirm port 3001 is free ---
echo
echo "[VERIFY] Checking TCP port $PORT is no longer listening..."
port_check="$(ss -tln 2>/dev/null | awk '{print $4}' | grep -E "[:.]${PORT}$" || true)"
if [[ -z "${port_check}" ]]; then
  echo "[OK ✅] port $PORT is FREE. HotX server stopped successfully."
else
  echo "[WARN] port $PORT still shows LISTEN socket(s):"
  echo "$port_check"
  echo "       (If it is a TIME_WAIT leftover from just-killed process, wait ~30s and retry)"
fi

# --- 6. Print tail of log for convenience (shows shutdown messages, any errors) ---
echo
echo "--- last 8 lines of $LOG_FILE (shutdown output) ---"
if [[ -r "$LOG_FILE" ]]; then
  tail -n 8 "$LOG_FILE"
else
  echo "(log file $LOG_FILE not present)"
fi
echo
exit 0
