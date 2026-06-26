"""Test — owner-scope de POST /v1/listings (audit High #2).

Contrat de sécurité après le fix :
  - POST /v1/listings exige un JWT interne owner valide (X-Internal-Auth),
    en plus du bearer machine-to-machine (Authorization). Sans JWT → 401.
  - Le bearer partagé SEUL ne suffit plus (un scrape Browserbase coûteux ne doit
    pas être déclenchable sans identité owner).
  - Avec JWT valide → 200, comportement fail-soft préservé (scrape mocké).

Le scraper Browserbase est mocké — on teste la GATE d'auth + le passage fail-soft,
jamais un vrai appel réseau.
"""
from __future__ import annotations

import os
import time
from unittest.mock import patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

OWNER_A = "11111111-1111-1111-1111-111111111111"


def _bearer_token() -> str:
    """Bearer machine-to-machine (CREWAI_ENGINE_AUTH_TOKEN, valeur de test conftest)."""
    return os.environ.get("CREWAI_ENGINE_AUTH_TOKEN", "00000000000000000000000000000000")


def _internal_jwt(owner_id: str = OWNER_A, secret: str | None = None) -> str:
    now = int(time.time())
    payload = {
        "iss": "myswarms-bff",
        "aud": "crewai-engine",
        "iat": now,
        "exp": now + 300,
        "sub": owner_id,
        "owner_id": owner_id,
    }
    sec = secret or os.environ["CREWAI_ENGINE_JWT_SECRET"]
    return pyjwt.encode(payload, sec, algorithm="HS256")


@pytest.fixture(scope="module")
def client():
    from src.main import app  # noqa: PLC0415

    with TestClient(app) as c:
        yield c


def _headers(*, bearer: bool = True, jwt: str | None = None) -> dict:
    h: dict = {}
    if bearer:
        h["Authorization"] = f"Bearer {_bearer_token()}"
    if jwt is not None:
        h["X-Internal-Auth"] = f"Bearer {jwt}"
    return h


# ── Auth gate ────────────────────────────────────────────────────────────────


class TestListingsAuthGate:
    def test_no_bearer_returns_401(self, client):
        """No machine bearer → blocked by global middleware."""
        r = client.post("/v1/listings", json={"ville": "Paris"}, headers={})
        assert r.status_code == 401

    def test_bearer_only_no_jwt_returns_401(self, client):
        """Bearer alone is no longer enough — owner JWT now required."""
        r = client.post("/v1/listings", json={"ville": "Paris"}, headers=_headers())
        assert r.status_code == 401

    def test_invalid_jwt_returns_401(self, client):
        """A JWT signed with the wrong secret is rejected."""
        bad = _internal_jwt(secret="wrong-secret-aaaaaaaaaaaaaaaaaaaaaaaa")
        r = client.post(
            "/v1/listings", json={"ville": "Paris"}, headers=_headers(jwt=bad)
        )
        assert r.status_code == 401


# ── Happy path with valid owner JWT ──────────────────────────────────────────


class TestListingsWithValidOwner:
    def test_valid_jwt_returns_200_and_listings(self, client):
        async def _fake_scrape(_query):
            return [{
                "id": "x1", "url": "https://e.x/1", "title": "T",
                "price_eur": 100000.0, "surface_m2": 50.0, "status": "active",
                "sale_type": "sale",
            }]

        with patch("src.routes.listings.scrape_listings", _fake_scrape):
            r = client.post(
                "/v1/listings",
                json={"ville": "Paris", "typeBien": "appartement"},
                headers=_headers(jwt=_internal_jwt()),
            )
        assert r.status_code == 200
        body = r.json()
        assert body["listings"][0]["id"] == "x1"

    def test_valid_jwt_failsoft_returns_empty_on_error(self, client):
        """Scrape raising → still 200 with [] (fail-soft preserved under auth)."""
        async def _boom(_query):
            raise RuntimeError("provider down")

        with patch("src.routes.listings.scrape_listings", _boom):
            r = client.post(
                "/v1/listings",
                json={"ville": "Lyon"},
                headers=_headers(jwt=_internal_jwt()),
            )
        assert r.status_code == 200
        assert r.json() == {"listings": []}
