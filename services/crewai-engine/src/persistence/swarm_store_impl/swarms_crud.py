"""CRUD table `swarms` — ownership, lecture complète, list, create/update/delete.

PATCHABILITÉ : les symboles privés patchés en interne (`_get_client`) sont
résolus via la façade (`_facade._get_client()`) pour que
`patch.object(swarm_store, "_get_client")` reste effectif. De même,
`delete_swarm` (soft) appelle `_facade.update_swarm(...)` afin que les tests qui
patchent `swarm_store.update_swarm` traversent.
"""
from __future__ import annotations

from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import _assert_valid_uuid, _now_iso, logger


def is_swarm_owned(swarm_id: str, owner_id: str, *, allow_template: bool = False) -> bool:
    """Vérif LÉGÈRE (1 requête) qu'un swarm appartient à `owner_id`.

    `allow_template=False` (défaut — ÉCRITURES) : owner STRICT — les templates
    globaux (owner_id NULL) ne matchent jamais → immuables par un user.
    `allow_template=True` (kickoff/lecture) : owner OU template global.
    """
    _assert_valid_uuid(owner_id)
    client = _facade._get_client()
    if client is None:
        return False
    try:
        query = client.table("swarms").select("id").eq("id", swarm_id)
        if allow_template:
            query = query.or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
        else:
            query = query.eq("owner_id", owner_id)
        res = query.maybe_single().execute()
        return bool(res and res.data)
    except Exception as exc:  # noqa: BLE001
        logger.error("is_swarm_owned failed for %s: %s", swarm_id, exc)
        return False


def get_swarm(
    swarm_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Charge un swarm complet (agents + tasks + tool_bindings).

    Si `owner_id` est fourni, retourne le swarm si :
      - il appartient à cet owner (owner_id = X), OU
      - c'est un template global (owner_id IS NULL AND is_template = true).
    Si `owner_id is None`, comportement service-role : pas de scoping.

    Renvoie None si swarm introuvable, owner mismatch ou Supabase indispo.
    """
    _assert_valid_uuid(owner_id)
    client = _facade._get_client()
    if client is None:
        return None
    try:
        query = client.table("swarms").select("*")
        if owner_id:
            # Include swarms owned by this user OR global templates (owner_id IS NULL).
            query = query.or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
        swarm_res = (
            query.eq("id", swarm_id)
            .maybe_single()
            .execute()
        )
        swarm = swarm_res.data if swarm_res else None
        if not swarm:
            return None

        agents_res = (
            client.table("swarm_agents")
            .select("*")
            .eq("swarm_id", swarm_id)
            .order("position_y", desc=False)
            .order("position_x", desc=False)
            .execute()
        )
        agents = agents_res.data if agents_res else []

        tasks_res = (
            client.table("swarm_tasks")
            .select("*")
            .eq("swarm_id", swarm_id)
            .order("position_y", desc=False)
            .order("position_x", desc=False)
            .execute()
        )
        tasks = tasks_res.data if tasks_res else []

        # Joint tools via swarm_tool_bindings.tool_id → tools.id.
        # On évite une vraie jointure PostgREST (syntaxe sensible aux FK names)
        # en faisant 2 selects + merge côté Python (plus robuste, fail-soft par tool).
        bindings_res = (
            client.table("swarm_tool_bindings")
            .select("*")
            .eq("swarm_id", swarm_id)
            .execute()
        )
        bindings = bindings_res.data if bindings_res else []

        tool_ids = list({b["tool_id"] for b in bindings if b.get("tool_id")})
        tools_map: dict[str, dict[str, Any]] = {}
        if tool_ids:
            try:
                tools_res = (
                    client.table("tools")
                    .select("*")
                    .in_("id", tool_ids)
                    .execute()
                )
                tools_map = {t["id"]: t for t in (tools_res.data or [])}
            except Exception as exc:  # noqa: BLE001
                logger.warning("get_swarm: failed to load tools %s: %s", tool_ids, exc)

        for b in bindings:
            b["tool"] = tools_map.get(b.get("tool_id"))

        return {
            "swarm": swarm,
            "agents": agents,
            "tasks": tasks,
            "tool_bindings": bindings,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("get_swarm failed for %s: %s", swarm_id, exc)
        return None


def list_swarms(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Liste les swarms actifs visibles pour cet owner.

    Si `owner_id` est fourni : retourne les swarms de l'owner ET les templates
    globaux (owner_id IS NULL AND is_template=true) — ces derniers sont visibles
    par tous les users authentifiés, comme en RLS Supabase.
    Si `owner_id is None` (service-role interne) : tous les swarms actifs.

    Perf : enrichissement agents_count + last_run en 2 requêtes agrégées
    (au lieu de 1 + 2N), cf audit 2026-06-07. Idéal V2 = RPC DISTINCT ON.
    """
    _assert_valid_uuid(owner_id)
    client = _facade._get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("swarms")
            .select(
                "id,owner_id,name,description,version,is_active,is_template,"
                "created_at,updated_at"
            )
            .eq("is_active", True)
            .order("created_at", desc=True)
        )
        if owner_id:
            # Include owned swarms OR global templates (mirrors swarms_templates_readable RLS).
            query = query.or_(f"owner_id.eq.{owner_id},and(owner_id.is.null,is_template.eq.true)")
        result = query.execute()
        swarms = result.data if result else []

        # Enrichit agents_count + last_run_* en 2 requêtes agrégées (au lieu de
        # 1 + 2N), fix N+1 — ce chemin est appelé toutes les 3s par activity/live.
        sids = [s["id"] for s in swarms if s.get("id")]
        agents_by_swarm: dict[str, int] = {}
        last_run_by_swarm: dict[str, dict] = {}

        if sids:
            # (a) agents_count : 1 requête, comptage en mémoire (peu d'agents/swarm).
            try:
                agents_res = (
                    client.table("swarm_agents")
                    .select("swarm_id")
                    .in_("swarm_id", sids)
                    .execute()
                )
                for row in agents_res.data or []:
                    k = row.get("swarm_id")
                    if k:
                        agents_by_swarm[k] = agents_by_swarm.get(k, 0) + 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("agents_count batch failed: %s", exc)

            # (b) last_run : 1 requête triée desc — le 1er vu par swarm = le plus
            # récent (sert l'index composite swarm_runs_swarm_started_idx, 0029).
            try:
                runs_res = (
                    client.table("swarm_runs")
                    .select("swarm_id,started_at,status")
                    .in_("swarm_id", sids)
                    .order("started_at", desc=True)
                    .execute()
                )
                for row in runs_res.data or []:
                    k = row.get("swarm_id")
                    if k and k not in last_run_by_swarm:
                        last_run_by_swarm[k] = row
            except Exception as exc:  # noqa: BLE001
                logger.warning("last_run batch failed: %s", exc)

        for s in swarms:
            sid = s.get("id")
            s["agents_count"] = agents_by_swarm.get(sid, 0)
            lr = last_run_by_swarm.get(sid)
            s["last_run_at"] = lr.get("started_at") if lr else None
            s["last_run_status"] = lr.get("status") if lr else None

        return swarms
    except Exception as exc:  # noqa: BLE001
        logger.error("list_swarms failed: %s", exc)
        return []


