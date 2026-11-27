-- EZD-2024 (Q-0901; security audit 2026-11-27 S4; AC-EZD-2024-1, -2, -3): only a caller whose own active
-- membership holds the company's Owner-preset role may give a member the Owner-preset role or move a member
-- off it (save_member), or invite someone as Owner (create_invite). Every other Users write keeps Q-0695 (any
-- settings_users holder). The refusal is P0001 owner_role_owner_only (403 at the routes). list_users also
-- answers viewerIsOwner, so the Users page offers the Owner role only to an Owner.

-- The caller's own membership (claim) is active in the claim company and holds the Owner preset; the same
-- test as private.owner_password_refusal's first check.
create function private.caller_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.membership cm
    join public.role cr on cr.id = cm.role_id and cr.tenant_id = cm.tenant_id
    where cm.id = nullif(auth.jwt() ->> 'membership_id', '')::uuid
      and cm.tenant_id = private.tenant_id()
      and cm.status = 'active'
      and cr.preset = 'owner'
  ), false);
$$;

revoke all on function private.caller_is_owner() from public, anon, authenticated, service_role;

-- Refuses (P0001 owner_role_owner_only) a non-Owner caller when the old or the new role is the company's
-- Owner preset. A null role is not the Owner preset.
create function private.require_owner_for_owner_role(p_tenant uuid, p_old_role uuid, p_new_role uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.role r
    where r.tenant_id = p_tenant and r.preset = 'owner' and r.id in (p_old_role, p_new_role)
  ) and not private.caller_is_owner() then
    raise exception 'owner_role_owner_only' using errcode = 'P0001';
  end if;
end
$$;

revoke all on function private.require_owner_for_owner_role(uuid, uuid, uuid) from public, anon, service_role;

-- save_member: 20261113140003's body word for word plus the Owner check before the writes.
create or replace function public.save_member(
  p_membership_id uuid,
  p_role_id uuid,
  p_language text,
  p_granted text[],
  p_ip inet default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_user uuid;
  v_old_role uuid;
  v_old_language text;
  v_changed text[];
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  if p_membership_id is null or p_role_id is null
    or p_language is null or p_language not in ('en', 'es')
    or p_granted is null or cardinality(p_granted) > 37
    or not (p_granted <@ private.permission_keys())
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select m.user_id, m.role_id into v_user, v_old_role
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.role r where r.id = p_role_id and r.tenant_id = v_tenant) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- EZD-2024 (Q-0901): giving a member the Owner preset or moving them off it needs an Owner caller.
  if v_old_role is distinct from p_role_id then
    perform private.require_owner_for_owner_role(v_tenant, v_old_role, p_role_id);
  end if;

  select u.language into v_old_language from public.app_user u where u.id = v_user for update;

  select coalesce(array_agg(k order by k), '{}'::text[]) into v_changed
  from unnest(private.permission_keys()) as k
  left join public.user_permission up
    on up.membership_id = p_membership_id and up.permission_key = k
  where coalesce(up.granted, false) is distinct from (k = any (p_granted))
    or up.permission_key is null;

  if cardinality(v_changed) > 0 then
    insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
    select v_tenant, p_membership_id, k, k = any (p_granted)
    from unnest(v_changed) as k
    on conflict (membership_id, permission_key) do update set granted = excluded.granted;
  end if;

  if v_old_role is distinct from p_role_id then
    update public.membership m set role_id = p_role_id where m.id = p_membership_id;
  end if;

  if v_old_language is distinct from p_language then
    update public.app_user u set language = p_language where u.id = v_user;
  end if;

  set constraints all immediate;

  if cardinality(v_changed) > 0 or v_old_role is distinct from p_role_id then
    perform private.write_event_log_as('user_permission.updated', v_tenant, v_actor, 'membership',
      p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user,
        'changedKeys', to_jsonb(v_changed), 'roleId', p_role_id,
        'roleChanged', v_old_role is distinct from p_role_id), p_ip);
  end if;

  return jsonb_build_object(
    'membershipId', p_membership_id,
    'appUserId', v_user,
    'tenantId', v_tenant,
    'changedKeys', to_jsonb(v_changed),
    'roleChanged', v_old_role is distinct from p_role_id,
    'roleId', p_role_id,
    'languageChanged', v_old_language is distinct from p_language,
    'language', p_language);
end
$$;


revoke all on function public.save_member(uuid, uuid, text, text[], inet) from public, anon, service_role;
grant execute on function public.save_member(uuid, uuid, text, text[], inet) to authenticated;

