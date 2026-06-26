"""Sous-routeur Architect Agent — génération (preview) de spec de swarm.

Path absolu inchangé (`/v1/swarms/architect/generate`). Monté sans prefix →
URL strictement identique.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...config import settings
from ...security.internal_auth import require_internal_identity, InternalIdentity
from ._shared import ArchitectGenerateRequest, _scoped

logger = logging.getLogger("src.routes.swarms")

router_architect = APIRouter()


@router_architect.post("/v1/swarms/architect/generate")
async def architect_generate_endpoint(
    body: ArchitectGenerateRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> dict[str, Any]:
    """Génère (preview) une spec de swarm depuis une description NL.

    Composition récursive : un agent LLM (Opus) conçoit une équipe d'agents.

    NE PERSISTE RIEN — renvoie une spec de shape `SwarmCreate` que le front
    affiche en preview puis envoie (après validation utilisateur) au
    `POST /v1/swarms` existant pour création réelle.

    `owner_id` : priorité body > query (même règle que `create_swarm`). Sert
    à scoper le catalogue de tools référençables par l'architecte.

    Erreurs :
    - 422 : prompt invalide (Pydantic — auto).
    - 502 : l'architecte n'a pas produit de spec valide après retries
      (`ArchitectGenerationError`) ou erreur inattendue.
    - 504 : génération dépassant `settings.ARCHITECT_TIMEOUT_SECONDS`.
    """
    # Import local : garde `architect` hors du chemin d'import du router
    # (le module ne fait aucun side-effect, mais on évite de charger les
    # deps LLM tant que l'endpoint n'est pas appelé).
    from ...agents.architect import ArchitectGenerationError, generate_swarm_spec

    # Owner dérivé du JWT vérifié — le champ body.owner_id (legacy) est ignoré
    # comme source de vérité (anti-spoofing).
    effective_owner_id = identity.owner_id
    available_tools = _scoped(identity).list_tools()

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                generate_swarm_spec,
                body.prompt,
                available_tools,
                effective_owner_id,
            ),
            timeout=settings.ARCHITECT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "Architect generation timed out after %ds",
            settings.ARCHITECT_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=504,
            detail=(
                f"Architect generation exceeded "
                f"{settings.ARCHITECT_TIMEOUT_SECONDS}s timeout"
            ),
        ) from exc
    except ArchitectGenerationError as exc:
        logger.error("Architect generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Architect generation unexpected error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"Architect generation error: {exc}",
        ) from exc

    return result
