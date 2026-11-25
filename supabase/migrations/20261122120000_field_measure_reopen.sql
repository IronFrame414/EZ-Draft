-- EZD-1419 (S17b States "sent (read-only until reopened by office)"; vault/build/assumptions.md EZD-1419). Two
-- changes to field_measure_session's functions, no new table or policy (the table keeps its RLS: select by project
-- scope, no member writes):
--   1. save_field_measure_session refuses a save while the rooms are sent (55000), so sent rooms are read-only on
--      every phone, not only on the one that sent them.
--   2. reopen_field_measure_session: the office (Approve field measurements, the people a Send to office notifies,
--      assumptions EZD-1417) reopens sent rooms. The rooms are kept; the sent columns are cleared, so the phone can
--      change them again and a later Send to office is applied and notifies again (apply_field_measure_send only
--      skips a session whose sent_at is set).
-- No money fields.

-- save_field_measure_session as EZD-1415 made it, with one more step after the room check: rooms already sent and
-- not reopened 55000, nothing changed.
create or replace function public.save_field_measure_session(p_project uuid, p_rooms jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'send_field_measurement'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array'
    or jsonb_array_length(p_rooms) < 1 or jsonb_array_length(p_rooms) > 40
    or octet_length(p_rooms::text) > 262144
    or exists (select 1 from jsonb_array_elements(p_rooms) as e where jsonb_typeof(e) <> 'object')
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.field_measure_session s
    where s.project_id = p_project and s.tenant_id = v_tenant and s.sent_at is not null
  ) then
    raise exception 'field_measure_sent' using errcode = '55000';
  end if;

  insert into public.field_measure_session as s (tenant_id, project_id, rooms, created_by, updated_by)
  values (v_tenant, p_project, p_rooms, v_user, v_user)
  on conflict (project_id) do update set rooms = excluded.rooms, updated_by = excluded.updated_by
  where s.sent_at is null;

  return jsonb_build_object('status', 'saved');
end
$$;

revoke all on function public.save_field_measure_session(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_field_measure_session(uuid, jsonb) to authenticated;

-- reopen_field_measure_session: the first failing step decides. Gate; no tenant, user or membership claim 42501; no
-- granted Approve field measurements 42501; project missing or out of scope P0002. Rooms not sent (no row, or
-- already reopened) answer { status: 'not_sent' } and change nothing; sent rooms are reopened:
-- { status: 'reopened' }.
create function public.reopen_field_measure_session(p_project uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
  v_id uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'approve_field_measurements'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  update public.field_measure_session s
    set sent_at = null, sent_by = null, sent_change_id = null, updated_by = v_user
  where s.project_id = p_project and s.tenant_id = v_tenant and s.sent_at is not null
  returning s.id into v_id;

  if v_id is null then
    return jsonb_build_object('status', 'not_sent');
  end if;
  return jsonb_build_object('status', 'reopened');
end
$$;

revoke all on function public.reopen_field_measure_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reopen_field_measure_session(uuid) to authenticated;
