"""Résolution owner-scopée des comptes externes (R5 — Composio / Telegram).

Risque fermé : le Daily Chief of Staff utilisait une entity Composio partagée
(fallback `settings.COMPOSIO_USER_ID = "adrien"`) et un `TELEGRAM_CHAT_ID`
global. Un run déclenché par un autre tenant pouvait donc lire/agir sur le
Gmail/Slack/Telegram d'Adrien.

Contrat :
- L'`owner_id` provient d'une `InternalIdentity` vérifiée (JWT R3), propagée
  jusqu'à la construction des tools.
- L'entity Composio / le chat Telegram sont résolus PAR owner via un mapping
  d'environnement explicite (JSON `owner_id -> valeur`).
- Owner inconnu / absent ⇒ **None** (fail-closed) : aucun tool externe, JAMAIS
  les credentials d'Adrien par défaut.
- Un fallback legacy (l'ancienne valeur globale) n'est autorisé qu'en dev/test,
  gated par env explicite, et **jamais en production**.

Env (valeurs jamais loggées) :
  COMPOSIO_ENTITY_BY_OWNER_JSON='{"<owner_uuid>":"<entity_id>"}'
  TELEGRAM_CHAT_BY_OWNER_JSON='{"<owner_uuid>":"<chat_id>"}'
  ALLOW_LEGACY_EXTERNAL_ACCOUNT_FALLBACK_FOR_TESTS=true   # dev/test only, OFF prod
"""
from __future__ import annotations

import json
import logging
import os

from ..config import settings

logger = logging.getLogger(__name__)


class ExternalAccountNotConfigured(RuntimeError):
    """Aucun compte externe owner-scopé n'est configuré (fail-closed)."""


def _is_production() -> bool:
    return (
        os.environ.get("ENVIRONMENT") == "production"
        or os.environ.get("NODE_ENV") == "production"
        or os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    )


def _legacy_fallback_allowed() -> bool:
    """Fallback global legacy : dev/test uniquement, OFF par défaut, jamais en prod."""
    return (
        os.environ.get("ALLOW_LEGACY_EXTERNAL_ACCOUNT_FALLBACK_FOR_TESTS") == "true"
        and not _is_production()
    )


def _mapping(env_var: str) -> dict[str, str]:
    """Parse un mapping JSON owner_id -> valeur (safe : {} si absent/malformé)."""
    raw = os.environ.get(env_var, "") or ""
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("[EXT_SCOPE] %s is not valid JSON — treating as empty (fail-closed)", env_var)
        return {}
    if not isinstance(data, dict):
        logger.warning("[EXT_SCOPE] %s is not a JSON object — ignored", env_var)
        return {}
    # On ne garde que des paires str->str ; aucune valeur n'est loggée.
    return {str(k): str(v) for k, v in data.items() if v}


def resolve_composio_entity(owner_id: str | None) -> str | None:
    """Entity Composio pour `owner_id`, ou None (fail-closed)."""
    if not owner_id:
        return None
    entity = _mapping("COMPOSIO_ENTITY_BY_OWNER_JSON").get(owner_id)
    if entity:
        return entity
    if _legacy_fallback_allowed():
        return settings.COMPOSIO_USER_ID or None
    return None


def resolve_telegram_chat(owner_id: str | None) -> str | None:
    """Chat Telegram pour `owner_id`, ou None (fail-closed → sender désactivé)."""
    if not owner_id:
        return None
    chat = _mapping("TELEGRAM_CHAT_BY_OWNER_JSON").get(owner_id)
    if chat:
        return chat
    if _legacy_fallback_allowed():
        return settings.TELEGRAM_CHAT_ID or None
    return None
