-- Migration 0022 : policy de lecture pour les tools globaux (owner_id IS NULL).
--
-- La policy existante "tools_owner_all" (auth.uid() = owner_id) bloque toute
-- lecture d'un tool dont owner_id IS NULL. Cette nouvelle policy SELECT permet
-- à tout utilisateur authentifié de lire les tools globaux — outils partagés
-- comme AutoScout24 Sourcing qui n'appartiennent à aucun owner spécifique.
--
-- La policy d'écriture (INSERT/UPDATE/DELETE) reste strictement scopée à
-- owner_id = auth.uid() via "tools_owner_all".

CREATE POLICY tools_global_read ON tools
  FOR SELECT
  USING (owner_id IS NULL);
