"""Tests — outil ask_human (Human-in-the-loop).

Couvre : retour mémoïsé au resume, pause + abort BaseException à la 1ʳᵉ
rencontre, normalisation des options. Aucun appel LLM/DB réel (swarm_store mocké).
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from src.tools.ask_human import AskHumanTool, HumanDecisionRequired, _normalize_options


class TestAskHumanMemoized:
    def test_returns_memoized_value_without_pausing(self):
        """Si la décision pour cet ordinal est déjà tranchée → renvoie la value."""
        tool = AskHumanTool(run_id="run-1", ordinal=2, hitl_answers={"2": "premium"})
        with patch("src.tools.ask_human.swarm_store.pause_run_with_decision") as pause:
            out = tool._run("Quel ton ?", [{"value": "premium", "label": "Premium"}])
        assert out == "premium"
        pause.assert_not_called()

    def test_memoized_lookup_is_ordinal_scoped(self):
        """Une réponse pour un autre ordinal ne doit PAS être consommée."""
        tool = AskHumanTool(run_id="run-1", ordinal=3, hitl_answers={"2": "premium"})
        with patch(
            "src.tools.ask_human.swarm_store.pause_run_with_decision",
            return_value="dec_abc",
        ):
            with pytest.raises(HumanDecisionRequired):
                tool._run("Q ?", [{"value": "a", "label": "A"}])


class TestAskHumanPause:
    def test_pauses_and_raises_on_first_encounter(self):
        tool = AskHumanTool(run_id="run-1", ordinal=0, hitl_answers={})
        with patch(
            "src.tools.ask_human.swarm_store.pause_run_with_decision",
            return_value="dec_xyz",
        ) as pause:
            with pytest.raises(HumanDecisionRequired) as exc:
                tool._run(
                    "Quel ton pour les messages ?",
                    [
                        {"value": "premium", "label": "Premium", "sub": "haut de gamme"},
                        {"value": "direct", "label": "Direct"},
                    ],
                    hint="Tu pourras changer après.",
                )
        assert exc.value.decision_id == "dec_xyz"
        assert exc.value.ordinal == 0
        # La payload persistée contient question + options normalisées + hint.
        _args, kwargs = pause.call_args
        assert kwargs["run_id"] == "run-1"
        assert kwargs["ordinal"] == 0
        payload = kwargs["payload"]
        assert payload["question"].startswith("Quel ton")
        assert payload["hint"] == "Tu pourras changer après."
        assert payload["options"][0] == {"value": "premium", "label": "Premium", "sub": "haut de gamme"}

    def test_human_decision_required_is_base_exception(self):
        """Doit hériter de BaseException (pas Exception) — sinon CrewAI l'avale."""
        assert issubclass(HumanDecisionRequired, BaseException)
        assert not issubclass(HumanDecisionRequired, Exception)


class TestNormalizeOptions:
    def test_drops_entries_without_value(self):
        out = _normalize_options([{"label": "x"}, {"value": "a", "label": "A"}])
        assert out == [{"value": "a", "label": "A"}]

    def test_label_defaults_to_value(self):
        out = _normalize_options([{"value": "a"}])
        assert out == [{"value": "a", "label": "a"}]

    def test_keeps_sub_when_present(self):
        out = _normalize_options([{"value": "a", "label": "A", "sub": "s"}])
        assert out[0]["sub"] == "s"

    def test_raises_when_no_valid_option(self):
        with pytest.raises(ValueError):
            _normalize_options([])
        with pytest.raises(ValueError):
            _normalize_options([{"label": "no value"}])
