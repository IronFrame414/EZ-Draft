-- EZD-120a Build step 1b (vault/plans/EZD-120a.md section 1 M2, Access M1-M3, Decided "Seq type"; 03d; 03e;
-- 03b rules 6, 9): the working copy, one row per object with a per-object sequence (integer, so every value
-- reads back as a JS number). No money field (03b rule 2). Members read the rows of projects in their scope;
-- rows are written only by the EZD-120a definer functions (no insert, update or delete policy).
create table public.model_object (
  project_id uuid not null,
  object_id uuid not null,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  type text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  schema_version integer not null check (schema_version >= 1),
  updated_seq integer not null check (updated_seq >= 1),
  updated_by uuid references public.app_user (id) on delete set null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, object_id),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index model_object_tenant_id_idx on public.model_object (tenant_id);

alter table public.model_object enable row level security;

-- EZD-006 policy template (20261019170006): tenant from the claim, then project scope.
create policy model_object_select on public.model_object for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy model_object_api_gate on public.model_object as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.model_object to authenticated;
grant select, insert, update, delete on public.model_object to service_role;

comment on table public.model_object is 'Data model entity: model_object (EZD-120a)';
