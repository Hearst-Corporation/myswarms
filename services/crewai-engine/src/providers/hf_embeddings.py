"""Client embeddings/rerank Hugging Face (TEI self-host GPU1) pour le moteur.

Voie nominale : TEI (bge-m3 + bge-reranker-v2-m3) exposé OpenAI-compatible via
le tunnel Cloudflare (embed.hearst.app / rerank.hearst.app), ~40 ms. Sert le
RAG / la mémoire des agents CrewAI côté Python, en complément de
qwen3-embedding-4b (Hypercli).

RÈGLES :
  - Aucune clé hardcodée : tout via settings (pydantic) / os.getenv.
  - Fail-closed : si TEI non configuré, lève une erreur explicite plutôt que de
    fabriquer un embedding bidon.

Cf. docs/HF_CAPABILITIES.md.
"""

from __future__ import annotations

import httpx

from src.config import settings


class HfEmbeddingsError(RuntimeError):
    """Erreur d'appel TEI (réseau, auth, réponse inattendue)."""


def _headers() -> dict[str, str]:
    key = (settings.TEI_API_KEY or "").strip()
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def is_configured() -> bool:
    """True si un endpoint TEI + (optionnellement) une clé sont configurés."""
    return bool((settings.TEI_EMBED_URL or "").strip())


def embed_texts(texts: list[str], *, timeout: float = 20.0) -> list[list[float]]:
    """Embeddings batch via TEI /embed. Retourne une matrice n×dim (1024 pour bge-m3)."""
    if not texts:
        return []
    if not is_configured():
        raise HfEmbeddingsError("TEI_EMBED_URL non configuré — embeddings HF indisponibles")

    url = (settings.TEI_EMBED_URL or "").rstrip("/") + "/embed"
    try:
        resp = httpx.post(
            url,
            json={"inputs": texts, "truncate": True},
            headers=_headers(),
            timeout=timeout,
        )
    except httpx.HTTPError as exc:  # réseau/timeout
        raise HfEmbeddingsError(f"TEI embed réseau: {type(exc).__name__}") from exc

    if resp.status_code != 200:
        raise HfEmbeddingsError(f"TEI embed HTTP {resp.status_code}")

    data = resp.json()
    if not isinstance(data, list):
        raise HfEmbeddingsError("TEI embed: réponse inattendue (liste attendue)")
    return data


def embed_text(text: str, *, timeout: float = 20.0) -> list[float]:
    """Embedding d'un seul texte."""
    vecs = embed_texts([text], timeout=timeout)
    return vecs[0] if vecs else []


def rerank(query: str, texts: list[str], *, top_k: int | None = None, timeout: float = 20.0) -> list[dict]:
    """Rerank via TEI /rerank. Retourne [{index, score}] trié décroissant."""
    if not texts:
        return []
    base = (settings.TEI_RERANK_URL or "").strip()
    if not base:
        raise HfEmbeddingsError("TEI_RERANK_URL non configuré — rerank HF indisponible")

    url = base.rstrip("/") + "/rerank"
    try:
        resp = httpx.post(
            url,
            json={"query": query, "texts": texts, "truncate": True},
            headers=_headers(),
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        raise HfEmbeddingsError(f"TEI rerank réseau: {type(exc).__name__}") from exc

    if resp.status_code != 200:
        raise HfEmbeddingsError(f"TEI rerank HTTP {resp.status_code}")

    data = resp.json()
    if not isinstance(data, list):
        raise HfEmbeddingsError("TEI rerank: réponse inattendue (liste attendue)")
    ranked = sorted(data, key=lambda r: r.get("score", 0.0), reverse=True)
    return ranked[:top_k] if top_k else ranked
