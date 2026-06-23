"""Pytest configuration for crewai-engine tests.

Sets the minimum required environment variables before any src module is
imported. CREWAI_ENGINE_AUTH_TOKEN is required (min_length=32) by Settings —
without this the pydantic validation fails at import time.

All other secrets default to empty strings in Settings, so tests can override
them per-module via unittest.mock.patch as needed.
"""
from __future__ import annotations

import os

# Must be set before any src.* import triggers config.py → Settings().
# Value is a dummy 32-char hex string valid only in tests.
os.environ.setdefault(
    "CREWAI_ENGINE_AUTH_TOKEN",
    "00000000000000000000000000000000",  # 32 hex chars — satisfies min_length=32
)

# Secret de signature du JWT interne BFF → Engine (valeur de test uniquement).
os.environ.setdefault(
    "CREWAI_ENGINE_JWT_SECRET",
    "test-internal-jwt-secret-please-rotate-0123456789",
)

# Fallback query-param owner_id : activé EN TEST seulement pour que les tests
# de logique métier existants (qui passent ?owner_id=) continuent de tourner
# sans devoir signer un JWT à chaque requête. Dev/test-only, OFF par défaut hors
# tests, fail-closed en production (cf src/security/internal_auth.py). Les tests
# de sécurité (test_internal_auth.py) le désactivent explicitement pour prouver
# le contrat JWT (no-JWT → 401).
os.environ.setdefault("CREWAI_ENGINE_ALLOW_LEGACY_OWNER_QUERY_FOR_TESTS", "true")
