#!/usr/bin/env bash
#
# security-regression.sh — Tenant-isolation regression gate for the crewai-engine.
#
# Verifies the full security train in one command:
#   R1 — swarm_runs IDOR closed
#   R3 — internal JWT (BFF -> Engine), owner_id non-spoofable
#   R2 — OwnerScope on P0 reads AND writes
#   R5 — Composio/Telegram Chief owner-scoped (no Adrien fallback)
#   R6 — VaultSearch owner-scoped, fail-closed (no global Vault fallback)
#
# Properties:
#   - MOCK-ONLY: no live Composio/Cortex/Telegram/network calls.
#   - NO SECRETS: uses test fixtures only; never reads prod env.
#   - DETERMINISTIC: safe to run before every merge/deploy that touches the engine.
#
# Usage:
#   ./scripts/security-regression.sh           # run the full gate
#   ./scripts/security-regression.sh -k pattern # pass extra args through to pytest
#
# Exit code 0 = all tenant-isolation invariants hold. Non-zero = a gate regressed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_DIR="$REPO_ROOT/services/crewai-engine"

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv is required (https://docs.astral.sh/uv/). Install it, then re-run." >&2
  exit 2
fi

# Security-critical test files, one per closed risk. Keep this list in sync with
# any new tenant-isolation test added to the engine.
SECURITY_TESTS=(
  tests/test_internal_auth.py          # R3 — JWT identity, anti-spoofing
  tests/test_runs_owner_scope.py       # R1 — runs IDOR
  tests/test_hitl_ownership_run.py     # R1/R2 — HitL run ownership
  tests/test_owner_scoping.py          # R2 — owner scoping contract
  tests/test_owner_scope.py            # R2 — OwnerScope read-side
  tests/test_owner_scope_guard.py      # R2 — AST guard: no unscoped store access
  tests/test_owner_scope_writes.py     # R2 — OwnerScope write-side
  tests/test_composio_chief_scope.py   # R5 — Composio/Telegram Chief scope
  tests/test_composio_session.py       # R5 — Composio session owner scope
  tests/test_vault_scope.py            # R6 — Vault namespace resolver
  tests/test_vault_search.py           # R6 — VaultSearch fail-closed gate
  tests/test_architect_vault_scope.py  # R6 — Architect owner propagation
)

echo "→ Security regression gate (R1·R3·R2·R5·R6) — mock-only, no secrets"
cd "$ENGINE_DIR"
exec uv run pytest "${SECURITY_TESTS[@]}" "$@"
