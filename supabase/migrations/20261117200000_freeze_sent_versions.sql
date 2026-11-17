-- EZD-121 (Q-0700 03 row "Freezing sent versions"; 03b rule 7; S20 Version rules; R24 #4a, #16b, #26; examples
-- 09p Numbering): client sends get Version 1, 2, 3 ... with no cap, and a sent version never changes.
--
-- 1. model_version_freeze: once is_sent is set, is_sent, version_no, sent_to and sent_at never change (model_json
--    is already fixed by model_version_immutable). A sent or named row is never deleted, for any caller,
--    service_role and the table owner included, unless its project row (or its company row, whose delete
--    cascades to the project) is already gone: the project Delete cascade. Other columns (preview_path, a
--    cleared parent) stay writable.
-- 2. A unique index on (project_id, version_no) where is_sent: two sends never share a number.
-- 3. send_to_client numbers the send's fresh checkpoint under the edit_lock row lock make_checkpoint holds
--    (1 + the highest sent version_no), writes event_log version.sent in the same transaction and broadcasts
--    version.sent on project:<id> (S20 Events; EZD-109). It gains p_ip for the event_log row.
-- 4. list_projects: each item carries versionNo, the project's highest sent version_no or null (S01 Data shown).

-- Owner rights (security definer), so the project and company lookups ignore row-level security: a caller who
-- cannot see the project never reads it as gone.
create function private.model_version_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.is_sent and (
      new.is_sent is distinct from old.is_sent
      or new.version_no is distinct from old.version_no
      or new.sent_to is distinct from old.sent_to
      or new.sent_at is distinct from old.sent_at)
    then
      raise exception 'model_version_sent_frozen' using errcode = '55000';
    end if;
    return new;
  end if;
  if (old.is_sent or old.is_snapshot)
    and exists (select 1 from public.project p where p.id = old.project_id)
    and exists (select 1 from public.tenant t where t.id = old.tenant_id)
  then
    raise exception 'model_version_kept' using errcode = '55000';
  end if;
  return old;
end
$$;

revoke all on function private.model_version_freeze() from public;

create trigger model_version_freeze
  before update or delete on public.model_version
  for each row execute function private.model_version_freeze();

create unique index model_version_sent_no_key on public.model_version (project_id, version_no)
  where is_sent;

alter table public.model_version add constraint model_version_sent_check
  check (not is_sent or (version_no is not null and version_no >= 1 and sent_at is not null));

-- send_to_client: 20261117134712 with p_ip, the numbering, the event_log row and the broadcast.
drop function public.send_to_client(uuid, text, text, integer);

