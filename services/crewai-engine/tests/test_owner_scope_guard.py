"""Garde (R2) — les routes ne lisent NI n'écrivent les tables P0 sans owner-scope.

Analyse AST des fichiers de routes :
- LECTURES owner-scopées (`swarm_store.get_swarm/list_swarms/get_swarm_run/
  list_swarm_runs/list_tools` ; `run_store.get_run/list_runs`) : interdites en
  accès direct PARTOUT dans les fichiers de routes → via ScopedSwarmStore /
  ScopedChiefStore.
- ÉCRITURES P0 (`create_swarm/update_swarm/delete_swarm/replace_*/save_swarm_run/
  update_swarm_run/cas_pause_to_running/resolve_decision` ; `run_store.save_run/
  update_run`) : interdites en accès direct dans les HANDLERS DE ROUTE
  (fonctions décorées `@router.*`). Les fonctions internes/background
  (`_execute_*_background`, `_hydrate_swarm_children`) restent autorisées : elles
  opèrent sur un objet déjà créé/validé par le handler owner-scopé.

But : rendre un oubli de scope owner (read OU write) détectable au CI plutôt
qu'en prod, alors même que l'engine tourne en service_role (bypass RLS).
Les lectures post-validation sans param owner (`list_run_steps`,
`get_active_decision`, `get_decision_by_id`, `apply_resume_inputs`…) ne sont pas
interdites — elles ne sont atteintes qu'après validation du run parent.
"""
from __future__ import annotations

import ast
import pathlib

_ROUTES_DIR = pathlib.Path(__file__).resolve().parents[1] / "src" / "routes"
_GUARDED_FILES = ("swarms.py", "crews.py")

# Lectures owner-scopées — interdites en accès direct dans tout le fichier route.
_READ_FORBIDDEN = {
    "swarm_store": {"get_swarm", "list_swarms", "get_swarm_run", "list_swarm_runs", "list_tools"},
    "run_store": {"get_run", "list_runs"},
}

# Écritures P0 — interdites en accès direct dans les HANDLERS de route uniquement.
_WRITE_FORBIDDEN = {
    "swarm_store": {
        "create_swarm",
        "update_swarm",
        "delete_swarm",
        "replace_agents",
        "replace_tasks",
        "replace_tool_bindings",
        "save_swarm_run",
        "update_swarm_run",
        "cas_pause_to_running",
        "resolve_decision",
    },
    "run_store": {"save_run", "update_run"},
}


def _is_route_handler(node: ast.AST) -> bool:
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return False
    for dec in node.decorator_list:
        d = dec.func if isinstance(dec, ast.Call) else dec
        # @router.get(...) / @router.post(...) → Attribute(value=Name("router"))
        if isinstance(d, ast.Attribute) and isinstance(d.value, ast.Name) and d.value.id == "router":
            return True
    return False


def _matches(call: ast.Call, table: dict[str, set[str]]) -> str | None:
    func = call.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        mod, attr = func.value.id, func.attr
        if mod in table and attr in table[mod]:
            return f"{mod}.{attr}() @L{call.lineno}"
    return None


def _violations(path: pathlib.Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[str] = []
    # Lectures interdites — tout le fichier.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            hit = _matches(node, _READ_FORBIDDEN)
            if hit:
                out.append("read " + hit)
    # Écritures interdites — handlers de route uniquement.
    for node in ast.walk(tree):
        if _is_route_handler(node):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call):
                    hit = _matches(sub, _WRITE_FORBIDDEN)
                    if hit:
                        out.append("write " + hit)
    return out


def test_routes_have_no_direct_unscoped_reads_or_writes():
    offenders = {}
    for fname in _GUARDED_FILES:
        v = _violations(_ROUTES_DIR / fname)
        if v:
            offenders[fname] = v
    assert not offenders, (
        "Accès P0 non owner-scopé dans une route — utiliser ScopedSwarmStore / "
        "ScopedChiefStore : " + repr(offenders)
    )


def test_guard_detects_direct_read(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text("def h(i):\n    return swarm_store.get_swarm_run('r', owner_id='x')\n", encoding="utf-8")
    assert any("read" in v for v in _violations(bad))


def test_guard_detects_direct_write_in_route_handler(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text(
        "@router.post('/x')\n"
        "def h(i):\n"
        "    return swarm_store.update_swarm('s', {}, owner_id='x')\n",
        encoding="utf-8",
    )
    assert any("write" in v for v in _violations(bad))


def test_guard_allows_write_in_non_route_helper(tmp_path):
    """Une écriture dans une fonction interne (non décorée @router) est tolérée."""
    ok = tmp_path / "ok.py"
    ok.write_text(
        "async def _execute_background(rid):\n"
        "    swarm_store.update_swarm_run(rid, status='failed')\n",
        encoding="utf-8",
    )
    assert not any("write" in v for v in _violations(ok))
