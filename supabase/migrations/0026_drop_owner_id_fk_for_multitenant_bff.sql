-- =====================================================================
-- 0026 — Drop owner_id FK to auth.users on swarms & tools
-- =====================================================================
-- WHY: crewai-engine is a multi-tenant BFF. Client front-ends (e.g.
-- real-estate-agent) pass their OWN tenant owner_id, which lives in the
-- CLIENT's Supabase, not in this engine's auth.users. The FK
-- swarms_owner_id_fkey -> auth.users(id) made POST /v1/swarms fail with
-- 23503 (foreign key violation) for any owner_id absent from engine auth,
-- surfaced as a generic 500 "Supabase unavailable or insert failed".
-- swarm_runs has NO such FK (no owner_id column at all), which is why
-- kickoff/runs worked while create_swarm failed.
--
-- The owner_id COLUMN and its index are kept: app-level tenant scoping via
-- .eq("owner_id", ...) in swarm_store is unchanged. No data is deleted.
--
-- Rollback:
--   ALTER TABLE public.swarms ADD CONSTRAINT swarms_owner_id_fkey
--     FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--   ALTER TABLE public.tools  ADD CONSTRAINT tools_owner_id_fkey
--     FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- =====================================================================

alter table public.swarms drop constraint if exists swarms_owner_id_fkey;
alter table public.tools  drop constraint if exists tools_owner_id_fkey;
