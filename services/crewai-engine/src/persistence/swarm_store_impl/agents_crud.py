"""CRUD agents / tasks / tool_bindings + snapshot-rollback (F6 / G1 / H4 / H9).

Contient :
- create/update/delete agent / task / tool_binding
- snapshot helpers (`_snapshot_rows`, `_snapshot_swarm_tree`)
- restore helpers (`_restore_swarm_tree`, `_restore_snapshot`)
- bulk replace (`replace_agents`, `replace_tasks`, `replace_tool_bindings`)
- relink des orphelins (`_relink_orphans_after_replace_agents`)

PATCHABILITÉ — règle critique :
- `_get_client`, `_snapshot_rows`, `_snapshot_swarm_tree` sont patchés par les
  tests via la façade. Toute fonction qui les appelle en INTERNE doit passer par
  `_facade.<symbole>()` (jamais la version locale), sinon le patch ne traverse
  pas. Cf. tests/test_snapshot_pagination.py (patch _snapshot_rows puis appel
  _snapshot_swarm_tree ; patch _snapshot_swarm_tree/_snapshot_rows=None puis
  appel replace_agents/replace_tasks/replace_tool_bindings).
- `_retry_db_op` lit le backoff via façade (cf. _shared) → restore fonctions OK.
- `create_agent` / `create_task` / `create_tool_binding` ne sont PAS patchés :
  appel local accepté.
"""
from __future__ import annotations

from typing import Any

from .. import swarm_store as _facade  # noqa: PLC0415 — façade pour patchabilité (lazy au runtime)
from ._shared import (
    _AGENT_COLUMNS,
    _BINDING_COLUMNS,
    _RESTORE_FAILURE_MARKER,
    _TASK_COLUMNS,
    _filter_payload,
    _now_iso,
    _retry_db_op,
    logger,
)


# ── Swarm agents CRUD ────────────────────────────────────────────────────────


def create_agent(
    swarm_id: str,
    payload: dict[str, Any],
    agent_id: str | None = None,
) -> str | None:
    """Insère un agent rattaché à un swarm. Renvoie l'id (UUID str) ou None.

    `agent_id` peut être imposé par l'appelant (utile pour préserver les UUIDs
    locaux émis côté front lors d'un POST swarm complet — facilite le mapping
    `agent_id` vers les tasks dans le même round-trip).
    """
    client = _facade._get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = _filter_payload(payload, _AGENT_COLUMNS)
        row["swarm_id"] = swarm_id
        if agent_id:
            row["id"] = agent_id

        result = client.table("swarm_agents").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_agent failed for swarm %s: %s", swarm_id, exc)
        return None


def update_agent(agent_id: str, payload: dict[str, Any]) -> bool:
    """Patch un agent existant."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _AGENT_COLUMNS)
        if not row:
            return True
        row["updated_at"] = _now_iso()
        client.table("swarm_agents").update(row).eq("id", agent_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_agent failed for %s: %s", agent_id, exc)
        return False


def delete_agent(agent_id: str) -> bool:
    """Hard delete d'un agent. Cascade DB sur tasks/bindings liés."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        client.table("swarm_agents").delete().eq("id", agent_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_agent failed for %s: %s", agent_id, exc)
        return False


# ── Swarm tasks CRUD ─────────────────────────────────────────────────────────


def create_task(
    swarm_id: str,
    payload: dict[str, Any],
    task_id: str | None = None,
) -> str | None:
    """Insère une task rattachée à un swarm. Renvoie l'id (UUID str) ou None."""
    client = _facade._get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = _filter_payload(payload, _TASK_COLUMNS)
        row["swarm_id"] = swarm_id
        if task_id:
            row["id"] = task_id

        result = client.table("swarm_tasks").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_task failed for swarm %s: %s", swarm_id, exc)
        return None


