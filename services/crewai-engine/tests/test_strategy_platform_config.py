"""Strategy Platform config — défauts des réglages engine → strategy-platform.

Vérifie les deux settings additifs (T4-config-strategy-url) :
  - STRATEGY_PLATFORM_URL : base API internes client (prod GPU1), défaut NON vide.
  - STRATEGY_PLATFORM_TOKEN : bearer optionnel, défaut "" (fail-soft, pas de header).
"""
from src.config import settings


def test_strategy_platform_url_default_non_empty():
    """La base URL a un défaut de prod utilisable (jamais vide)."""
    assert isinstance(settings.STRATEGY_PLATFORM_URL, str)
    assert settings.STRATEGY_PLATFORM_URL.strip() != ""


def test_strategy_platform_token_default_empty():
    """Le bearer est optionnel : vide par défaut (aucun header Authorization)."""
    assert settings.STRATEGY_PLATFORM_TOKEN == ""
