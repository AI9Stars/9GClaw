#!/usr/bin/env bash
set -euo pipefail

NINEGCLAW_HOME="${NINEGCLAW_HOME:-/root/.9gclaw}"
CONFIG_FILE="$NINEGCLAW_HOME/9gclaw.yaml"

mkdir -p \
  "$NINEGCLAW_HOME/projects" \
  "$NINEGCLAW_HOME/router" \
  "$NINEGCLAW_HOME/skills" \
  "$NINEGCLAW_HOME/plugins" \
  "$NINEGCLAW_HOME/memory"

if [ -d "$CONFIG_FILE" ]; then
  echo "[9gclaw-docker] ERROR: $CONFIG_FILE is a directory, not a config file." >&2
  echo "[9gclaw-docker] If you intended to mount a YAML config, create the host file first or remove the bind mount and use NINEGCLAW_* env vars." >&2
  exit 1
fi

# ── Generate config from env vars if no config file is mounted ────────
if [ ! -f "$CONFIG_FILE" ]; then
  MODEL="${NINEGCLAW_MODEL:-openrouter/deepseek/deepseek-v4-flash}"
  LIGHT_MODEL="${NINEGCLAW_LIGHT_MODEL:-openrouter/qwen/qwen3-8b}"
  API_KEY="${NINEGCLAW_API_KEY:-}"
  API_URL="${NINEGCLAW_API_URL:-https://openrouter.ai/api/v1}"

  # Derive provider name from model string (e.g. "openrouter/deepseek/deepseek-v4-flash" -> "openrouter")
  PROVIDER="${MODEL%%/*}"
  LIGHT_PROVIDER="${LIGHT_MODEL%%/*}"
  # Model ID is everything after the first slash
  MODEL_ID="${MODEL#*/}"
  LIGHT_MODEL_ID="${LIGHT_MODEL#*/}"

  if [ -z "$API_KEY" ]; then
    echo "[9gclaw-docker] No model credential supplied; starting the Web UI for onboarding."
  else

  # Router section shared by both same-provider and cross-provider branches
  ROUTER_SECTION="router:
  scenarios:
    default: ${MODEL}
  fallback:
    default:
      - ${MODEL}
  zeroUsageRetry:
    enabled: true
    maxAttempts: 2
  tokenSaver:
    enabled: true
    judge: ${LIGHT_MODEL}
    defaultTier: medium
    judgeTimeoutMs: 15000
    tiers:
      simple:
        model: ${LIGHT_MODEL}
        description: \"Simple greetings, confirmations, single-step Q&A, trivial file writes, remembering rules\"
      medium:
        model: ${LIGHT_MODEL}
        description: \"Single tool call, short text generation, 1-2 file read/write, code generation\"
      complex:
        model: ${MODEL}
        description: \"Needs sub-agent orchestration: parallel workstreams, delegation to specialized agents\"
      reasoning:
        model: ${MODEL}
        description: \"Deep single-agent work: multi-file operations, data analysis, multi-step workflows, web research, structured reports from many sources\"
    rules:
      - \"complex is ONLY for tasks that need sub-agent orchestration or parallel delegation — do NOT use it for single-agent multi-step work\"
      - \"Multi-file operations, data analysis, and multi-step workflows without orchestration should be reasoning\"
      - \"Simple file creation (1-2 files) or single code generation is medium\"
      - \"Trivial greetings, confirmations, remembering rules, or reading one file and answering a short question is simple\"
  autoOrchestrate:
    enabled: true
    triggerTiers:
      - complex
    slimSystemPrompt: true
    allowedTools:
      - agent
      - read_file
      - grep
      - glob
      - read_skill
  stats:
    enabled: true"

  if [ "$PROVIDER" = "$LIGHT_PROVIDER" ]; then
    # Same provider for both models
    cat > "$CONFIG_FILE" <<YAML
schemaVersion: 1
agent:
  model: ${MODEL}
model:
  providers:
    ${PROVIDER}:
      protocol: openai
      url: ${API_URL}
      apiKey: ${API_KEY}
      models:
        ${MODEL_ID}:
          capabilities:
            maxOutputTokens: 32768
        ${LIGHT_MODEL_ID}:
          capabilities:
            maxOutputTokens: 16384
cron:
  enabled: true
${ROUTER_SECTION}
YAML
  else
    # Different providers — declare both
    LIGHT_API_URL="${NINEGCLAW_LIGHT_API_URL:-${API_URL}}"
    LIGHT_API_KEY="${NINEGCLAW_LIGHT_API_KEY:-${API_KEY}}"
    cat > "$CONFIG_FILE" <<YAML
schemaVersion: 1
agent:
  model: ${MODEL}
model:
  providers:
    ${PROVIDER}:
      protocol: openai
      url: ${API_URL}
      apiKey: ${API_KEY}
      models:
        ${MODEL_ID}:
          capabilities:
            maxOutputTokens: 32768
    ${LIGHT_PROVIDER}:
      protocol: openai
      url: ${LIGHT_API_URL}
      apiKey: ${LIGHT_API_KEY}
      models:
        ${LIGHT_MODEL_ID}:
          capabilities:
            maxOutputTokens: 16384
cron:
  enabled: true
${ROUTER_SECTION}
YAML
  fi

  echo "[9gclaw-docker] Generated config at $CONFIG_FILE (provider=$PROVIDER, model=$MODEL, light=$LIGHT_MODEL)"
  fi
fi

# ── Forward proxy env vars ────────────────────────────────────────────
if [ -n "${NINEGCLAW_PROXY:-}" ]; then
  export http_proxy="$NINEGCLAW_PROXY"
  export https_proxy="$NINEGCLAW_PROXY"
  export HTTP_PROXY="$NINEGCLAW_PROXY"
  export HTTPS_PROXY="$NINEGCLAW_PROXY"
  echo "[9gclaw-docker] Proxy set to $NINEGCLAW_PROXY"
fi

echo "[9gclaw-docker] Starting 9GClaw Web UI; Gateway will start after model configuration is ready..."
echo "[9gclaw-docker] Config: $CONFIG_FILE"
echo "[9gclaw-docker] UI will be available at http://0.0.0.0:${SERVER_PORT:-3001}"

# ── Remove stale auth token so the bridge never uses a leftover value ──
rm -f "$NINEGCLAW_HOME/server-token"

# ── Start supervised runtime ──────────────────────────────────────────
cd /app

GATEWAY_PORT="${NINEGCLAW_GATEWAY_PORT:-18789}"
export NINEGCLAW_GATEWAY_URL="${NINEGCLAW_GATEWAY_URL:-ws://127.0.0.1:${GATEWAY_PORT}/ws}"
exec node ui/server/webRuntimeSupervisor.js start-built
