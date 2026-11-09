-- EZD-299a Build step 1 (vault/plans/EZD-299a.md section 1 S1, Decided D-Table, D-Delete, D-Read; Q-0540;
-- Q-0628; Q-0511 e): the changes the server refused, kept for the person who made them, one row per person,
-- project and object. Mine is stored as sent (structure only); no project text and no saved value is stored.
-- No money field (03b rule 2). Members read their own rows of projects in their scope; rows are written only by
-- the EZD-299a definer functions (no insert, update or delete policy).
create table public.sync_conflict (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  user_id uuid not null references public.app_user (id) on delete cascade,
  project_id uuid not null,
  object_id uuid not null,
  reason text not null check (reason in ('conflict', 'invalid', 'not_editable')),
  base_seq integer not null check (base_seq >= 0),
  deleted boolean not null,
  type text check (type ~ '^[a-z][a-z0-9_]*$'),
  schema_version integer check (schema_version >= 1),
  data jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (deleted and type is null and schema_version is null and data is null)
    or (not deleted and type is not null and schema_version is not null and data is not null)
  ),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create unique index sync_conflict_project_user_object_key on public.sync_conflict (project_id, user_id, object_id);
create index sync_conflict_tenant_id_idx on public.sync_conflict (tenant_id);
create index sync_conflict_user_idx on public.sync_conflict (user_id, tenant_id);

alter table public.sync_conflict enable row level security;

-- EZD-006 policy template (20261019170006): tenant from the claim, then project scope, then the caller's own rows.
create policy sync_conflict_select on public.sync_conflict for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and user_id = (select private.app_user_id())
  );

create policy sync_conflict_api_gate on public.sync_conflict as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.sync_conflict to authenticated;
grant select, insert, update, delete on public.sync_conflict to service_role;

comment on table public.sync_conflict is 'Data model entity: sync_conflict (EZD-299a)';
