-- EZD-109 (vault/plans/EZD-109.md section 9; vault/build/assumptions.md EZD-106 and EZD-107 rows; Q-0695
-- decisions 03 row 33; S15:84 "All of the above also write event_log"): the Users page member writes
-- (20261113120001) and the custom role writes (20261113130000) write their event_log row in the same
-- transaction as the change, so a failed log write fails the change (AC-EZD-109-3). Each is copied from its
-- source migration with only three changes: a trailing `p_ip inet default null` argument (the request IP the
-- route reads, AC-EZD-109-1), the actor taken at the start (before a self-deactivate or self-remove ends the
-- caller's session), and the write. The old signatures are dropped first, so PostgREST sees one function per
-- name; a call without p_ip still resolves. Grants unchanged: authenticated only, in GATED_RPC_CALLS.

-- The caller's app_user id from the claims; 42501 event_log_no_actor without one.
create function private.event_log_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid := private.app_user_id();
begin
  if v is null then
    raise exception 'event_log_no_actor' using errcode = '42501';
  end if;
  return v;
end
$$;

revoke all on function private.event_log_actor() from public;

-- save_member: from 20261113120001
drop function public.save_member(uuid, uuid, text, text[]);

create function public.save_member(
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

-- deactivate_member: from 20261113120001
drop function public.deactivate_member(uuid);

create function public.deactivate_member(p_membership_id uuid, p_ip inet default null)
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
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
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
  perform private.write_event_log_as('user.deactivated', v_tenant, v_actor, 'membership',
    p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.deactivate_member(uuid, inet) from public, anon, service_role;
grant execute on function public.deactivate_member(uuid, inet) to authenticated;

-- reactivate_member: from 20261113120001
drop function public.reactivate_member(uuid);

create function public.reactivate_member(p_membership_id uuid, p_ip inet default null)
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
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
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
  perform private.write_event_log_as('user.reactivated', v_tenant, v_actor, 'membership',
    p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.reactivate_member(uuid, inet) from public, anon, service_role;
grant execute on function public.reactivate_member(uuid, inet) to authenticated;

-- remove_member: from 20261113120001
drop function public.remove_member(uuid);

create function public.remove_member(p_membership_id uuid, p_ip inet default null)
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
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
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
  perform private.write_event_log_as('user.removed', v_tenant, v_actor, 'membership',
    p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.remove_member(uuid, inet) from public, anon, service_role;
grant execute on function public.remove_member(uuid, inet) to authenticated;

-- create_role: from 20261113130000
drop function public.create_role(text, text[]);

create function public.create_role(p_name text, p_granted text[], p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_name text;
  v_set text[];
  v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  v_name := private.role_name(p_name);
  v_set := private.role_switch_set(p_granted);
  begin
    insert into public.role (tenant_id, name, preset, default_permissions)
    values (v_tenant, v_name, null, v_set)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'role_name_taken' using errcode = '23505';
  end;
  perform private.write_event_log_as('role.created', v_tenant, v_actor, 'role', v_id,
    jsonb_build_object('roleId', v_id, 'name', v_name), p_ip);
  return jsonb_build_object('roleId', v_id, 'tenantId', v_tenant, 'name', v_name,
    'defaultPermissions', to_jsonb(v_set));
end
$$;

revoke all on function public.create_role(text, text[], inet) from public, anon, service_role;
grant execute on function public.create_role(text, text[], inet) to authenticated;

-- update_role: from 20261113130000
drop function public.update_role(uuid, text, text[]);

create function public.update_role(p_role_id uuid, p_name text, p_granted text[], p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_name text;
  v_set text[];
  v_old public.role%rowtype;
  v_fields text[] := '{}';
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  if p_role_id is null then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  v_name := private.role_name(p_name);
  v_set := private.role_switch_set(p_granted);

  select * into v_old from public.role r
  where r.id = p_role_id and r.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  if v_old.preset is not null then
    raise exception 'preset_role_change_refused' using errcode = 'P0001';
  end if;

  if v_old.name is distinct from v_name then v_fields := v_fields || 'name'::text; end if;
  if v_old.default_permissions is distinct from v_set then
    v_fields := v_fields || 'default_permissions'::text;
  end if;

  if cardinality(v_fields) > 0 then
    begin
      update public.role r set name = v_name, default_permissions = v_set where r.id = p_role_id;
    exception when unique_violation then
      raise exception 'role_name_taken' using errcode = '23505';
    end;
  end if;

  if cardinality(v_fields) > 0 then
    perform private.write_event_log_as('role.updated', v_tenant, v_actor, 'role', p_role_id,
      jsonb_build_object('roleId', p_role_id, 'fields', to_jsonb(v_fields)), p_ip);
  end if;

  return jsonb_build_object('roleId', p_role_id, 'tenantId', v_tenant, 'name', v_name,
    'defaultPermissions', to_jsonb(v_set), 'fields', to_jsonb(v_fields));
end
$$;

revoke all on function public.update_role(uuid, text, text[], inet) from public, anon, service_role;
grant execute on function public.update_role(uuid, text, text[], inet) to authenticated;

-- delete_role: from 20261113130000
drop function public.delete_role(uuid);

create function public.delete_role(p_role_id uuid, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_old public.role%rowtype;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  select * into v_old from public.role r
  where r.id = p_role_id and r.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  if v_old.preset is not null then
    raise exception 'preset_role_change_refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership m where m.role_id = p_role_id) then
    raise exception 'role_in_use' using errcode = 'P0001';
  end if;
  begin
    delete from public.role r where r.id = p_role_id;
  exception when foreign_key_violation then
    raise exception 'role_in_use' using errcode = 'P0001';
  end;
  perform private.write_event_log_as('role.deleted', v_tenant, v_actor, 'role', p_role_id,
    jsonb_build_object('roleId', p_role_id, 'name', v_old.name), p_ip);
  return jsonb_build_object('roleId', p_role_id, 'tenantId', v_tenant, 'name', v_old.name);
end
$$;

revoke all on function public.delete_role(uuid, inet) from public, anon, service_role;
grant execute on function public.delete_role(uuid, inet) to authenticated;
