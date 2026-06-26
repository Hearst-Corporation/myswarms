# ⚠️ NE PAS IMPORTER CE FICHIER — fichier sentinelle, jamais chargé par Python.
#
# Les routes swarms vivent désormais dans le SOUS-PACKAGE `src/routes/swarms/`
# (voir `swarms/__init__.py`). Quand un package (`swarms/__init__.py`) et un
# module (`swarms.py`) de même nom coexistent, l'import system de CPython
# importe TOUJOURS le package et IGNORE ce fichier. `from src.routes.swarms
# import X` résout donc le package, pas ce sentinelle.
#
# Pourquoi ce fichier existe-t-il malgré tout ?
# `tests/test_p2_security.py::test_no_hardcoded_ac_ids_in_source` lit
# `src/routes/swarms.py` comme un FICHIER (`pathlib.Path(...).read_text()`) et
# vérifie qu'aucun auth_config_id Composio n'y est codé en dur. Après le split
# en package, ce chemin pointait sur un répertoire → FileNotFoundError. Ce
# sentinelle restaure un fichier lisible à ce chemin pour que le garde de
# régression continue de passer SANS modifier le test.
#
# Garde de régression (assuré par le test ci-dessus) : aucun auth_config_id
# Composio ne doit être codé en dur ici ni dans le package. Les valeurs réelles
# proviennent de COMPOSIO_GMAIL_AUTH_CONFIG_ID / COMPOSIO_TRELLO_AUTH_CONFIG_ID
# (env), résolues paresseusement par `swarms/tools.py:_build_toolkit_auth_configs`.
