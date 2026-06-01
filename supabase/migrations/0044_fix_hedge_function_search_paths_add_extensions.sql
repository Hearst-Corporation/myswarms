-- Fix search_path pour les 6 fonctions HEDGE : ajoute `extensions` afin que
-- pgcrypto (digest()) soit résolu correctement.
-- Migration : fix_hedge_function_search_paths_add_extensions

alter function public.hedge_chain_hash(text, jsonb) set search_path = pg_catalog, public, extensions;
alter function public.hedge_canonical_json(jsonb)   set search_path = pg_catalog, public, extensions;
alter function public.hedge_block_mutation()        set search_path = pg_catalog, public, extensions;
alter function public.hedge_is_blocked(uuid, text)  set search_path = pg_catalog, public, extensions;
alter function public.hedge_exec_outbox_touch()     set search_path = pg_catalog, public, extensions;
alter function public.hedge_run_jobs_touch()        set search_path = pg_catalog, public, extensions;
