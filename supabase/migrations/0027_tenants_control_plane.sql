-- =====================================================================
-- 0027 — Control-plane tenants (niveau 1 multi-produit)
-- =====================================================================
-- MySwarms = backend/control-plane. Chaque PRODUIT a SA propre Supabase
-- (supabase_ref) ; NULL = natif MySwarms. Ce registre fédère les DB
-- existantes (refs vérifiés 2026-06-07) — aucune nouvelle DB créée.
-- Niveau 2 (tenant_config, par-user) reste en place et override le niveau 1.
-- =====================================================================

create table if not exists public.tenants (
  id           text primary key,                  -- 'hive' | 'hedge' | 'automobile' | 'real-estate'
  name         text not null,
  supabase_ref text,                              -- ref DB produit ; NULL = natif MySwarms
  product      text not null default 'hive',      -- accent Cockpit (hive|halo|hyper|hustle|automobile|default)
  modules      text[] not null default array['accueil','workspace','swarms','crews','tools','automobile'],
  status       text not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.tenant_members (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  tenant_id  text not null references public.tenants(id) on delete cascade,
  role       text not null default 'member',      -- owner | admin | member
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner_id, tenant_id)
);
create index if not exists tenant_members_owner_idx on public.tenant_members(owner_id);

alter table public.tenants        enable row level security;
alter table public.tenant_members enable row level security;

-- Un user lit UNIQUEMENT les tenants dont il est membre. Écritures = service_role
-- (admin BFF) qui bypass RLS — un tenant ne peut pas s'auto-enregistrer.
-- (select auth.uid()) = pattern initplan-optimisé.
create policy tenants_select_member on public.tenants
  for select using (
    id in (select tenant_id from public.tenant_members where owner_id = (select auth.uid()))
  );

create policy tenant_members_select_own on public.tenant_members
  for select using (owner_id = (select auth.uid()));

-- Seed des 4 produits réels (1 Supabase par produit, refs vérifiés via MCP)
insert into public.tenants (id, name, supabase_ref, product, modules) values
  ('hive',        'Hive (MySwarms natif)', null,                   'hive',       array['accueil','workspace','swarms','crews','tools','automobile']),
  ('automobile',  'APM / Automobile',      'ipgqjrsvcqqmnihasxae', 'automobile', array['accueil','automobile']),
  ('hedge',       'Hedge',                 'oblwrgtfjkqixakuunaj', 'default',    array['accueil','swarms']),
  ('real-estate', 'Real-estate Agent',     'pyxhhkdjirqambhlpuqz', 'default',    array['accueil','swarms'])
on conflict (id) do update set
  name = excluded.name, supabase_ref = excluded.supabase_ref,
  product = excluded.product, modules = excluded.modules, updated_at = now();

-- Rattache les users existants au tenant natif 'hive' (par défaut)
insert into public.tenant_members (owner_id, tenant_id, role, is_default)
select id, 'hive', 'owner', true from auth.users
on conflict (owner_id, tenant_id) do nothing;
