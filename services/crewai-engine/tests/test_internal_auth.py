"""Tests — auth interne JWT BFF → Engine (R3 : identité non spoofable).

Couvre :
- vérification JWT (valide / expiré / signature / issuer / audience / owner).
- précédence : JWT autoritaire, query owner_id ignoré quand JWT présent.
- fail-closed : pas de JWT (legacy off) → 401 ; legacy off par défaut ; prod off.
- anti-spoofing bout-en-bout via une route owner-scopée (TestClient).

Le secret de test vient de conftest.py. On ne logge JAMAIS de token.
"""
from __future__ import annotations

import time
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from src.security import internal_auth
from src.security.internal_auth import (
    InternalIdentity,
    require_internal_identity,
    verify_internal_token,
)

OWNER_A = "11111111-1111-1111-1111-111111111111"
OWNER_B = "22222222-2222-2222-2222-222222222222"


def _secret() -> str:
    return internal_auth._get_secret()


def mint(
    owner_id: str = OWNER_A,
    *,
    secret: str | None = None,
    issuer: str = "myswarms-bff",
    audience: str = "crewai-engine",
    ttl: int = 300,
    tenant_id: str | None = None,
    drop_owner: bool = False,
    alg: str = "HS256",
) -> str:
    """Forge un JWT interne (paramétrable pour les cas négatifs)."""
    now = int(time.time())
    payload: dict = {
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + ttl,
        "sub": owner_id,
        "owner_id": owner_id,
    }
    if tenant_id is not None:
        payload["tenant_id"] = tenant_id
    if drop_owner:
        payload.pop("owner_id", None)
        payload.pop("sub", None)
    return pyjwt.encode(payload, secret or _secret(), algorithm=alg)


def _bearer(token: str) -> str:
    return f"Bearer {token}"


def _fake_request(query_string: bytes = b"") -> Request:
    return Request({"type": "http", "query_string": query_string, "headers": []})


# ── verify_internal_token : cas valides ──────────────────────────────────────

class TestVerifyValid:
    def test_valid_token_returns_identity(self):
        ident = verify_internal_token(_bearer(mint(OWNER_A)))
        assert isinstance(ident, InternalIdentity)
        assert ident.owner_id == OWNER_A

    def test_tenant_claim_propagated(self):
        ident = verify_internal_token(_bearer(mint(OWNER_A, tenant_id="hive")))
        assert ident.tenant_id == "hive"

    def test_owner_from_sub_when_owner_id_absent(self):
        now = int(time.time())
        token = pyjwt.encode(
            {"iss": "myswarms-bff", "aud": "crewai-engine", "iat": now,
             "exp": now + 300, "sub": OWNER_A},
            _secret(), algorithm="HS256",
        )
        assert verify_internal_token(_bearer(token)).owner_id == OWNER_A


# ── verify_internal_token : cas négatifs → 401 ───────────────────────────────

class TestVerifyRejects:
    @pytest.mark.parametrize("header", [None, "", "Token abc", "Bearer", "Basic xyz"])
    def test_missing_or_malformed_header_401(self, header):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(header)
        assert exc.value.status_code == 401

    def test_expired_token_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, ttl=-10)))
        assert exc.value.status_code == 401

    def test_bad_signature_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, secret="the-wrong-secret-xxxxxxxxxxxxxxxx")))
        assert exc.value.status_code == 401

    def test_wrong_issuer_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, issuer="evil-issuer")))
        assert exc.value.status_code == 401

    def test_wrong_audience_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, audience="some-other-service")))
        assert exc.value.status_code == 401

    def test_missing_owner_claim_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, drop_owner=True)))
        assert exc.value.status_code == 401

    def test_non_uuid_owner_401(self):
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint("not-a-uuid")))
        assert exc.value.status_code == 401

    def test_no_secret_configured_401(self, monkeypatch):
        monkeypatch.delenv("CREWAI_ENGINE_JWT_SECRET", raising=False)
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(mint(OWNER_A, secret="whatever-secret-32-characters-aaa")))
        assert exc.value.status_code == 401

    def test_error_detail_leaks_no_token(self):
        token = mint(OWNER_A, issuer="evil")
        with pytest.raises(HTTPException) as exc:
            verify_internal_token(_bearer(token))
        assert token not in str(exc.value.detail)


# ── require_internal_identity : précédence + fallback ────────────────────────

