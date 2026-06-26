"""Endpoint synchrone /v1/listings — scrape d'annonces immobilières (HORS swarm).

Pourquoi hors mécanisme swarm : le consommateur (Real Estate Agent) attend une
réponse dans un deadline court (~secondes). Les swarms async (flows LLM) ne
peuvent pas tenir ce SLA. Cet endpoint appelle directement Browserbase + portail.

Contrat :
  - POST /v1/listings (bearer existant via verify_bearer).
  - Body : { ville, codePostal, typeBien, surface, nbPieces } (tous nullable).
  - Réponse 200 : { listings: [ ...format apify-brut... ] }.
  - Fail-soft TOTAL : jamais d'exception non gérée → { listings: [] }.
  - Timeout global interne ~18s (asyncio.wait_for).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..providers.listings_browserbase import ListingQuery, scrape_listings
from ..security.internal_auth import InternalIdentity, require_internal_identity

logger = logging.getLogger(__name__)

router = APIRouter()

# Budget global d'exécution du scrape (création session Browserbase + nav +
# fetch API + parsing). Au-delà → on renvoie [] (fail-soft) pour tenir le SLA
# du consommateur. ~18s : marge confortable pour 1 session Browserbase + 2 fetch.
_SCRAPE_TIMEOUT_SECONDS = 18.0


class ListingsRequest(BaseModel):
    """Body de POST /v1/listings — alias camelCase imposés par le consommateur."""

    ville: str | None = None
    codePostal: str | None = None
    typeBien: Literal["appartement", "maison"] | None = None
    surface: float | None = None
    nbPieces: float | None = None


class ListingItem(BaseModel):
    id: str
    url: str
    title: str
    price_eur: float
    surface_m2: float
    price_per_sqm: float | None = None
    rooms: float | None = None
    published_at: str | None = None
    status: str
    sale_type: str


class ListingsResponse(BaseModel):
    listings: list[ListingItem]


@router.post("/v1/listings", response_model=ListingsResponse)
async def post_listings(
    body: ListingsRequest,
    identity: InternalIdentity = Depends(require_internal_identity),
) -> ListingsResponse:
    """Scrape synchrone d'annonces de vente. Fail-soft : renvoie toujours 200.

    Owner-scopé (R-listings) : l'identité owner est dérivée du JWT interne vérifié
    (X-Internal-Auth), comme toutes les routes swarm/chief. Sans JWT valide → 401.
    Le bearer partagé seul (machine-to-machine) ne suffit plus : un scrape
    Browserbase coûteux ne doit être déclenchable que par un owner authentifié,
    et chaque appel est tracé par owner (anti-abus quota + audit).
    """
    logger.info("POST /v1/listings owner_id=%s", identity.owner_id)
    query = ListingQuery(
        ville=body.ville,
        code_postal=body.codePostal,
        type_bien=body.typeBien,
        surface=body.surface,
        nb_pieces=body.nbPieces,
    )

    try:
        raw = await asyncio.wait_for(scrape_listings(query), timeout=_SCRAPE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning(
            "POST /v1/listings: timeout %.0fs dépassé (ville=%r cp=%r) → [].",
            _SCRAPE_TIMEOUT_SECONDS,
            body.ville,
            body.codePostal,
        )
        return ListingsResponse(listings=[])
    except Exception as exc:  # noqa: BLE001 — fail-soft total, jamais d'exception remontée
        logger.warning("POST /v1/listings: erreur inattendue (fail-soft → []): %s", exc, exc_info=True)
        return ListingsResponse(listings=[])

    listings: list[ListingItem] = []
    for item in raw:
        try:
            listings.append(ListingItem(**item))
        except Exception as exc:  # noqa: BLE001 — un item malformé ne casse pas la réponse
            logger.warning("POST /v1/listings: item ignoré (validation): %s", exc)
    return ListingsResponse(listings=listings)
