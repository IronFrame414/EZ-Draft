-- EZD-024 Step 4 (vault/plans/EZD-024.md): the alert store. One row per error fingerprint, failed job or
-- failed webhook delivery; it decides whether the owner is emailed (one email per new fingerprint, at most 20
-- per rolling hour, Q-0068 (a)). tenant_id is null only for kind 'error': errors belong to the app, not a
-- tenant, so such rows are visible to no member. Rows are written only through record_error_alert and
-- release_error_alert_email (next migration). Titles are scrubbed and hold codes and names only.
create table public.error_alert (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenant (id) on delete cascade,
  project_id uuid,
  kind text not null check (kind in ('error', 'job_failed', 'webhook_failed')),
  source text not null check (source in ('browser', 'function', 'worker', 'job', 'webhook')),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  title text not null check (char_length(title) between 1 and 300),
  ref text check (ref ~ '^[A-Za-z0-9-]{1,64}$'),
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  email_claim uuid,
  emailed_at timestamptz,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  check ((kind = 'error') = (tenant_id is null))
);

create index error_alert_tenant_id_idx on public.error_alert (tenant_id);
create index error_alert_project_id_idx on public.error_alert (project_id);
create index error_alert_emailed_at_idx on public.error_alert (emailed_at) where emailed_at is not null;
create index error_alert_kind_first_seen_idx on public.error_alert (kind, first_seen_at);

alter table public.error_alert enable row level security;

-- EZD-006 policy template: a tenant's failure rows are visible to its members in scope; error rows (null
-- tenant) to nobody.
create policy error_alert_select on public.error_alert
  for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

comment on table public.error_alert is 'Error and failure alerts, one per fingerprint (EZD-024)';

-- EZD-006 Table grants convention: members read only; writes go through the two functions.
grant select on public.error_alert to authenticated;
grant select, insert, update, delete on public.error_alert to service_role;