def create_swarm(payload: dict[str, Any]) -> str | None:
    """Insère un nouveau swarm. Renvoie l'id (str) ou None en cas d'échec.

    Le payload accepte les colonnes natives de la table `swarms` :
    `owner_id`, `name`, `description`, `version`, `config_json`, `is_active`,
    `is_template`. `created_at` / `updated_at` sont posés ici si absents.
    """
    client = _facade._get_client()
    if client is None:
        return None
    try:
        now = _now_iso()
        row: dict[str, Any] = {
            "name": payload.get("name") or "Untitled swarm",
            "description": payload.get("description", ""),
            "version": payload.get("version", 1),
            "config_json": payload.get("config_json", {}),
            "is_active": payload.get("is_active", True),
            "is_template": payload.get("is_template", False),
            "created_at": payload.get("created_at", now),
            "updated_at": payload.get("updated_at", now),
        }
        if payload.get("owner_id"):
            row["owner_id"] = payload["owner_id"]
        if payload.get("id"):
            row["id"] = payload["id"]

        result = client.table("swarms").insert(row).execute()
        if not result or not result.data:
            return None
        inserted = result.data[0]
        return inserted.get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_swarm failed: %s", exc)
        return None


def update_swarm(
    swarm_id: str,
    payload: dict[str, Any],
    owner_id: str | None = None,
) -> bool:
    """Patch un swarm. `updated_at` toujours rafraîchi.

    Si `owner_id` est fourni, la query UPDATE est filtrée sur owner_id —
    une tentative d'update cross-owner est silencieusement no-op côté DB.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        row = {k: v for k, v in payload.items() if k not in {"id", "created_at"}}
        row["updated_at"] = _now_iso()
        query = client.table("swarms").update(row).eq("id", swarm_id)
        if owner_id:
            query = query.eq("owner_id", owner_id)
        query.execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_swarm failed for %s: %s", swarm_id, exc)
        return False


def delete_swarm(
    swarm_id: str,
    hard: bool = False,
    owner_id: str | None = None,
) -> bool:
    """Soft-delete par défaut (`is_active = false`).

    Si `hard=True`, supprime réellement la ligne (utile pour rollback partiel
    d'une création échouée). Les FK ON DELETE CASCADE de la migration 0003
    s'occupent des agents/tasks/bindings/runs liés.

    Si `owner_id` est fourni, scope la suppression sur ce propriétaire.
    """
    if not hard:
        # PATCHABILITÉ : passe par la façade pour que patch(swarm_store.update_swarm) traverse.
        return _facade.update_swarm(swarm_id, {"is_active": False}, owner_id=owner_id)

    client = _facade._get_client()
    if client is None:
        return False
    try:
        query = client.table("swarms").delete().eq("id", swarm_id)
        if owner_id:
            query = query.eq("owner_id", owner_id)
        query.execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_swarm(hard=True) failed for %s: %s", swarm_id, exc)
        return False
