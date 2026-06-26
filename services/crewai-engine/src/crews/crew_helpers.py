"""Construction des objets CrewAI (extrait de dynamic_crew, H7 split).

Module FEUILLE : résolution LLM (Hypercli-only), résolution des tools Composio,
instanciation Agent/Task, tri topologique des tasks, rendu des blocs d'inputs /
d'outputs antérieurs, agrégation best-effort des tokens.

Ne dépend ni de `step_writer` ni de `callbacks` → aucun cycle d'import.
"""
from __future__ import annotations

import logging
from typing import Any

from crewai import Agent, LLM, Task

from ..composio_session import get_composio_tools_for_toolkits
from ..config import settings
from ..llms import get_llm

logger = logging.getLogger(__name__)

# G3 fix : limite de preview pour les output_text persistés en DB. CrewAI
# peut produire des outputs longs (>50KB) qui gonflent inutilement
# `swarm_run_steps`. On garde un preview lisible côté UI.
# Consommée par les callbacks (callbacks.py importe cette constante).
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
        # Cycle détecté (P1.6) : les tasks restantes ont toujours in_degree > 0
        # après l'algorithme de Kahn — il existe au moins un cycle dans le graphe.
        # On lève une erreur explicite pour éviter une exécution silencieusement
        # incohérente (au lieu du fallback silencieux précédent).
        leftover = [tid for tid in by_id if tid not in sorted_ids]
        raise ValueError(
            f"Cycle détecté dans depends_on_task_id pour les tasks {leftover}. "
            "Corriger les dépendances circulaires dans le swarm avant de relancer."
        )

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
        # P1.2 — injection dans TOUTES les racines du DAG (nodes sans prédécesseur).
        # Un DAG multi-racines (tâches parallèles en entrée) doit recevoir le contexte
        # utilisateur dans CHACUNE d'elles, pas seulement la première construite.
        # Aucune déduplication nécessaire : chaque racine est un agent distinct qui
        # analyse les inputs sous son angle propre.
        dep_str = str(depends_on) if depends_on else ""
        is_root = not dep_str or dep_str not in {str(r.get("id") or "") for r in ordered_rows}
        if inputs_block and is_root:
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
