"""Tests for resolve_vault_namespace — owner-scoped, fail-closed (R6).

Mirrors the R5 external_account_scope contract. No real namespace value is
asserted beyond opaque test labels; no private content is involved.
"""
from __future__ import annotations

import json

import pytest

from src.tools.vault_scope import resolve_vault_namespace

_OWNER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_OWNER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
_NS_A = "ns-a"
_NS_B = "ns-b"


@pytest.fixture(autouse=True)
def _clean_vault_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start each test from a fully fail-closed env (no mapping, no legacy)."""
    for var in (
        "VAULT_NAMESPACE_BY_OWNER_JSON",
        "VAULT_DEFAULT_NAMESPACE",
        "ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS",
        "ENVIRONMENT",
        "NODE_ENV",
        "RAILWAY_ENVIRONMENT",
    ):
        monkeypatch.delenv(var, raising=False)


def _set_mapping(monkeypatch: pytest.MonkeyPatch, mapping: dict[str, str]) -> None:
    monkeypatch.setenv("VAULT_NAMESPACE_BY_OWNER_JSON", json.dumps(mapping))


def test_mapped_owner_resolves_namespace(monkeypatch: pytest.MonkeyPatch):
    _set_mapping(monkeypatch, {_OWNER_A: _NS_A})
    assert resolve_vault_namespace(_OWNER_A) == _NS_A


def test_other_owner_resolves_own_namespace(monkeypatch: pytest.MonkeyPatch):
    _set_mapping(monkeypatch, {_OWNER_A: _NS_A, _OWNER_B: _NS_B})
    assert resolve_vault_namespace(_OWNER_B) == _NS_B


def test_owner_b_never_gets_owner_a_namespace(monkeypatch: pytest.MonkeyPatch):
    _set_mapping(monkeypatch, {_OWNER_A: _NS_A, _OWNER_B: _NS_B})
    assert resolve_vault_namespace(_OWNER_B) != _NS_A


def test_unknown_owner_failclosed(monkeypatch: pytest.MonkeyPatch):
    _set_mapping(monkeypatch, {_OWNER_A: _NS_A})
    assert resolve_vault_namespace("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz") is None


def test_none_owner_failclosed(monkeypatch: pytest.MonkeyPatch):
    _set_mapping(monkeypatch, {_OWNER_A: _NS_A})
    assert resolve_vault_namespace(None) is None
    assert resolve_vault_namespace("") is None


def test_invalid_json_mapping_failclosed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VAULT_NAMESPACE_BY_OWNER_JSON", "{not valid json")
    assert resolve_vault_namespace(_OWNER_A) is None


def test_non_object_json_mapping_failclosed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VAULT_NAMESPACE_BY_OWNER_JSON", '["array","not","object"]')
    assert resolve_vault_namespace(_OWNER_A) is None


def test_no_mapping_failclosed(monkeypatch: pytest.MonkeyPatch):
    # No VAULT_NAMESPACE_BY_OWNER_JSON at all → fail-closed.
    assert resolve_vault_namespace(_OWNER_A) is None


def test_production_forbids_legacy_fallback(monkeypatch: pytest.MonkeyPatch):
    """En production, le fallback legacy est interdit même si le flag est posé."""
    monkeypatch.setenv("ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS", "true")
    monkeypatch.setenv("VAULT_DEFAULT_NAMESPACE", "global-vault")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    # owner non mappé en prod → None, jamais le namespace global.
    assert resolve_vault_namespace(_OWNER_A) is None


def test_dev_legacy_fallback_requires_explicit_flag_and_value(monkeypatch: pytest.MonkeyPatch):
    """Dev/test : legacy fallback seulement si flag + VAULT_DEFAULT_NAMESPACE explicites."""
    # Flag posé mais pas de valeur → toujours None.
    monkeypatch.setenv("ALLOW_LEGACY_VAULT_NAMESPACE_FALLBACK_FOR_TESTS", "true")
    assert resolve_vault_namespace(_OWNER_A) is None
    # Flag + valeur explicite (hors prod) → fallback autorisé.
    monkeypatch.setenv("VAULT_DEFAULT_NAMESPACE", "global-vault")
    assert resolve_vault_namespace(_OWNER_A) == "global-vault"


def test_legacy_flag_off_failclosed_even_with_default(monkeypatch: pytest.MonkeyPatch):
    """VAULT_DEFAULT_NAMESPACE posé mais flag absent → fail-closed."""
    monkeypatch.setenv("VAULT_DEFAULT_NAMESPACE", "global-vault")
    assert resolve_vault_namespace(_OWNER_A) is None
