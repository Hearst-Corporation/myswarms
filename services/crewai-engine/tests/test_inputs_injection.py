"""Test — _render_inputs_block bornage défensif + injection racine-only.

Valide deux propriétés fondamentales :

  A. _render_inputs_block
     - exclusion des clés méta (swarm_id, run_id, trigger, owner_id)
     - inclusion des clés véhicule (make, model, …)
     - strip des accolades (neutralise l'interpolation CrewAI .format)
     - retourne '' pour None et {}
     - bornage : valeur > _INPUT_VALUE_MAX_CHARS → tronquée + '…'
     - bornage : au plus _INPUT_MAX_LINES lignes

  B. instantiate_tasks — injection racine uniquement (anti-hallucination + anti-hang)
     - la task racine (sans depends_on) reçoit le bloc dans sa description
     - la task child (avec depends_on) ne reçoit PAS le bloc
     - avec inputs_block="" aucune task n'est modifiée

Aucun appel LLM / réseau : on construit Agent + Task (la construction
crewai ne déclenche aucun appel HTTP tant qu'on ne kickoff pas le Crew).
"""
from __future__ import annotations

from crewai import Agent, LLM, Task

from src.crews.dynamic_crew import (
    _INPUT_MAX_LINES,
    _INPUT_VALUE_MAX_CHARS,
    _render_inputs_block,
    instantiate_tasks,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _fake_llm() -> LLM:
    """Instance LLM déclarative uniquement — aucun appel réseau au build."""
    return LLM(model="openai/kimi-k2.6", base_url="http://fake-local", api_key="fake-key")


def _make_agent(name: str) -> Agent:
    """Construit un Agent minimal sans déclencher d'appel LLM."""
    return Agent(
        role=name,
        goal=f"Goal of {name}",
        backstory=f"Backstory of {name}",
        llm=_fake_llm(),
    )


# ── Section A : _render_inputs_block ─────────────────────────────────────────


class TestRenderInputsBlock:
    """Comportement de _render_inputs_block."""

    def _fn(self, inputs):
        return _render_inputs_block(inputs)

    # --- happy-path : inclus vs exclus ---

    def test_excludes_meta_keys(self):
        """swarm_id, run_id, trigger, owner_id sont absents du bloc."""
        result = self._fn({
            "swarm_id": "s-1",
            "run_id": "r-1",
            "trigger": "manual",
            "owner_id": "u-1",
            "make": "BMW",
        })
        assert "swarm_id" not in result
        assert "run_id" not in result
        assert "trigger" not in result
        assert "owner_id" not in result

    def test_includes_vehicle_keys(self):
        """Les clés véhicule courantes sont présentes dans le bloc."""
        result = self._fn({"make": "BMW", "model": "330d", "year": "2023"})
        assert "make" in result
        assert "BMW" in result
        assert "model" in result
        assert "330d" in result

    # --- strip accolades ---

    def test_strips_curly_braces(self):
        """Les accolades { et } sont neutralisées pour ne pas casser .format."""
        result = self._fn({"notes": "valeur {avec} accolades {multiples}"})
        assert "{" not in result
        assert "}" not in result
        assert "valeur" in result  # le contenu reste

    # --- retour vide ---

    def test_returns_empty_for_none(self):
        assert self._fn(None) == ""

    def test_returns_empty_for_empty_dict(self):
        assert self._fn({}) == ""

    def test_returns_empty_when_only_meta_keys(self):
        """Un dict qui ne contient que des clés méta produit ''."""
        result = self._fn({"swarm_id": "s", "run_id": "r", "owner_id": "u"})
        assert result == ""

    # --- bornage valeur ---

    def test_long_value_is_truncated(self):
        """Une valeur > _INPUT_VALUE_MAX_CHARS est tronquée avec '…'."""
        long_val = "x" * (_INPUT_VALUE_MAX_CHARS + 50)
        result = self._fn({"notes": long_val})
        assert "…" in result
        # La valeur dans la ligne ne dépasse pas max + marge (clé + ": " + val + ellipsis)
        line = [ln for ln in result.splitlines() if "notes" in ln][0]
        value_part = line.split(": ", 1)[1]
        assert len(value_part) <= _INPUT_VALUE_MAX_CHARS + 1  # +1 pour le caractère '…'

    def test_short_value_not_truncated(self):
        """Une valeur courte (make/model) n'est pas tronquée."""
        short_val = "BMW"
        assert len(short_val) < _INPUT_VALUE_MAX_CHARS  # pré-condition
        result = self._fn({"make": short_val})
        assert "…" not in result
        assert "BMW" in result

    # --- bornage nombre de lignes ---

    def test_max_lines_cap(self):
        """Au plus _INPUT_MAX_LINES paires sont rendues même avec beaucoup d'inputs."""
        many_inputs = {f"key_{i}": f"val_{i}" for i in range(_INPUT_MAX_LINES + 10)}
        result = self._fn(many_inputs)
        # Compter les lignes commençant par "- "
        data_lines = [ln for ln in result.splitlines() if ln.startswith("- ")]
        assert len(data_lines) <= _INPUT_MAX_LINES

    # --- format préservé ---

    def test_header_present(self):
        """L'en-tête de section est toujours présent quand il y a des données."""
        result = self._fn({"make": "Peugeot"})
        assert "## DONNÉES FOURNIES POUR CETTE ANALYSE" in result

    def test_line_format(self):
        """Chaque ligne de valeur suit le format '- key: value'."""
        result = self._fn({"make": "Tesla", "model": "Model 3"})
        assert "- make: Tesla" in result
        assert "- model: Model 3" in result

    # --- P1 : frontières exactes de troncature ---

    def test_value_at_exact_max_chars_not_truncated(self):
        """Valeur de longueur EXACTEMENT _INPUT_VALUE_MAX_CHARS → PAS tronquée."""
        exact_val = "y" * _INPUT_VALUE_MAX_CHARS
        result = self._fn({"notes": exact_val})
        assert "…" not in result
        assert exact_val in result

    def test_value_at_max_chars_plus_one_truncated(self):
        """Valeur de longueur _INPUT_VALUE_MAX_CHARS + 1 → tronquée avec '…'."""
        over_val = "z" * (_INPUT_VALUE_MAX_CHARS + 1)
        result = self._fn({"notes": over_val})
        assert "…" in result

    # --- P2 : valeurs numériques brutes ---

    def test_numeric_values_rendered_as_str(self):
        """Valeurs numériques (int/float) → str(value) appliqué correctement."""
        result = self._fn({"year": 2023, "price_eur": 19990.5, "mileage_km": 145000})
        assert "- year: 2023" in result
        assert "- price_eur: 19990.5" in result
        assert "- mileage_km: 145000" in result

    # --- P3 : cap-lines adversarial ---

    def test_meta_keys_before_real_key_do_not_eat_lines(self):
        """Les clés méta ne consomment pas de slot du cap _INPUT_MAX_LINES —
        12 vraies clés survivent malgré 4 méta intercalées.

        Discriminant : on injecte EXACTEMENT _INPUT_MAX_LINES vraies clés (k_0..k_11)
        + les 4 clés méta. Si le cap comptait les méta comme des slots, certaines
        vraies clés tardives (ex: k_11) seraient coupées et on obtiendrait < 12 lignes.
        """
        inputs = {
            "swarm_id": "s-1",
            "run_id": "r-1",
            "trigger": "manual",
            "owner_id": "u-1",
            **{f"k_{i}": f"v_{i}" for i in range(_INPUT_MAX_LINES)},
        }
        result = self._fn(inputs)
        data_lines = [ln for ln in result.splitlines() if ln.startswith("- ")]
        assert len(data_lines) == _INPUT_MAX_LINES
        # La clé tardive k_11 doit être présente — elle serait absente si les méta
        # consommaient des slots (cap 12 - 4 méta = 8 slots → k_8..k_11 coupées)
        assert f"k_{_INPUT_MAX_LINES - 1}" in result

    def test_many_real_keys_capped_at_max_lines(self):
        """Avec > _INPUT_MAX_LINES vraies clés, au plus _INPUT_MAX_LINES lignes '- ' rendues."""
        many_inputs = {f"key_{i}": f"val_{i}" for i in range(_INPUT_MAX_LINES + 20)}
        result = self._fn(many_inputs)
        data_lines = [ln for ln in result.splitlines() if ln.startswith("- ")]
        assert len(data_lines) <= _INPUT_MAX_LINES


# ── Section B : instantiate_tasks — injection racine uniquement ───────────────


class TestInstantiateTasksInjection:
    """Injection du bloc inputs UNIQUEMENT dans la task racine (sans depends_on)."""

    _AGENT_ROOT_ID = "agent-root"
    _AGENT_CHILD_ID = "agent-child"
    _TASK_ROOT_ID = "task-root"
    _TASK_CHILD_ID = "task-child"
    _ROOT_DESC = "Collecte les données du véhicule."
    _CHILD_DESC = "Analyse les données collectées."
    _BLOC = "\n\nBLOC_TEST_VEHICULE"

    def _build_config(self):
        """swarm_config minimal : 2 tasks (root sans depends_on, child avec)."""
        return {
            "tasks": [
                {
                    "id": self._TASK_ROOT_ID,
                    "agent_id": self._AGENT_ROOT_ID,
                    "description": self._ROOT_DESC,
                    "expected_output": "Résultat root",
                    "depends_on_task_id": None,
                },
                {
                    "id": self._TASK_CHILD_ID,
                    "agent_id": self._AGENT_CHILD_ID,
                    "description": self._CHILD_DESC,
                    "expected_output": "Résultat child",
                    "depends_on_task_id": self._TASK_ROOT_ID,
                },
            ]
        }

    def _build_agents_map(self):
        return {
            self._AGENT_ROOT_ID: _make_agent("Root Agent"),
            self._AGENT_CHILD_ID: _make_agent("Child Agent"),
        }

    def test_root_task_contains_bloc(self):
        """La task racine (sans depends_on) intègre le bloc dans sa description."""
        pairs = instantiate_tasks(
            self._build_agents_map(),
            self._build_config(),
            inputs_block=self._BLOC,
        )
        root_task = next(
            task for meta, task in pairs if meta["task_id"] == self._TASK_ROOT_ID
        )
        assert "BLOC_TEST_VEHICULE" in root_task.description

    def test_child_task_does_not_contain_bloc(self):
        """La task child (avec depends_on) ne reçoit PAS le bloc — anti-hang prod."""
        pairs = instantiate_tasks(
            self._build_agents_map(),
            self._build_config(),
            inputs_block=self._BLOC,
        )
        child_task = next(
            task for meta, task in pairs if meta["task_id"] == self._TASK_CHILD_ID
        )
        assert "BLOC_TEST_VEHICULE" not in child_task.description

    def test_empty_bloc_leaves_descriptions_unchanged(self):
        """Avec inputs_block='', aucune task n'est modifiée."""
        pairs = instantiate_tasks(
            self._build_agents_map(),
            self._build_config(),
            inputs_block="",
        )
        desc_by_id = {meta["task_id"]: task.description for meta, task in pairs}
        assert desc_by_id[self._TASK_ROOT_ID] == self._ROOT_DESC
        assert desc_by_id[self._TASK_CHILD_ID] == self._CHILD_DESC

    def test_both_tasks_instantiated(self):
        """Les deux tasks sont bien instanciées (pas de skip inattendu)."""
        pairs = instantiate_tasks(
            self._build_agents_map(),
            self._build_config(),
            inputs_block=self._BLOC,
        )
        ids = {meta["task_id"] for meta, _ in pairs}
        assert self._TASK_ROOT_ID in ids
        assert self._TASK_CHILD_ID in ids

    def test_all_tasks_are_task_instances(self):
        """Chaque élément retourné est bien un objet crewai.Task."""
        pairs = instantiate_tasks(
            self._build_agents_map(),
            self._build_config(),
            inputs_block=self._BLOC,
        )
        for _meta, task in pairs:
            assert isinstance(task, Task)
