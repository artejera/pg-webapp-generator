# 1. (Optional) Make 100% sure there is no stale node or listener first
pkill -9 -f 'node server.js' 2>/dev/null ; sleep 1

# 2. Change to the HotY project dir
cd /home/artejera/Documents/trae_projects/HotY || exit 2

# 3. Launch (same as before). PID in /tmp/hoty-server.pid, logs to /tmp/pg-server.log
( PORT=3001 nohup node server.js > /tmp/pg-server.log 2>&1 &
  echo $! > /tmp/hoty-server.pid )

# 4. Wait for HTTP-ready
sleep 3

# 5. Verify
echo "--- PID ---" ; cat /tmp/hoty-server.pid
echo "--- port ---" ; ss -tlnp 2>/dev/null | grep 3001
echo "--- /api/version ---" ; curl -s http://localhost:3001/api/version ; echo
echo "--- tail log ---" ; tail -n 5 /tmp/pg-server.log