"""Supabase persistence — multi-swarm dynamic engine — FAÇADE.

CRUD pour les tables `swarms`, `swarm_agents`, `swarm_tasks`, `tools`,
`swarm_tool_bindings`, `swarm_runs`, `swarm_run_steps`.

# H7 (fait) : ce module a dépassé 1500 lignes. L'implémentation a été splittée
# par domaine dans le sous-package `swarm_store_impl/` (voir ci-dessous), et ce
# fichier devient une FAÇADE pure qui ré-exporte TOUS les symboles publics ET les
# privés patchés par les tests, pour préserver l'API et la patchabilité
# (`patch.object(swarm_store, "X")`) sans toucher un seul test.
#
#   swarm_store_impl/
#     _shared.py     — logger, _get_client, _retry_db_op (+ backoff), helpers,
#                      whitelists de colonnes.
#     swarms_crud.py — is_swarm_owned, get_swarm, list_swarms,
#                      create/update/delete_swarm.
#     agents_crud.py — create/update/delete agent|task|tool_binding, snapshot/
#                      restore helpers, replace_agents|tasks|tool_bindings,
#                      relink orphans.
#     tools_crud.py  — list_tools.
#     runs_crud.py   — save/update/get/list runs, list/update/append run steps,
#                      cleanup_stale_runs, max_step_number,
#                      get_active_run_for_swarm.
#     hitl_crud.py   — pause_run_with_decision, save_task_checkpoint,
#                      get_active_decision, get_decision_by_id, resolve_decision,
#                      cas_pause_to_running, apply_resume_inputs,
#                      expire_stale_paused_runs.
#
# RÈGLE DE PATCHABILITÉ (interne) : les sous-modules résolvent les symboles
# patchables (`_get_client`, `_snapshot_rows`, `_snapshot_swarm_tree`,
# `_RESTORE_RETRY_BACKOFF_S`, `update_swarm`, `_restore_*`) VIA cette façade
# (`from .. import swarm_store as _facade`, appel `_facade.X(...)`) — jamais via
# leur liaison locale — pour qu'un `patch.object(swarm_store, "X")` traverse les
# appels internes. C'est un cycle d'import façade↔sous-module, BÉNIN car les
# attributs ne sont lus qu'au runtime (jamais au top-level de chargement).

Fail-soft : si SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY est absent, ou si la
table n'existe pas encore, les opérations renvoient des valeurs neutres
(`None` / `False` / `[]`) avec un warning log — jamais d'exception remontée.

Contrat de colonnes (cf migration 0006_swarms_dynamic.sql) :

- swarms(id, owner_id, name, description, version, config_json, is_active,
         is_template, created_at, updated_at)
- swarm_agents(id, swarm_id, name, role, system_prompt, model_provider, model_name,
               temperature, max_tokens, parent_agent_id, position_x, position_y,
               created_at, updated_at)
  NB : pas de colonne `llm_tier`, pas de colonne `position` agrégée — uniquement
  `position_x` et `position_y`.
- swarm_tasks(id, swarm_id, agent_id, name, description, expected_output,
              depends_on_task_id, position_x, position_y, created_at, updated_at)
- tools(id, owner_id, name, category, description, endpoint_url, auth_type,
        schema_json, is_active, created_at, updated_at)
- swarm_tool_bindings(id, swarm_id, agent_id, tool_id, priority, config_json,
                      created_at)
- swarm_runs(id, swarm_id, trigger, status, inputs_json, result_text, started_at,
             finished_at, error_text, total_tokens_in, total_tokens_out,
             total_cost_usd, langfuse_trace_id, created_at)
- swarm_run_steps(id, run_id, agent_id, task_id, step_number, input_text,
                  output_text, tokens_in, tokens_out, cost_usd, latency_ms,
                  status, error_text, langfuse_span_id, created_at, finished_at)
"""
from __future__ import annotations

# ── Shared primitives (logger, client, retry, helpers, whitelists) ───────────
from .swarm_store_impl._shared import *  # noqa: F401,F403
from .swarm_store_impl._shared import (  # noqa: F401
    _AGENT_COLUMNS,
    _BINDING_COLUMNS,
    _RESTORE_FAILURE_MARKER,
    _RESTORE_RETRY_BACKOFF_S,
    _T,
    _TASK_COLUMNS,
    _assert_valid_uuid,
    _filter_payload,
    _get_client,
    _now_iso,
    _retry_db_op,
    _supabase_client,
    logger,
)

# ── Swarms CRUD ──────────────────────────────────────────────────────────────
from .swarm_store_impl.swarms_crud import *  # noqa: F401,F403

# ── Agents / tasks / tool_bindings + snapshot-rollback ───────────────────────
from .swarm_store_impl.agents_crud import *  # noqa: F401,F403
from .swarm_store_impl.agents_crud import (  # noqa: F401
    _relink_orphans_after_replace_agents,
    _restore_snapshot,
    _restore_swarm_tree,
    _snapshot_rows,
    _snapshot_swarm_tree,
)

# ── Tools catalog (lecture) ──────────────────────────────────────────────────
from .swarm_store_impl.tools_crud import *  # noqa: F401,F403

# ── Swarm runs / run steps ───────────────────────────────────────────────────
from .swarm_store_impl.runs_crud import *  # noqa: F401,F403

# ── Human-in-the-loop (HITL) — décisions de direction ─────────────────────────
from .swarm_store_impl.hitl_crud import *  # noqa: F401,F403
from .swarm_store_impl.hitl_crud import _DECISION_ID_PREFIX  # noqa: F401
