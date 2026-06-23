"""Garde (R2) — les routes ne lisent JAMAIS les tables P0 sans owner-scope.

Analyse AST des fichiers de routes : aucun appel direct aux fonctions de store
owner-scopées (`swarm_store.get_swarm`, `get_swarm_run`, `list_swarm_runs`,
`list_swarms`, `list_tools` ; `run_store.get_run`, `list_runs`). Toute lecture
owner-scopée doit passer par `ScopedSwarmStore` / `ScopedChiefStore`.

But : rendre un oubli de filtre owner détectable au CI plutôt qu'en prod.
Les écritures (`save_swarm_run`, `create_swarm`, `replace_*`, `save_run`,
`update_run`…) restent autorisées (elles utilisent l'identité JWT vérifiée) et
ne sont pas dans la liste interdite. Les lectures sans param owner et
post-validation (`list_run_steps`, `get_active_decision`, `get_decision_by_id`)
ne sont pas interdites — elles ne sont atteintes qu'après validation du run parent.
"""
from __future__ import annotations

import ast
import pathlib

_ROUTES_DIR = pathlib.Path(__file__).resolve().parents[1] / "src" / "routes"

# module → noms de fonctions de LECTURE owner-scopées interdites en accès direct.
_FORBIDDEN = {
    "swarm_store": {
        "get_swarm",
        "list_swarms",
        "get_swarm_run",
        "list_swarm_runs",
        "list_tools",
    },
    "run_store": {"get_run", "list_runs"},
}

_GUARDED_FILES = ("swarms.py", "crews.py")


def _direct_unscoped_calls(path: pathlib.Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[str] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        target = node.func.value
        if (
            isinstance(target, ast.Name)
            and target.id in _FORBIDDEN
            and node.func.attr in _FORBIDDEN[target.id]
        ):
            found.append(f"{target.id}.{node.func.attr}() @L{node.lineno}")
    return found


def test_routes_have_no_direct_unscoped_reads():
    offenders = {}
    for fname in _GUARDED_FILES:
        path = _ROUTES_DIR / fname
        calls = _direct_unscoped_calls(path)
        if calls:
            offenders[fname] = calls
    assert not offenders, (
        "Lecture owner-scopée en accès DIRECT dans une route — "
        "utiliser ScopedSwarmStore / ScopedChiefStore : " + repr(offenders)
    )


def test_guard_actually_detects_violation(tmp_path):
    """Méta-test : la garde détecte bien un accès direct (anti-faux-négatif)."""
    bad = tmp_path / "bad_route.py"
    bad.write_text(
        "def h(identity):\n    return swarm_store.get_swarm_run('r', owner_id='x')\n",
        encoding="utf-8",
    )
    assert _direct_unscoped_calls(bad), "la garde devrait détecter swarm_store.get_swarm_run"
