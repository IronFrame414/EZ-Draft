-- EZD-132 Step 1 (vault/plans/EZD-132.md): Data model entity "source_file" (03c Tables source_file), the row
-- behind every uploaded original. No money fields (03b rule 2). storage_path is fixed to
-- <tenant_id>/<project_id>/<id> in bucket sources (docs/architecture.md Storage buckets and paths); the user's
-- file name lives only in original_name. Originals are never changed (03c): the trigger refuses any change to
-- the identifying columns, to uploaded_by once set and to uploaded_at once set; uploaded_at is stamped by the
-- database when the upload completes.
create table public.source_file (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('polycam_dxf','polycam_glb','pdf','supplier_pdf','dxf','image','order_report','photo','panel_photo','field_measure')),
  storage_path text not null unique check (storage_path = tenant_id::text || '/' || project_id::text || '/' || id::text),
  original_name text not null check (char_length(original_name) between 1 and 255),
  content_type text not null check (char_length(content_type) <= 127 and content_type ~ '^[a-z0-9]+/[a-z0-9.+-]+$'),
  size_bytes bigint not null check (size_bytes > 0),
  scale_calibration jsonb check (jsonb_typeof(scale_calibration) = 'object'),
  uploaded_by uuid references public.app_user (id) on delete set null,
  supplier_name text check (char_length(supplier_name) between 1 and 255),
  supplier_contact_email text check (char_length(supplier_contact_email) between 3 and 320),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index source_file_tenant_id_idx on public.source_file (tenant_id);
create index source_file_project_id_idx on public.source_file (project_id);

alter table public.source_file enable row level security;

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy source_file_select on public.source_file
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

-- A member inserts only their own unfinished row (AC-EZD-132-5: the row comes before the object).
create policy source_file_insert on public.source_file
  for insert to authenticated
  with check (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and uploaded_by = (select private.app_user_id())
    and uploaded_at is null
  );

create policy source_file_update on public.source_file
  for update to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  )
  with check (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create function private.source_file_keep_original()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id or new.kind is distinct from old.kind
    or new.storage_path is distinct from old.storage_path or new.original_name is distinct from old.original_name
    or new.content_type is distinct from old.content_type or new.size_bytes is distinct from old.size_bytes
    or new.created_at is distinct from old.created_at
    or (new.uploaded_by is distinct from old.uploaded_by and new.uploaded_by is not null)
    or (old.uploaded_at is not null and new.uploaded_at is distinct from old.uploaded_at) then
    raise exception 'source_file_original_refused' using errcode = 'P0001';
  end if;
  if old.uploaded_at is null and new.uploaded_at is not null then
    new.uploaded_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.source_file_keep_original() from public;

create trigger source_file_keep_original
  before update on public.source_file
  for each row execute function private.source_file_keep_original();

comment on table public.source_file is 'Data model entity: source_file (03c; EZD-132)';

-- EZD-006 Table grants convention: originals are kept for the life of the project, so no member deletes a
-- row (03c; 11 Data retention).
grant select, insert, update on public.source_file to authenticated;
grant select, insert, update, delete on public.source_file to service_role;
