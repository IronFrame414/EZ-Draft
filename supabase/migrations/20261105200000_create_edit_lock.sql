-- EZD-120a Build step 1a (vault/plans/EZD-120a.md section 1 M1, Access M1-M3; 03e; 00d; 03b rules 6, 9): the
-- lock generation a save must match, one row per project, made at its first save or checkpoint (EZD-125 adds
-- the holder columns). No money field (03b rule 2). Members read the rows of projects in their scope; rows are
-- written only by the EZD-120a definer functions (no insert, update or delete policy).
create table public.edit_lock (
  project_id uuid primary key,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  lock_epoch bigint not null default 0 check (lock_epoch >= 0),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index edit_lock_tenant_id_idx on public.edit_lock (tenant_id);

alter table public.edit_lock enable row level security;

-- EZD-006 policy template (20261019170006): tenant from the claim, then project scope.
create policy edit_lock_select on public.edit_lock for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy edit_lock_api_gate on public.edit_lock as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select on public.edit_lock to authenticated;
grant select, insert, update, delete on public.edit_lock to service_role;

comment on table public.edit_lock is 'Data model entity: edit_lock (EZD-120a)';
