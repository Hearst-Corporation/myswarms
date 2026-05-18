-- Migration 0013 : fix RLS pour swarm_agents et swarm_tasks liés aux templates
-- Permet la lecture des agents/tâches liés à un swarm template (owner_id IS NULL, is_template=true)
-- par tout utilisateur authentifié.
-- Pattern identique à "swarms_templates_readable" de la migration 0006.

drop policy if exists "swarm_agents_templates_readable" on public.swarm_agents;
create policy "swarm_agents_templates_readable"
  on public.swarm_agents
  for select
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_agents.swarm_id
        and s.is_template = true
        and s.owner_id is null
    )
  );

drop policy if exists "swarm_tasks_templates_readable" on public.swarm_tasks;
create policy "swarm_tasks_templates_readable"
  on public.swarm_tasks
  for select
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tasks.swarm_id
        and s.is_template = true
        and s.owner_id is null
    )
  );
