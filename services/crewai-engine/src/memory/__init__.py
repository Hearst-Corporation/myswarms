"""Chief of Staff — mémoire sémantique owner-scopée (RAG via embeddings + rerank HF).

Met au travail les capacités HF (embeddings bge-m3 + reranker bge-reranker) dans
un flux produit réel : le Chief retrouve des mémoires pertinentes du passé,
strictement owner-scopées, rédactées, et les injecte comme CONTEXTE (jamais
comme instruction). Fail-closed : owner inconnu / HF indisponible → no-memory,
le Chief continue normalement.
"""

from .chief_memory import (
    ChiefMemoryItem,
    ChiefMemoryResult,
    retrieve_chief_memory,
)
from .redaction import redact_sensitive_text

__all__ = [
    "ChiefMemoryItem",
    "ChiefMemoryResult",
    "retrieve_chief_memory",
    "redact_sensitive_text",
]
