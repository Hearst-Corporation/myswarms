"""Tests — Composio/Telegram Chief tenant scoping (R5). Mock-only, AUCUN envoi.

Prouve que le Daily Chief n'utilise plus de credentials externes partagés :
- l'entity Composio et le chat Telegram sont résolus PAR owner ;
- owner inconnu/absent → fail-closed (aucun tool, aucun envoi), jamais 'adrien' ;
- le fallback global legacy n'est autorisé qu'en dev/test gated, jamais en prod ;
- l'owner_id se propage jusqu'aux tools du Chief.
"""
from __future__ import annotations

import json

import pytest

import src.composio_session as cs
from src.config import settings
from src.tools.external_account_scope import (
    resolve_composio_entity,
    resolve_telegram_chat,
)
from src.tools.telegram_sender import TelegramSenderTool

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"

_LEGACY = "ALLOW_LEGACY_EXTERNAL_ACCOUNT_FALLBACK_FOR_TESTS"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Part d'un état fail-closed : aucun mapping, aucun fallback, non-prod."""
    for v in ("COMPOSIO_ENTITY_BY_OWNER_JSON", "TELEGRAM_CHAT_BY_OWNER_JSON",
              _LEGACY, "ENVIRONMENT", "NODE_ENV", "RAILWAY_ENVIRONMENT"):
        monkeypatch.delenv(v, raising=False)
    yield


# ── resolver Composio ────────────────────────────────────────────────────────

class TestComposioResolver:
    def test_owner_mapped(self, monkeypatch):
        monkeypatch.setenv("COMPOSIO_ENTITY_BY_OWNER_JSON", json.dumps({OWNER_A: "entity-A"}))
        assert resolve_composio_entity(OWNER_A) == "entity-A"

    def test_owner_unmapped_failclosed(self, monkeypatch):
        monkeypatch.setenv("COMPOSIO_ENTITY_BY_OWNER_JSON", json.dumps({OWNER_A: "entity-A"}))
        assert resolve_composio_entity(OWNER_B) is None

    def test_none_owner(self):
        assert resolve_composio_entity(None) is None
        assert resolve_composio_entity("") is None

    def test_no_adrien_default_without_fallback(self, monkeypatch):
        monkeypatch.setattr(settings, "COMPOSIO_USER_ID", "adrien", raising=False)
        assert resolve_composio_entity(OWNER_A) is None  # jamais 'adrien' par défaut

    def test_legacy_fallback_dev_only(self, monkeypatch):
        monkeypatch.setenv(_LEGACY, "true")
        monkeypatch.setattr(settings, "COMPOSIO_USER_ID", "legacy-entity", raising=False)
        assert resolve_composio_entity(OWNER_A) == "legacy-entity"

    def test_legacy_disabled_in_production(self, monkeypatch):
        monkeypatch.setenv(_LEGACY, "true")
        monkeypatch.setenv("ENVIRONMENT", "production")
        monkeypatch.setattr(settings, "COMPOSIO_USER_ID", "legacy-entity", raising=False)
        assert resolve_composio_entity(OWNER_A) is None  # fail-closed en prod

    def test_legacy_disabled_on_railway_production(self, monkeypatch):
        monkeypatch.setenv(_LEGACY, "true")
        monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
        monkeypatch.setattr(settings, "COMPOSIO_USER_ID", "legacy-entity", raising=False)
        assert resolve_composio_entity(OWNER_A) is None

    def test_invalid_json_failclosed(self, monkeypatch):
        monkeypatch.setenv("COMPOSIO_ENTITY_BY_OWNER_JSON", "{not valid json")
        assert resolve_composio_entity(OWNER_A) is None


# ── resolver Telegram ────────────────────────────────────────────────────────

class TestTelegramResolver:
    def test_owner_mapped(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_CHAT_BY_OWNER_JSON", json.dumps({OWNER_A: "chat-A"}))
        assert resolve_telegram_chat(OWNER_A) == "chat-A"

    def test_owner_unmapped_failclosed(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_CHAT_BY_OWNER_JSON", json.dumps({OWNER_A: "chat-A"}))
        assert resolve_telegram_chat(OWNER_B) is None

    def test_none_owner(self):
        assert resolve_telegram_chat(None) is None


# ── get_composio_tools_for_toolkits : fail-closed (pas de SDK appelé) ─────────

class TestComposioToolsScope:
    def test_unknown_owner_returns_empty(self):
        assert cs.get_composio_tools_for_toolkits(["gmail"], owner_id=OWNER_B) == []

    def test_none_owner_returns_empty(self):
        assert cs.get_composio_tools_for_toolkits(["gmail", "slack"], owner_id=None) == []


# ── TelegramSenderTool : owner-scopé, fail-closed (aucun envoi) ───────────────

class TestTelegramToolScope:
    def test_unknown_owner_no_send(self, monkeypatch):
        # owner sans chat mappé + niveau auto-send + token présent → "skipped"
        # (aucun chat → aucun appel httpx). Le LLM-fourni chat_id est ignoré.
        monkeypatch.setattr(settings, "SECURITY_LEVEL", 5, raising=False)
        monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "fake-token", raising=False)
        out = json.loads(TelegramSenderTool(owner_id=OWNER_B)._run("hello"))
        assert out["status"] == "skipped"

    def test_llm_chat_id_is_ignored(self, monkeypatch):
        # même avec un chat_id fourni par le LLM, owner non mappé → skipped (anti-ciblage).
        monkeypatch.setattr(settings, "SECURITY_LEVEL", 5, raising=False)
        monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "fake-token", raising=False)
        out = json.loads(TelegramSenderTool(owner_id=OWNER_B)._run("hello", chat_id="adrien-chat"))
        assert out["status"] == "skipped"

    def test_owner_scoped_chat_resolved(self, monkeypatch):
        # owner A mappé → le tool résout bien chat-A (sans envoyer : on patche httpx).
        monkeypatch.setenv("TELEGRAM_CHAT_BY_OWNER_JSON", json.dumps({OWNER_A: "chat-A"}))
        monkeypatch.delenv(_LEGACY, raising=False)
        monkeypatch.setattr(settings, "SECURITY_LEVEL", 5, raising=False)
        monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "fake-token", raising=False)
        sent = {}
        import httpx
        def fake_post(url, json=None, timeout=None):
            sent["chat_id"] = (json or {}).get("chat_id")
            class _R:
                def raise_for_status(self): ...
            return _R()
        monkeypatch.setattr(httpx, "post", fake_post)
        out = json.loads(TelegramSenderTool(owner_id=OWNER_A)._run("hello"))
        assert out["status"] == "sent"
        assert sent["chat_id"] == "chat-A"  # owner-scopé, jamais le chat global


# ── Propagation owner_id dans le Chief ───────────────────────────────────────

class TestChiefPropagation:
    def test_create_daily_chief_crew_passes_owner_to_agents(self, monkeypatch):
        seen = {}
        class _Stop(Exception):
            pass
        def fake_create_agents(owner_id=None):
            seen["owner_id"] = owner_id
            raise _Stop()
        monkeypatch.setattr("src.crews.daily_chief_crew.create_agents", fake_create_agents)
        from src.crews.daily_chief_crew import create_daily_chief_crew
        with pytest.raises(_Stop):
            create_daily_chief_crew(owner_id=OWNER_A)
        assert seen["owner_id"] == OWNER_A

    def test_local_tools_telegram_owner_scoped(self):
        from src.agents.definitions import _get_local_tools
        tools = _get_local_tools(owner_id=OWNER_A)
        assert tools["telegram_sender"].owner_id == OWNER_A
