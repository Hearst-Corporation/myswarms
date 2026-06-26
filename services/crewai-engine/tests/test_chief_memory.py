"""Tests — mémoire sémantique owner-scopée du Chief of Staff.

Couvre :
  - isolation owner (A ne voit que A ; B ne voit pas A)
  - owner invalide/None → degraded no-memory
  - HF embed indisponible → degraded no-memory
  - rerank indisponible → fallback récence (degraded=False, reranked_count=0)
  - rerank ordonne correctement
  - top-k cap respecté
  - redaction appliquée AVANT injection (no-leak)
  - le Chief continue si la mémoire échoue (flow fail-safe)

Toutes les dépendances externes (Supabase, HF) sont mockées — aucun réseau,
aucun secret réel.
"""
from __future__ import annotations

from unittest.mock import patch

from src.memory import chief_memory
from src.memory.redaction import contains_secret, redact_sensitive_text

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsZWFrIn0.abcdefghijklmnopqrstuvwxyz123456"


def _runs(owner_label: str, n: int = 3):
    return [
        {
            "kickoff_id": f"kick-{owner_label}-{i}",
            "trigger": "morning",
            "status": "completed",
            "started_at": f"2026-06-2{i}T08:00:00Z",
            "result": f"Résumé du run {owner_label} numéro {i}",
        }
        for i in range(n)
    ]


# ── Redaction ────────────────────────────────────────────────────────────────


class TestRedaction:
    def test_redacts_jwt_and_truncates(self):
        out = redact_sensitive_text(f"contexte {JWT} fin")
        assert JWT not in out
        assert "[REDACTED_JWT]" in out

    def test_redacts_bearer_and_hf_and_service_role(self):
        assert "Bearer [REDACTED]" in redact_sensitive_text("Authorization: Bearer abc.def.ghi")
        assert "[REDACTED_KEY]" in redact_sensitive_text("hf_0000000000000000000000")
        assert "[REDACTED_ROLE]" in redact_sensitive_text("uses service_role key")

    def test_truncates_long_text(self):
        out = redact_sensitive_text("a" * 2000, max_chars=800)
        assert len(out) <= 801
        assert out.endswith("…")

    def test_contains_secret(self):
        assert contains_secret(JWT) is True
        assert contains_secret("plain safe text") is False

    def test_empty(self):
        assert redact_sensitive_text(None) == ""
        assert redact_sensitive_text("") == ""


# ── Owner isolation ──────────────────────────────────────────────────────────


class TestOwnerIsolation:
    def test_owner_a_only_sees_a(self):
        captured = {}

        def fake_list_runs(self, limit=20):  # noqa: ARG001
            captured["owner_id"] = self.owner_id
            # Le store NE renvoie que les runs de l'owner demandé (simule .eq).
            return _runs("A") if self.owner_id == OWNER_A else []

        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", fake_list_runs), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1, 0.2]), \
             patch("src.memory.chief_memory.hf_embeddings.rerank", return_value=[{"index": 0, "score": 0.9}]):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "planning today")

        assert captured["owner_id"] == OWNER_A
        assert res.memory_used is True
        assert all(item.owner_id == OWNER_A for item in res.items)
        # Aucun contenu de B ne peut apparaître.
        assert all("B numéro" not in item.text for item in res.items)

    def test_owner_b_does_not_see_a(self):
        def fake_list_runs(self, limit=20):  # noqa: ARG001
            return _runs("A") if self.owner_id == OWNER_A else []

        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", fake_list_runs), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1]), \
             patch("src.memory.chief_memory.hf_embeddings.rerank", return_value=[]):
            res = chief_memory.retrieve_chief_memory(OWNER_B, "planning today")

        # B n'a aucun run → degraded no-memory, jamais le contenu de A.
        assert res.memory_used is False
        assert res.items == []


# ── Degraded modes ───────────────────────────────────────────────────────────