def update_task(task_id: str, payload: dict[str, Any]) -> bool:
    """Patch une task existante."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _TASK_COLUMNS)
        if not row:
            return True
        row["updated_at"] = _now_iso()
        client.table("swarm_tasks").update(row).eq("id", task_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_task failed for %s: %s", task_id, exc)
        return False


def delete_task(task_id: str) -> bool:
    """Hard delete d'une task."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        client.table("swarm_tasks").delete().eq("id", task_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_task failed for %s: %s", task_id, exc)
        return False


# ── Tool bindings CRUD ───────────────────────────────────────────────────────


def create_tool_binding(
    swarm_id: str,
    agent_id: str,
    tool_id: str,
    priority: int = 0,
    config_json: dict[str, Any] | None = None,
    binding_id: str | None = None,
) -> str | None:
    """Crée un binding tool↔agent dans un swarm. Renvoie l'id (UUID str) ou None."""
    client = _facade._get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = {
            "swarm_id": swarm_id,
            "agent_id": agent_id,
            "tool_id": tool_id,
            "priority": priority,
            "config_json": config_json or {},
        }
        if binding_id:
            row["id"] = binding_id
        result = client.table("swarm_tool_bindings").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "create_tool_binding failed (swarm=%s, agent=%s, tool=%s): %s",
            swarm_id, agent_id, tool_id, exc,
        )
        return None


