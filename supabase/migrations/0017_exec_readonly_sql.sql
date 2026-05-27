-- RPC consommée par le tool `sql_query` du cockpit-agent Kimi.
-- Lecture seule, SECURITY INVOKER (RLS appliquée), résultat JSONB borné à 500 lignes.
-- Réservée aux utilisateurs authentifiés.

create or replace function public.exec_readonly_sql(q text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if q ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|comment)\M' then
    raise exception 'exec_readonly_sql: seul SELECT/WITH/EXPLAIN est autorisé';
  end if;
  if position(';' in trim(trailing ';' from q)) > 0 then
    raise exception 'exec_readonly_sql: une seule requête par appel';
  end if;

  set transaction read only;

  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || q || ' limit 500) t'
    into result;

  return result;
end;
$$;

revoke all on function public.exec_readonly_sql(text) from public;
grant execute on function public.exec_readonly_sql(text) to authenticated;

comment on function public.exec_readonly_sql(text) is
  'Lecture seule pour le cockpit-agent Kimi. SELECT/WITH/EXPLAIN uniquement, ≤500 lignes, RLS appliquée (INVOKER).';
