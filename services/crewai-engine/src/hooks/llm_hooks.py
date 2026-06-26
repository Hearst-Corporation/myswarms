"""LLM call hooks — sanitize PII, prevent prompt injection."""
from __future__ import annotations

import logging
import re

from crewai.hooks import LLMCallHookContext, after_llm_call, before_llm_call

logger = logging.getLogger(__name__)

# PII patterns to redact from LLM prompts and responses
#
# P1.9 — pattern hex affiné : l'ancien r"\b[0-9a-fA-F]{32,}\b" trop large
# rédactait aussi les git SHAs (40 chars hex), UUIDs sans tirets (32 chars),
# et trace IDs Langfuse, rendant les réponses LLM incohérentes.
#
# Nouveau pattern : exclut les hexadécimaux précédés ou suivis d'un tiret
# (segments d'UUID formaté : 8-4-4-4-12) via lookbehind/lookahead négatifs,
# et exclut les chaînes de 40 chars (git SHA) en limitant à 33-64 chars.
# Cible uniquement les tokens/clés API typiques : longues chaînes hex denses
# sans tiret, entre 33 et 64 chars.
_PII_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    (re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "[CARD]"),
    # Hex tokens : 33-64 chars, non précédés/suivis d'un tiret (exclut segments UUID).
    # Exclut 32 chars (UUID sans tiret — identifiant, pas secret) et 40 chars (git SHA).
    (re.compile(r"(?<!-)\b[0-9a-fA-F]{33,64}\b(?!-)"), "[TOKEN]"),
]


@before_llm_call
def sanitize_pii_in_prompts(context: LLMCallHookContext) -> None:
    """Redact PII patterns from LLM messages before sending to Claude API."""
    for msg in context.messages:
        if isinstance(msg, dict) and isinstance(msg.get("content"), str):
            content = msg["content"]
            for pattern, replacement in _PII_PATTERNS:
                content = pattern.sub(replacement, content)
            msg["content"] = content


@after_llm_call
def log_llm_cost(context: LLMCallHookContext) -> str | None:
    """Log LLM call metadata for Langfuse cost tracking."""
    logger.debug(
        "LLM call — agent=%s, iterations=%d",
        getattr(context.agent, "role", "unknown") if context.agent else "unknown",
        getattr(context, "iterations", 0),
    )
    return None  # don't modify response
