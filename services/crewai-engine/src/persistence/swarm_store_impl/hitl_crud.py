"""Human-in-the-loop (HITL) — décisions de direction.

Voir migration 0032_swarm_run_decisions.sql + src/tools/ask_human.py.
Le decision_id est un jeton opaque exposé à l'app ; il est mappé 1-1 sur la PK
(run_id, ordinal) où `ordinal` = index de la task qui a posé la décision.

PATCHABILITÉ : `_get_client` résolu via façade. Les fonctions publiques
(`get_decision_by_id`, `resolve_decision`, `cas_pause_to_running`, ...) sont
ré-exportées et patchées telles quelles ; aucune ne s'appelle mutuellement en
interne.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import _now_iso, logger


_DECISION_ID_PREFIX = "dec_"


def pause_run_with_decision(
    run_id: str,
    ordinal: int,
    payload: dict[str, Any],
    ttl_minutes: int | None = None,
) -> str:
    """Persiste une décision en attente et passe le run en `paused_hitl`.

    Idempotent sur (run_id, ordinal) : si une décision existe déjà pour cet
    ordinal, on RÉUTILISE son `decision_id` (pas de doublon, pas d'écrasement de
    la payload) — garantit « un seul decision actif à la fois » même si l'outil
    est appelé plus d'une fois.

    Effets DB (R01/R08 — ordre anti-zombie) :
      - UPSERT dans `swarm_run_decisions` EN PREMIER (vérifié).
      - `swarm_runs.status = 'paused_hitl'` posé UNIQUEMENT si la décision a
        bien été persistée (result.data non vide) ou réutilisée.
      Invariant : status paused_hitl ⇒ décision présente.

    Fail-soft : retourne TOUJOURS un decision_id (même si Supabase indisponible)
    pour que l'abort `HumanDecisionRequired` reste cohérent côté Flow.
    """
    decision_id = f"{_DECISION_ID_PREFIX}{secrets.token_urlsafe(12)}"
    client = _facade._get_client()
    if client is None:
        return decision_id
    try:
        # Réutilise une décision existante pour ce (run_id, ordinal) si présente.
        existing = (
            client.table("swarm_run_decisions")
            .select("decision_id")
            .eq("run_id", run_id)
            .eq("ordinal", ordinal)
            .maybe_single()
            .execute()
        )
        decision_persisted = False
        if existing and existing.data and existing.data.get("decision_id"):
            decision_id = str(existing.data["decision_id"])
            decision_persisted = True  # réutilisation = la décision est déjà en DB
        else:
            row: dict[str, Any] = {
                "run_id": run_id,
                "ordinal": ordinal,
                "decision_id": decision_id,
                "payload": payload,
            }
            if ttl_minutes and ttl_minutes > 0:
                row["expires_at"] = (
                    datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
                ).isoformat()
            insert_result = client.table("swarm_run_decisions").insert(row).execute()
            if insert_result and insert_result.data:
                decision_persisted = True
            else:
                logger.error(
                    "pause_run_with_decision: insert decision returned no data for run=%s "
                    "— NOT marking paused_hitl (zombie-guard)",
                    run_id,
                )

        # R01/R08 : ne pose paused_hitl QUE si la décision est bien persistée.
        if decision_persisted:
            client.table("swarm_runs").update(
                {
                    "status": "paused_hitl",
                    "paused_at": _now_iso(),
                    "checkpoint_index": ordinal,
                }
            ).eq("id", run_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("pause_run_with_decision failed for run=%s: %s", run_id, exc)
    return decision_id


def save_task_checkpoint(run_id: str, task_index: int, output_text: str) -> bool:
    """Persiste l'output d'une task terminée + avance `checkpoint_index`.

    L'output rejoint `swarm_runs.inputs_json._task_outputs[str(task_index)]`
    (read-modify-write complet — PostgREST ne merge pas le JSON partiellement) ;
    `checkpoint_index = task_index + 1`. Au resume, la boucle par-task relit ces
    outputs pour grounder les tasks suivantes SANS rejouer les tasks antérieures.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        current = (
            client.table("swarm_runs")
            .select("inputs_json")
            .eq("id", run_id)
            .maybe_single()
            .execute()
        )
        inputs_json = dict((current.data or {}).get("inputs_json") or {}) if current else {}
        task_outputs = dict(inputs_json.get("_task_outputs") or {})
        task_outputs[str(task_index)] = output_text
        inputs_json["_task_outputs"] = task_outputs
        client.table("swarm_runs").update(
            {"inputs_json": inputs_json, "checkpoint_index": task_index + 1}
        ).eq("id", run_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("save_task_checkpoint failed for run=%s idx=%s: %s", run_id, task_index, exc)
        return False


def get_active_decision(run_id: str) -> dict[str, Any] | None:
    """Décision active (non résolue) la plus récente d'un run, ou None."""
    client = _facade._get_client()
    if client is None:
        return None
    try:
        result = (
            client.table("swarm_run_decisions")
            .select("*")
            .eq("run_id", run_id)
            .is_("resolved_at", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data if result else None
        return rows[0] if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_active_decision failed for run=%s: %s", run_id, exc)
        return None


def get_decision_by_id(run_id: str, decision_id: str) -> dict[str, Any] | None:
    """Lookup d'une décision par (run_id, decision_id) — scope-checké."""
    client = _facade._get_client()
    if client is None:
        return None
    try:
        result = (
            client.table("swarm_run_decisions")
            .select("*")
            .eq("run_id", run_id)
            .eq("decision_id", decision_id)
            .maybe_single()
            .execute()
        )
        return result.data if result else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_decision_by_id failed for run=%s id=%s: %s", run_id, decision_id, exc)
        return None


def resolve_decision(run_id: str, decision_id: str, value: str) -> bool:
    """Marque une décision comme résolue (answer + resolved_at) de façon idempotente.

    Update conditionnel `resolved_at is null` : si la décision était déjà résolue,
    0 ligne mise à jour → retourne False (no-op idempotent côté caller).
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        result = (
            client.table("swarm_run_decisions")
            .update({"answer": {"value": value}, "resolved_at": _now_iso()})
            .eq("run_id", run_id)
            .eq("decision_id", decision_id)
            .is_("resolved_at", "null")
            .execute()
        )
        return bool(result and result.data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("resolve_decision failed for run=%s id=%s: %s", run_id, decision_id, exc)
        return False


def cas_pause_to_running(run_id: str, expected_resume_count: int = 0) -> bool:
    """Compare-and-swap : `paused_hitl` → `running` avec incrément atomique de resume_count.

    R02 — borne de convergence atomique : l'UPDATE inclut le filtre sur
    `resume_count = expected_resume_count` ET pose `resume_count = expected + 1`.
    Ainsi l'incrément est ATOMIQUE avec la transition de statut — un échec DB
    ne peut plus laisser resume_count figé à 0 (boucle infinie).

    Retourne True si CETTE invocation a gagné le CAS (1 ligne mise à jour),
    False si le run n'était plus en pause OU si le resume_count a déjà avancé
    (double resume concurrent / déjà repris) → le caller fait un no-op idempotent.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        result = (
            client.table("swarm_runs")
            .update({
                "status": "running",
                "paused_at": None,
                "resume_count": expected_resume_count + 1,
            })
            .eq("id", run_id)
            .eq("status", "paused_hitl")
            .eq("resume_count", expected_resume_count)
            .execute()
        )
        return bool(result and result.data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("cas_pause_to_running failed for run=%s: %s", run_id, exc)
        return False


def apply_resume_inputs(run_id: str, ordinal: int, value: str) -> dict[str, Any]:
    """Injecte la réponse dans `inputs_json._hitl_answers`.

    Read-modify-write complet de `inputs_json` (merge de la clé `_hitl_answers`
    keyée par `ordinal`). Appelé APRÈS un CAS gagné (un seul writer) → pas de
    lost-update.

    R02 : le bump `resume_count` a été déplacé dans `cas_pause_to_running` (CAS
    atomique) — cette fonction ne touche plus à `resume_count`.

    Retourne le `inputs_json` mergé (que le caller passe au Flow au resume) ;
    en cas d'échec DB, retourne au moins `{_hitl_answers:{ordinal:value}}`.
    """
    merged: dict[str, Any] = {"_hitl_answers": {str(ordinal): value}}
    client = _facade._get_client()
    if client is None:
        return merged
    try:
        current = (
            client.table("swarm_runs")
            .select("inputs_json")
            .eq("id", run_id)
            .maybe_single()
            .execute()
        )
        data = (current.data or {}) if current else {}
        inputs_json = dict(data.get("inputs_json") or {})
        answers = dict(inputs_json.get("_hitl_answers") or {})
        answers[str(ordinal)] = value
        inputs_json["_hitl_answers"] = answers
        client.table("swarm_runs").update(
            {"inputs_json": inputs_json}
        ).eq("id", run_id).execute()
        return inputs_json
    except Exception as exc:  # noqa: BLE001
        logger.warning("apply_resume_inputs failed for run=%s: %s", run_id, exc)
        return merged


def expire_stale_paused_runs(max_age_minutes: int) -> int:
    """Marque `failed` les runs `paused_hitl` en pause depuis trop longtemps.

    Cible `swarm_runs` avec status='paused_hitl' ET `paused_at < now - cutoff`.
    Complète `cleanup_stale_runs` (qui ne cible que 'running') pour éviter une
    fuite de runs zombies en pause jamais repris. Fail-soft → 0 sur erreur.
    """
    client = _facade._get_client()
    if client is None:
        return 0
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)).isoformat()
        result = (
            client.table("swarm_runs")
            .update(
                {
                    "status": "failed",
                    "error_text": "HITL decision expired — no human response (stale cleanup)",
                    "finished_at": _now_iso(),
                }
            )
            .eq("status", "paused_hitl")
            .lt("paused_at", cutoff)
            .execute()
        )
        return len(result.data) if result and result.data else 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("expire_stale_paused_runs failed: %s", exc)
        return 0
