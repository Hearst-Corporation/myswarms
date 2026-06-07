-- 0030 — Index couvrant la FK tenant_members.tenant_id (advisor unindexed_foreign_keys).
-- Le lookup inverse (membres d'un tenant) et les CASCADE de tenants→members
-- bénéficient de cet index. tenant_members_owner_idx (0027) couvre déjà owner_id.
create index if not exists tenant_members_tenant_idx
  on public.tenant_members (tenant_id);
