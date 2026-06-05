"""Scraper d'annonces immobilières via Browserbase — endpoint /v1/listings (HORS swarm).

Architecture :
  - Browserbase crée une session Chrome headless distante (CDP).
  - Playwright se connecte via `connect_over_cdp(session.connectUrl)`.
  - On ne scrappe PAS le DOM (fragile, SPA) : on appelle directement l'API JSON
    publique du portail depuis le contexte browser (mêmes cookies/UA → pas de
    blocage anti-bot supplémentaire), puis on parse le JSON.

Cibles, par ordre de priorité :
  1. LeBonCoin  — bloqué par DataDome sans proxy résidentiel (403 + captcha).
  2. SeLoger    — bloqué par DataDome (403 + captcha).
  3. PAP        — bloqué par Cloudflare (403 "Just a moment").
  4. Bienici    — PASSE (HTTP 200, API JSON `realEstateAds.json` exploitable).

Constat (test réel 2026-06-05, plan Browserbase free, IP datacenter AWS) :
  LeBonCoin / SeLoger / PAP renvoient tous 403 (anti-bot). Bienici est la seule
  source qui répond 200 avec des annonces de vente réelles. Le plan free
  Browserbase n'inclut PAS les proxies résidentiels (402 Payment Required), donc
  on ne peut pas contourner DataDome. La stratégie de prod par défaut est donc
  Bienici ; LeBonCoin/SeLoger restent tentés en best-effort et échouent silencieusement.

Fail-soft TOTAL : aucune exception ne remonte — toute erreur => [].
AUCUN résultat n'est fabriqué : si tout est bloqué, on renvoie [].
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal
from urllib.parse import quote

from ..config import settings

logger = logging.getLogger(__name__)

# Cap dur sur le nombre de résultats renvoyés au consommateur.
MAX_RESULTS = 12

# VENTES uniquement : un bien < ce seuil (en €) est presque certainement une
# location (loyer mensuel) et non un prix de vente → exclu.
MIN_SALE_PRICE_EUR = 30000

# Marqueurs textuels de location dans sale_type → exclus.
_RENT_MARKERS = ("location", "rent", "loue", "louer", "rental")

# Browserbase impose un pool de tailles de page raisonnable pour l'API portail.
_BIENICI_PAGE_SIZE = 24

# Mapping typeBien (contrat consommateur) → propertyType Bienici.
_TYPE_MAP: dict[str, list[str]] = {
    "appartement": ["flat"],
    "maison": ["house"],
}


class ListingQuery:
    """Requête de recherche normalisée (issue du body /v1/listings)."""

    def __init__(
        self,
        ville: str | None = None,
        code_postal: str | None = None,
        type_bien: Literal["appartement", "maison"] | None = None,
        surface: float | None = None,
        nb_pieces: float | None = None,
    ) -> None:
        self.ville = (ville or "").strip()
        self.code_postal = (code_postal or "").strip()
        self.type_bien = type_bien
        self.surface = surface
        self.nb_pieces = nb_pieces

    def search_term(self) -> str:
        """Terme texte pour le géocodeur (ex: 'Lyon 69003')."""
        parts = [p for p in (self.ville, self.code_postal) if p]
        return " ".join(parts).strip()


# ---------------------------------------------------------------------------
# Helpers de mapping vers le format apify-brut imposé par le consommateur.
# ---------------------------------------------------------------------------
def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_rent(sale_type: str) -> bool:
    s = (sale_type or "").lower()
    return any(marker in s for marker in _RENT_MARKERS)


def _map_bienici_ad(ad: dict[str, Any]) -> dict[str, Any] | None:
    """Mappe une annonce Bienici brute vers le format apify-brut.

    Renvoie None si l'annonce n'est pas une vente exploitable.
    """
    sale_type = str(ad.get("adTypeFR") or ad.get("adType") or ad.get("transactionType") or "")
    if _is_rent(sale_type):
        return None

    price = _to_float(ad.get("price"))
    if price is None or price < MIN_SALE_PRICE_EUR:
        return None

    surface = _to_float(ad.get("surfaceArea"))
    rooms = _to_float(ad.get("roomsQuantity"))

    pps = _to_float(ad.get("pricePerSquareMeter"))
    if pps is None and surface and surface > 0:
        pps = round(price / surface, 2)
    elif pps is not None:
        pps = round(pps, 2)

    ad_id = str(ad.get("id") or "").strip()
    if not ad_id:
        return None

    url = f"https://www.bienici.com/annonce/{ad_id}"

    published_at = ad.get("modificationDate") or ad.get("publicationDate")
    if isinstance(published_at, str):
        # 1970 = époque (date manquante côté portail) → on neutralise.
        if published_at.startswith("1970"):
            published_at = None
    else:
        published_at = None

    title = str(ad.get("title") or "").strip() or "Annonce immobilière"

    status_obj = ad.get("status") or {}
    on_market = bool(status_obj.get("onTheMarket", True)) if isinstance(status_obj, dict) else True
    status = "active" if on_market else "inactive"

    return {
        "id": ad_id,
        "url": url,
        "title": title,
        "price_eur": price,
        "surface_m2": surface if surface is not None else 0.0,
        "price_per_sqm": pps,
        "rooms": rooms,
        "published_at": published_at,
        "status": status,
        "sale_type": sale_type or "buy",
    }


# ---------------------------------------------------------------------------
# Browserbase session lifecycle.
# ---------------------------------------------------------------------------
async def _new_browserbase_page(playwright: Any) -> tuple[Any, Any]:
    """Crée une session Browserbase + connecte Playwright. Retourne (browser, page)."""
    from browserbase import Browserbase  # import local : ne casse pas le boot si SDK absent

    bb = Browserbase(api_key=settings.BROWSERBASE_API_KEY)
    # NOTE : proxies=True nécessite un plan payant (402 Payment Required en free).
    # On crée donc une session standard (IP datacenter). DataDome bloque LeBonCoin/
    # SeLoger dans ce mode ; Bienici passe.
    session = bb.sessions.create(project_id=settings.BROWSERBASE_PROJECT_ID)
    browser = await playwright.chromium.connect_over_cdp(session.connect_url)
    context = browser.contexts[0] if browser.contexts else await browser.new_context()
    page = context.pages[0] if context.pages else await context.new_page()
    return browser, page


async def _bienici_zone_ids(page: Any, term: str, code_postal: str | None = None) -> list[str]:
    """Résout un terme ('Lyon 69003') en zoneIds Bienici via suggest.json.

    Si code_postal est fourni, valide que le premier résultat Bienici couvre bien
    ce code postal — évite les faux matches (ex: 'Ploufquintec 99999' → 'Les Milles 13290').
    """
    if not term:
        return []
    try:
        url = "https://res.bienici.com/suggest.json?q=" + quote(term)
        raw = await page.evaluate(
            """async (u) => {
                const r = await fetch(u, {headers: {'accept': 'application/json'}});
                if (!r.ok) return null;
                return await r.text();
            }""",
            url,
        )
        if not raw:
            return []
        suggestions = json.loads(raw)
        if not isinstance(suggestions, list) or not suggestions:
            return []
        # Prendre le 1er résultat, mais valider que ses postalCodes contiennent
        # le code postal demandé (si fourni) pour éviter les faux matches géo.
        zone_ids: list[str] = []
        for sug in suggestions:
            if not isinstance(sug, dict):
                continue
            zids = sug.get("zoneIds")
            if not zids:
                continue
            if code_postal:
                suggested_cps = sug.get("postalCodes") or []
                if code_postal not in [str(cp) for cp in suggested_cps]:
                    logger.warning(
                        "Bienici geocode: suggestion %r (cps=%s) ne couvre pas CP=%s → rejetée.",
                        sug.get("name"),
                        suggested_cps[:3],
                        code_postal,
                    )
                    return []
            zone_ids = [str(z) for z in zids]
            break
        return zone_ids
    except Exception as exc:  # noqa: BLE001
        logger.warning("Bienici geocode failed for %r: %s", term, exc)
        return []


async def _scrape_bienici(page: Any, query: ListingQuery) -> list[dict[str, Any]]:
    """Scrape Bienici via son API JSON publique. Retourne des annonces mappées."""
    # Bienici exige d'avoir chargé le domaine pour que les fetch same-origin passent.
    await page.goto("https://www.bienici.com/", wait_until="domcontentloaded", timeout=25000)

    zone_ids = await _bienici_zone_ids(page, query.search_term(), code_postal=query.code_postal or None)
    if not zone_ids:
        logger.warning("Bienici: aucun zoneId résolu pour %r — abandon Bienici.", query.search_term())
        return []

    property_type = _TYPE_MAP.get(query.type_bien or "", [])

    filters: dict[str, Any] = {
        "size": _BIENICI_PAGE_SIZE,
        "from": 0,
        "filterType": "buy",  # VENTES uniquement
        "page": 1,
        "sortBy": "relevance",
        "sortOrder": "desc",
        "onTheMarket": [True],
        "zoneIdsByTypes": {"zoneIds": zone_ids},
    }
    if property_type:
        filters["propertyType"] = property_type
    if query.surface and query.surface > 0:
        # Fenêtre +/- 30% autour de la surface cible.
        filters["minArea"] = round(query.surface * 0.7)
        filters["maxArea"] = round(query.surface * 1.3)
    if query.nb_pieces and query.nb_pieces > 0:
        filters["minRooms"] = int(query.nb_pieces)

    filters_json = json.dumps(filters, separators=(",", ":"))
    raw = await page.evaluate(
        """async (f) => {
            const url = 'https://www.bienici.com/realEstateAds.json?filters=' + encodeURIComponent(f);
            const r = await fetch(url, {headers: {'accept': 'application/json'}});
            if (!r.ok) return JSON.stringify({__error: r.status});
            return await r.text();
        }""",
        filters_json,
    )
    if not raw:
        logger.warning("Bienici: réponse vide de realEstateAds.json")
        return []

    data = json.loads(raw)
    if isinstance(data, dict) and data.get("__error"):
        logger.warning("Bienici: realEstateAds.json HTTP %s", data["__error"])
        return []

    ads = data.get("realEstateAds") if isinstance(data, dict) else None
    if not isinstance(ads, list):
        logger.warning("Bienici: structure JSON inattendue (pas de realEstateAds)")
        return []

    out: list[dict[str, Any]] = []
    for ad in ads:
        if not isinstance(ad, dict):
            continue
        mapped = _map_bienici_ad(ad)
        if mapped is not None:
            out.append(mapped)
    logger.info(
        "Bienici: %d annonces brutes → %d ventes exploitables (zoneIds=%s)",
        len(ads),
        len(out),
        zone_ids,
    )
    return out


async def scrape_listings(query: ListingQuery) -> list[dict[str, Any]]:
    """Point d'entrée : scrape des annonces de VENTE via Browserbase.

    Fail-soft TOTAL — n'importe quelle erreur => []. Ne fabrique jamais de résultat.

    Stratégie :
      - Bienici en priorité (seule source qui passe sans proxy résidentiel).
      - LeBonCoin / SeLoger / PAP sont bloqués par DataDome/Cloudflare en IP
        datacenter ; non tentés ici tant qu'on n'a pas de proxy résidentiel
        (sinon coût de session Browserbase pour un 403 garanti).

    Retour : liste de dicts au format apify-brut, cappée à MAX_RESULTS.
    """
    if not settings.BROWSERBASE_API_KEY or not settings.BROWSERBASE_PROJECT_ID:
        logger.warning("Browserbase non configuré (clé/projet absents) — scrape skip.")
        return []

    browser = None
    try:
        from playwright.async_api import async_playwright  # import local : fail-soft

        async with async_playwright() as playwright:
            browser, page = await _new_browserbase_page(playwright)
            results = await _scrape_bienici(page, query)
    except Exception as exc:  # noqa: BLE001
        logger.warning("scrape_listings échec (fail-soft → []): %s", exc, exc_info=True)
        return []
    finally:
        if browser is not None:
            try:
                await browser.close()
            except Exception:  # noqa: BLE001
                pass

    # Dédup par id + cap.
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for r in results:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        deduped.append(r)
        if len(deduped) >= MAX_RESULTS:
            break
    return deduped
