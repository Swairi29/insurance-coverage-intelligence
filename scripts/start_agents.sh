#!/usr/bin/env bash
# Starts all four agent services (ports 8001-8004) and the orchestration gateway (port 8000).
#
# Usage (from the project root, in Git Bash / Linux / macOS):
#   bash scripts/start_agents.sh            # use the LLM settings from .env
#   bash scripts/start_agents.sh --no-llm   # rules + templates only, no model is called
#
# Set PYTHON to choose the interpreter (default: python). Each service logs to
# logs/<service>.log. Press Ctrl+C to stop every service.

set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-python}"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

if [[ "${1:-}" == "--no-llm" ]]; then
  # Agent 4 uses template wording. Any Ollama call (e.g. from Agent 1 if it is
  # switched to Ollama) goes to a closed port, fails at once and falls back to
  # rules. Agent 1's Gemini step still runs if GEMINI_API_KEY is set in .env.
  export EXPLANATION_USE_LLM=false
  export LLM_PROVIDER=ollama
  export OLLAMA_HOST=http://127.0.0.1:9
  export LLM_MAX_RETRIES=0
  echo "No-LLM mode: rules and templates only."
fi

# name  module  port
SERVICES=(
  "risk_agent        agents.risk_agent.main:app          8001"
  "policy_agent      agents.policy_agent.main:app        8002"
  "coverage_agent    agents.coverage_agent.main:app      8003"
  "explanation_agent agents.explanation_agent.main:app   8004"
  "gateway           services.orchestration.api:app      8000"
)

PIDS=()
stop_all() {
  echo
  echo "Stopping services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap stop_all EXIT INT TERM

for entry in "${SERVICES[@]}"; do
  read -r name module port <<<"$entry"
  "$PYTHON" -m uvicorn "$module" --port "$port" >"$LOG_DIR/$name.log" 2>&1 &
  PIDS+=("$!")
  echo "Started $name on port $port (log: $LOG_DIR/$name.log)"
done

# Wait up to 60 s for each /health endpoint.
for entry in "${SERVICES[@]}"; do
  read -r name module port <<<"$entry"
  status="DOWN"
  for _ in $(seq 1 60); do
    if "$PYTHON" -c "import sys, urllib.request; urllib.request.urlopen('http://127.0.0.1:$port/health', timeout=1)" 2>/dev/null; then
      status="up"
      break
    fi
    sleep 1
  done
  printf '  %-18s %s\n' "$name" "$status"
done

echo
echo "Gateway: http://127.0.0.1:8000/docs   Agent status: http://127.0.0.1:8000/health/agents"
echo "Press Ctrl+C to stop."
wait
