-- =====================================================================
-- 0031 — Fusion des policies SELECT permissives dupliquées (advisor perf
--        multiple_permissive_policies) sur swarms / swarm_agents / swarm_tasks
--        / tools.
-- =====================================================================
-- Avant : 1 policy FOR ALL (owner) + 1 policy FOR SELECT (templates/global) →
-- 2 policies permissives évaluées à CHAQUE SELECT.
-- Après : 1 SELECT (owner OR template) + INSERT/UPDATE/DELETE owner-only.
-- Sémantique strictement identique (les permissives sont OR'd ; les templates
-- étaient déjà SELECT-only). auth.uid() sous-requêté (initplan, déjà en place).
-- NB : l'initplan auth.uid()→(select auth.uid()) signalé par l'audit était
-- DÉJÀ appliqué en base (advisor 0 lint) — non touché ici.
-- =====================================================================

-- ── swarms ──────────────────────────────────────────────────────────
drop policy if exists swarms_owner_all on public.swarms;
drop policy if exists swarms_templates_readable on public.swarms;
create policy swarms_select on public.swarms for select to public
  using (owner_id = (select auth.uid()) or (is_template = true and owner_id is null));
create policy swarms_insert on public.swarms for insert to public
  with check (owner_id = (select auth.uid()));
create policy swarms_update on public.swarms for update to public
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy swarms_delete on public.swarms for delete to public
  using (owner_id = (select auth.uid()));

-- ── tools (global = owner_id IS NULL) ───────────────────────────────
drop policy if exists tools_owner_all on public.tools;
drop policy if exists tools_global_read on public.tools;
create policy tools_select on public.tools for select to public
  using (owner_id = (select auth.uid()) or owner_id is null);
create policy tools_insert on public.tools for insert to public
  with check (owner_id = (select auth.uid()));
create policy tools_update on public.tools for update to public
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy tools_delete on public.tools for delete to public
  using (owner_id = (select auth.uid()));

-- ── swarm_agents (parent swarm) ─────────────────────────────────────
drop policy if exists swarm_agents_owner_all on public.swarm_agents;
drop policy if exists swarm_agents_templates_readable on public.swarm_agents;
create policy swarm_agents_select on public.swarm_agents for select to public
  using (exists (select 1 from swarms s where s.id = swarm_agents.swarm_id
    and (s.owner_id = (select auth.uid()) or (s.is_template = true and s.owner_id is null))));
create policy swarm_agents_insert on public.swarm_agents for insert to public
  with check (exists (select 1 from swarms s where s.id = swarm_agents.swarm_id and s.owner_id = (select auth.uid())));
create policy swarm_agents_update on public.swarm_agents for update to public
  using (exists (select 1 from swarms s where s.id = swarm_agents.swarm_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from swarms s where s.id = swarm_agents.swarm_id and s.owner_id = (select auth.uid())));
create policy swarm_agents_delete on public.swarm_agents for delete to public
  using (exists (select 1 from swarms s where s.id = swarm_agents.swarm_id and s.owner_id = (select auth.uid())));

-- ── swarm_tasks (parent swarm) ──────────────────────────────────────
drop policy if exists swarm_tasks_owner_all on public.swarm_tasks;
drop policy if exists swarm_tasks_templates_readable on public.swarm_tasks;
create policy swarm_tasks_select on public.swarm_tasks for select to public
  using (exists (select 1 from swarms s where s.id = swarm_tasks.swarm_id
    and (s.owner_id = (select auth.uid()) or (s.is_template = true and s.owner_id is null))));
create policy swarm_tasks_insert on public.swarm_tasks for insert to public
  with check (exists (select 1 from swarms s where s.id = swarm_tasks.swarm_id and s.owner_id = (select auth.uid())));
create policy swarm_tasks_update on public.swarm_tasks for update to public
  using (exists (select 1 from swarms s where s.id = swarm_tasks.swarm_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from swarms s where s.id = swarm_tasks.swarm_id and s.owner_id = (select auth.uid())));
create policy swarm_tasks_delete on public.swarm_tasks for delete to public
  using (exists (select 1 from swarms s where s.id = swarm_tasks.swarm_id and s.owner_id = (select auth.uid())));