-- create_invite: 20261113150001's body word for word plus the Owner check after the input check (so another
-- company's role still answers invalid_input).
create or replace function public.create_invite(
  p_email text,
  p_name text,
  p_role_id uuid,
  p_language text,
  p_scope text,
  p_secret text,
  p_token_sha256 text,
  p_ip inet default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_scope text;
  v_user uuid;
  v_status text;
  v_membership uuid;
  v_invited_at timestamptz := now();
  v_invite uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();

  if char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if (v_name is not null and char_length(v_name) > 100)
    or p_role_id is null
    or p_language is null or p_language not in ('en', 'es')
    or (p_scope is not null and p_scope not in ('all', 'listed'))
    or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
    or p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (select 1 from public.role r where r.id = p_role_id and r.tenant_id = v_tenant)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- EZD-2024 (Q-0901): inviting someone as Owner needs an Owner caller.
  perform private.require_owner_for_owner_role(v_tenant, null, p_role_id);
  v_scope := coalesce(p_scope, private.invite_scope_default(p_role_id));

  -- One invite at a time per email, whether or not the person exists yet.
  perform pg_advisory_xact_lock(hashtextextended('ezd-invite:' || v_email, 0));

  select u.id into v_user from public.app_user u where u.email = v_email for update;
  if v_user is not null then
    select m.status into v_status
    from public.membership m
    where m.tenant_id = v_tenant and m.user_id = v_user;
    if v_status = 'active' then
      raise exception 'already_member' using errcode = 'P0001';
    elsif v_status = 'invited' then
      raise exception 'already_invited' using errcode = 'P0001';
    elsif v_status = 'deactivated' then
      raise exception 'deactivated_member' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.membership o
      where o.user_id = v_user and o.status = 'active' and o.tenant_id <> v_tenant
    ) then
      raise exception 'email_in_use' using errcode = 'P0001';
    end if;
    -- The person is active nowhere: the inviter's name and language apply (a name already on file is kept
    -- when none is typed).
    update public.app_user u
    set name = coalesce(v_name, u.name), language = p_language
    where u.id = v_user;
  else
    insert into public.app_user (email, name, language)
    values (v_email, v_name, p_language)
    returning id into v_user;
  end if;

  insert into public.membership (tenant_id, user_id, status, scope, invited_at, role_id)
  values (v_tenant, v_user, 'invited', v_scope, v_invited_at, p_role_id)
  returning id into v_membership;

  insert into public.invite (tenant_id, membership_id, secret, token_sha256, expires_at, created_by, sent_by)
  values (v_tenant, v_membership, p_secret, p_token_sha256, v_invited_at + interval '7 days', v_actor, v_actor)
  returning id into v_invite;

  perform private.write_event_log_as('user.invited', v_tenant, v_actor, 'membership', v_membership,
    jsonb_build_object('membershipId', v_membership, 'appUserId', v_user, 'roleId', p_role_id,
      'scope', v_scope), p_ip);

  return (
    select jsonb_build_object(
      'membershipId', v_membership,
      'appUserId', v_user,
      'tenantId', v_tenant,
      'roleId', p_role_id,
      'scope', v_scope,
      'email', v_email,
      'language', p_language,
      'expiresAt', v_invited_at + interval '7 days',
      'companyName', t.name,
      'companyEmail', nullif(btrim(coalesce(t.contact ->> 'email', '')), ''),
      'inviterName', (select a.name from public.app_user a where a.id = v_actor))
    from public.tenant t where t.id = v_tenant);
end
$$;


revoke all on function public.create_invite(text, text, uuid, text, text, text, text, inet)
  from public, anon, service_role;
grant execute on function public.create_invite(text, text, uuid, text, text, text, text, inet)
  to authenticated;

-- list_users: 20261115001454's body word for word plus the top-level viewerIsOwner (inline, as 20261111120001's
-- viewer check, so no private function is granted to authenticated; read under the viewer's RLS).
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
    'viewerIsOwner', exists (
      select 1 from public.membership vm
      join public.role vr on vr.id = vm.role_id and vr.tenant_id = vm.tenant_id
      where vm.id = nullif(auth.jwt() ->> 'membership_id', '')::uuid
        and vm.status = 'active'
        and vr.preset = 'owner'),
    'total', (select count(*) from filtered),
    'active', (select count(*) from base where status = 'active'),
    'invited', (select count(*) from base where status = 'invited'),
    'en', (select count(*) from base where status <> 'deactivated' and language = 'en'),
    'es', (select count(*) from base where status <> 'deactivated' and language = 'es'));
$$;

revoke all on function public.list_users(text, integer) from public, anon, service_role;
grant execute on function public.list_users(text, integer) to authenticated;
