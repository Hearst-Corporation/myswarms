"""Factory dynamique de Crew CrewAI à partir d'une config DB Supabase.

# TODO V2 [H7] : ce fichier dépasse 500 lignes (~540L). Cohésion forte
# autour de la factory de Crew dynamique (load → mapping → instantiation →
# callbacks). Splitter introduirait des indirections artificielles pour
# peu de gain. Plan V2 : extraire un `crew_callbacks.py` séparé pour les
# step_callback / task_callback / agent_callback dès qu'on dépasse 700L
# ou qu'on ajoute un 3e type de callback (e.g. tool_callback).

Charge un swarm (agents + tasks + tool_bindings) via `swarm_store.get_swarm`
puis instancie des objets CrewAI natifs (`Agent`, `Task`, `Crew`).

Contrat (aligné avec la migration 0006_swarms_dynamic.sql) :
- `model_provider` ∈ {"anthropic", "openai", "kimi", "hypercli"} — fallback "anthropic"
- `model_name` : string LiteLLM (ex: "claude-sonnet-4-6"). Si fourni, override
  toute factory. La colonne `llm_tier` N'EXISTE PAS en DB — fallback direct
  vers `get_llm("balanced")` si `model_name` absent ou invalide.
- Les tool_bindings de category "api_call" et tool.name ∈ {gmail, slack, telegram,
  googlecalendar, notion} sont résolus via Composio (via composio_session.get_composio_tools_for_toolkits).
- Les autres catégories renvoient pour l'instant une liste vide (extensible plus tard).
"""
from __future__ import annotations

import functools
import logging
import queue
import threading
import time
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task

from ..composio_session import get_composio_tools_for_toolkits
from ..config import settings
from ..llms import get_llm
from ..persistence import swarm_store
from ..tools.ask_human import AskHumanTool

logger = logging.getLogger(__name__)

# ── Async step writer ─────────────────────────────────────────────────────────
# Sentinel object used to signal the worker thread to exit cleanly.
_WRITER_STOP_SENTINEL = object()

# Module-level registry {run_id: _StepWriter}.
# Populated by create_dynamic_crew when run_id is provided.
# Used by flush_run_steps() called from the flow after kickoff.
_run_writers: dict[str, "_StepWriter"] = {}
_run_writers_lock = threading.Lock()

# Module-level registry {run_id: ctx} pour les callbacks module-level.
# Chaque ctx contient : agent_obj_to_id, agents_map, tasks_meta, step_state,
# writer. Protégé par _run_writers_lock (PAS de 2e lock — on réutilise
# l'existant).
_run_ctx: dict[str, dict[str, Any]] = {}


class _StepWriter:
    """Thread-safe, non-blocking writer for swarm_run_steps.

    A single daemon worker thread drains a Queue and calls
    swarm_store.append_run_step(**item). The queue is FIFO, so
    step_number order is preserved (one worker, no interleaving).

    Usage:
        writer = _StepWriter(run_id="...")
        writer.enqueue(run_id=..., agent_id=..., step_number=..., ...)
        writer.close()   # drains + joins worker before returning
    """

    # Maximum time (seconds) to wait for queue drain during close().
    # Named constant — no magic number.
    _CLOSE_TIMEOUT_SECONDS: float = 30.0

    def __init__(self, run_id: str) -> None:
        self._run_id = run_id
        self._q: queue.Queue[Any] = queue.Queue()
        self._thread = threading.Thread(
            target=self._worker,
            name=f"step-writer-{run_id[:8]}",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, **kwargs: Any) -> None:
        """Non-blocking: puts item in queue. Never raises."""
        try:
            self._q.put_nowait(kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "_StepWriter.enqueue failed for run=%s: %s",
                self._run_id, exc,
            )

    def close(self) -> None:
        """Drain the queue and wait for the worker to finish.

        Puts a sentinel to signal the worker, then joins with a bounded
        timeout so we never block the flow indefinitely on a stuck DB call.
        """
        try:
            self._q.put(_WRITER_STOP_SENTINEL)
            self._thread.join(timeout=self._CLOSE_TIMEOUT_SECONDS)
            if self._thread.is_alive():
                logger.warning(
                    "_StepWriter worker still alive after %.1fs drain — "
                    "run=%s (some steps may be lost)",
                    self._CLOSE_TIMEOUT_SECONDS, self._run_id,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "_StepWriter.close failed for run=%s: %s",
                self._run_id, exc,
            )

    def _worker(self) -> None:
        """Daemon worker: consumes queue items and persists each step."""
        while True:
            try:
                item = self._q.get()
                if item is _WRITER_STOP_SENTINEL:
                    self._q.task_done()
                    break
                try:
                    swarm_store.append_run_step(**item)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "_StepWriter worker append_run_step failed for run=%s: %s",
                        self._run_id, exc,
                    )
                finally:
                    self._q.task_done()
            except Exception as exc:  # noqa: BLE001
                # Safety net: worker must never crash.
                logger.warning(
                    "_StepWriter worker unexpected error for run=%s: %s",
                    self._run_id, exc,
                )


