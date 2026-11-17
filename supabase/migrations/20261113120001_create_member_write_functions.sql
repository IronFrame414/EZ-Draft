-- EZD-106 (vault/plans/EZD-106.md Part a; S15 Controls, More menu, Validation; Q-0695 decisions 10 rows 59,
-- 60, 62; Q-0043; Q-0637): the Users page write path, and list_users with deactivated members and roles.
-- Every function is security definer, takes the company from the claim (private.tenant_id(), which raises
-- 42501 for an ended session), and needs the caller's active membership to hold settings_users (42501
-- permission_denied; a holder may edit any row, their own included, and grant any switch, Q-0695 row 59).
-- The target membership must be in the caller's company (P0002 member_not_found otherwise, so another
-- company's id reads as unknown). Each runs SET CONSTRAINTS ALL IMMEDIATE before it returns, so the
-- last-holder guard (20261113120000) answers inside the call with P0001 last_settings_users_holder.
-- Session ending and the AI key delete are the membership triggers' (20261113120000;
-- 20261110120003 membership_drop_ai_key). The same-transaction event_log row waits for EZD-109
-- (vault/build/assumptions.md EZD-106). Executable by authenticated only; listed in GATED_RPC_CALLS.

create function private.users_writer_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
begin
  if v_tenant is null or v_membership is null or not exists (
    select 1
    from public.membership m
    join public.user_permission up on up.membership_id = m.id and up.tenant_id = m.tenant_id
    where m.id = v_membership
      and m.tenant_id = v_tenant
      and m.status = 'active'
      and up.permission_key = 'settings_users'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return v_tenant;
end
$$;

revoke all on function private.users_writer_tenant() from public;

-- Save (S15 Save): role, language and the 37 switches. p_granted is the full granted set (at most 37 keys,
-- each a catalog key, duplicates ignored); every key not in it is unticked. The member may be active,
-- invited or deactivated (AC-EZD-106-9: an invite's switches are editable). Answers what changed.
create function public.save_member(
  p_membership_id uuid,
  p_role_id uuid,
  p_language text,
  p_granted text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_old_role uuid;
  v_old_language text;
  v_changed text[];
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
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

revoke all on function public.save_member(uuid, uuid, text, text[]) from public, anon, service_role;
grant execute on function public.save_member(uuid, uuid, text, text[]) to authenticated;

-- Deactivate (S15 More menu; Q-0695 row 62): an active member becomes deactivated; rows stay. The
-- membership trigger ends the person's sessions. Any other status is 22023 member_state.
create function public.deactivate_member(p_membership_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select m.user_id, m.status into v_user, v_status
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'active' then
    raise exception 'member_state' using errcode = '22023';
  end if;

  update public.membership m set status = 'deactivated' where m.id = p_membership_id;
  set constraints all immediate;
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.deactivate_member(uuid) from public, anon, service_role;
grant execute on function public.deactivate_member(uuid) to authenticated;

-- Reactivate (Q-0695 row 62; Q-0043): a deactivated member becomes active again, unless the person is
-- active in another company (P0001 active_elsewhere). The person's app_user row is locked first, so two
-- companies reactivating the same person at once cannot both pass.
create function public.reactivate_member(p_membership_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select m.user_id, m.status into v_user, v_status
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  perform 1 from public.app_user u where u.id = v_user for update;
  select m.status into v_status
  from public.membership m
  where m.id = p_membership_id
  for update;
  if v_status <> 'deactivated' then
    raise exception 'member_state' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.membership o
    where o.user_id = v_user and o.status = 'active' and o.id <> p_membership_id
  ) then
    raise exception 'active_elsewhere' using errcode = 'P0001';
  end if;

  update public.membership m set status = 'active' where m.id = p_membership_id;
  set constraints all immediate;
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.reactivate_member(uuid) from public, anon, service_role;
grant execute on function public.reactivate_member(uuid) to authenticated;

-- Remove (Q-0695 row 62; Q-0637): deletes an active or deactivated membership. user_permission and
-- membership_project cascade; membership_drop_ai_key deletes the person's AI key for this company; the
-- app_user row stays. An invited row is Cancel invite (EZD-105): 22023 member_state.
create function public.remove_member(p_membership_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select m.user_id, m.status into v_user, v_status
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('active', 'deactivated') then
    raise exception 'member_state' using errcode = '22023';
  end if;

  delete from public.membership m where m.id = p_membership_id;
  set constraints all immediate;
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.remove_member(uuid) from public, anon, service_role;
grant execute on function public.remove_member(uuid) to authenticated;

-- list_users (EZD-104, 20261111120001) redefined: deactivated members are listed after the invited rows
-- but not counted (09n Status bar row 1); each row's role carries its id; `roles` lists the company's
-- roles for the inspector's Role select (presets Owner, Designer, Foreman, Crew, then custom roles by
-- name; S15 Role select).
create or replace function public.list_users(p_search text, p_page integer)
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
        'canCopyLink', pg.status = 'invited' and (select is_owner from viewer))
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
