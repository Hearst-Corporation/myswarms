"""CRUD runs / run_steps — table `swarm_runs`, `swarm_run_steps`.

PATCHABILITÉ : `_get_client` résolu via façade. Les fonctions publiques
(`save_swarm_run`, `update_swarm_run`, `get_swarm_run`, `list_swarm_runs`,
`list_run_steps`, `append_run_step`, `get_active_run_for_swarm`) sont ré-exportées
par la façade et patchées telles quelles par les tests — aucune ne s'appelle
mutuellement en interne, donc pas de routage croisé nécessaire ici.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import _now_iso, logger


def save_swarm_run(
    run_id: str,
    swarm_id: str,
    trigger: str,
    status: str = "running",
    inputs_json: dict[str, Any] | None = None,
    owner_id: str | None = None,
) -> bool:
    """Insère un nouveau run de swarm.

    R07 : `owner_id` est écrit dans la row pour permettre un scoping direct
    (sans JOIN swarms) dans `get_swarm_run` — anti-IDOR multi-tenant.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        now = _now_iso()
        row: dict[str, Any] = {
            "id": run_id,
            "swarm_id": swarm_id,
            "trigger": trigger,
            "status": status,
            "inputs_json": inputs_json or {},
            "started_at": now,
            "created_at": now,
        }
        if owner_id:
            row["owner_id"] = owner_id
        client.table("swarm_runs").insert(row).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("save_swarm_run failed for %s: %s", run_id, exc)
        return False


def update_swarm_run(run_id: str, **fields: Any) -> bool:
    """Patch un run. `finished_at` posé automatiquement si status terminal et absent."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        # status terminaux → on pose finished_at si manquant
        terminal_statuses = {"completed", "failed", "cancelled", "timeout"}
        if (
            fields.get("status") in terminal_statuses
            and "finished_at" not in fields
        ):
            fields["finished_at"] = _now_iso()

        # On ne pousse aucun champ vide / None pour éviter d'écraser des colonnes
        payload = {k: v for k, v in fields.items() if v is not None}
        if not payload:
            return True
        client.table("swarm_runs").update(payload).eq("id", run_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_swarm_run failed for %s: %s", run_id, exc)
        return False


def get_swarm_run(
    run_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Récupère un run par son id.

    R1 — IDOR fix : si `owner_id` est fourni, lecture STRICTE par
    `swarm_runs.owner_id`. Un run dont l'owner ne matche pas — ou dont l'owner
    est NULL (run système ou lancé sur un template global, non backfillable) —
    est traité comme inexistant (404 côté route). Plus AUCUN fallback via le
    statut `is_template` du swarm parent : un run n'est jamais lisible parce que
    son swarm parent est un template global. Les runs ownerless restent
    atteignables uniquement en service_role / SQL direct (admin).
    """
    from ._shared import _assert_valid_uuid  # noqa: PLC0415

    _assert_valid_uuid(owner_id)
    client = _facade._get_client()
    if client is None:
        return None
    try:
        result = (
            client.table("swarm_runs")
            .select("*")
            .eq("id", run_id)
            .maybe_single()
            .execute()
        )
        run = result.data if result else None
        if run is None:
            return None

        if owner_id:
            # Scope strict : seul le propriétaire du run y accède. owner_id NULL
            # (legacy non rattachable / run système / template global) ⇒ 404.
            run_owner = run.get("owner_id")
            if run_owner is None or str(run_owner) != owner_id:
                return None
        return run
    except Exception as exc:  # noqa: BLE001
        logger.error("get_swarm_run failed for %s: %s", run_id, exc)
        return None