def update_tool_binding(binding_id: str, payload: dict[str, Any]) -> bool:
    """Patch un tool_binding existant (priority / config_json / agent_id / tool_id)."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _BINDING_COLUMNS)
        if not row:
            return True
        client.table("swarm_tool_bindings").update(row).eq("id", binding_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_tool_binding failed for %s: %s", binding_id, exc)
        return False


def delete_tool_binding(binding_id: str) -> bool:
    """Hard delete d'un binding."""
    client = _facade._get_client()
    if client is None:
        return False
    try:
        client.table("swarm_tool_bindings").delete().eq("id", binding_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_tool_binding failed for %s: %s", binding_id, exc)
        return False


# ── Replace bulk helpers (delete-all-then-insert pour les saves complets) ────
#
# F6 fix : snapshot-rollback applicatif.
#
# supabase-py n'expose pas de transaction PostgreSQL native simple (pas de
# `BEGIN/COMMIT` via REST). Workaround : avant tout `delete + insert`, on
# snapshot l'état courant. Si un insert échoue en cours de boucle, on
# restore depuis le snapshot (delete + re-insert des rows originales). Best-
# effort — si la restauration elle-même échoue, on log un warning explicit.


def _snapshot_rows(table: str, swarm_id: str) -> list[dict[str, Any]] | None:
    """Snapshot toutes les rows d'une table filtrées par swarm_id.

    Renvoie une liste (potentiellement vide) ou None si Supabase indispo / erreur.
    Les rows sont retournées telles quelles (avec leur id) pour permettre une
    ré-insertion fidèle en cas de rollback.

    Pagination: fetches in chunks of PAGE rows to avoid the PostgREST default
    limit (~1000 rows), which would silently truncate the snapshot and cause
    partial rollbacks on large swarms.
    """
    client = _facade._get_client()
    if client is None:
        return None
    try:
        PAGE = 1000
        offset = 0
        all_rows: list[dict[str, Any]] = []
        while True:
            res = (
                client.table(table)
                .select("*")
                .eq("swarm_id", swarm_id)
                .range(offset, offset + PAGE - 1)
                .execute()
            )
            chunk = res.data if res else []
            all_rows.extend(chunk)
            if len(chunk) < PAGE:
                break
            offset += PAGE
        return all_rows
    except Exception as exc:  # noqa: BLE001
        logger.error("_snapshot_rows: snapshot failed for %s/%s: %s", table, swarm_id, exc)
        return None


def _snapshot_swarm_tree(swarm_id: str) -> dict[str, list[dict[str, Any]]] | None:
    """G1 fix : snapshot multi-tables (agents + tasks + bindings) atomique.

    Avant `replace_agents`, on doit capturer l'ensemble du sous-arbre lié au
    swarm — sinon la CASCADE (ou désormais le SET NULL après la migration 0009)
    laisse partir des rows que F6 ne peut pas restaurer.

    Renvoie `{"agents": [...], "tasks": [...], "bindings": [...]}` ou None si
    une seule des 3 lectures échoue (sécurité : on préfère interrompre plutôt
    que de risquer un rollback partiel).

    PATCHABILITÉ : appelle `_facade._snapshot_rows(...)` (pas la version locale)
    pour que test_snapshot_pagination puisse patcher `_snapshot_rows` et observer
    l'effet ici.

    # TODO V2 : add pagination LIMIT 5000 + warning if exceeded.
    """
    agents = _facade._snapshot_rows("swarm_agents", swarm_id)
    tasks = _facade._snapshot_rows("swarm_tasks", swarm_id)
    bindings = _facade._snapshot_rows("swarm_tool_bindings", swarm_id)
    if agents is None or tasks is None or bindings is None:
        return None
    return {"agents": agents, "tasks": tasks, "bindings": bindings}


def _restore_swarm_tree(
    swarm_id: str,
    snapshot: dict[str, list[dict[str, Any]]],
) -> bool:
    """G1 fix : restore multi-tables après un échec de replace_agents.

    Stratégie : delete les 3 tables en cascade-friendly order (bindings →
    tasks → agents) puis re-insert depuis le snapshot (agents → tasks →
    bindings) pour respecter les FK.

    H9 fix : chaque opération delete/insert passe par `_retry_db_op` (retry
    exponentiel 3 tentatives) — un échec transitoire (réseau / 5xx PostgREST)
    ne corrompt plus la DB au premier coup. Si la restauration échoue malgré
    les retries, on émet un log CRITICAL marqué `SWARM_RESTORE_FAILURE`
    (capturé par Sentry) au lieu d'un simple warning : signal durable
    d'incohérence DP potentielle, alertable en prod.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        # Order matters : on delete d'abord les "feuilles" (bindings/tasks)
        # puis les "racines" (agents) pour ne pas déclencher de SET NULL
        # parasite intermédiaire.
        _retry_db_op(
            lambda: client.table("swarm_tool_bindings").delete().eq("swarm_id", swarm_id).execute(),
            what="restore_tree.delete_bindings", swarm_id=swarm_id,
        )
        _retry_db_op(
            lambda: client.table("swarm_tasks").delete().eq("swarm_id", swarm_id).execute(),
            what="restore_tree.delete_tasks", swarm_id=swarm_id,
        )
        _retry_db_op(
            lambda: client.table("swarm_agents").delete().eq("swarm_id", swarm_id).execute(),
            what="restore_tree.delete_agents", swarm_id=swarm_id,
        )

        # Re-insert : racines (agents) d'abord, puis tasks (FK agent_id), puis
        # bindings (FK agent_id + tool_id).
        if snapshot["agents"]:
            _retry_db_op(
                lambda: client.table("swarm_agents").insert(snapshot["agents"]).execute(),
                what="restore_tree.insert_agents", swarm_id=swarm_id,
            )
        if snapshot["tasks"]:
            _retry_db_op(
                lambda: client.table("swarm_tasks").insert(snapshot["tasks"]).execute(),
                what="restore_tree.insert_tasks", swarm_id=swarm_id,
            )
        if snapshot["bindings"]:
            _retry_db_op(
                lambda: client.table("swarm_tool_bindings").insert(snapshot["bindings"]).execute(),
                what="restore_tree.insert_bindings", swarm_id=swarm_id,
            )

        logger.warning(
            "_restore_swarm_tree: restored %d agents / %d tasks / %d bindings for swarm %s",
            len(snapshot["agents"]), len(snapshot["tasks"]),
            len(snapshot["bindings"]), swarm_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.critical(
            "%s _restore_swarm_tree: FAILED to restore swarm %s after retries — "
            "DB may be inconsistent (orphaned agents/tasks/bindings): %s",
            _RESTORE_FAILURE_MARKER, swarm_id, exc,
        )
        return False


def _restore_snapshot(table: str, swarm_id: str, snapshot: list[dict[str, Any]]) -> bool:
    """Re-insert les rows snapshot après un échec de replace_*.

    Stratégie : delete tout (au cas où il reste des résidus) puis bulk insert
    du snapshot.

    H9 fix : delete + insert passent par `_retry_db_op` (retry exponentiel) ;
    un échec définitif émet un log CRITICAL marqué `SWARM_RESTORE_FAILURE`
    (capturé par Sentry) plutôt qu'un warning silencieux.
    """
    client = _facade._get_client()
    if client is None:
        return False
    try:
        _retry_db_op(
            lambda: client.table(table).delete().eq("swarm_id", swarm_id).execute(),
            what=f"restore_snapshot.delete_{table}", swarm_id=swarm_id,
        )
        if snapshot:
            _retry_db_op(
                lambda: client.table(table).insert(snapshot).execute(),
                what=f"restore_snapshot.insert_{table}", swarm_id=swarm_id,
            )
        logger.warning(
            "_restore_snapshot: restored %d rows in %s for swarm %s",
            len(snapshot), table, swarm_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.critical(
            "%s _restore_snapshot: FAILED to restore %s/%s after retries — "
            "DB may be inconsistent: %s",
            _RESTORE_FAILURE_MARKER, table, swarm_id, exc,
        )
        return False


def replace_agents(swarm_id: str, agents: list[dict[str, Any]]) -> dict[str, str] | None:
    """Remplace intégralement les agents d'un swarm.

    Retourne un mapping `{client_id → db_uuid}` pour permettre à l'appelant
    (PATCH du builder) de résoudre les références `agent_id` dans les tasks
    et tool_bindings du même payload.

    H2 fix : retourne `None` (et non `{}`) en cas d'échec, pour permettre au
    routeur de distinguer "payload vide légitime" de "snapshot/delete/insert
    failed après rollback". `{}` reste valide (cas : aucun agent à insérer
    OU aucun client_id à mapper).

    G1 fix : snapshot-rollback multi-tables (agents + tasks + bindings).
    Avant la migration 0009, le DELETE des agents déclenchait une CASCADE qui
    effaçait silencieusement toutes les tasks et tool_bindings du swarm —
    catastrophique pour un PATCH `{"agents": [...]}` sans clé `tasks`.

    Depuis la migration 0009 :
      - swarm_tasks.agent_id          ON DELETE SET NULL + nullable
      - swarm_tool_bindings.agent_id  ON DELETE SET NULL + nullable

    Donc en cas d'agent supprimé puis recréé avec un nouveau id, la task qui
    pointait dessus se retrouve avec `agent_id=NULL` (orpheline, mais
    préservée). H4 fix : on re-link les tasks/bindings vers les agents
    conservés (mapping via snapshot, `old_id == new_id` quand un même UUID
    revient dans le payload).

    Si replace_agents échoue partiellement, on restore TOUT (agents + tasks +
    bindings) depuis le snapshot via `_restore_swarm_tree`.
    """
    client = _facade._get_client()
    if client is None:
        return None

    # G1 fix : snapshot multi-tables AVANT delete (le DELETE peut déclencher
    # un SET NULL en cascade sur tasks/bindings, et on veut pouvoir tout
    # restaurer en bloc). PATCHABILITÉ : via façade.
    snapshot = _facade._snapshot_swarm_tree(swarm_id)
    if snapshot is None:
        return None

    id_map: dict[str, str] = {}
    try:
        # Delete all : le SET NULL cascade vers tasks/bindings (post-0009),
        # ce qui préserve les rows orphelines (pas de cascade destructive).
        client.table("swarm_agents").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_agents: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore en bloc si delete a foiré (état mixte possible).
        _facade._restore_swarm_tree(swarm_id, snapshot)
        return None

    failure = False
    for agent in agents:
        local_id = agent.get("id")
        payload = {k: v for k, v in agent.items() if k != "id"}
        db_id = create_agent(swarm_id=swarm_id, payload=payload, agent_id=local_id)
        if db_id is None:
            logger.warning(
                "replace_agents: create_agent failed (swarm=%s, name=%s) — rolling back tree",
                swarm_id, agent.get("name"),
            )
            failure = True
            break
        if local_id:
            id_map[str(local_id)] = db_id
        id_map[db_id] = db_id

    if failure:
        # Restore complet du sous-arbre — agents échoués, tasks/bindings
        # SET NULL côté DB sont aussi réparés depuis le snapshot.
        _facade._restore_swarm_tree(swarm_id, snapshot)
        return None

    # H4 fix : re-link les tasks/bindings préservées vers les agents
    # conservés (cas où le client a renvoyé le même UUID dans le payload).
    # Sans ce re-link, la cascade SET NULL aurait laissé les tasks orphelines
    # même quand l'agent est ré-inséré avec son ancien UUID.
    try:
        _relink_orphans_after_replace_agents(
            swarm_id=swarm_id,
            snapshot=snapshot,
            id_map=id_map,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "replace_agents: relink orphans failed for swarm %s: %s (orphans persist)",
            swarm_id, exc,
        )

    return id_map


def _relink_orphans_after_replace_agents(
    swarm_id: str,
    snapshot: dict[str, list[dict[str, Any]]],
    id_map: dict[str, str],
) -> None:
    """H4 fix : re-link tasks/bindings orphelines vers les agents conservés.

    Pour chaque row du snapshot pointant vers un agent dont l'UUID est encore
    présent dans le payload (id_map contient old_id), on UPDATE la row en DB
    pour reconnecter `agent_id`. Sans ça, la cascade SET NULL aurait laissé
    la row avec `agent_id=NULL` même quand l'agent est conservé.

    Mapping : id_map contient `{client_id → new_db_uuid}` ET `{new_db_uuid →
    new_db_uuid}` (cf. boucle de replace_agents). Donc si `old_agent_id` du
    snapshot est dans id_map, on peut reconnecter.
    """
    client = _facade._get_client()
    if client is None:
        return

    # Tasks orphelines à reconnecter.
    for task in snapshot.get("tasks", []):
        old_agent_id = task.get("agent_id")
        task_id = task.get("id")
        if not old_agent_id or not task_id:
            continue
        new_agent_id = id_map.get(str(old_agent_id))
        if not new_agent_id:
            continue  # agent supprimé, task reste orpheline (agent_id=NULL)
        try:
            client.table("swarm_tasks").update(
                {"agent_id": new_agent_id}
            ).eq("id", task_id).eq("swarm_id", swarm_id).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "relink task %s → agent %s failed: %s",
                task_id, new_agent_id, exc,
            )

    # Tool bindings orphelins à reconnecter.
    for binding in snapshot.get("bindings", []):
        old_agent_id = binding.get("agent_id")
        binding_id = binding.get("id")
        if not old_agent_id or not binding_id:
            continue
        new_agent_id = id_map.get(str(old_agent_id))
        if not new_agent_id:
            continue
        try:
            client.table("swarm_tool_bindings").update(
                {"agent_id": new_agent_id}
            ).eq("id", binding_id).eq("swarm_id", swarm_id).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "relink binding %s → agent %s failed: %s",
                binding_id, new_agent_id, exc,
            )


def replace_tasks(
    swarm_id: str,
    tasks: list[dict[str, Any]],
    agent_id_map: dict[str, str] | None = None,
) -> dict[str, str] | None:
    """Remplace intégralement les tasks d'un swarm.

    Si `agent_id_map` est fourni, résout les `agent_id` clients vers les UUIDs
    DB (mapping construit par `replace_agents`).

    H2 fix : retourne `None` en cas d'échec (snapshot/delete/insert KO après
    rollback). Sinon retourne le mapping `{client_id → db_uuid}` (peut être
    `{}` si payload vide ou aucun id client).

    F6 fix : snapshot-rollback applicatif.
    """
    client = _facade._get_client()
    if client is None:
        return None

    # PATCHABILITÉ : snapshot via façade.
    snapshot = _facade._snapshot_rows("swarm_tasks", swarm_id)
    if snapshot is None:
        return None

    agent_id_map = agent_id_map or {}
    id_map: dict[str, str] = {}
    try:
        client.table("swarm_tasks").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_tasks: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore snapshot — sans cela les tasks DELETE seraient perdues.
        _facade._restore_snapshot("swarm_tasks", swarm_id, snapshot)
        return None

    failure = False
    for task in tasks:
        local_id = task.get("id")
        payload = {k: v for k, v in task.items() if k != "id"}
        # Résout agent_id local → DB UUID si nécessaire.
        agent_ref = payload.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            payload["agent_id"] = agent_id_map[agent_ref]
        # Résout depends_on_task_id local → DB UUID.
        dep = payload.get("depends_on_task_id")
        if dep and dep in id_map:
            payload["depends_on_task_id"] = id_map[dep]

        db_id = create_task(swarm_id=swarm_id, payload=payload, task_id=local_id)
        if db_id is None:
            logger.warning(
                "replace_tasks: create_task failed (swarm=%s, name=%s) — rolling back",
                swarm_id, task.get("name"),
            )
            failure = True
            break
        if local_id:
            id_map[str(local_id)] = db_id
        id_map[db_id] = db_id

    if failure:
        _facade._restore_snapshot("swarm_tasks", swarm_id, snapshot)
        return None
    return id_map


def replace_tool_bindings(
    swarm_id: str,
    bindings: list[dict[str, Any]],
    agent_id_map: dict[str, str] | None = None,
) -> bool:
    """Remplace intégralement les tool_bindings d'un swarm.

    Résout les `agent_id` clients vers DB via `agent_id_map`.

    H2 fix : retourne `False` UNIQUEMENT en cas d'échec hard (Supabase
    indispo, snapshot KO, delete KO, ou rollback déclenché par une insertion
    KO). Le cas "binding skippé car payload incomplet" (sans agent/tool) n'est
    PAS considéré comme un échec — on log un warning et on retourne `True`
    (les bindings valides ont bien été insérés).

    F6 fix : snapshot-rollback applicatif sur échec d'insertion.
    """
    client = _facade._get_client()
    if client is None:
        return False

    # PATCHABILITÉ : snapshot via façade.
    snapshot = _facade._snapshot_rows("swarm_tool_bindings", swarm_id)
    if snapshot is None:
        return False

    agent_id_map = agent_id_map or {}
    try:
        client.table("swarm_tool_bindings").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_tool_bindings: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore snapshot — sinon les bindings DELETE sont perdus sans warning.
        _facade._restore_snapshot("swarm_tool_bindings", swarm_id, snapshot)
        return False

    failure = False
    for binding in bindings:
        agent_ref = binding.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            agent_ref = agent_id_map[agent_ref]
        if not agent_ref or not binding.get("tool_id"):
            logger.warning(
                "replace_tool_bindings: skipping binding without agent_id/tool_id "
                "(swarm=%s, binding=%s)", swarm_id, binding,
            )
            # H2 : skip de binding mal formé n'est pas un échec — on continue.
            continue
        bid = create_tool_binding(
            swarm_id=swarm_id,
            agent_id=agent_ref,
            tool_id=binding["tool_id"],
            priority=binding.get("priority", 0),
            config_json=binding.get("config_json") or {},
            binding_id=binding.get("id"),
        )
        if bid is None:
            logger.warning(
                "replace_tool_bindings: create failed (swarm=%s) — rolling back",
                swarm_id,
            )
            failure = True
            break

    if failure:
        _facade._restore_snapshot("swarm_tool_bindings", swarm_id, snapshot)
        return False
    return True
