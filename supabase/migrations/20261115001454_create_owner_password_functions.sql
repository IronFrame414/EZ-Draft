-- EZD-105b (vault/plans/EZD-105b.md section 1; Q-0096 P3, P4, P7, P10; Q-0695 decisions 10 rows 59, 65 and 03
-- row 33; Q-0731 (a)): the Owner-set password. An active member whose role is the company's Owner preset may
-- have EZ Draft set a new password for another member; no permission switch is read, so an Owner without
-- settings_users passes (the one exception to the settings_users rule). One predicate decides who may be
-- set, for the route and for the Users page flag:
--   private.owner_password_refusal: null (allowed) or the first refusal, in this order: not_owner, not_found,
--     self, not_active, no_account (no linked or no confirmed Auth account), admin (Owner preset or holding
--     settings_users), other_company (any membership in another company).
--   public.owner_password_target: the check before the server sets the password in Auth; answers the
--     member's Auth id and email.
--   public.record_member_password_set: after Auth has the new password, ends every session of the member
--     and writes the event_log row in one transaction.
--   public.list_users: 20261113150001's body word for word plus canSetPassword per row.

create function private.owner_password_refusal(p_membership_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_caller uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_user uuid;
  v_status text;
  v_auth uuid;
  v_preset text;
begin
  if v_tenant is null or v_caller is null or not exists (
    select 1
    from public.membership cm
    join public.role cr on cr.id = cm.role_id and cr.tenant_id = cm.tenant_id
    where cm.id = v_caller and cm.tenant_id = v_tenant and cm.status = 'active'
      and cr.preset = 'owner'
  ) then
    return 'not_owner';
  end if;

  select m.user_id, m.status, u.auth_user_id, r.preset
    into v_user, v_status, v_auth, v_preset
  from public.membership m
  join public.app_user u on u.id = m.user_id
  left join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
  where m.id = p_membership_id and m.tenant_id = v_tenant;
  if not found then
    return 'not_found';
  end if;
  if p_membership_id = v_caller then
    return 'self';
  end if;
  if v_status <> 'active' then
    return 'not_active';
  end if;
  if v_auth is null or not exists (
    select 1 from auth.users au where au.id = v_auth and au.email_confirmed_at is not null
  ) then
    return 'no_account';
  end if;
  if v_preset = 'owner' or exists (
    select 1 from public.user_permission up
    where up.membership_id = p_membership_id and up.permission_key = 'settings_users' and up.granted
  ) then
    return 'admin';
  end if;
  if exists (
    select 1 from public.membership om where om.user_id = v_user and om.tenant_id <> v_tenant
  ) then
    return 'other_company';
  end if;
  return null;
end
$$;

revoke all on function private.owner_password_refusal(uuid) from public, anon, service_role;
grant execute on function private.owner_password_refusal(uuid) to authenticated;

-- The refusal as the route's error: 42501 permission_denied, P0002 user_not_found, P0001
-- password_target_refused.
create function private.owner_password_raise(p_refusal text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_refusal is null then
    return;
  elsif p_refusal = 'not_owner' then
    raise exception 'permission_denied' using errcode = '42501';
  elsif p_refusal = 'not_found' then
    raise exception 'user_not_found' using errcode = 'P0002';
  else
    raise exception 'password_target_refused' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function private.owner_password_raise(text) from public;

create function public.owner_password_target(p_membership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  perform private.require_api_gate();
  perform private.owner_password_raise(private.owner_password_refusal(p_membership_id));
  select jsonb_build_object('authUserId', u.auth_user_id, 'email', u.email)
    into v_out
  from public.membership m
  join public.app_user u on u.id = m.user_id
  where m.id = p_membership_id;
  return v_out;
end
$$;

revoke all on function public.owner_password_target(uuid) from public, anon, service_role;
grant execute on function public.owner_password_target(uuid) to authenticated;

create function public.record_member_password_set(p_membership_id uuid, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_out jsonb;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  perform 1 from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  perform private.owner_password_raise(private.owner_password_refusal(p_membership_id));

  select m.user_id into v_user from public.membership m where m.id = p_membership_id;
  perform private.end_user_sessions(v_user);
  perform private.write_event_log('user.password_set', 'membership', p_membership_id,
    jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);

  select jsonb_build_object(
      'tenantId', v_tenant,
      'appUserId', v_user,
      'memberEmail', u.email,
      'memberName', u.name,
      'actorLabel', (select coalesce(nullif(btrim(a.name), ''), a.email)
        from public.app_user a where a.id = private.app_user_id()),
      'actorEmail', (select a.email from public.app_user a where a.id = private.app_user_id()),
      'companyName', t.name,
      'companyReplyTo', nullif(btrim(t.contact ->> 'email'), ''))
    into v_out
  from public.app_user u, public.tenant t
  where u.id = v_user and t.id = v_tenant;
  return v_out;
end
$$;

revoke all on function public.record_member_password_set(uuid, inet) from public, anon, service_role;
grant execute on function public.record_member_password_set(uuid, inet) to authenticated;

-- list_users from 20261113150001 (EZD-105), word for word, except the added canSetPassword.
create or replace function public.list_users(p_search text, p_page integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (
    select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t
  ),
  base as (
    select m.id, m.status, m.last_active_at, m.invited_at, u.name, u.email, u.language,
      r.id as role_id, r.name as role_name, r.preset as role_preset,
      r.default_permissions as role_defaults,
      case m.status when 'active' then 0 when 'invited' then 1 else 2 end as status_order
    from public.membership m
    join public.app_user u on u.id = m.user_id
    left join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
    where m.status in ('active', 'invited', 'deactivated')
  ),
  filtered as (
    select b.* from base b, term
    where term.t = ''
      or coalesce(b.name, '') ilike '%' || term.t || '%'
      or b.email ilike '%' || term.t || '%'
  ),
  page as (
    select f.* from filtered f
    order by f.status_order, lower(coalesce(nullif(btrim(f.name), ''), f.email)), f.id
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
          'id', pg.role_id, 'name', pg.role_name, 'preset', pg.role_preset,
          'defaultPermissions', to_jsonb(pg.role_defaults)) end,
        'grantedKeys', to_jsonb(coalesce(g.keys, '{}'::text[])),
        'lastActiveAt', pg.last_active_at,
        'invitedAt', pg.invited_at,
        'canCopyLink', pg.status = 'invited' and (select private.can_see_invite_link(pg.id)),
        'canSetPassword', (select private.owner_password_refusal(pg.id)) is null)
      order by pg.status_order, lower(coalesce(nullif(btrim(pg.name), ''), pg.email)), pg.id)
      from page pg left join grants g on g.membership_id = pg.id), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'preset', r.preset,
        'defaultPermissions', to_jsonb(r.default_permissions))
      order by case r.preset when 'owner' then 0 when 'designer' then 1 when 'foreman' then 2
        when 'crew' then 3 else 4 end, lower(r.name), r.id)
      from public.role r), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'active', (select count(*) from base where status = 'active'),
    'invited', (select count(*) from base where status = 'invited'),
    'en', (select count(*) from base where status <> 'deactivated' and language = 'en'),
    'es', (select count(*) from base where status <> 'deactivated' and language = 'es'));
$$;