def list_swarm_runs(
    swarm_id: str,
    limit: int = 20,
    owner_id: str | None = None,
) -> list[dict[str, Any]]:
    """Liste les runs d'un swarm, plus récents en premier.

    R1 — IDOR fix : si `owner_id` est fourni, on ne retourne QUE les runs
    appartenant à ce propriétaire (filtre direct `swarm_runs.owner_id`). Plus de
    gate « swarm template global ⇒ tous ses runs » : un run n'est jamais listé
    via le statut template du swarm parent. Sur un template partagé, chaque
    tenant ne voit donc que ses propres runs. `owner_id=None` (appel interne de
    confiance) liste tous les runs du swarm.
    """
    client = _facade._get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("swarm_runs")
            .select(
                "id,swarm_id,trigger,status,started_at,finished_at,"
                "total_tokens_in,total_tokens_out,langfuse_trace_id"
            )
            .eq("swarm_id", swarm_id)
        )
        if owner_id:
            query = query.eq("owner_id", owner_id)

        result = (
            query
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_swarm_runs failed for %s: %s", swarm_id, exc)
        return []


def list_run_steps(run_id: str) -> list[dict[str, Any]]:
    """Liste tous les steps d'un run, ordonnés par step_number.

    Enrichit chaque step avec `agent_name` et `task_name` via un load des
    `swarm_agents` / `swarm_tasks` du swarm parent (3 selects total, OK tant
    que le nombre de steps reste modéré).
    """
    client = _facade._get_client()
    if client is None:
        return []
    try:
        result = (
            client.table("swarm_run_steps")
            .select("*")
            .eq("run_id", run_id)
            .order("step_number", desc=False)
            .execute()
        )
        steps = result.data if result else []
        if not steps:
            return []

        # Récupère le swarm_id parent via swarm_runs → indispensable pour
        # filtrer les agents/tasks de manière scopée.
        agent_name_map: dict[str, str] = {}
        task_name_map: dict[str, str] = {}
        try:
            run_res = (
                client.table("swarm_runs")
                .select("swarm_id")
                .eq("id", run_id)
                .maybe_single()
                .execute()
            )
            run_row = run_res.data if run_res else None
            swarm_id = run_row.get("swarm_id") if run_row else None
            if swarm_id:
                try:
                    agents_res = (
                        client.table("swarm_agents")
                        .select("id,name")
                        .eq("swarm_id", swarm_id)
                        .execute()
                    )
                    agent_name_map = {
                        a["id"]: a.get("name", "") for a in (agents_res.data or [])
                    }
                except Exception as exc:  # noqa: BLE001
                    logger.warning("list_run_steps: agents fetch failed for run=%s: %s", run_id, exc)
                try:
                    tasks_res = (
                        client.table("swarm_tasks")
                        .select("id,name")
                        .eq("swarm_id", swarm_id)
                        .execute()
                    )
                    task_name_map = {
                        t["id"]: t.get("name", "") for t in (tasks_res.data or [])
                    }
                except Exception as exc:  # noqa: BLE001
                    logger.warning("list_run_steps: tasks fetch failed for run=%s: %s", run_id, exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("list_run_steps: parent swarm lookup failed for run=%s: %s", run_id, exc)

        for step in steps:
            aid = step.get("agent_id")
            tid = step.get("task_id")
            step["agent_name"] = agent_name_map.get(aid) if aid else None
            step["task_name"] = task_name_map.get(tid) if tid else None
        return steps
    except Exception as exc:  # noqa: BLE001
        logger.error("list_run_steps failed for %s: %s", run_id, exc)
        return []


def update_run_step(step_id: str, **fields: Any) -> bool:
    """H5 fix : met à jour un step existant (e.g. `finished_at`,
    `output_text`, `status`, `latency_ms`).

    Best-effort : retourne True sur succès, False sinon (log warning).
    Utile pour poser `finished_at` quand on a un signal de fin de step
    (ex: step suivant qui arrive, ou task_callback en fin de task).

    # TODO V2 : appelée depuis _build_step_callback quand on aura le
    # hook task end de CrewAI. Pour l'instant la fonction est conservée
    # en attente du wiring V2 — pas de call-site actif dans le code.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        payload = {k: v for k, v in fields.items() if v is not None}
        if not payload:
            return True
        client.table("swarm_run_steps").update(payload).eq("id", step_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("update_run_step failed for step %s: %s", step_id, exc)
        return False


def cleanup_stale_runs(max_age_minutes: int) -> int:
    """Mark 'running' swarm_runs older than max_age_minutes as failed.

    Targets rows in `swarm_runs` with status='running' AND
    started_at < now(utc) - max_age_minutes. Updates status to 'failed',
    sets error_text and finished_at. Fail-soft: returns 0 on any error.

    Returns the number of rows updated.
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
                    "error_text": "Run abandoned — no heartbeat (stale cleanup)",
                    "finished_at": _now_iso(),
                }
            )
            .eq("status", "running")
            .lt("started_at", cutoff)
            .execute()
        )
        count = len(result.data) if result and result.data else 0
        return count
    except Exception as exc:  # noqa: BLE001
        logger.warning("cleanup_stale_runs (swarm_runs) failed: %s", exc)
        return 0


def max_step_number(run_id: str) -> int:
    """Retourne le step_number maximum pour ce run (R03 — seeding au resume).

    Fail-soft → 0 si Supabase indispo, table vide, ou erreur.
    """
    client = _facade._get_client()
    if client is None:
        return 0
    try:
        result = (
            client.table("swarm_run_steps")
            .select("step_number")
            .eq("run_id", run_id)
            .order("step_number", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data if result else []
        if rows:
            return int(rows[0].get("step_number") or 0)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("max_step_number failed for run=%s: %s", run_id, exc)
        return 0


def append_run_step(
    run_id: str,
    agent_id: str | None,
    task_id: str | None,
    step_number: int,
    **fields: Any,
) -> bool:
    """Insère un step (output d'agent/task) lié à un run."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        row: dict[str, Any] = {
            "run_id": run_id,
            "agent_id": agent_id,
            "task_id": task_id,
            "step_number": step_number,
            "created_at": _now_iso(),
        }
        # Colonnes optionnelles autorisées dans la table.
        for key in (
            "input_text",
            "output_text",
            "tokens_in",
            "tokens_out",
            "latency_ms",
            "status",
        ):
            if key in fields and fields[key] is not None:
                row[key] = fields[key]

        client.table("swarm_run_steps").insert(row).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("append_run_step failed for run=%s step=%s: %s", run_id, step_number, exc)
        return False


def get_active_run_for_swarm(swarm_id: str, window_minutes: int = 10) -> str | None:
    """Retourne l'id du premier run `running` pour ce swarm dans la fenêtre spécifiée,
    ou None s'il n'en existe pas.

    Utilisé pour le check d'idempotency du scheduler (P1.5) : empêche une double
    exécution en cas de misfire (crash-restart dans la grâce APScheduler de 300s)
    ou de run zombie pas encore nettoyé par le stale-run cleanup.
    Fail-soft : retourne None si Supabase non configuré ou erreur DB.
    """
    client = _facade._get_client()
    if client is None:
        return None
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=window_minutes)).isoformat()
        result = (
            client.table("swarm_runs")
            .select("id")
            .eq("swarm_id", swarm_id)
            .eq("status", "running")
            .gte("started_at", cutoff)
            .limit(1)
            .execute()
        )
        rows = result.data if result else []
        return str(rows[0]["id"]) if rows else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_active_run_for_swarm failed (non-blocking): %s", exc)
        return None
