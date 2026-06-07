"""ask_human — outil Human-in-the-loop (« moment de décision »).

Permet à un agent de S'ARRÊTER pour demander un CHOIX DE DIRECTION à l'humain
(ton, option A/B, cible…) puis de reprendre avec la réponse injectée. Distinct
d'une confirmation destructive (sécurité) : ici c'est de la direction (constructif).

Mécanisme (cf. dynamic_swarm_flow.run_crew, exécution task-par-task) :
- À la 1ʳᵉ rencontre, l'outil persiste la décision en attente + passe le run en
  `paused_hitl`, puis lève `HumanDecisionRequired` qui ABORTE proprement le
  `crew.kickoff()` de la task courante.
- Au resume, la réponse choisie est mémoïsée dans `state.inputs._hitl_answers`
  (clé = `ordinal` = index de la task). L'outil la relit et RENVOIE la `value`
  → l'agent dépasse le point de décision et continue.

Pourquoi `HumanDecisionRequired(BaseException)` et pas `Exception` ?
CrewAI emballe chaque appel d'outil dans `except Exception` (ToolUsage._use,
crew_agent_executor) : une `Exception` serait avalée, retriée 3× puis convertie
en observation « Moving on then » — le run ne s'arrêterait jamais. Un
`BaseException` n'est intercepté par AUCUN `except Exception` du chemin agent
(vérifié : aucun bare `except:` ni `except BaseException`), donc il traverse
`crew.kickoff()` jusqu'au Flow qui le catch nominalement.
"""
from __future__ import annotations

import logging
from typing import Any

from crewai.tools import BaseTool
from pydantic import Field

from ..persistence import swarm_store

logger = logging.getLogger(__name__)


class HumanDecisionRequired(BaseException):
    """Abort propre du crew courant à un point de décision HITL.

    Hérite de `BaseException` (PAS `Exception`) à dessein — cf. docstring module.
    Porte l'`ordinal` (index de task = decision_id déterministe) et le
    `decision_id` opaque déjà persisté, pour que le Flow sache qu'il s'agit
    d'une pause et non d'un échec.
    """

    def __init__(self, ordinal: int, decision_id: str) -> None:
        self.ordinal = ordinal
        self.decision_id = decision_id
        super().__init__(
            f"HITL decision required (ordinal={ordinal}, decision_id={decision_id})"
        )


def _normalize_options(options: Any) -> list[dict[str, Any]]:
    """Valide/normalise la liste d'options en `[{value, label, sub?}]`.

    Tolérant aux shapes LLM imparfaites : ignore les entrées sans `value`,
    rabat `label` sur `value` si absent, ne garde `sub` que s'il est non vide.
    Garantit au moins une option exploitable côté UI (sinon ValueError —
    une décision sans choix n'a pas de sens).
    """
    normalized: list[dict[str, Any]] = []
    for opt in options or []:
        if not isinstance(opt, dict):
            continue
        value = opt.get("value")
        if value is None or str(value).strip() == "":
            continue
        entry: dict[str, Any] = {
            "value": str(value),
            "label": str(opt.get("label") or value),
        }
        sub = opt.get("sub")
        if sub:
            entry["sub"] = str(sub)
        normalized.append(entry)
    if not normalized:
        raise ValueError("ask_human: au moins une option {value,label} est requise")
    return normalized


class AskHumanTool(BaseTool):
    """Outil run-scopé : une instance par task (porte son `ordinal`).

    Le contexte (`run_id`, `ordinal`, `hitl_answers`) est injecté à la
    construction dans `create_dynamic_crew` / la boucle par-task du Flow.
    """

    name: str = "ask_human"
    description: str = (
        "Demande à l'humain de trancher un CHOIX DE DIRECTION (ton, option A/B, "
        "cible…) AVANT de continuer. À utiliser uniquement pour une décision "
        "constructive qui oriente le travail — jamais pour une simple confirmation. "
        "Arguments : question (str) ; options (liste de {value, label, sub?}) ; "
        "hint (str, optionnel). Le run se met en pause ; au retour, l'outil "
        "renvoie la `value` choisie par l'humain pour que tu continues."
    )

    # Contexte run-scopé (champs pydantic — BaseTool est un BaseModel).
    run_id: str = ""
    ordinal: int = 0
    hitl_answers: dict[str, Any] = Field(default_factory=dict)
    ttl_minutes: int | None = None

    def _run(
        self,
        question: str,
        options: list[dict[str, Any]] | None = None,
        hint: str = "",
    ) -> str:
        # Resume : décision déjà tranchée pour cet ordinal → renvoie la value
        # mémoïsée, l'agent dépasse le point de décision sans re-pause.
        memo = self.hitl_answers.get(str(self.ordinal))
        if memo is not None:
            logger.info(
                "ask_human(run=%s, ordinal=%s) → réponse mémoïsée: %s",
                self.run_id, self.ordinal, memo,
            )
            return str(memo)

        # Première rencontre : persiste la décision + paused_hitl, puis abort.
        payload: dict[str, Any] = {
            "question": str(question),
            "options": _normalize_options(options),
        }
        if hint:
            payload["hint"] = str(hint)

        decision_id = swarm_store.pause_run_with_decision(
            run_id=self.run_id,
            ordinal=self.ordinal,
            payload=payload,
            ttl_minutes=self.ttl_minutes,
        )
        logger.info(
            "ask_human(run=%s, ordinal=%s) → PAUSE (decision_id=%s)",
            self.run_id, self.ordinal, decision_id,
        )
        raise HumanDecisionRequired(self.ordinal, decision_id)
