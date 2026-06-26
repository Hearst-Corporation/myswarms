"""Factory dynamique de Crew CrewAI à partir d'une config DB Supabase.

H7 split : ce module est désormais la FAÇADE qui orchestre la construction
(`create_dynamic_crew`, `run_swarm_tasks`) et ré-exporte les symboles publics.
Les briques vivent dans des sous-modules cohésifs :
  - `step_writer.py`  : _StepWriter, état global (_run_writers / _run_ctx), flush_run_steps
  - `crew_helpers.py` : résolution LLM/tools, instantiate_agents/tasks, tri topologique, rendus
  - `callbacks.py`    : _module_step_callback / _module_task_callback

Charge un swarm (agents + tasks + tool_bindings) via `swarm_store.get_swarm`
puis instancie des objets CrewAI natifs (`Agent`, `Task`, `Crew`).

Contrat (aligné avec la migration 0006_swarms_dynamic.sql) :
- `model_provider` ∈ {"anthropic", "openai", "kimi", "hypercli"} — fallback "anthropic"
- `model_name` : string LiteLLM (ex: "claude-sonnet-4-6"). Si fourni, override
  toute factory. La colonne `llm_tier` N'EXISTE PAS en DB.
- Les tool_bindings de category "api_call" et tool.name ∈ {gmail, slack, telegram,
  googlecalendar, notion} sont résolus via Composio.
"""
from __future__ import annotations

import functools
import logging
import time
from typing import Any

from crewai import Crew, Process, Task

from ..persistence import swarm_store
from ..tools.ask_human import AskHumanTool
from .callbacks import _module_step_callback, _module_task_callback
from .crew_helpers import (
    _HYPERCLI_KNOWN_MODELS,
    _COMPOSIO_TOOLKITS,
    _INPUT_MAX_LINES,
    _INPUT_META_KEYS,
    _INPUT_VALUE_MAX_CHARS,
    _PRIOR_OUTPUTS_MAX_CHARS,
    _STEP_OUTPUT_PREVIEW_CHARS,
    _render_inputs_block,
    _render_prior_outputs,
    _resolve_llm,
    _resolve_tools_for_agent,
    _sum_task_tokens,
    _topological_sort_tasks,
    instantiate_agents,
    instantiate_tasks,
)
from .step_writer import (
    _WRITER_STOP_SENTINEL,
    _StepWriter,
    _run_ctx,
    _run_writers,
    _run_writers_lock,
    flush_run_steps,
)

logger = logging.getLogger(__name__)

# Ré-exports publics (compat importeurs : scheduler, flows, routes, architect, tests).
__all__ = [
    "create_dynamic_crew",
    "run_swarm_tasks",
    "flush_run_steps",
    "instantiate_agents",
    "instantiate_tasks",
    "_topological_sort_tasks",
    "_render_inputs_block",
    "_render_prior_outputs",
    "_resolve_llm",
    "_resolve_tools_for_agent",
    "_sum_task_tokens",
    "_StepWriter",
    "_run_writers",
    "_run_writers_lock",
    "_run_ctx",
    "_WRITER_STOP_SENTINEL",
    "_module_step_callback",
    "_module_task_callback",
    "_HYPERCLI_KNOWN_MODELS",
    "_COMPOSIO_TOOLKITS",
    "_INPUT_MAX_LINES",
    "_INPUT_META_KEYS",
    "_INPUT_VALUE_MAX_CHARS",
    "_PRIOR_OUTPUTS_MAX_CHARS",
    "_STEP_OUTPUT_PREVIEW_CHARS",
]


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
