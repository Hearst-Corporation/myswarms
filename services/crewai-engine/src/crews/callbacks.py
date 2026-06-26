"""Callbacks CrewAI module-level (extrait de dynamic_crew, H7 split).

Step/task callbacks appliqués via `functools.partial(fn, run_id)` — picklable /
deepcopy-safe sous CrewAI 1.14. Tout l'état vit dans `step_writer._run_ctx[run_id]`,
sous le verrou partagé `step_writer._run_writers_lock`.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from crewai import Agent

from .crew_helpers import _STEP_OUTPUT_PREVIEW_CHARS
from .step_writer import _StepWriter, _run_ctx, _run_writers_lock

logger = logging.getLogger(__name__)


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
