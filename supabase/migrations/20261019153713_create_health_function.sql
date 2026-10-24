-- EZD-004a Step 3 (vault/plans/EZD-004a.md): public.health() returns 'ok' and the newest applied
-- migration version. No table; execute granted to anon and authenticated only.
create function public.health()
returns table (status text, schema_version text)
language sql stable security definer set search_path = ''
as $$
  select 'ok'::text, max(version)::text from supabase_migrations.schema_migrations
$$;
revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated;
