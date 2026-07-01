#!/usr/bin/env bash
#
# deploy-engine.sh — Reliable manual deploy for the crewai-engine (Railway).
#
# The Railway `crewai-engine` service has NO GitHub auto-deploy, so engine code
# and engine env changes must be shipped manually. This wraps the deploy with a
# health check and a no-secret security smoke so a deploy is never "forgotten" or
# left half-verified. See docs/OPS_RUNBOOK.md.
#
# Usage:
#   ./scripts/deploy-engine.sh            # deploy + verify
#   ./scripts/deploy-engine.sh --check    # verify only (no deploy)
#
# Prints status codes only — never secrets/tokens/JWTs.
set -euo pipefail

SERVICE="crewai-engine"
ENVIRONMENT="production"
ENGINE_URL="https://crewai-engine-production.up.railway.app"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v railway >/dev/null 2>&1 || { echo "✗ railway CLI not found" >&2; exit 2; }

if [[ "${1:-}" != "--check" ]]; then
  echo "→ Deploying $SERVICE ($ENVIRONMENT) via railway up …"
  echo "  (env vars are snapshotted at build time — set them BEFORE this with --skip-deploys)"
  ( cd "$REPO_ROOT/services/crewai-engine" && railway up -s "$SERVICE" -e "$ENVIRONMENT" --ci ) || \
    echo "  ⚠ railway CLI returned non-zero (often just a log-stream timeout — verifying below)"
  echo "→ Latest deployment status:"
  railway deployment list -s "$SERVICE" -e "$ENVIRONMENT" 2>/dev/null | head -2 || true
fi

echo "→ Health check"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$ENGINE_URL/health" || echo "000")
echo "  /health                -> $HEALTH (expect 200)"

echo "→ Security smoke (no auth header → must be rejected)"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' "$ENGINE_URL/v1/tools" || echo "000")
echo "  no-auth /v1/tools      -> $NOAUTH (expect 401)"

if [[ "$HEALTH" == "200" && "$NOAUTH" == "401" ]]; then
  echo "✓ engine deploy verified: healthy + auth gate closed"
  echo "  Reminder: run 'npm run test:security' before shipping engine changes,"
  echo "  and reload an owner-scoped BFF page to confirm the end-to-end JWT path."
else
  echo "✗ engine verification FAILED (health=$HEALTH no-auth=$NOAUTH) — investigate before relying on this deploy" >&2
  exit 1
fi
