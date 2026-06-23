"""Auth interne BFF → Engine : identité owner/tenant signée (JWT HS256).

Contrat (cf src/lib/crewai/internal-auth.ts côté Next.js) :
- header   : `X-Internal-Auth: Bearer <jwt>`
- alg      : HS256
- issuer   : "myswarms-bff"
- audience : "crewai-engine"
- claims   : owner_id (+ sub), tenant_id?, iat, exp (TTL court)
- secret   : env `CREWAI_ENGINE_JWT_SECRET` (server-side, jamais loggé)

Règle de sécurité : le JWT est la SEULE source de vérité de l'owner pour les
endpoints owner-scopés. Le query-param `owner_id` n'est JAMAIS pris en compte
quand un JWT est présent. Un fallback query-param existe uniquement pour les
tests/dev, gated par env, désactivé par défaut et fail-closed en production.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Header, HTTPException, Request

_ISSUER = "myswarms-bff"
_AUDIENCE = "crewai-engine"
_BEARER_PREFIX = "Bearer "


@dataclass(frozen=True)
class InternalIdentity:
    """Identité owner/tenant extraite du JWT interne BFF → Engine."""

    owner_id: str
    tenant_id: str | None = None


def _get_secret() -> str:
    """Secret HMAC du JWT interne (vide si non configuré → refus)."""
    return os.environ.get("CREWAI_ENGINE_JWT_SECRET", "")


def _is_production() -> bool:
    return (
        os.environ.get("ENVIRONMENT") == "production"
        or os.environ.get("NODE_ENV") == "production"
    )


def _legacy_owner_query_allowed() -> bool:
    """Fallback query-param owner_id : dev/test uniquement, OFF par défaut.

    Jamais actif en production (fail-closed), même si la variable est posée.
    """
    return (
        os.environ.get("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS") == "true"
        and not _is_production()
    )


def _validate_owner_uuid(owner_id: str | None) -> str:
    """Valide le format UUID de l'owner — 401 générique sinon (pas de leak)."""
    try:
        UUID(str(owner_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid owner identity")
    return str(owner_id)


def verify_internal_token(raw_header: str | None) -> InternalIdentity:
    """Vérifie le JWT du header `X-Internal-Auth` et renvoie l'identité.

    401 si : header absent/malformé, secret indisponible, signature invalide,
    expiré, mauvais issuer/audience, owner manquant ou non-UUID. Aucun token,
    secret ou détail interne n'est inclus dans le message d'erreur.
    """
    if not raw_header or not raw_header.startswith(_BEARER_PREFIX):
        raise HTTPException(status_code=401, detail="Missing or malformed internal auth token")

    token = raw_header[len(_BEARER_PREFIX):].strip()
    secret = _get_secret()
    if not secret:
        # Fail-closed : sans secret, aucun token ne peut être prouvé → refus.
        raise HTTPException(status_code=401, detail="Internal auth unavailable")

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=_AUDIENCE,
            issuer=_ISSUER,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Internal token expired")
    except jwt.InvalidTokenError:
        # Couvre signature/issuer/audience/format invalides — message générique.
        raise HTTPException(status_code=401, detail="Invalid internal token")

    owner_id = payload.get("owner_id") or payload.get("sub")
    if not owner_id:
        raise HTTPException(status_code=401, detail="Internal token missing owner identity")

    owner_id = _validate_owner_uuid(str(owner_id))
    tenant_id = payload.get("tenant_id")
    return InternalIdentity(
        owner_id=owner_id,
        tenant_id=str(tenant_id) if tenant_id else None,
    )


def require_internal_identity(
    request: Request,
    x_internal_auth: str | None = Header(default=None, alias="X-Internal-Auth"),
) -> InternalIdentity:
    """Dependency FastAPI : identité interne vérifiée pour les routes owner-scopées.

    Précédence stricte : si un JWT est présent, il est AUTORITAIRE — le
    query-param `owner_id` est ignoré (anti-spoofing). En l'absence de JWT, un
    fallback query-param dev/test existe (gated, OFF par défaut, jamais en prod).
    Sinon → 401.
    """
    if x_internal_auth:
        # JWT présent → seule source de vérité. Le query owner_id est ignoré.
        return verify_internal_token(x_internal_auth)

    if _legacy_owner_query_allowed():
        owner_id = request.query_params.get("owner_id")
        if owner_id:
            return InternalIdentity(owner_id=_validate_owner_uuid(owner_id))

    raise HTTPException(status_code=401, detail="Missing internal auth token")
