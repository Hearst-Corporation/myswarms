-- 0021_tenant_config
-- Pilotage de l'interface par tenant (owner) — niveau 2 multi-tenant UI.
-- modules = liste des modules de navigation visibles pour ce tenant.
-- product = accent Cockpit (hive|halo|hyper|hustle|default) pour le futur niveau 1.

CREATE TABLE IF NOT EXISTS public.tenant_config (
  owner_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  modules     TEXT[]      NOT NULL DEFAULT ARRAY['accueil','swarms','automobile'],
  product     TEXT        NOT NULL DEFAULT 'hive',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;

-- Owner lit UNIQUEMENT sa propre config. Les écritures passent par le service
-- role (admin), qui bypass RLS — un tenant ne peut pas s'auto-octroyer des
-- modules. (select auth.uid()) = pattern initplan-optimisé.
CREATE POLICY tenant_config_select_own ON public.tenant_config
  FOR SELECT USING (owner_id = (select auth.uid()));