class TestPrecedence:
    def test_jwt_present_wins_over_query(self):
        """JWT owner A + query owner B → owner A (query ignoré)."""
        req = _fake_request(query_string=f"owner_id={OWNER_B}".encode())
        ident = require_internal_identity(req, x_internal_auth=_bearer(mint(OWNER_A)))
        assert ident.owner_id == OWNER_A

    def test_invalid_jwt_never_falls_back_to_query(self):
        """JWT invalide + query owner B → 401 (pas de fallback silencieux sur la query)."""
        req = _fake_request(query_string=f"owner_id={OWNER_B}".encode())
        with pytest.raises(HTTPException) as exc:
            require_internal_identity(req, x_internal_auth=_bearer(mint(OWNER_A, issuer="evil")))
        assert exc.value.status_code == 401

    def test_legacy_query_used_only_without_jwt(self, monkeypatch):
        monkeypatch.setenv("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", "true")
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.delenv("NODE_ENV", raising=False)
        req = _fake_request(query_string=f"owner_id={OWNER_A}".encode())
        ident = require_internal_identity(req, x_internal_auth=None)
        assert ident.owner_id == OWNER_A

    def test_no_jwt_legacy_off_returns_401(self, monkeypatch):
        monkeypatch.delenv("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", raising=False)
        req = _fake_request(query_string=f"owner_id={OWNER_A}".encode())
        with pytest.raises(HTTPException) as exc:
            require_internal_identity(req, x_internal_auth=None)
        assert exc.value.status_code == 401

    def test_legacy_disabled_in_production(self, monkeypatch):
        """Même flag ON, en production le fallback query est désactivé (fail-closed)."""
        monkeypatch.setenv("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", "true")
        monkeypatch.setenv("ENVIRONMENT", "production")
        req = _fake_request(query_string=f"owner_id={OWNER_A}".encode())
        with pytest.raises(HTTPException) as exc:
            require_internal_identity(req, x_internal_auth=None)
        assert exc.value.status_code == 401

    def test_legacy_invalid_uuid_query_401(self, monkeypatch):
        monkeypatch.setenv("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", "true")
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.delenv("NODE_ENV", raising=False)
        req = _fake_request(query_string=b"owner_id=not-a-uuid")
        with pytest.raises(HTTPException) as exc:
            require_internal_identity(req, x_internal_auth=None)
        assert exc.value.status_code == 401


# ── Anti-spoofing bout-en-bout via une route owner-scopée ────────────────────

@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415
    import os  # noqa: PLC0415
    token = os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


class TestEndToEndAntiSpoofing:
    def test_jwt_owner_wins_over_query_param_at_route(self, client):
        """GET /v1/swarms/{id}/runs : JWT(A) + ?owner_id=B → l'engine scope sur A."""
        from src.persistence import swarm_store  # noqa: PLC0415
        with patch.object(swarm_store, "list_swarm_runs", return_value=[]) as lsr:
            resp = client.get(
                f"/v1/swarms/{OWNER_A}/runs",
                params={"owner_id": OWNER_B},  # tentative de spoof
                headers={"X-Internal-Auth": _bearer(mint(OWNER_A))},
            )
        assert resp.status_code == 200
        # L'owner_id transmis au store est celui du JWT (A), jamais le query (B).
        assert lsr.call_args.kwargs.get("owner_id") == OWNER_A

    def test_no_jwt_no_legacy_returns_401(self, client, monkeypatch):
        """Sans JWT et fallback legacy désactivé → 401 même avec bearer global valide."""
        monkeypatch.delenv("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", raising=False)
        resp = client.get(f"/v1/swarms/{OWNER_A}/runs", params={"owner_id": OWNER_B})
        assert resp.status_code == 401

    def test_invalid_jwt_returns_401(self, client):
        resp = client.get(
            f"/v1/swarms/{OWNER_A}/runs",
            headers={"X-Internal-Auth": _bearer(mint(OWNER_A, secret="wrong-secret-aaaaaaaaaaaaaaaaaa"))},
        )
        assert resp.status_code == 401

    def test_valid_jwt_returns_200(self, client):
        from src.persistence import swarm_store  # noqa: PLC0415
        with patch.object(swarm_store, "list_swarm_runs", return_value=[]):
            resp = client.get(
                f"/v1/swarms/{OWNER_A}/runs",
                headers={"X-Internal-Auth": _bearer(mint(OWNER_A))},
            )
        assert resp.status_code == 200
