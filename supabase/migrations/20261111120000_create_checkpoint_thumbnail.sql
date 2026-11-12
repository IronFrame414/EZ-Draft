-- EZD-224 (vault/plans/EZD-224.md section 1; 03 Q-0664; AC-EZD-224-1, -3, -4).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
where id = 'media';

alter table public.project add constraint project_thumbnail_path_check check (
  thumbnail_path is null or thumbnail_path ~ ('^' || tenant_id::text || '/' || id::text
    || '/thumb/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));
alter table public.model_version add constraint model_version_preview_path_check check (
  preview_path is null
  or preview_path = tenant_id::text || '/' || project_id::text || '/thumb/' || id::text || '.webp');

create function private.checkpoint_thumbnail_refusal(p_project uuid, p_version uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_tenant uuid; v_user uuid; v_membership uuid;
  v_id uuid; v_by uuid; v_preview text;
begin
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then return 'permission_denied'; end if;
  if not exists (select 1 from public.user_permission up
      where up.membership_id = v_membership and up.tenant_id = v_tenant
        and up.permission_key = 'edit_model' and up.granted) then
    return 'permission_denied';
  end if;
  if p_project is null or not private.can_see_project(p_project) then return 'project_not_found'; end if;
  select v.id, v.created_by, v.preview_path into v_id, v_by, v_preview
  from public.model_version v
  where v.project_id = p_project and v.tenant_id = v_tenant
  order by v.created_at desc, v.id desc limit 1;
  if v_id is null or p_version is null or v_id <> p_version or v_by is distinct from v_user
    or v_preview is not null then
    return 'version_not_found';
  end if;
  return null;
end $$;
revoke all on function private.checkpoint_thumbnail_refusal(uuid, uuid) from public;

create function private.thumbnail_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[];
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/thumb/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if v_parts[1] is distinct from private.tenant_id()::text then return false; end if;
  return private.checkpoint_thumbnail_refusal(v_parts[2]::uuid, left(v_parts[4], 36)::uuid) is null;
end $$;
revoke all on function private.thumbnail_upload_allowed(text) from public;

-- Only set_checkpoint_thumbnail (definer, owner postgres) may write project.thumbnail_path.
create function private.project_thumbnail_path_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'postgres'
    and ((tg_op = 'INSERT' and new.thumbnail_path is not null)
      or (tg_op = 'UPDATE' and new.thumbnail_path is distinct from old.thumbnail_path)) then
    raise exception 'thumbnail_path_refused' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.project_thumbnail_path_guard() from public;
create trigger project_thumbnail_path_guard
  before insert or update on public.project
  for each row execute function private.project_thumbnail_path_guard();
grant execute on function private.thumbnail_upload_allowed(text) to authenticated;

create policy storage_media_thumb_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select private.storage_request_from_server())
    and current_setting('storage.operation', true) = 'storage.object.sign_upload_url'
    and private.thumbnail_upload_allowed(name)
  );

create function public.start_checkpoint_thumbnail(p_project uuid, p_version uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_refusal text;
begin
  perform private.require_api_gate();
  v_refusal := private.checkpoint_thumbnail_refusal(p_project, p_version);
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal is not null then raise exception '%', v_refusal using errcode = 'P0002'; end if;
  return private.tenant_id()::text || '/' || p_project::text || '/thumb/' || p_version::text || '.webp';
end $$;
revoke all on function public.start_checkpoint_thumbnail(uuid, uuid) from public, anon, service_role;
grant execute on function public.start_checkpoint_thumbnail(uuid, uuid) to authenticated;

create function public.set_checkpoint_thumbnail(p_project uuid, p_version uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_refusal text; v_path text; v_meta jsonb; v_owner text; v_size text;
begin
  perform private.require_api_gate();
  v_refusal := private.checkpoint_thumbnail_refusal(p_project, p_version);
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal is not null then raise exception '%', v_refusal using errcode = 'P0002'; end if;
  perform 1 from public.edit_lock l where l.project_id = p_project for update;
  if not found then raise exception 'version_not_found' using errcode = 'P0002'; end if;
  v_refusal := private.checkpoint_thumbnail_refusal(p_project, p_version);
  if v_refusal = 'permission_denied' then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_refusal is not null then raise exception '%', v_refusal using errcode = 'P0002'; end if;
  v_path := private.tenant_id()::text || '/' || p_project::text || '/thumb/' || p_version::text || '.webp';
  begin
    select o.metadata, o.owner_id into strict v_meta, v_owner
    from storage.objects o where o.bucket_id = 'media' and o.name = v_path;
  exception when no_data_found or too_many_rows then
    raise exception 'thumbnail_invalid' using errcode = 'P0001';
  end;
  v_size := v_meta ->> 'size';
  if coalesce(v_meta ->> 'mimetype', '') <> 'image/webp'
    or v_size is null or v_size !~ '^[0-9]{1,10}$'
    or v_size::bigint < 1 or v_size::bigint > 40959
    or v_owner is distinct from auth.uid()::text then
    raise exception 'thumbnail_invalid' using errcode = 'P0001';
  end if;
  update public.model_version v set preview_path = v_path where v.id = p_version;
  update public.project p set thumbnail_path = v_path where p.id = p_project;
  return v_path;
end $$;
revoke all on function public.set_checkpoint_thumbnail(uuid, uuid) from public, anon, service_role;
grant execute on function public.set_checkpoint_thumbnail(uuid, uuid) to authenticated;

-- list_projects: 20261106140001 with p.thumbnail_path in base and 'hasThumbnail' in each item; same grants.
create or replace function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null, p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t),
  base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at, p.thumbnail_path,
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
        'status', r.status, 'openItems', r.open_items_count, 'hasThumbnail', r.thumbnail_path is not null)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb, text) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb, text) to authenticated;
