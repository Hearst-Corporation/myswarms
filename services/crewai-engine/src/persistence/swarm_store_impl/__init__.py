# Daily Chief of Staff — swarm_store implementation sub-package.
#
# Voir `src/persistence/swarm_store.py` (façade) : ce package contient
# l'implémentation splittée par domaine (H7), la façade ré-exporte tous les
# symboles publics + les privés patchés par les tests pour préserver la
# patchabilité externe (`patch.object(swarm_store, "X")`).
