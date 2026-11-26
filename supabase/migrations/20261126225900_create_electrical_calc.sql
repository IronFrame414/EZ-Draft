-- EZD-717 (03c electrical_calc "model_version_id, case, method, inputs, results | Computed in the browser from the working
-- copy ... a row is stored when a version is sent or a set issues"): the load calc stored with an issued version. It is
-- written only by public.issue_permit_set (20261126230000_issue_permit_revision.sql). Members read the rows of projects
-- in their scope (EZD-006 template); no member write policy.
create table public.electrical_calc (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  model_version_id uuid not null references public.model_version (id) on delete cascade,
  "case" text not null check ("case" in ('existing', 'proposed')),
  method text not null check (method in ('standard', 'optional')),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index electrical_calc_tenant_id_idx on public.electrical_calc (tenant_id);
create index electrical_calc_version_idx on public.electrical_calc (model_version_id);
create index electrical_calc_project_idx on public.electrical_calc (project_id);

alter table public.electrical_calc enable row level security;

create policy electrical_calc_select on public.electrical_calc for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy electrical_calc_api_gate on public.electrical_calc as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select, insert, update, delete on public.electrical_calc to authenticated;
grant select, insert, update, delete on public.electrical_calc to service_role;

comment on table public.electrical_calc is 'Data model entity: electrical_calc (03c; stored when a set issues; EZD-717)';

