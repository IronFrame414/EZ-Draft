-- EZD-120a Build step 1c (vault/plans/EZD-120a.md section 1 M3, Access M1-M3; 03c model_version; 03b rule 7;
-- Q-0507 gap 16): a checkpoint of the working copy, whose document never changes once written. No money field
-- (03b rule 2). Members read the rows of projects in their scope; rows are written only by the EZD-120a
-- definer functions (no insert, update or delete policy).
create table public.model_version (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  model_json jsonb not null check (jsonb_typeof(model_json) = 'object'),
  schema_version integer not null check (schema_version >= 1),
  parent_version_id uuid references public.model_version (id) on delete set null,
  label text,
  sent_to text,
  preview_path text,
  is_snapshot boolean not null default false,
  is_sent boolean not null default false,
  keep boolean not null default false,
  sent_at timestamptz,
  cleanup_shown_at timestamptz,
  version_no integer,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index model_version_tenant_id_idx on public.model_version (tenant_id);
create index model_version_project_list_idx on public.model_version (project_id, created_at desc, id desc);

-- 03b rule 7: a checkpoint's document and identity never change; parent_version_id may only be cleared (the
-- parent's delete sets it null). Other columns stay editable (EZD-121/122 own their rules).
create function private.model_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.model_json is distinct from old.model_json
    or new.schema_version is distinct from old.schema_version
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or (new.parent_version_id is distinct from old.parent_version_id and new.parent_version_id is not null)
  then
    raise exception 'model_version_immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

revoke all on function private.model_version_immutable() from public;

create trigger model_version_immutable
  before update on public.model_version
  for each row execute function private.model_version_immutable();

alter table public.model_version enable row level security;

-- EZD-006 policy template (20261019170006): tenant from the claim, then project scope.
create policy model_version_select on public.model_version for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy model_version_api_gate on public.model_version as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.model_version to authenticated;
grant select, insert, update, delete on public.model_version to service_role;

comment on table public.model_version is 'Data model entity: model_version (EZD-120a)';