def flush_run_steps(run_id: str | None) -> None:
    """Drain the _StepWriter for run_id, if one exists.

    Idempotent and fail-soft:
      - run_id=None → no-op.
      - Unknown run_id → no-op (writer may have already been closed).
      - Any exception → logged as warning, never raised.

    Called by dynamic_swarm_flow.run_crew BEFORE update_swarm_run so that
    ALL queued steps are persisted before the run transitions to
    completed/failed.
    """
    if not run_id:
        return
    with _run_writers_lock:
        writer = _run_writers.pop(run_id, None)
        _run_ctx.pop(run_id, None)
    if writer is None:
        return
    try:
        writer.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "flush_run_steps close failed for run=%s: %s",
            run_id, exc,
        )

# G3 fix : limite de preview pour les output_text persistés en DB. CrewAI
# peut produire des outputs longs (>50KB) qui gonflent inutilement
# `swarm_run_steps`. On garde un preview lisible côté UI.
_STEP_OUTPUT_PREVIEW_CHARS = 2000

# Clés méta éventuelles à exclure du bloc d'inputs injecté dans le prompt racine.
_INPUT_META_KEYS = {"swarm_id", "run_id", "trigger", "owner_id"}

# Bornage défensif du bloc d'inputs injecté dans la task racine : évite qu'une
# valeur pathologique (notes, source_url très long) gonfle le prompt de façon
# incontrôlée (anti-bloat, cohérent avec le revert anti-hang 3b0b13e).
# Les champs courts habituels (make/model/year/price_eur/fuel/country) ne sont
# jamais tronqués en pratique.
_INPUT_VALUE_MAX_CHARS: int = 200  # troncature à cette longueur + ellipsis
_INPUT_MAX_LINES: int = 12  # au plus N paires clé/valeur rendues


def _render_inputs_block(inputs: dict[str, Any] | None) -> str:
    """Bloc lisible des inputs réels du run, injecté UNIQUEMENT dans la task
    racine (Data Collector) pour grounder l'analyse sur le véhicule fourni
    (anti-hallucination). Les agents aval reçoivent le véhicule via le context
    CrewAI. Valeurs non vides, clés méta exclues, accolades neutralisées pour ne
    pas casser l'interpolation CrewAI. Retourne '' si rien.

    Bornage défensif : chaque valeur est tronquée à _INPUT_VALUE_MAX_CHARS et
    au plus _INPUT_MAX_LINES paires sont rendues (anti-bloat du prompt racine).
    """
    if not inputs:
        return ""
    lines: list[str] = []
    for key, value in inputs.items():
        if len(lines) >= _INPUT_MAX_LINES:
            break
        if key in _INPUT_META_KEYS or value is None:
            continue
        text = str(value).strip().replace("{", "").replace("}", "")
        if not text:
            continue
        if len(text) > _INPUT_VALUE_MAX_CHARS:
            text = text[:_INPUT_VALUE_MAX_CHARS] + "…"
        lines.append(f"- {key}: {text}")
    if not lines:
        return ""
    return (
        "\n\n## DONNÉES FOURNIES POUR CETTE ANALYSE (source de vérité — utilise "
        "EXCLUSIVEMENT ces valeurs, n'invente AUCUN autre véhicule)\n"
        + "\n".join(lines)
    )


# ── Constants ────────────────────────────────────────────────────────────────

# Modèles Hypercli connus (LiteLLM les préfixe "openai/" car l'endpoint est
# OpenAI-compatible). Défini au niveau module pour éviter une réallocation
# frozenset à chaque appel de _resolve_llm.
_HYPERCLI_KNOWN_MODELS: frozenset[str] = frozenset({
    "kimi-k2.6", "kimi-k2.5", "glm-5", "minimax-m2.5",
    "qwen3-embedding-4b", "kimi-k2.6-anthropic", "kimi-k2.5-anthropic",
})

_COMPOSIO_TOOLKITS: set[str] = {
    "gmail",
    "slack",
    "telegram",
    "googlecalendar",
    "notion",
    "google_calendar",  # alias commun, normalisé plus bas
}


