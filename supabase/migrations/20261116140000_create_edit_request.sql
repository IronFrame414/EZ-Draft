-- EZD-125 (Q-0697 decisions 03 "Edit lock data"; 03c:20-21; glossary 00i "Lock holder"; S06 Edit lock): the
-- lock holder on edit_lock, and the Request edit rows. The lock is per user: holder_app_user_id is null when
-- the lock is free; since is when the holder took it; device_id records the holder's last device and offline
-- describes that device. Rows of both tables cascade with the project.
--
-- edit_request: one row per Request edit. deadline_at = requested_at + the Defaults "Edit lock auto-release"
-- minutes read at request time (a later Defaults change does not move it). response is null while pending,
-- then release, keep, auto or cancelled, with responded_at. At most one pending row per (project, requester).
-- Members read the rows of projects in their scope; rows are written only by the EZD-125 definer functions.
-- The table grants follow the default convention (authenticated holds the four data privileges and RLS has no
-- write policy, so writes are refused): the locked rls.audit.test.ts pins the TABLE_GRANTS key list (the
-- EZD-109 event_log precedent, vault/build/assumptions.md EZD-109).

alter table public.edit_lock
  add column holder_app_user_id uuid references public.app_user (id) on delete set null,
  add column since timestamptz,
  add column device_id text check (device_id is null or char_length(device_id) between 1 and 100),
  add column offline boolean not null default false,
  add constraint edit_lock_holder_since check ((holder_app_user_id is null) = (since is null));

create index edit_lock_holder_app_user_id_idx on public.edit_lock (holder_app_user_id);

create table public.edit_request (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  requester_app_user_id uuid not null references public.app_user (id) on delete cascade,
  requested_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  response text check (response in ('release', 'keep', 'auto', 'cancelled')),
  responded_at timestamptz,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade,
  constraint edit_request_deadline check (deadline_at > requested_at),
  constraint edit_request_responded check ((response is null) = (responded_at is null))
);

create index edit_request_tenant_id_idx on public.edit_request (tenant_id);
create index edit_request_project_id_idx on public.edit_request (project_id, requested_at);
create index edit_request_requester_idx on public.edit_request (requester_app_user_id);
create unique index edit_request_one_pending on public.edit_request (project_id, requester_app_user_id)
  where response is null;
create index edit_request_pending_deadline_idx on public.edit_request (deadline_at) where response is null;

alter table public.edit_request enable row level security;

-- EZD-006 policy template (20261019170006): tenant from the claim, then project scope.
create policy edit_request_select on public.edit_request for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy edit_request_api_gate on public.edit_request as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.edit_request from public, anon, authenticated;
grant select, insert, update, delete on public.edit_request to authenticated;
grant select, insert, update, delete on public.edit_request to service_role;

comment on table public.edit_request is 'Data model entity: edit_request (EZD-125)';