create function public.send_to_client(
  p_project uuid, p_token_hash text, p_note text, p_expiry_days integer, p_ip inet default null)
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
  v_project public.project;
  v_customer public.customer;
  v_tenant_row public.tenant;
  v_version uuid;
  v_holder_id uuid;
  v_holder jsonb := null;
  v_holder_name text;
  v_saved_at timestamptz;
  v_now timestamptz;
  v_id uuid;
  v_expires timestamptz;
  v_sender_email text;
  v_no integer;
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
      and up.permission_key = 'send_to_client'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expiry_days is null or p_expiry_days not between 1 and 365
    or (p_note is not null and char_length(p_note) not between 1 and 1000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_project from public.project p where p.id = p_project and p.tenant_id = v_tenant;
  select * into v_customer from public.customer c
  where c.id = v_project.customer_id and c.tenant_id = v_tenant;
  if not found or v_project.customer_id is null then
    raise exception 'no_client' using errcode = 'P0001';
  end if;

  v_version := private.make_checkpoint(p_project, v_user);

  -- make_checkpoint holds the edit_lock row lock; the holder is read under it.
  select l.holder_app_user_id into v_holder_id from public.edit_lock l where l.project_id = p_project;
  if v_holder_id is not null and v_holder_id <> v_user then
    select coalesce(nullif(btrim(u.name), ''), u.email) into v_holder_name
    from public.app_user u where u.id = v_holder_id;
    select max(o.updated_at) into v_saved_at from public.model_object o where o.project_id = p_project;
    v_holder := jsonb_build_object('name', v_holder_name, 'saved_at', v_saved_at);
  end if;

  v_now := clock_timestamp();

  -- Numbering (09p): still under the edit_lock row lock, so a second send waits here and then sees this one's
  -- number; the unique index is the backstop.
  select coalesce(max(v.version_no), 0) + 1 into v_no
  from public.model_version v where v.project_id = p_project and v.is_sent;
  update public.model_version v
  set is_sent = true, version_no = v_no, sent_to = v_customer.name, sent_at = v_now
  where v.id = v_version;

  v_expires := v_now + make_interval(days => p_expiry_days);
  insert into public.sent_package
    (tenant_id, project_id, model_version_id, kind, recipients, note, token_hash, expires_at, created_by,
     created_at)
  values (v_tenant, p_project, v_version, 'client',
    jsonb_build_array(jsonb_build_object('name', v_customer.name, 'email', v_customer.email)),
    p_note, p_token_hash, v_expires, v_user, v_now)
  returning id into v_id;

  perform private.write_event_log('version.sent', 'project', p_project,
    jsonb_build_object('model_version_id', v_version, 'version_no', v_no, 'sent_package_id', v_id), p_ip);
  perform private.broadcast_project(p_project, 'version.sent', jsonb_build_object(
    'modelVersionId', v_version,
    'versionNo', v_no,
    'sentAt', v_now));

  select * into v_tenant_row from public.tenant t where t.id = v_tenant;
  select u.email into v_sender_email from public.app_user u where u.id = v_user;

  return jsonb_build_object(
    'sent_package_id', v_id,
    'model_version_id', v_version,
    'version_no', v_no,
    'expires_at', v_expires,
    'project_name', v_project.name,
    'recipient', jsonb_build_object('name', v_customer.name, 'email', v_customer.email),
    'company', jsonb_build_object(
      'name', v_tenant_row.name,
      'reply_to', nullif(btrim(v_tenant_row.contact ->> 'email'), '')),
    'sender_email', v_sender_email,
    'holder', v_holder);
end
$$;

revoke all on function public.send_to_client(uuid, text, text, integer, inet)
  from public, anon, authenticated, service_role;
grant execute on function public.send_to_client(uuid, text, text, integer, inet) to authenticated;

-- list_projects: 20261111120000 with each item's versionNo (the highest sent version_no, null before any send);
-- same grants.
create or replace function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null, p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t),
  base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at, p.thumbnail_path,
      (select max(v.version_no) from public.model_version v where v.project_id = p.id and v.is_sent) as version_no,
      c.name as client_name,
      (c.name is null) as client_missing,
      left(lower(coalesce(c.name, '')), 500) as client_key,
      left(lower(p.name), 500) as name_key,
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    cross join term
    where p.archived_at is null and not p.is_benchmark
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (p_status is null or p.status = p_status)
      and (term.t = '' or p.name ilike '%' || term.t || '%' or p.address ilike '%' || term.t || '%' or c.name ilike '%' || term.t || '%')
  ),
  after_cursor as (
    select b.* from base b
    where p_after is null or case p_sort
      when 'edited' then (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
      when 'name' then (b.name_key, b.id) > (p_after ->> 'n', (p_after ->> 'id')::uuid)
      when 'client' then (b.client_missing, b.client_key, b.id) > ((p_after ->> 'm')::boolean, p_after ->> 'c', (p_after ->> 'id')::uuid)
      when 'status' then b.status_rank > (p_after ->> 'r')::integer
        or (b.status_rank = (p_after ->> 'r')::integer and (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid))
      when 'open_items' then (b.open_items_count, b.updated_at, b.id) < ((p_after ->> 'o')::integer, (p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
    end
  ),
  ranked as (
    select a.*, row_number() over (order by
      case when p_sort = 'name' then a.name_key end asc,
      case when p_sort = 'client' then a.client_missing end asc,
      case when p_sort = 'client' then a.client_key end asc,
      case when p_sort = 'status' then a.status_rank end asc,
      case when p_sort = 'open_items' then a.open_items_count end desc,
      case when p_sort in ('edited', 'status', 'open_items') then a.updated_at end desc,
      case when p_sort in ('name', 'client') then a.id end asc,
      case when p_sort in ('edited', 'status', 'open_items') then a.id end desc) as rn
    from after_cursor a
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'clientName', r.client_name, 'address', r.address,
        'status', r.status, 'openItems', r.open_items_count, 'hasThumbnail', r.thumbnail_path is not null,
        'versionNo', r.version_no)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb, text) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb, text) to authenticated;
