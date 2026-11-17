-- EZD-111 M1 (vault/plans/EZD-111.md Database columns, RLS policies, Grants; 03d sent_package; Q-0700): one row
-- per send to a client. Only the SHA-256 of the client-link token is stored (09p Token #1; 03b rule 11), never
-- the token. No API role reads or writes a row: RLS on with one deny-all policy (tenant and project scope, then
-- false) and the API gate policy; send_to_client, mark_sent_package_emailed and resolve_sent_package (M2) are the
-- only way in. The table grants follow the default convention (authenticated holds the four data privileges and
-- every policy refuses): the locked rls.audit.test.ts pins the TABLE_GRANTS key list (benchmark_run and
-- project_recent precedent, vault/build/assumptions.md EZD-128).
-- model_version_id has no delete action, so a sent version cannot be removed alone; the project's cascade
-- deletes both in one statement.

create table public.sent_package (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  model_version_id uuid not null references public.model_version (id),
  kind text not null check (kind in ('client', 'permit', 'co', 'supplier')),
  recipients jsonb not null check (
    jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) = 1
  ),
  note text check (note is null or char_length(note) between 1 and 1000),
  email_sent_at timestamptz,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  constraint sent_package_expiry check (expires_at > created_at)
);

create index sent_package_tenant_id_idx on public.sent_package (tenant_id);
create index sent_package_project_idx on public.sent_package (project_id, created_at desc);
create index sent_package_model_version_id_idx on public.sent_package (model_version_id);
create index sent_package_created_by_idx on public.sent_package (created_by);

alter table public.sent_package enable row level security;

create policy sent_package_none on public.sent_package
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and private.can_see_project(project_id) and false)
  with check (tenant_id = (select private.tenant_id()) and private.can_see_project(project_id) and false);

create policy sent_package_api_gate on public.sent_package as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.sent_package from public, anon, authenticated;
grant select, insert, update, delete on public.sent_package to authenticated;
grant select, insert, update, delete on public.sent_package to service_role;

comment on table public.sent_package is 'Data model entity: sent_package (EZD-111)';
