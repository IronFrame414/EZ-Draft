-- EZD-009 Step 1 (vault/plans/EZD-009.md): Data model entity "job" (03 Tables job), the background queue.
-- The 03 fields first, then the lease (run_id, lease_expires_at), the split cursor (state) and the result.
-- payload, state and result hold ids, small values and Storage paths only, never money (every member who
-- can see the project can select the row; 03 rule 2; R26 R2). error holds a stable code only.
create table public.job (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid,
  kind text not null
    check (kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test')),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null check (max_attempts between 1 and 5),
  error text check (error ~ '^[a-z][a-z0-9_]{0,63}$'),
  run_after timestamptz not null default now(),
  run_id uuid,
  lease_expires_at timestamptz,
  state jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 16384),
  result jsonb check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 16384),
  created_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  check ((status = 'running') = (run_id is not null and lease_expires_at is not null))
);

create index job_tenant_id_idx on public.job (tenant_id);
create index job_project_id_idx on public.job (project_id);
create index job_due_idx on public.job (run_after) where status = 'queued';
create index job_lease_idx on public.job (lease_expires_at) where status = 'running';

alter table public.job enable row level security;

create trigger job_set_updated_at
  before update on public.job
  for each row execute function public.set_updated_at();

-- EZD-006 policy template; a tenant-level job (null project_id) is visible to all-projects members only.
create policy job_select on public.job
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

comment on table public.job is 'Data model entity: job (03 Tables job; EZD-009)';

-- EZD-006 Table grants convention: members enqueue only through enqueue_job; the runner writes with the
-- secret key (service_role).
grant select on public.job to authenticated;
grant select, insert, update, delete on public.job to service_role;
