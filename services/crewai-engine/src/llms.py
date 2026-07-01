import os
from typing import Literal

from crewai import LLM

from .config import settings

ModelTier = Literal["fast", "balanced", "smart"]


def _provider() -> str:
    """Provider de routage LLM (env `CREWAI_LLM_PROVIDER`, défaut `openai`).

    - `openai`   (défaut) : modèles OpenAI officiels (gpt-4o, gpt-5.1…) via
      l'API OpenAI (`OPENAI_API_KEY`, base_url par défaut de litellm).
    - `hypercli` : Kimi/GLM via l'endpoint OpenAI-compatible Hypercli
      (`HYPERCLI_BASE_URL` + `HYPERCLI_API_KEY`) — legacy, gardé pour rollback.
    """
    return os.environ.get("CREWAI_LLM_PROVIDER", "openai").strip().lower()


def get_llm(tier: ModelTier = "balanced") -> LLM:
    """Factory LLM — route selon `CREWAI_LLM_PROVIDER`.

    Les 3 tiers (fast / balanced / smart) mappent sur
    `CREWAI_DEFAULT_{FAST,BALANCED,SMART}_MODEL`. Le provider décide de l'endpoint :

    - `openai` (défaut) : API OpenAI officielle — aucun `base_url` custom, clé
      `OPENAI_API_KEY`. Modèles `gpt-4o` (conversationnel, tiers fast/balanced)
      et `gpt-5.1` (agentique — orchestration/tool-use, tier smart).
    - `hypercli` (legacy/rollback) : `base_url`/`api_key` Hypercli — modèles
      `openai/kimi-k2.6`, `openai/glm-5`, etc. (endpoint OpenAI-compatible).

    Aucun secret hardcodé — tout vient de `settings`. `temperature` non passée
    (évite un éventuel rejet 400 côté provider).
    """
    mapping: dict[ModelTier, str] = {
        "fast": settings.CREWAI_DEFAULT_FAST_MODEL,
        "balanced": settings.CREWAI_DEFAULT_BALANCED_MODEL,
        "smart": settings.CREWAI_DEFAULT_SMART_MODEL,
    }
    model = mapping[tier]

    if _provider() == "hypercli":
        # Legacy/rollback : Hypercli (Kimi/GLM) via endpoint OpenAI-compatible.
        return LLM(
            model=model,
            base_url=settings.HYPERCLI_BASE_URL,
            api_key=settings.HYPERCLI_API_KEY,
            timeout=settings.LLM_REQUEST_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )

    # Défaut : OpenAI officiel — pas de base_url custom, clé OpenAI dédiée.
    return LLM(
        model=model,
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT_SECONDS,
        max_retries=settings.LLM_MAX_RETRIES,
    )
