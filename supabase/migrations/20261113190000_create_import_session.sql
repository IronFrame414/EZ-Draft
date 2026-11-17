-- EZD-302 (03c Tables import_session; S02; phase-03 EZD-302 "write import_session items"): one detected import
-- per source file, written by the import job. Nothing here is model data until Finish import accepts it (03c
-- "Nothing becomes model data until accepted"). `items` holds the detected walls, openings and rooms with their
-- confidence (0-100). The job writes with the secret key (service_role); members read through the EZD-006
-- policy template and have no write policy yet. Review actions (EZD-308/309) add their own write path. job_id
-- with source_file_id is unique, so a job run twice writes the same rows (EZD-009 safe to run twice). No money
-- fields (03b rule 2).
create table public.import_session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  source_file_id uuid not null references public.source_file (id) on delete cascade,
  job_id uuid references public.job (id) on delete set null,
  source_kind text not null check (source_kind in ('scan', 'pdf', 'dxf', 'supplier', 'field_measure')),
  mode text not null default 'accept_fix' check (mode in ('one_by_one', 'accept_fix', 'by_room')),
  status text not null default 'detecting'
    check (status in ('detecting', 'ready', 'failed', 'finished', 'cancelled')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  error text check (error ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  unique (job_id, source_file_id)
);

create index import_session_tenant_id_idx on public.import_session (tenant_id);
create index import_session_project_id_idx on public.import_session (project_id);
create index import_session_source_file_id_idx on public.import_session (source_file_id);

alter table public.import_session enable row level security;

create trigger import_session_set_updated_at
  before update on public.import_session
  for each row execute function public.set_updated_at();

-- EZD-006 policy template: tenant from the claim, then project scope.
create policy import_session_select on public.import_session
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy import_session_api_gate on public.import_session as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6). There is no insert, update or delete policy yet, so RLS refuses every
-- member write; the review tickets (EZD-308/309) add the policies for review actions.
grant select, insert, update, delete on public.import_session to authenticated;
grant select, insert, update, delete on public.import_session to service_role;

comment on table public.import_session is 'Data model entity: import_session (03c Tables import_session; EZD-302)';