def _resolve_llm(agent_row: dict[str, Any]) -> LLM:
    """Résout l'instance LLM à partir des colonnes DB.

    Politique Hypercli-only (directive provider unique) :
    - Si le provider DB est "kimi" ou "hypercli", OU si model_name est un
      modèle Hypercli connu : on instancie LLM avec base_url+api_key Hypercli.
    - Dans TOUS les autres cas (provider "anthropic", "openai", vide, ou model
      claude-*/gpt-*) : on IGNORE le provider d'origine et on route vers
      get_llm("balanced") qui est 100 % Hypercli. Aucun chemin n'instancie
      LLM(model="anthropic/...") ni un LLM OpenAI réel.

    Justification : la table swarm_agents contient actuellement model_provider
    ="anthropic" pour 100 % des agents (défaut Builder V1). La migration de
    réécriture des lignes est prévue en V2 ; en attendant cette politique de
    routage runtime garantit la conformité à la directive Hypercli-only sans
    modifier la DB. Le fallback final reste get_llm("balanced") — même provider
    (Hypercli), jamais Claude.

    NB : la colonne `llm_tier` N'EXISTE PAS dans `swarm_agents` (migration 0006)
    — on se base uniquement sur `model_provider` + `model_name`.
    """
    model_name = (agent_row.get("model_name") or "").strip()
    provider = (agent_row.get("model_provider") or "").strip().lower()
    agent_name_or_id = agent_row.get("name") or agent_row.get("id") or "<unknown>"

    if model_name:
        # Détermine si c'est un modèle Hypercli explicite.
        _is_hypercli = (
            provider in {"kimi", "hypercli"}
            or model_name in _HYPERCLI_KNOWN_MODELS
            or model_name.removeprefix("openai/") in _HYPERCLI_KNOWN_MODELS
        )

        if _is_hypercli:
            # Chemin Hypercli explicite : préfixe "openai/" pour LiteLLM et
            # injecte base_url + api_key Hypercli.
            bare_name = model_name.removeprefix("openai/")
            resolved_model = f"openai/{bare_name}"
            try:
                return LLM(
                    model=resolved_model,
                    base_url=settings.HYPERCLI_BASE_URL,
                    api_key=settings.HYPERCLI_API_KEY,
                )
            except Exception as exc:  # noqa: BLE001
                # Préfixe stable `[LLM_FALLBACK]` pour grep côté observabilité.
                logger.warning(
                    "[LLM_FALLBACK] agent=%s requested provider=%s model=%s — "
                    "LLM() instanciation failed (%s) — falling back to balanced tier",
                    agent_name_or_id, provider, model_name, exc,
                )
        else:
            # Politique Hypercli-only : provider anthropic/openai/vide ou
            # model claude-*/gpt-* → route vers Hypercli sans tenter le
            # provider d'origine. Préfixe grep-able [LLM_HYPERCLI_ONLY].
            logger.warning(
                "[LLM_HYPERCLI_ONLY] agent=%s provider=%s model=%s → "
                "routé Hypercli (politique provider unique — migration V2 "
                "réécrira les lignes DB)",
                agent_name_or_id, provider, model_name,
            )

    # Fallback final : get_llm("balanced") — 100 % Hypercli via llms.py,
    # conforme à la directive. Jamais Claude ni OpenAI réel.
    logger.warning(
        "[LLM_FALLBACK] agent=%s requested provider=%s model=%s — "
        "falling back to balanced tier (Hypercli)",
        agent_name_or_id, provider, model_name,
    )
    return get_llm("balanced")


def _resolve_tools_for_agent(
    agent_id: str,
    tool_bindings: list[dict[str, Any]],
    owner_id: str | None = None,
) -> list:
    """Renvoie la liste de tools CrewAI pour un agent donné.

    Aujourd'hui :
    - category="api_call" + tool.name ∈ _COMPOSIO_TOOLKITS → Composio bridge.
    - Les autres bindings sont ignorés (log debug). Extensible plus tard
      (webhook/custom-python/etc.).
    """
    composio_toolkits: list[str] = []
    for binding in tool_bindings:
        if binding.get("agent_id") != agent_id:
            continue
        tool = binding.get("tool") or {}
        if not tool:
            continue
        category = (tool.get("category") or "").lower()
        name = (tool.get("name") or "").lower()
        if category == "api_call" and name in _COMPOSIO_TOOLKITS:
            # Normalise les alias.
            slug = "googlecalendar" if name in {"googlecalendar", "google_calendar"} else name
            if slug not in composio_toolkits:
                composio_toolkits.append(slug)
        else:
            logger.debug(
                "Tool binding ignored (agent=%s, category=%s, name=%s) — not yet supported",
                agent_id, category, name,
            )

    if not composio_toolkits:
        return []
    return get_composio_tools_for_toolkits(composio_toolkits, owner_id=owner_id)


