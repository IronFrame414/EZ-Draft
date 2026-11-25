-- EZD-1402 (03c offline_change "project_id, device_id, base_version_id, ops (json), queued_at, synced_at"; 03b
-- Architecture rule 9 "One outbox"; phase-14 EZD-1402; vault/build/assumptions.md EZD-1402): the server record of
-- each typed field action a device queued (measurement, task check, photo pin, field-measure send) and sent on
-- reconnect. The row id is the id the device gave the action, so a resend after a lost answer is recorded once.
-- A photo travels as a signed upload to media <tenant>/<project>/field-photos/<id>.jpg|png before the action is
-- recorded. Applying an action to field_task or field_pin rows is EZD-1409's and EZD-1410's (assumptions EZD-1402).
--
-- Members read the rows of projects in their scope (EZD-006 template). Rows are written only through
-- sync_field_action (no insert, update or delete policy, so RLS refuses member writes). No money fields.
create table public.offline_change (
  id uuid primary key,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  device_id text not null check (device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  kind text not null check (kind in ('measurement', 'task_check', 'photo_pin', 'field_measure_send')),
  base_version_id uuid references public.model_version (id) on delete set null,
  ops jsonb not null check (jsonb_typeof(ops) = 'object' and octet_length(ops::text) <= 65536),
  photo_path text,
  queued_at timestamptz not null,
  synced_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  constraint offline_change_photo_path_check check (
    photo_path is null
    or photo_path = tenant_id::text || '/' || project_id::text || '/field-photos/' || id::text || '.jpg'
    or photo_path = tenant_id::text || '/' || project_id::text || '/field-photos/' || id::text || '.png')
);

create index offline_change_tenant_id_idx on public.offline_change (tenant_id);
create index offline_change_project_idx on public.offline_change (project_id, queued_at);
create index offline_change_app_user_idx on public.offline_change (app_user_id);
create index offline_change_base_version_idx on public.offline_change (base_version_id)
  where base_version_id is not null;

alter table public.offline_change enable row level security;

create policy offline_change_select on public.offline_change for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy offline_change_api_gate on public.offline_change as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.offline_change to authenticated;
grant select, insert, update, delete on public.offline_change to service_role;

comment on table public.offline_change is 'Data model entity: offline_change (03c; EZD-1402)';

-- The switch each kind needs (10 Permissions: Check off tasks, Photo notes, Send field measurement).
create function private.field_action_permission(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case p_kind
    when 'task_check' then 'check_off_tasks'
    when 'photo_pin' then 'photo_notes'
    when 'measurement' then 'send_field_measurement'
    when 'field_measure_send' then 'send_field_measurement'
  end;
$$;
revoke all on function private.field_action_permission(text) from public;

-- null when the caller may record an action of this kind on this project; else the refusal code.
create function private.field_action_refusal(p_project uuid, p_kind text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid; v_user uuid; v_membership uuid; v_key text;
begin
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then return 'permission_denied'; end if;
  v_key := private.field_action_permission(p_kind);
  if v_key is null then return 'invalid_input'; end if;
  if not exists (select 1 from public.user_permission up
      where up.membership_id = v_membership and up.tenant_id = v_tenant
        and up.permission_key = v_key and up.granted) then
    return 'permission_denied';
  end if;
  if p_project is null or not private.can_see_project(p_project) then return 'project_not_found'; end if;
  return null;
end $$;
revoke all on function private.field_action_refusal(uuid, text) from public;

-- The storage insert check for <tenant>/<project>/field-photos/<id>.jpg|png: the caller's company, a project in
-- scope, a switch of some field action kind that carries a photo, and no action recorded under that id yet.
create function private.field_photo_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[];
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/field-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if v_parts[1] is distinct from private.tenant_id()::text then return false; end if;
  if exists (select 1 from public.offline_change c where c.id = left(v_parts[4], 36)::uuid) then return false; end if;
  return private.field_action_refusal(v_parts[2]::uuid, 'photo_pin') is null
    or private.field_action_refusal(v_parts[2]::uuid, 'task_check') is null
    or private.field_action_refusal(v_parts[2]::uuid, 'measurement') is null;
end $$;
revoke all on function private.field_photo_upload_allowed(text) from public;
grant execute on function private.field_photo_upload_allowed(text) to authenticated;

-- Signed by the server only (the thumbnail policy's shape, 20261111120000).
create policy storage_media_field_photo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select private.storage_request_from_server())
    and current_setting('storage.operation', true) = 'storage.object.sign_upload_url'
    and private.field_photo_upload_allowed(name)
  );

-- start_field_photo: the photo's path, and whether it is already stored (a resend after the upload went through).
-- An id the caller already recorded for this project and kind answers stored, so a resend after a lost answer goes
-- on to the duplicate record. Gate; no claim or no switch for the kind 42501; project out of scope P0002; a bad
-- kind or extension, or an id recorded by someone else or for another project or kind, 22023.
create function public.start_field_photo(p_project uuid, p_action uuid, p_kind text, p_ext text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_refusal text; v_path text; v_old public.offline_change%rowtype;
begin
  perform private.require_api_gate();
  v_refusal := private.field_action_refusal(p_project, p_kind);
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal = 'project_not_found' then raise exception 'project_not_found' using errcode = 'P0002'; end if;
  if v_refusal is not null or p_action is null or p_ext is null or p_ext not in ('jpg', 'png') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_path := private.tenant_id()::text || '/' || p_project::text || '/field-photos/' || p_action::text || '.' || p_ext;
  select * into v_old from public.offline_change c where c.id = p_action;
  if found then
    if v_old.tenant_id = private.tenant_id() and v_old.app_user_id = private.app_user_id()
      and v_old.project_id = p_project and v_old.kind = p_kind then
      return jsonb_build_object('path', v_path, 'stored', true);
    end if;
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'path', v_path,
    'stored', exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = v_path));
end $$;
revoke all on function public.start_field_photo(uuid, uuid, text, text) from public, anon, service_role;
grant execute on function public.start_field_photo(uuid, uuid, text, text) to authenticated;

-- sync_field_action: records one queued field action. Returns { status: 'synced' | 'duplicate', syncedAt, tenantId }.
-- Gate; no claim or no switch for the kind 42501; project out of scope P0002; a bad kind, ops, device id, base
-- version or id 22023; a photo that is not stored as the caller's JPEG or PNG of at most 5,000,000 bytes
-- photo_missing (P0001). A photo pin needs a photo. queued_at is the device's time, never later than now.
create function public.sync_field_action(
  p_id uuid, p_project uuid, p_device text, p_kind text, p_ops jsonb, p_base_version uuid,
  p_queued_at timestamptz, p_photo text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_refusal text; v_tenant uuid; v_user uuid; v_path text; v_meta jsonb; v_owner text; v_size text;
  v_old public.offline_change%rowtype; v_synced timestamptz;
begin
  perform private.require_api_gate();
  v_refusal := private.field_action_refusal(p_project, p_kind);
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal = 'project_not_found' then raise exception 'project_not_found' using errcode = 'P0002'; end if;
  if v_refusal is not null or p_id is null or p_queued_at is null
    or p_ops is null or jsonb_typeof(p_ops) <> 'object' or octet_length(p_ops::text) > 65536
    or p_device is null or p_device !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_photo is not null and p_photo not in ('jpg', 'png'))
    or (p_kind = 'photo_pin' and p_photo is null) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();

  select * into v_old from public.offline_change c where c.id = p_id;
  if found then
    if v_old.tenant_id = v_tenant and v_old.app_user_id = v_user and v_old.project_id = p_project
      and v_old.kind = p_kind then
      return jsonb_build_object('status', 'duplicate', 'syncedAt', v_old.synced_at, 'tenantId', v_tenant);
    end if;
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_base_version is not null and not exists (
      select 1 from public.model_version v
      where v.id = p_base_version and v.project_id = p_project and v.tenant_id = v_tenant) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_photo is not null then
    v_path := v_tenant::text || '/' || p_project::text || '/field-photos/' || p_id::text || '.' || p_photo;
    begin
      select o.metadata, o.owner_id into strict v_meta, v_owner
      from storage.objects o where o.bucket_id = 'media' and o.name = v_path;
    exception when no_data_found or too_many_rows then
      raise exception 'photo_missing' using errcode = 'P0001';
    end;
    v_size := v_meta ->> 'size';
    if coalesce(v_meta ->> 'mimetype', '') <> (case p_photo when 'jpg' then 'image/jpeg' else 'image/png' end)
      or v_size is null or v_size !~ '^[0-9]{1,10}$'
      or v_size::bigint < 1 or v_size::bigint > 5000000
      or v_owner is distinct from auth.uid()::text then
      raise exception 'photo_missing' using errcode = 'P0001';
    end if;
  end if;

  insert into public.offline_change
    (id, tenant_id, project_id, app_user_id, device_id, kind, base_version_id, ops, photo_path, queued_at)
  values
    (p_id, v_tenant, p_project, v_user, p_device, p_kind, p_base_version, p_ops, v_path,
     least(p_queued_at, now()))
  returning synced_at into v_synced;
  return jsonb_build_object('status', 'synced', 'syncedAt', v_synced, 'tenantId', v_tenant);
end $$;
revoke all on function public.sync_field_action(uuid, uuid, text, text, jsonb, uuid, timestamptz, text)
  from public, anon, service_role;
grant execute on function public.sync_field_action(uuid, uuid, text, text, jsonb, uuid, timestamptz, text)
  to authenticated;
