-- EZD-025 Step 1 (vault/plans/EZD-025.md): one row per off-site backup run (nightly files, weekly database dump)
-- and per restore drill. One run covers every tenant, so the table is tenant-less (TENANTLESS_TABLES). It holds
-- no tenant data: counts, times, error codes and a dump prefix only, never object names, ids or paths. Written by
-- the backup scripts with the database URL (role postgres). RLS on with one deny-all policy; anon and
-- authenticated hold no privilege (EZD-006 Table grants convention). EZD-135 decides how it is read.

create table public.backup_run (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('files', 'db_dump', 'restore_drill')),
  scope text not null default 'all',
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  objects_copied int not null default 0 check (objects_copied >= 0),
  objects_skipped int not null default 0 check (objects_skipped >= 0),
  objects_hidden int not null default 0 check (objects_hidden >= 0),
  bytes_copied bigint not null default 0 check (bytes_copied >= 0),
  files_cursor timestamptz null,
  location text null,
  error text null check (error ~ '^[a-z][a-z0-9_]{0,63}$'),
  created_at timestamptz not null default now(),
  constraint backup_run_finished_check check ((status = 'running') = (finished_at is null))
);

comment on table public.backup_run is
  'EZD-025: off-site backup runs and restore drills (system-wide, no tenant data; no API role can read it).';

create index backup_run_kind_scope_started_idx on public.backup_run (kind, scope, started_at desc);

alter table public.backup_run enable row level security;

create policy backup_run_no_api_access on public.backup_run
  for select to authenticated using (false);

revoke all on public.backup_run from public, anon;
revoke all on public.backup_run from authenticated;
grant select, insert, update, delete on public.backup_run to service_role;