def instantiate_agents(swarm_config: dict[str, Any], owner_id: str | None = None) -> dict[str, Agent]:
    """Construit la map {agent_id_db: Agent CrewAI} à partir du swarm chargé."""
    agents_rows: list[dict[str, Any]] = swarm_config.get("agents", []) or []
    tool_bindings: list[dict[str, Any]] = swarm_config.get("tool_bindings", []) or []

    agents_map: dict[str, Agent] = {}
    for row in agents_rows:
        agent_id = str(row.get("id") or "")
        if not agent_id:
            logger.warning("Agent row without id skipped: %s", row)
            continue

        role = (row.get("role") or row.get("name") or "Agent").strip()
        goal = (row.get("system_prompt") or row.get("name") or "").strip() or role
        backstory = (row.get("description") or "").strip() or (
            f"Specialized agent: {role}"
        )

        tools = _resolve_tools_for_agent(agent_id, tool_bindings, owner_id=owner_id)
        llm = _resolve_llm(row)

        try:
            agents_map[agent_id] = Agent(
                role=role,
                goal=goal,
                backstory=backstory,
                tools=tools,
                llm=llm,
                allow_delegation=bool(row.get("allow_delegation", False)),
                verbose=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to build Agent for id=%s: %s", agent_id, exc)
    return agents_map


def _topological_sort_tasks(
    tasks_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Tri topologique (Kahn) des tasks selon `depends_on_task_id`.

    Garantit que pour chaque task instanciée, sa dépendance (si elle existe
    et est présente dans la liste) ait déjà été instanciée — sinon le
    `context=[prev_task]` côté CrewAI ne pourrait pas être résolu.

    Fallback : si un cycle est détecté ou si certaines tasks restent
    "orphelines" (cycle entre elles), on log un warning et on les ajoute
    en fin de liste dans leur ordre `(position_y, position_x)` d'origine.
    """
    # Index les tasks par id pour lookup rapide.
    by_id: dict[str, dict[str, Any]] = {}
    order_idx: dict[str, int] = {}
    for idx, row in enumerate(tasks_rows):
        tid = str(row.get("id") or "")
        if not tid:
            continue
        by_id[tid] = row
        order_idx[tid] = idx

    # in_degree initial : combien de tasks pointent VERS moi via depends_on
    # — non, Kahn standard utilise l'inverse : nb de mes prérequis non encore résolus.
    # Pour la cohérence d'execution sequential, on veut que les prérequis sortent en premier.
    in_degree: dict[str, int] = {tid: 0 for tid in by_id}
    # Graph "qui dépend de moi" : key = task qui doit sortir avant, value = ses successeurs.
    successors: dict[str, list[str]] = {tid: [] for tid in by_id}
    for tid, row in by_id.items():
        dep = row.get("depends_on_task_id")
        dep_str = str(dep) if dep else ""
        if dep_str and dep_str in by_id:
            # Cette task a dep_str comme prérequis → dep_str est prédecesseur.
            successors[dep_str].append(tid)
            in_degree[tid] += 1
        # Si dep_str n'existe pas dans by_id, on traite comme racine (in_degree=0).

    # Kahn : queue de tasks sans prérequis non résolus, tri stable par order_idx.
    queue: list[str] = sorted(
        [tid for tid, deg in in_degree.items() if deg == 0],
        key=lambda t: order_idx[t],
    )
    sorted_ids: list[str] = []
    while queue:
        # Pop la "première" (tri stable par position d'origine).
        head = queue.pop(0)
        sorted_ids.append(head)
        for succ in successors[head]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                # Insère à la bonne place (tri stable).
                inserted = False
                for i, q in enumerate(queue):
                    if order_idx[succ] < order_idx[q]:
                        queue.insert(i, succ)
                        inserted = True
                        break
                if not inserted:
                    queue.append(succ)

    if len(sorted_ids) != len(by_id):
        # Cycle détecté : les tasks restantes ont in_degree > 0.
        leftover = [tid for tid in by_id if tid not in sorted_ids]
        logger.warning(
            "Cycle détecté dans depends_on_task_id — tasks %s ajoutées en fin "
            "dans leur ordre (position_y, position_x) initial",
            leftover,
        )
        leftover.sort(key=lambda t: order_idx[t])
        sorted_ids.extend(leftover)

    return [by_id[tid] for tid in sorted_ids]


def instantiate_tasks(
    agents_map: dict[str, Agent],
    swarm_config: dict[str, Any],
    inputs_block: str = "",
) -> list[tuple[dict[str, Any], Task]]:
    """Construit la liste ordonnée de paires (meta DB, Task CrewAI).

    Le tri topologique (Kahn) garantit que `depends_on_task_id` est toujours
    résolvable vers un Task déjà construit, indépendamment de l'ordre de
    livraison Supabase (par défaut `position_y, position_x` — cf migration 0006).
    En cas de cycle, on tombe sur un fallback ordonné par position avec
    un warning explicite (cf `_topological_sort_tasks`).

    Retourne des paires `(meta, task)` — et NON juste les Task — pour que
    l'appelant puisse construire un `tasks_meta` strictement aligné (même
    cardinalité, même ordre) sur les tasks réellement instanciées. `meta`
    contient `task_id` / `agent_id` DÉJÀ résolus et validés ici (agent_id
    non-NULL et présent dans `agents_map`), évitant à l'appelant de re-résoudre
    l'agent_id. Les rows orphelines (agent_id NULL, agent inconnu, sans id, ou
    échec Task()) sont skippées ici et n'apparaissent donc pas dans le retour :
    le mapping meta↔task est exact par construction, sans duplication du
    prédicat de skip ni de la résolution agent_id.
    """
    tasks_rows: list[dict[str, Any]] = swarm_config.get("tasks", []) or []
    # B4 — tri topologique pour résoudre les dépendances proprement.
    ordered_rows = _topological_sort_tasks(tasks_rows)

    task_objects: dict[str, Task] = {}
    ordered_pairs: list[tuple[dict[str, Any], Task]] = []

    for row in ordered_rows:
        task_id = str(row.get("id") or "")
        if not task_id:
            logger.warning("Task row without id skipped: %s", row)
            continue

        # G1 fix : agent_id peut être NULL (task orpheline post-cascade SET NULL,
        # cf. migration 0009). On skip avec warning explicit plutôt que de
        # crasher la construction du Crew — l'orphan doit être re-pair via un
        # PATCH tasks côté UI avant de pouvoir rejouer le swarm.
        raw_agent_id = row.get("agent_id")
        if raw_agent_id is None:
            logger.warning(
                "Task %s has agent_id=NULL (orphan after agent deletion) — skipping. "
                "Re-pair via PATCH /v1/swarms/{id} with tasks payload to restore execution.",
                task_id,
            )
            continue
        agent_id = str(raw_agent_id)
        agent = agents_map.get(agent_id)
        if agent is None:
            logger.warning(
                "Task %s references unknown agent_id=%s — skipping",
                task_id, agent_id,
            )
            continue

        description = (row.get("description") or row.get("name") or "").strip()
        expected_output = (row.get("expected_output") or "Task output").strip()

        depends_on = row.get("depends_on_task_id")
        # Injection du bloc uniquement dans les tasks racines (sans depends_on).
        # Edge multi-racines : un DAG avec plusieurs entrées recevrait le bloc
        # en double (une fois par task racine) — le template Automobile n'a
        # qu'une seule racine (Data Collector), donc ce cas ne se produit pas
        # en production. À documenter si un swarm multi-racines est introduit.
        if inputs_block and not depends_on:
            description = f"{description}{inputs_block}"
        context_tasks: list[Task] = []
        if depends_on:
            dep_task = task_objects.get(str(depends_on))
            if dep_task is not None:
                context_tasks.append(dep_task)
            else:
                # Avec le tri topologique, ce cas n'arrive plus que si la
                # dépendance pointe vers un id inexistant ou en cycle.
                logger.warning(
                    "Task %s depends_on %s not yet instantiated (orphan ou cycle) — context skipped",
                    task_id, depends_on,
                )

        try:
            task_obj = Task(
                description=description,
                expected_output=expected_output,
                agent=agent,
                context=context_tasks or None,
            )
            task_objects[task_id] = task_obj
            # meta : task_id / agent_id déjà résolus et validés ci-dessus
            # (agent_id non-NULL + présent dans agents_map). On le porte tel
            # quel pour que l'appelant n'ait rien à re-résoudre.
            ordered_pairs.append(({"task_id": task_id, "agent_id": agent_id}, task_obj))
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to build Task for id=%s: %s", task_id, exc)
    return ordered_pairs


def _module_step_callback(run_id: str, payload: Any) -> None:
    """Callback CrewAI module-level qui pousse chaque step ReAct dans `swarm_run_steps`.

    Fonction MODULE-LEVEL appliquée via
    `functools.partial(_module_step_callback, run_id)` → picklable /
    deepcopy-safe sous CrewAI 1.14 (qui deepcopy les callbacks par task).
    Ne capture qu'un `str` (run_id) ; tout le reste vit dans `_run_ctx[run_id]`.

    Le `step_callback` est appelé pour chaque sous-étape d'agent (un cycle
    ReAct peut en générer plusieurs par task). Le `step_state` (partagé avec
    `_module_task_callback` via le MÊME ctx) porte :
      - `step_number` : incrémenté à chaque step ReAct
      - `current_task_idx` : avancé en fin de chaque task par le task callback

    `tasks_meta[current_task_idx]` permet d'attribuer le `task_id` /
    `agent_id` à chaque step ReAct.

    P0-2 — writes non-bloquants : ne fait QUE enqueue() dans le _StepWriter
    (zéro appel HTTP dans le thread du crew).

    Race-condition fix: _run_writers_lock is held for the entire read of
    _run_ctx AND the enqueue() call. This prevents a KeyError/lost-write
    when flush_run_steps() concurrently deletes the writer from _run_writers
    while this callback is between the dict lookup and the enqueue. Queue.put_nowait
    is non-blocking so holding the lock during enqueue is safe.
    """
    try:
        with _run_writers_lock:
            ctx = _run_ctx.get(run_id)
            if ctx is None:
                return

            step_state: dict[str, Any] = ctx["step_state"]
            agent_obj_to_id: dict[int, str] = ctx["agent_obj_to_id"]
            agents_map: dict[str, Agent] = ctx["agents_map"]
            task_meta_by_idx: list[dict[str, Any]] = ctx["tasks_meta"]
            writer: "_StepWriter" = ctx["writer"]

            step_state["step_number"] += 1
            now = time.monotonic()
            latency_ms = int((now - step_state["last_t"]) * 1000)
            step_state["last_t"] = now

            agent_id: str | None = None
            task_id: str | None = None
            output_text: str | None = None
            # Aligné sur l'enum DB `crew_run_status` (migration 0010 tâche E) :
            # valeurs autorisées = pending / running / paused_hitl / completed /
            # failed / cancelled. JAMAIS écrire "ok" ou "error" ici — rejected
            # par le cast enum côté Postgres.
            status = "completed"

            # Best-effort introspection : CrewAI 1.14 envoie un objet step
            # interne (AgentAction / AgentFinish) — on extrait ce qu'on peut
            # sans présumer la shape exacte.
            agent_attr = getattr(payload, "agent", None)
            if isinstance(agent_attr, Agent):
                agent_id = agent_obj_to_id.get(id(agent_attr))
            elif isinstance(agent_attr, str):
                for db_id, agent in agents_map.items():
                    if getattr(agent, "role", "") == agent_attr:
                        agent_id = db_id
                        break

            for attr in ("output", "log", "raw", "result", "input"):
                val = getattr(payload, attr, None)
                if val:
                    output_text = str(val)[:_STEP_OUTPUT_PREVIEW_CHARS]
                    break

            # Attribue ce step à la task courante (suivant current_task_idx).
            idx = step_state["current_task_idx"]
            if 0 <= idx < len(task_meta_by_idx):
                meta = task_meta_by_idx[idx]
                task_id = meta.get("task_id")
                if agent_id is None:
                    agent_id = meta.get("agent_id")

            if getattr(payload, "error", None):
                status = "failed"
                output_text = str(getattr(payload, "error"))[:_STEP_OUTPUT_PREVIEW_CHARS]

            # P0-2 : enqueue uniquement — zéro appel HTTP synchrone dans ce thread.
            # H5 fix : `finished_at` n'est PAS posé ici — append_run_step ne
            # gère que created_at, et nous n'avons pas l'id du step en retour
            # (best-effort, pas atomique). TODO V2 : retourner le step_id
            # depuis append_run_step et faire un update_run_step ultérieur
            # quand le step suivant arrive (proxy de "fin du step précédent").
            writer.enqueue(
                run_id=run_id,
                agent_id=agent_id,
                task_id=task_id,
                step_number=step_state["step_number"],
                output_text=output_text,
                latency_ms=latency_ms,
                status=status,
            )
    except Exception as exc:  # noqa: BLE001
        # Un callback qui crash ne doit JAMAIS faire tomber le Crew.
        logger.warning(
            "step_callback failed for run=%s: %s",
            run_id, exc,
        )


def _module_task_callback(run_id: str, task_output: Any) -> None:
    """Callback module-level de fin de task — avance le `current_task_idx`.

    Fonction MODULE-LEVEL appliquée via
    `functools.partial(_module_task_callback, run_id)` → deepcopy-safe
    (même raison que `_module_step_callback`). Partage le `step_state` avec
    le step callback via le MÊME `_run_ctx[run_id]`.

    À chaque fin de task CrewAI (TaskOutput), on incrémente le pointeur
    `current_task_idx` pour que les prochains step_callback rattachent leur
    step aux meta de la task SUIVANTE. On persiste aussi un "step de fin de
    task" avec le TaskOutput pour l'UI timeline.

    P0-2 : ne fait QUE enqueue() — zéro appel HTTP synchrone dans le thread
    du crew.

    Race-condition fix: _run_writers_lock is held for the entire body,
    consistent with _module_step_callback, preventing a lost-write or
    KeyError when flush_run_steps() concurrently removes the writer.
    """
    try:
        with _run_writers_lock:
            ctx = _run_ctx.get(run_id)
            if ctx is None:
                return

            step_state: dict[str, Any] = ctx["step_state"]
            tasks_meta: list[dict[str, Any]] = ctx["tasks_meta"]
            writer: "_StepWriter" = ctx["writer"]

            # Persiste un step "task done" avec l'output final de la task.
            current_idx = step_state["current_task_idx"]
            if 0 <= current_idx < len(tasks_meta):
                meta = tasks_meta[current_idx]
                output_text: str | None = None
                for attr in ("raw", "output", "result", "description"):
                    val = getattr(task_output, attr, None)
                    if val:
                        output_text = str(val)[:_STEP_OUTPUT_PREVIEW_CHARS]
                        break
                step_state["step_number"] += 1
                # P0-2 : enqueue uniquement — zéro appel HTTP synchrone.
                writer.enqueue(
                    run_id=run_id,
                    agent_id=meta.get("agent_id"),
                    task_id=meta.get("task_id"),
                    step_number=step_state["step_number"],
                    output_text=output_text,
                    latency_ms=0,
                    status="completed",
                )
            # Avance vers la task suivante pour les prochains step_callback.
            step_state["current_task_idx"] += 1
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "task_callback failed for run=%s: %s",
            run_id, exc,
        )


def create_dynamic_crew(swarm_id: str, run_id: str | None = None, owner_id: str | None = None, inputs: dict[str, Any] | None = None) -> Crew:
    """Charge un swarm DB et renvoie un Crew CrewAI prêt à être kickoff.

    Args:
        swarm_id:  UUID du swarm en DB.
        run_id:    UUID du run en cours (optionnel). Si fourni, on installe
                   un step_callback / task_callback qui persiste chaque
                   step dans `swarm_run_steps` — G3 fix.
        owner_id:  UUID du tenant (optionnel). Si fourni, Composio utilise
                   ce user_id pour l'authentification par tenant.
        inputs:    Inputs bruts du run (optionnel). Les clés méta sont exclues
                   via `_INPUT_META_KEYS` ; le reste est injecté dans le prompt
                   de la task racine via `_render_inputs_block`.

    Raises:
        ValueError: si le swarm n'existe pas ou n'a aucun agent/task valide.
    """
    swarm_config = swarm_store.get_swarm(swarm_id)
    if swarm_config is None:
        raise ValueError(f"Swarm {swarm_id} not found")

    agents_map = instantiate_agents(swarm_config, owner_id=owner_id)
    if not agents_map:
        raise ValueError(f"Swarm {swarm_id} has no instantiable agents")

    inputs_block = _render_inputs_block(inputs)
    task_pairs = instantiate_tasks(agents_map, swarm_config, inputs_block=inputs_block)
    if not task_pairs:
        raise ValueError(f"Swarm {swarm_id} has no instantiable tasks")
    tasks = [task for _meta, task in task_pairs]

    # Process : par défaut sequential ; lit `swarm.config_json.process` si fourni.
    config_json = swarm_config.get("swarm", {}).get("config_json") or {}
    process_str = (config_json.get("process") or "sequential").lower()
    process = Process.hierarchical if process_str == "hierarchical" else Process.sequential

    crew_kwargs: dict[str, Any] = {
        "agents": list(agents_map.values()),
        "tasks": tasks,
        "process": process,
        "verbose": True,
    }

    # step_callback + task_callback SÉPARÉS avec state isolé : deux fonctions
    # module-level distinctes (functools.partial(fn, run_id) — seul un `str`
    # est capturé, picklable / deepcopy-safe sous CrewAI 1.14 qui deepcopy
    # les callbacks par task) qui partagent `step_state` via _run_ctx[run_id].
    #
    # P0-2 — writes non-bloquants : un _StepWriter (queue + worker daemon)
    # est instancié ici et enregistré dans _run_writers[run_id].
    # Les callbacks ne font que enqueue() — zéro HTTP dans le thread du crew.
    # flush_run_steps(run_id) est appelé par le flow AVANT que le run passe
    # completed/failed pour garantir que tous les steps queués sont persistés.
    if run_id:
        tasks_meta = [meta for meta, _task in task_pairs]
        writer = _StepWriter(run_id)
        agent_obj_to_id = {id(agent): db_id for db_id, agent in agents_map.items()}
        with _run_writers_lock:
            _run_writers[run_id] = writer
            _run_ctx[run_id] = {
                "agent_obj_to_id": agent_obj_to_id,
                "agents_map": agents_map,
                "tasks_meta": tasks_meta,
                "step_state": {"step_number": 0, "current_task_idx": 0, "last_t": time.monotonic()},
                "writer": writer,
            }
        crew_kwargs["step_callback"] = functools.partial(_module_step_callback, run_id)
        crew_kwargs["task_callback"] = functools.partial(_module_task_callback, run_id)

    return Crew(**crew_kwargs)


# ── Exécution task-par-task (Human-in-the-loop) ───────────────────────────────
# Le HITL impose une exécution task-par-task : un point de décision = une
# frontière de task. On ne peut PAS interrompre un `crew.kickoff()` monolithique
# (CrewAI exécute toutes les tasks en interne). On exécute donc chaque task dans
# son propre mini-Crew ; entre deux tasks, `ask_human` peut mettre le run en
# pause (cf. src/tools/ask_human.py + flows/dynamic_swarm_flow.run_crew).

# Bloc de contexte injecté dans une task aval : remplace le `Task.context` natif
# de CrewAI, inopérant entre kickoffs séparés. Borné pour ne pas exploser le prompt.
_PRIOR_OUTPUTS_MAX_CHARS: int = 6000


def _render_prior_outputs(
    task_pairs: list[tuple[dict[str, Any], Task]],
    task_outputs: dict[str, str],
    upto_index: int,
) -> str:
    """Bloc lisible des outputs des tasks `< upto_index` (contexte aval)."""
    lines: list[str] = []
    for j in range(upto_index):
        out = task_outputs.get(str(j))
        if not out:
            continue
        _meta, task = task_pairs[j]
        label = getattr(task, "name", None) or f"étape {j + 1}"
        snippet = str(out).replace("{", "").replace("}", "")
        lines.append(f"### {label}\n{snippet}")
    if not lines:
        return ""
    block = "\n\n".join(lines)
    if len(block) > _PRIOR_OUTPUTS_MAX_CHARS:
        block = block[:_PRIOR_OUTPUTS_MAX_CHARS] + "…"
    return (
        "\n\n## CONTEXTE DES ÉTAPES PRÉCÉDENTES (résultats déjà produits — "
        "appuie-toi dessus, ne les refais pas)\n" + block
    )


def _sum_task_tokens(acc: dict[str, int], crew: Any, result: Any) -> None:
    """Cumule (best-effort) les usage metrics d'un mini-Crew dans `acc`.

    Défensif : getattr partout, jamais d'assert ni de prix inventé. Met à jour
    `acc["tokens_in"]` / `acc["tokens_out"]` en place.
    """
    try:
        usage = getattr(crew, "usage_metrics", None)
        if usage is None and result is not None:
            usage = getattr(result, "token_usage", None)
        if usage is None:
            return
        prompt = getattr(usage, "prompt_tokens", None)
        completion = getattr(usage, "completion_tokens", None)
        if prompt is None and completion is None:
            total = getattr(usage, "total_tokens", None)
            if total is not None:
                acc["tokens_in"] += int(total)
            return
        if prompt is not None:
            acc["tokens_in"] += int(prompt)
        if completion is not None:
            acc["tokens_out"] += int(completion)
    except Exception as exc:  # noqa: BLE001
        logger.warning("_sum_task_tokens failed: %s", exc)


def run_swarm_tasks(
    swarm_id: str,
    run_id: str | None,
    owner_id: str | None = None,
    inputs: dict[str, Any] | None = None,
    start_index: int = 0,
    ttl_minutes: int | None = None,
) -> dict[str, Any]:
    """Exécute les tasks d'un swarm UNE PAR UNE (HITL task-boundary).

    Chaque task tourne dans son propre mini-Crew (1 agent, 1 task). Si un agent
    appelle `ask_human`, l'outil lève `HumanDecisionRequired` (BaseException) qui
    ABORTE le mini-Crew courant et REMONTE jusqu'au Flow — le run est déjà passé
    `paused_hitl` par l'outil. Cette fonction n'attrape PAS cette exception.

    Reprise sans re-exécution : `start_index` = `swarm_runs.checkpoint_index` ;
    les outputs des tasks antérieures viennent de `inputs._task_outputs` (injectés
    en contexte, JAMAIS rejoués). Les réponses humaines déjà tranchées sont dans
    `inputs._hitl_answers` (l'outil les relit et renvoie la value → la task de
    décision se termine au lieu de re-pauser).

    Retourne `{"result": str, "tokens_in": int|None, "tokens_out": int|None}`.
    """
    inputs = inputs or {}
    swarm_config = swarm_store.get_swarm(swarm_id)
    if swarm_config is None:
        raise ValueError(f"Swarm {swarm_id} not found")

    agents_map = instantiate_agents(swarm_config, owner_id=owner_id)
    if not agents_map:
        raise ValueError(f"Swarm {swarm_id} has no instantiable agents")

    inputs_block = _render_inputs_block(inputs)
    task_pairs = instantiate_tasks(agents_map, swarm_config, inputs_block=inputs_block)
    if not task_pairs:
        raise ValueError(f"Swarm {swarm_id} has no instantiable tasks")

    task_outputs: dict[str, str] = dict(inputs.get("_task_outputs") or {})
    hitl_answers: dict[str, Any] = dict(inputs.get("_hitl_answers") or {})
    token_acc: dict[str, int] = {"tokens_in": 0, "tokens_out": 0}

    # Step writer + ctx enregistrés une fois pour tout le run ; current_task_idx
    # démarre à start_index pour attribuer correctement les steps au resume.
    # R03 : au resume (start_index > 0), on seed step_number depuis la DB pour
    # éviter que les steps repris repartent à 0 (collision de numéros en DB).
    if run_id:
        tasks_meta = [meta for meta, _t in task_pairs]
        writer = _StepWriter(run_id)
        agent_obj_to_id = {id(agent): db_id for db_id, agent in agents_map.items()}
        seed_step = swarm_store.max_step_number(run_id) if start_index > 0 else 0
        with _run_writers_lock:
            _run_writers[run_id] = writer
            _run_ctx[run_id] = {
                "agent_obj_to_id": agent_obj_to_id,
                "agents_map": agents_map,
                "tasks_meta": tasks_meta,
                "step_state": {
                    "step_number": seed_step,
                    "current_task_idx": start_index,
                    "last_t": time.monotonic(),
                },
                "writer": writer,
            }

    last_output = ""
    for i in range(start_index, len(task_pairs)):
        _meta, base_task = task_pairs[i]
        agent = base_task.agent
        prior_block = _render_prior_outputs(task_pairs, task_outputs, i)
        description = (base_task.description or "") + prior_block
        # Outil de décision run-scopé, ordinal = index de la task (positionnel,
        # déterministe — la mémoïsation au resume matche de façon fiable).
        ask_tool = AskHumanTool(
            run_id=run_id or "",
            ordinal=i,
            hitl_answers=hitl_answers,
            ttl_minutes=ttl_minutes,
        )
        task_tools = list(getattr(agent, "tools", []) or []) + [ask_tool]
        task_i = Task(
            description=description,
            expected_output=base_task.expected_output,
            agent=agent,
            tools=task_tools,
        )

        if run_id:
            with _run_writers_lock:
                ctx = _run_ctx.get(run_id)
                if ctx is not None:
                    ctx["step_state"]["current_task_idx"] = i

        crew_kwargs: dict[str, Any] = {
            "agents": [agent],
            "tasks": [task_i],
            "process": Process.sequential,
            "verbose": True,
        }
        if run_id:
            crew_kwargs["step_callback"] = functools.partial(_module_step_callback, run_id)
            crew_kwargs["task_callback"] = functools.partial(_module_task_callback, run_id)

        mini_crew = Crew(**crew_kwargs)
        # Peut lever HumanDecisionRequired (BaseException) → remonte au Flow.
        result = mini_crew.kickoff(inputs=inputs)
        _sum_task_tokens(token_acc, mini_crew, result)

        last_output = getattr(result, "raw", None) or str(result)
        task_outputs[str(i)] = last_output
        if run_id:
            swarm_store.save_task_checkpoint(run_id, i, last_output)

    return {
        "result": last_output,
        "tokens_in": token_acc["tokens_in"] or None,
        "tokens_out": token_acc["tokens_out"] or None,
    }

