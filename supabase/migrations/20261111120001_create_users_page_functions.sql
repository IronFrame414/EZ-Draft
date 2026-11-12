-- EZD-104 Build step 1 (vault/plans/EZD-104.md section 1 "Database functions"; Q-0695; Q-0706): the Users
-- page functions.
-- list_users: one page of 50 active and invited members (active first, then invited; by lower(name or
-- email), then id) with each row's role, granted switches and times, the company counts (never filtered by
-- the search) and canCopyLink (an invited row, viewer holds the Owner preset; EZD-105a adds the last-sender
-- half). Invoker, so RLS limits every table to the claim tenant. Search is a trimmed, case-insensitive
-- substring of name or email, with \ % _ matched literally (as list_customers).
-- touch_last_active: moves the caller's own active membership.last_active_at at most once per 15 minutes
-- (Q-0695, 03-data-model row 34); a concurrent second request waits on the row lock, re-checks and writes
-- nothing. Definer behind the API request gate (L-016); both are listed in GATED_RPC_CALLS
-- (app/test-harness/rls/gate.ts).
create function public.list_users(p_search text, p_page integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with viewer as (
    select exists (
      select 1 from public.membership vm
      join public.role vr on vr.id = vm.role_id and vr.tenant_id = vm.tenant_id
      where vm.id = nullif(auth.jwt() ->> 'membership_id', '')::uuid
        and vm.status = 'active'
        and vr.preset = 'owner'
    ) as is_owner
  ),
  term as (
    select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t
  ),
  base as (
    select m.id, m.status, m.last_active_at, m.invited_at, u.name, u.email, u.language,
      r.id as role_id, r.name as role_name, r.preset as role_preset,
      r.default_permissions as role_defaults
    from public.membership m
    join public.app_user u on u.id = m.user_id
    left join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
    where m.status in ('active', 'invited')
  ),
  filtered as (
    select b.* from base b, term
    where term.t = ''
      or coalesce(b.name, '') ilike '%' || term.t || '%'
      or b.email ilike '%' || term.t || '%'
  ),
  page as (
    select f.* from filtered f
    order by (f.status <> 'active'), lower(coalesce(nullif(btrim(f.name), ''), f.email)), f.id
    limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50
  ),
  grants as (
    select p.membership_id, array_agg(p.permission_key order by p.permission_key) as keys
    from public.user_permission p
    where p.granted and p.membership_id in (select id from page)
    group by p.membership_id
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'membershipId', pg.id,
        'status', pg.status,
        'name', pg.name,
        'email', pg.email,
        'language', pg.language,
        'role', case when pg.role_id is null then null else jsonb_build_object(
          'name', pg.role_name, 'preset', pg.role_preset,
          'defaultPermissions', to_jsonb(pg.role_defaults)) end,
        'grantedKeys', to_jsonb(coalesce(g.keys, '{}'::text[])),
        'lastActiveAt', pg.last_active_at,
        'invitedAt', pg.invited_at,
        'canCopyLink', pg.status = 'invited' and (select is_owner from viewer))
      order by (pg.status <> 'active'), lower(coalesce(nullif(btrim(pg.name), ''), pg.email)), pg.id)
      from page pg left join grants g on g.membership_id = pg.id), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'active', (select count(*) from base where status = 'active'),
    'invited', (select count(*) from base where status = 'invited'),
    'en', (select count(*) from base where language = 'en'),
    'es', (select count(*) from base where language = 'es'));
$$;
revoke all on function public.list_users(text, integer) from public, anon, service_role;
grant execute on function public.list_users(text, integer) to authenticated;

create function public.touch_last_active()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
  v_tenant uuid;
  v_count integer;
begin
  perform private.require_api_gate();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  if v_membership is null or v_tenant is null or not private.session_is_live() then
    return false;
  end if;

  update public.membership m
  set last_active_at = now()
  where m.id = v_membership
    and m.tenant_id = v_tenant
    and m.status = 'active'
    and (m.last_active_at is null or m.last_active_at < now() - interval '15 minutes');
  get diagnostics v_count = row_count;
  return v_count > 0;
end
$$;

revoke all on function public.touch_last_active() from public, anon, service_role;
grant execute on function public.touch_last_active() to authenticated;
