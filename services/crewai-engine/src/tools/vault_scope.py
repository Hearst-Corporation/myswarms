"""Résolution owner-scopée de l'accès au Vault Cortex (R6 — VaultSearch).

Risque fermé : `VaultSearchTool` interroge un Vault Cortex GLOBAL (les ~39 000
notes privées d'Adrien) sans aucun scoping. L'Architecte de swarms
(`generate_swarm_spec`) lance un pré-fetch Cortex avec le prompt de
l'utilisateur AVANT toute génération. Tout owner authentifié (JWT R3) pouvait
donc faire chercher son prompt dans le Vault privé d'Adrien et récupérer des
extraits de notes (décisions, factures, échanges clients) injectés dans la spec
retournée.

Contrat (identique à R5 — `external_account_scope`) :
- L'`owner_id` provient d'une `InternalIdentity` vérifiée (JWT R3), propagée
  jusqu'à la construction du tool.
- Le namespace Vault autorisé est résolu PAR owner via un mapping
  d'environnement explicite (JSON `owner_id -> namespace`).
- Owner inconnu / absent ⇒ **None** (fail-closed) : aucune requête Cortex,
  JAMAIS le Vault d'Adrien par défaut.
- Un fallback legacy (namespace global par défaut) n'est autorisé qu'en
  dev/test, gated par env explicite, et **jamais en production**.

Le namespace résolu est forcé côté serveur : ni le LLM ni le client ne peuvent
le surcharger (le payload Cortex est construit à partir de cette valeur seule).

Note d'enforcement : le service Cortex expose aujourd'hui un Vault unique
(celui d'Adrien). La frontière de sécurité réelle est donc la GATE D'ACCÈS —
seuls les owners présents dans le mapping atteignent Cortex ; tout autre owner
est fail-closed (zéro requête). Le `namespace` est transmis dans le payload pour
compat future (partition par tenant côté Cortex), sans présumer que Cortex le
filtre déjà.

Env (valeurs jamais loggées) :
  VAULT_NAMESPACE_BY_OWNER_JSON='{"<owner_uuid>":"<namespace>"}'
  VAULT_DEFAULT_NAMESPACE=<namespace>            # dev/test legacy fallback only
  ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS=true   # dev/test only, OFF prod
"""
from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

_MAPPING_ENV = "VAULT_NAMESPACE_BY_OWNER_JSON"
_LEGACY_DEFAULT_ENV = "VAULT_DEFAULT_NAMESPACE"
_LEGACY_FLAG_ENV = "ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS"


class VaultAccessDenied(RuntimeError):
    """Aucun namespace Vault owner-scopé n'est configuré (fail-closed)."""


def _is_production() -> bool:
    return (
        os.environ.get("ENVIRONMENT") == "production"
        or os.environ.get("NODE_ENV") == "production"
        or os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    )


def _legacy_fallback_allowed() -> bool:
    """Fallback namespace global legacy : dev/test uniquement, OFF par défaut, jamais en prod."""
    return os.environ.get(_LEGACY_FLAG_ENV) == "true" and not _is_production()


def _mapping(env_var: str) -> dict[str, str]:
    """Parse un mapping JSON owner_id -> namespace (safe : {} si absent/malformé)."""
    raw = os.environ.get(env_var, "") or ""
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("[VAULT_SCOPE] %s is not valid JSON — treating as empty (fail-closed)", env_var)
        return {}
    if not isinstance(data, dict):
        logger.warning("[VAULT_SCOPE] %s is not a JSON object — ignored", env_var)
        return {}
    # On ne garde que des paires str->str ; aucune valeur n'est loggée.
    return {str(k): str(v) for k, v in data.items() if v}


def resolve_vault_namespace(owner_id: str | None) -> str | None:
    """Namespace Vault autorisé pour `owner_id`, ou None (fail-closed).

    - owner_id absent/None ⇒ None (jamais de Vault par défaut).
    - owner_id mappé ⇒ son namespace.
    - owner_id non mappé ⇒ None, SAUF dev/test avec legacy flag explicite et
      `VAULT_DEFAULT_NAMESPACE` posé (jamais en production).
    """
    if not owner_id:
        return None
    namespace = _mapping(_MAPPING_ENV).get(owner_id)
    if namespace:
        return namespace
    if _legacy_fallback_allowed():
        # Valeur explicite seulement — aucun namespace hardcodé.
        return os.environ.get(_LEGACY_DEFAULT_ENV) or None
    return None
