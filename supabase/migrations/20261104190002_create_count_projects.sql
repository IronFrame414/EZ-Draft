-- EZD-117a Step 2 (vault/plans/EZD-117a.md M2): the Projects page tab counts from one grouped count.
-- Invoker, so RLS limits project to the claim tenant and the viewer's scope; archived projects are
-- never counted.
create function public.count_projects()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'all', count(*),
    'draft', count(*) filter (where p.status = 'draft'),
    'client_review', count(*) filter (where p.status = 'client_review'),
    'permit_submitted', count(*) filter (where p.status = 'permit_submitted'),
    'approved', count(*) filter (where p.status = 'approved'),
    'in_build', count(*) filter (where p.status = 'in_build'))
  from public.project p
  where p.archived_at is null;
$$;
revoke all on function public.count_projects() from public, anon, service_role;
grant execute on function public.count_projects() to authenticated;
