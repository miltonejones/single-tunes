#!/bin/bash
set -e

SCRIPT_NAME="$(basename "$0")"
PORT=4200

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME <command>

Commands:
  start     Start the Angular dev server (ng serve --port $PORT)
  stop      Kill the process on port $PORT
  restart   Stop then start
  on        Sign in to Ollama, use deepseek cloud config, open VS Code + Claude
  off       Sign out of Ollama, use default config, open VS Code + Claude
  help      Show this help

EOF
}

# ──────────────────────────────────────────────
#  start
# ──────────────────────────────────────────────
cmd_start() {
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Starting Angular Dev Server                 ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  Port:       $PORT"
  echo "  Command:    ng serve --port $PORT"
  echo "  URL:        http://localhost:$PORT"
  echo ""

  ng serve --port "$PORT" &

  echo ""
  echo "✔ Dev server starting in the background (PID $!)."
  echo "  Use '$SCRIPT_NAME stop' to kill it."
  echo ""
}

# ──────────────────────────────────────────────
#  stop
# ──────────────────────────────────────────────
cmd_stop() {
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Stopping Angular Dev Server                  ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  Scanning for processes on port $PORT..."

  PID=$(lsof -ti tcp:"$PORT")

  if [ -n "$PID" ]; then
    echo "  Found process(es): $PID"
    echo "  Sending kill signal..."
    echo ""

    if kill "$PID"; then
      echo "✔ Successfully killed process(es) $PID."
    else
      echo "✘ Failed to kill process(es) $PID on port $PORT."
      exit 1
    fi
  else
    echo "  No process found listening on port $PORT — nothing to stop."
  fi

  echo ""
  echo "✔ Port $PORT is now free."
  echo ""
}

# ──────────────────────────────────────────────
#  restart
# ──────────────────────────────────────────────
cmd_restart() {
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Restarting Angular Dev Server                ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  cmd_stop
  echo "  ── Waiting 1 second before starting again ──"
  sleep 1
  cmd_start
  echo "✔ Restart complete."
  echo ""
}

# ──────────────────────────────────────────────
#  on  (claude-on)
# ──────────────────────────────────────────────
cmd_on() {
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Claude: DeepSeek Cloud Mode                  ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  Step 1/3 — Signing in to Ollama..."
  ollama signin
  echo "  ✔ Ollama signed in."
  echo ""
  echo "  Step 2/3 — Switching to deepseek cloud config..."
  cp .claude/settings.local.deepseekcloud.json .claude/settings.local.json
  echo "  ✔ Config applied."
  echo ""
  echo "  Step 3/3 — Opening VS Code and launching Claude..."
  # code .
  claude
}

# ──────────────────────────────────────────────
#  off  (claude-off)
# ──────────────────────────────────────────────
cmd_off() {
  echo "╔══════════════════════════════════════════════╗"
  echo "║  Claude: Default Mode                         ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "  Step 1/3 — Signing out of Ollama..."
  ollama signout
  echo "  ✔ Ollama signed out."
  echo ""
  echo "  Step 2/3 — Switching to default config..."
  cp .claude/settings.local.default.json .claude/settings.local.json
  echo "  ✔ Config applied."
  echo ""
  echo "  Step 3/3 — Opening VS Code and launching Claude..."
  # code .
  claude
}

# ──────────────────────────────────────────────
#  Dispatch
# ──────────────────────────────────────────────
case "${1:-help}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  on)      cmd_on ;;
  off)     cmd_off ;;
  help|--help|-h) usage ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
