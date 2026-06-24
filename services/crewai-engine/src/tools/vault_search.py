"""Vault search tool — interroge Cortex (RAG sur 39k notes Obsidian d'Adrien)."""
from __future__ import annotations

import json
import logging
from typing import Any

import requests
from crewai.tools import BaseTool

from ..config import settings

logger = logging.getLogger(__name__)

_DEFAULT_LIMIT = 5
_PREVIEW_CHARS = 300
_HTTP_TIMEOUT_S = 10
_VAULT_UNAVAILABLE_PREFIX = "Vault unavailable"
# Message fail-closed quand l'owner courant n'a aucun namespace Vault autorisé.
# Aucune requête Cortex n'est émise dans ce cas (R6 — anti cross-tenant).
_VAULT_NOT_AUTHORIZED = f"{_VAULT_UNAVAILABLE_PREFIX}: no vault namespace authorized for this owner"


def _format_results(results: list[dict[str, Any]]) -> str:
    """Format Cortex search results into LLM-readable markdown."""
    if not results:
        return "Aucune note pertinente trouvée dans le vault."

    lines: list[str] = ["**Top notes du vault Cortex :**", ""]
    for r in results:
        title = r.get("title") or r.get("path", "").split("/")[-1].replace(".md", "") or "(sans titre)"
        score = r.get("score")
        score_str = f" · score {score:.2f}" if isinstance(score, (int, float)) else ""
        path = r.get("path", "(path inconnu)")
        preview = (r.get("content_preview") or "").replace("\n", " ").strip()
        if len(preview) > _PREVIEW_CHARS:
            preview = preview[:_PREVIEW_CHARS] + "…"

        lines.append(f"### {title}{score_str}")
        lines.append(f"Path : `{path}`")
        if preview:
            lines.append("")
            lines.append(preview)
        lines.append("")

    return "\n".join(lines)


class VaultSearchTool(BaseTool):
    name: str = "vault_search"
    description: str = (
        "Recherche sémantique dans le vault privé de l'OWNER courant "
        "(owner-scopé — R6). À utiliser AVANT de rédiger une réponse, un draft "
        "ou une consolidation mémoire pour récupérer le contexte historique "
        "pertinent. "
        "Input : une requête en langage naturel (ex: 'décisions sur projet X', "
        "'historique factures électricité', 'discussions avec client Y'). "
        "Output : top-5 notes pertinentes avec path, score, et extrait. "
        "Si aucun namespace Vault n'est autorisé pour l'owner, la recherche est "
        "désactivée (fail-closed, aucune requête émise)."
    )
    # R6 — owner du run (JWT vérifié) ; détermine le namespace Vault autorisé.
    # Le namespace est résolu côté serveur à partir de cet owner_id ; ni le LLM
    # ni le client ne peuvent le surcharger (aucun argument namespace exposé).
    owner_id: str | None = None

    def _run(self, query: str, limit: int = _DEFAULT_LIMIT) -> str:
        """Search Cortex vault. Fail-soft : returns explanatory string, never raises."""
        if not isinstance(query, str) or not query.strip():
            return f"{_VAULT_UNAVAILABLE_PREFIX}: empty query"

        # R6 — résolution owner-scopée du namespace (autoritaire). Fail-closed :
        # un owner sans mapping n'atteint JAMAIS le Vault d'Adrien — aucune
        # requête Cortex n'est émise.
        from .vault_scope import resolve_vault_namespace

        namespace = resolve_vault_namespace(self.owner_id)
        if not namespace:
            logger.info(
                "[VAULT_SCOPE] vault search denied — no namespace authorized for owner (fail-closed)"
            )
            return _VAULT_NOT_AUTHORIZED

        cortex_url = (settings.CORTEX_URL or "").rstrip("/")
        if not cortex_url:
            return f"{_VAULT_UNAVAILABLE_PREFIX}: CORTEX_URL not configured"

        safe_limit = max(1, min(int(limit) if isinstance(limit, int) else _DEFAULT_LIMIT, 25))

        headers = {"Content-Type": "application/json"}
        if settings.CORTEX_API_KEY:
            # Header standard REST attendu par le middleware Cortex (middleware.ts).
            headers["x-api-key"] = settings.CORTEX_API_KEY

        try:
            resp = requests.post(
                f"{cortex_url}/api/search",
                headers=headers,
                json={
                    "query": query.strip(),
                    "limit": safe_limit,
                    "mode": "hybrid",
                    # Namespace owner-scopé forcé côté serveur (jamais LLM/client).
                    "namespace": namespace,
                },
                timeout=_HTTP_TIMEOUT_S,
            )
        except requests.Timeout:
            logger.warning("Cortex search timeout (%ss) for query: %r", _HTTP_TIMEOUT_S, query[:80])
            return f"{_VAULT_UNAVAILABLE_PREFIX}: timeout after {_HTTP_TIMEOUT_S}s"
        except requests.RequestException as exc:
            logger.warning("Cortex search request failed: %s", exc)
            return f"{_VAULT_UNAVAILABLE_PREFIX}: connection error ({type(exc).__name__})"

        if resp.status_code >= 500:
            logger.warning("Cortex 5xx (%s) for query: %r", resp.status_code, query[:80])
            return f"{_VAULT_UNAVAILABLE_PREFIX}: cortex {resp.status_code}"
        if resp.status_code == 401:
            return f"{_VAULT_UNAVAILABLE_PREFIX}: authentication required (set CORTEX_API_KEY)"
        if not resp.ok:
            return f"{_VAULT_UNAVAILABLE_PREFIX}: HTTP {resp.status_code}"

        try:
            data = resp.json()
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning("Cortex returned invalid JSON: %s", exc)
            return f"{_VAULT_UNAVAILABLE_PREFIX}: invalid JSON response"

        # Cortex may return { results: [...] } or { error: "qdrant_unreachable", ... }
        if isinstance(data, dict) and "error" in data and "results" not in data:
            return f"{_VAULT_UNAVAILABLE_PREFIX}: {data.get('error')}"

        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            return f"{_VAULT_UNAVAILABLE_PREFIX}: unexpected response shape"

        return _format_results(results)
