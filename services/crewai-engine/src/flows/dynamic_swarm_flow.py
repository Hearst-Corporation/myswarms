"""Flow CrewAI générique pour un swarm dynamique chargé depuis Supabase.

Pattern reprend `chief_of_staff_flow.py` mais paramétré par `swarm_id`.
- @start initialize : log + horodatage.
- @listen(initialize) run_crew : `create_dynamic_crew(swarm_id).kickoff(inputs)`.
- @listen(run_crew) finalize : update `swarm_runs` à `completed`.

Toute exception en cours d'exécution met le run à `failed` et propage l'erreur
au caller (le router est libre de la convertir en HTTP 500 ou de logger seulement).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from crewai import Flow
from crewai.flow.flow import listen, start
from pydantic import BaseModel, Field

from ..config import settings
from ..crews.dynamic_crew import flush_run_steps, run_swarm_tasks
from ..persistence import swarm_store
from ..tools.ask_human import HumanDecisionRequired

logger = logging.getLogger(__name__)


# ── Token extraction helpers (P1-2) ───────────────────────────────────────────


def _extract_and_store_token_usage(
    state: Any,
    crew: Any,
    result: Any,
) -> None:
    """Extrait de façon défensive les usage metrics du crew après kickoff.

    CrewAI expose (best-effort) :
      - crew.usage_metrics  → objet UsageMetrics avec prompt_tokens /
        completion_tokens / total_tokens
      - result.token_usage  → fallback si usage_metrics absent

    La shape n'est pas garantie selon la version CrewAI → getattr partout,
    pas d'assert. Les valeurs extraites sont stockées dans state._tokens_in /
    state._tokens_out pour que finalize() les persiste.

    NE PAS inventer de prix (total_cost_usd) — règle no-magic-number.
    """
    try:
        usage = getattr(crew, "usage_metrics", None)
        if usage is None and result is not None:
            usage = getattr(result, "token_usage", None)
        if usage is None:
            return

        prompt = getattr(usage, "prompt_tokens", None)
        completion = getattr(usage, "completion_tokens", None)

        # Fallback : certaines versions exposent total_tokens uniquement.
        if prompt is None and completion is None:
            total = getattr(usage, "total_tokens", None)
            if total is not None:
                # On ne peut pas séparer in/out — on met tout dans tokens_in.
                state.tokens_in = int(total)
                state.tokens_out = 0
            return

        if prompt is not None:
            state.tokens_in = int(prompt)
        if completion is not None:
            state.tokens_out = int(completion)
    except Exception as exc:  # noqa: BLE001
        logger.warning("_extract_and_store_token_usage failed: %s", exc)


def _persist_tokens_on_failure(state: Any, run_id: str, exc: Exception) -> None:
    """Persiste le run comme failed + token counts best-effort."""
    try:
        update_kwargs: dict = {
            "status": "failed",
            "error_text": str(exc),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        tokens_in = getattr(state, "tokens_in", None)
        tokens_out = getattr(state, "tokens_out", None)
        if tokens_in is not None:
            update_kwargs["total_tokens_in"] = tokens_in
        if tokens_out is not None:
            update_kwargs["total_tokens_out"] = tokens_out
        # TODO V2 : pricing Hypercli/Kimi non publié — pas de constante
        # prix inventée (règle no-magic-number). total_cost_usd reste 0.0.
        swarm_store.update_swarm_run(run_id, **update_kwargs)
    except Exception as inner_exc:  # noqa: BLE001
        logger.warning(
            "_persist_tokens_on_failure failed for run=%s: %s",
            run_id, inner_exc,
        )


class DynamicSwarmState(BaseModel):
    """State partagé entre les étapes du Flow.

    Tous les champs ont un default sain. CrewAI instancie le state via
    `state_type()` (sans arguments) AVANT d'appliquer les `inputs` du
    `kickoff()` — un champ required ferait crasher l'instanciation
    (`ValidationError`). La validation logique (swarm_id non vide) est
    déléguée à `initialize()` qui raise explicitement si l'invocation a
    oublié de passer `swarm_id`.
    """

    # Identifiants — defaults vides, validés runtime dans initialize().
    swarm_id: str = ""
    run_id: str = ""

    # Contexte d'invocation
    trigger: str = "on_demand"
    inputs: dict[str, Any] = Field(default_factory=dict)
    owner_id: str | None = None

    # HITL — index de la prochaine task à exécuter (resume sans rejouer) + flag
    # de pause (positionné par run_crew si un ask_human a mis le run en attente).
    checkpoint_index: int = 0
    paused: bool = False

    # Résultat
    result: str | None = None
    error: str | None = None

    # Métadonnées
    started_at: str = ""
    completed_at: str = ""

    # P1-2 token tracking — peuplés par run_crew après kickoff(), consommés
    # par finalize() pour persister sur swarm_runs. None = pas de données.
    tokens_in: int | None = None
    tokens_out: int | None = None


class DynamicSwarmFlow(Flow[DynamicSwarmState]):
    """Flow générique multi-swarm.

    Le state DOIT être pré-rempli (au minimum `swarm_id` + `run_id`) via le
    paramètre `inputs` de `kickoff()` — CrewAI hydrate le state depuis ces
    inputs avant d'appeler `@start initialize`. Si `swarm_id` est vide à
    `initialize()`, on raise explicitement.
    """

    @start()
    def initialize(self) -> str:
        # Validation logique : un kickoff() doit toujours fournir swarm_id.
        if not self.state.swarm_id:
            raise ValueError(
                "DynamicSwarmFlow.initialize: swarm_id missing — "
                "kickoff(inputs={'swarm_id': ..., 'run_id': ...}) is required"
            )
        self.state.started_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            "DynamicSwarmFlow starting — swarm_id=%s run_id=%s trigger=%s",
            self.state.swarm_id, self.state.run_id, self.state.trigger,
        )
        return self.state.swarm_id

    @listen(initialize)
    def run_crew(self, swarm_id: str) -> str:
        """Exécute les tasks du swarm UNE PAR UNE (HITL task-boundary).

        Pourquoi task-par-task et pas un `crew.kickoff()` monolithique ?
        - Un `crew.kickoff()` exécute toutes les tasks en interne, sans rendre la
          main : impossible de mettre le run en pause au milieu. La boucle
          task-par-task (`run_swarm_tasks`) crée une frontière exploitable entre
          deux tasks — un point de décision HITL.

        Pause HITL : si un agent appelle `ask_human`, l'outil persiste la
        décision, passe le run `paused_hitl`, et lève `HumanDecisionRequired`
        (BaseException — non interceptée par la machinerie CrewAI). Elle remonte
        ici : on flush les steps, on positionne `state.paused` et on RETOURNE
        proprement (pas d'échec). `finalize` verra `state.paused` et ne marquera
        PAS le run completed.

        Reprise : `state.checkpoint_index` (lu depuis `swarm_runs` côté router au
        resume) fait redémarrer la boucle à la bonne task ; les tasks antérieures
        ne sont pas rejouées (leurs outputs vivent dans `inputs._task_outputs`).

        P0-2 flush garanti : flush_run_steps(run_id) est appelé dans TOUS les
        chemins (succès, pause, except) AVANT update_swarm_run.
        """
        run_id = self.state.run_id or None
        try:
            outcome = run_swarm_tasks(
                swarm_id,
                run_id=run_id,
                owner_id=self.state.owner_id,
                inputs=self.state.inputs or {},
                start_index=self.state.checkpoint_index,
                ttl_minutes=settings.HITL_DECISION_TTL_MINUTES,
            )
            # P0-2 : drain le writer AVANT de toucher swarm_runs.
            flush_run_steps(run_id)

            # P1-2 — token tracking cumulé par task (défensif, peut être None).
            self.state.tokens_in = outcome.get("tokens_in")
            self.state.tokens_out = outcome.get("tokens_out")

            raw_result = outcome.get("result") or ""
            self.state.result = raw_result
            return raw_result
        except HumanDecisionRequired as dec:
            # Pause HITL : le run est déjà `paused_hitl` (posé par l'outil).
            # On ne marque RIEN failed/completed — on s'arrête proprement.
            logger.info(
                "DynamicSwarmFlow paused for HITL (swarm=%s, run=%s, decision=%s)",
                self.state.swarm_id, self.state.run_id, dec.decision_id,
            )
            flush_run_steps(run_id)
            self.state.paused = True
            return "__PAUSED_HITL__"
        except Exception as exc:
            self.state.error = str(exc)
            logger.error(
                "DynamicSwarmFlow run_swarm_tasks failed (swarm=%s, run=%s): %s",
                self.state.swarm_id, self.state.run_id, exc, exc_info=True,
            )
            # P0-2 : drain le writer avant de marquer failed — fail-soft.
            flush_run_steps(run_id)
            # Marque le run failed en DB tout de suite — finalize ne sera pas appelé.
            if run_id:
                _persist_tokens_on_failure(self.state, run_id, exc)
            raise

    @listen(run_crew)
    def finalize(self, crew_output: str) -> str:
        """Persistance finale + horodatage + token counts (P1-2).

        No-op si le run est en pause HITL (`state.paused`) : le statut
        `paused_hitl` a déjà été posé par l'outil `ask_human`, et le run reprendra
        via l'endpoint resume — on ne doit surtout pas le marquer completed.
        """
        if getattr(self.state, "paused", False):
            logger.info(
                "DynamicSwarmFlow finalize skipped — run paused_hitl (swarm=%s, run=%s)",
                self.state.swarm_id, self.state.run_id,
            )
            return crew_output
        self.state.completed_at = datetime.now(timezone.utc).isoformat()
        if self.state.run_id:
            update_kwargs: dict = {
                "status": "completed",
                "result_text": crew_output,
                "finished_at": self.state.completed_at,
            }
            # P1-2 : persiste les tokens si extraits par run_crew.
            tokens_in = self.state.tokens_in
            tokens_out = self.state.tokens_out
            if tokens_in is not None:
                update_kwargs["total_tokens_in"] = tokens_in
            if tokens_out is not None:
                update_kwargs["total_tokens_out"] = tokens_out
            # TODO V2 : pricing Hypercli/Kimi non publié — pas de constante
            # prix inventée (règle no-magic-number). total_cost_usd reste 0.0.
            swarm_store.update_swarm_run(self.state.run_id, **update_kwargs)
        logger.info(
            "DynamicSwarmFlow completed — swarm_id=%s run_id=%s",
            self.state.swarm_id, self.state.run_id,
        )
        return crew_output