class TestDegraded:
    def test_invalid_owner_returns_degraded(self):
        res = chief_memory.retrieve_chief_memory("not-a-uuid", "q")
        assert res.degraded is True
        assert res.memory_used is False
        assert res.reason == "invalid_or_missing_owner"

    def test_empty_query_returns_degraded(self):
        res = chief_memory.retrieve_chief_memory(OWNER_A, "   ")
        assert res.degraded is True
        assert res.reason == "empty_query"

    def test_hf_not_configured_returns_degraded(self):
        with patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=False):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        assert res.degraded is True
        assert res.reason == "hf_not_configured"

    def test_embed_failure_returns_degraded(self):
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: _runs("A")), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch(
                 "src.memory.chief_memory.hf_embeddings.embed_text",
                 side_effect=chief_memory.hf_embeddings.HfEmbeddingsError("down"),
             ):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        assert res.degraded is True
        assert res.reason == "hf_embeddings_failed"
        assert res.candidate_count == 3

    def test_no_candidates_returns_degraded(self):
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: []), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        assert res.degraded is True
        assert res.reason == "no_candidates"


# ── Rerank ───────────────────────────────────────────────────────────────────


class TestRerank:
    def test_rerank_orders_results(self):
        # rerank renvoie index 2 en tête, puis 0.
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: _runs("A", 3)), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1]), \
             patch(
                 "src.memory.chief_memory.hf_embeddings.rerank",
                 return_value=[{"index": 2, "score": 0.95}, {"index": 0, "score": 0.4}],
             ):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        assert res.reranked_count == 2
        assert "numéro 2" in res.items[0].text
        assert "numéro 0" in res.items[1].text

    def test_rerank_failure_falls_back_to_recency(self):
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: _runs("A", 3)), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1]), \
             patch(
                 "src.memory.chief_memory.hf_embeddings.rerank",
                 side_effect=chief_memory.hf_embeddings.HfEmbeddingsError("rerank down"),
             ):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        # Fallback récence : mémoire utilisée mais reranked_count=0.
        assert res.memory_used is True
        assert res.degraded is False
        assert res.reranked_count == 0

    def test_top_k_cap_enforced(self):
        many = _runs("A", 20)
        rerank_all = [{"index": i, "score": 1.0 - i * 0.01} for i in range(20)]
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: many), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1]), \
             patch("src.memory.chief_memory.hf_embeddings.rerank", return_value=rerank_all):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q", limit=8)
        assert len(res.items) <= 8


# ── No-leak ──────────────────────────────────────────────────────────────────


class TestNoLeak:
    def test_secret_in_run_result_is_redacted_before_injection(self):
        leaky = [{
            "kickoff_id": "kick-A-0",
            "trigger": "morning",
            "status": "completed",
            "started_at": "2026-06-25T08:00:00Z",
            "result": f"Plan with secret Bearer {JWT} and service_role",
        }]
        with patch("src.memory.chief_memory.ScopedChiefStore.list_runs", lambda self, limit=20: leaky), \
             patch("src.memory.chief_memory.hf_embeddings.is_configured", return_value=True), \
             patch("src.memory.chief_memory.hf_embeddings.embed_text", return_value=[0.1]), \
             patch("src.memory.chief_memory.hf_embeddings.rerank", return_value=[{"index": 0, "score": 0.9}]):
            res = chief_memory.retrieve_chief_memory(OWNER_A, "q")
        ctx = chief_memory.build_memory_context(res)
        assert JWT not in ctx
        assert "service_role" not in ctx
        assert "[REDACTED" in ctx

    def test_build_context_empty_when_no_memory(self):
        empty = chief_memory.ChiefMemoryResult(items=[], degraded=True, reason="x", candidate_count=0, reranked_count=0)
        assert chief_memory.build_memory_context(empty) == ""


# ── Flow fail-safe ───────────────────────────────────────────────────────────


class TestFlowFailSafe:
    def test_chief_continues_when_memory_raises(self):
        from src.flows.chief_of_staff_flow import ChiefOfStaffFlow

        flow = ChiefOfStaffFlow()
        flow.state.owner_id = OWNER_A
        flow.state.trigger = "morning"
        # retrieve lève → _load_memory doit avaler et mettre degraded.
        with patch(
            "src.memory.chief_memory.retrieve_chief_memory",
            side_effect=RuntimeError("boom"),
        ):
            flow._load_memory()
        assert flow.state.memory_context == ""
        assert flow.state.memory_metadata["memory_used"] is False
        assert flow.state.memory_metadata["degraded"] is True

    def test_unknown_owner_flow_gets_no_memory(self):
        from src.flows.chief_of_staff_flow import ChiefOfStaffFlow

        flow = ChiefOfStaffFlow()
        flow.state.owner_id = ""  # owner inconnu
        flow.state.trigger = "morning"
        flow._load_memory()
        assert flow.state.memory_context == ""
        assert flow.state.memory_metadata["memory_used"] is False
