"""Test — client embeddings/rerank HF (TEI GPU1).

httpx mocké : on teste le parsing, le gate de configuration (fail-closed) et le
tri du rerank, pas le réseau réel.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.providers import hf_embeddings


def _resp(status: int, payload):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = payload
    return m


def test_embed_texts_empty_returns_empty():
    assert hf_embeddings.embed_texts([]) == []


def test_embed_texts_parses_matrix():
    with patch.object(hf_embeddings.settings, "TEI_EMBED_URL", "https://embed.test"), \
         patch.object(hf_embeddings.settings, "TEI_API_KEY", "k"), \
         patch("src.providers.hf_embeddings.httpx.post", return_value=_resp(200, [[0.1, 0.2], [0.3, 0.4]])):
        out = hf_embeddings.embed_texts(["a", "b"])
    assert out == [[0.1, 0.2], [0.3, 0.4]]


def test_embed_fail_closed_when_not_configured():
    with patch.object(hf_embeddings.settings, "TEI_EMBED_URL", ""):
        with pytest.raises(hf_embeddings.HfEmbeddingsError):
            hf_embeddings.embed_texts(["a"])


def test_embed_raises_on_http_error():
    with patch.object(hf_embeddings.settings, "TEI_EMBED_URL", "https://embed.test"), \
         patch("src.providers.hf_embeddings.httpx.post", return_value=_resp(502, {})):
        with pytest.raises(hf_embeddings.HfEmbeddingsError):
            hf_embeddings.embed_texts(["a"])


def test_rerank_sorts_descending_and_truncates():
    payload = [{"index": 0, "score": 0.2}, {"index": 1, "score": 0.9}, {"index": 2, "score": 0.5}]
    with patch.object(hf_embeddings.settings, "TEI_RERANK_URL", "https://rerank.test"), \
         patch.object(hf_embeddings.settings, "TEI_API_KEY", "k"), \
         patch("src.providers.hf_embeddings.httpx.post", return_value=_resp(200, payload)):
        out = hf_embeddings.rerank("q", ["a", "b", "c"], top_k=2)
    assert [r["index"] for r in out] == [1, 2]


def test_rerank_fail_closed_when_not_configured():
    with patch.object(hf_embeddings.settings, "TEI_RERANK_URL", ""):
        with pytest.raises(hf_embeddings.HfEmbeddingsError):
            hf_embeddings.rerank("q", ["a"])
