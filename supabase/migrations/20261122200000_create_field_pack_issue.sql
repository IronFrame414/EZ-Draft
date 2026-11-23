-- EZD-1404 (03d tables "field_pack_issue | project_id, model_version_id, task_ids, issued_by, issued_at, note";
-- phase-14.md EZD-1404 "field_pack_issue table (version, tasks, by, at, note)"; S17 Field pack): one issued field
-- pack of a project: the sent version the crew works from, the published tasks it carries, who issued it, when, and
-- the revision note. The newest row is the pack the phone opens. Rows are written by Issue field pack (EZD-1421);
-- until then only tests and the admin client insert them. No money field (03b rule 2).
--
-- Members read the rows of projects in their scope (EZD-006 template). No insert, update or delete policy, so RLS
-- refuses every member write.
create table public.field_pack_issue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  model_version_id uuid not null references public.model_version (id),
  task_ids uuid[] not null default '{}',
  issued_by uuid references public.app_user (id) on delete set null,
  issued_at timestamptz not null default now(),
  note text,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index field_pack_issue_tenant_id_idx on public.field_pack_issue (tenant_id);
create index field_pack_issue_project_idx on public.field_pack_issue (project_id, issued_at desc, id desc);
create index field_pack_issue_model_version_idx on public.field_pack_issue (model_version_id);

alter table public.field_pack_issue enable row level security;

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy field_pack_issue_select on public.field_pack_issue for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy field_pack_issue_api_gate on public.field_pack_issue as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.field_pack_issue to authenticated;
grant select, insert, update, delete on public.field_pack_issue to service_role;

comment on table public.field_pack_issue is 'Data model entity: field_pack_issue (S17 Field pack; EZD-1404)';
