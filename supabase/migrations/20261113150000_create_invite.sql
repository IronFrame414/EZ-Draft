-- EZD-105 (S15 Invite user; Q-0695 decisions 10 rows 61-63; Q-0216; Q-0050): one row per pending invite.
-- `secret` is the per-invite random value (64 lower-case hex characters, made in the app); the link token and
-- the 6-digit code are worked out from it in the app with a server-held key (HKDF, label ezd-invite-v1,
-- app/src/server/users/invite-token.ts), so the database never sees that key. Lookup is by the token's sha-256
-- (`token_sha256`); no hash of the code is stored. `expires_at` is 7 days after the last send (Resend moves
-- it, with membership.invited_at). `code_tries` counts wrong codes for EZD-138 (5 locks the code until
-- Resend). Removing or cancelling the membership deletes the invite (composite key, as membership_project).
-- No API role reads or writes a row: RLS on with one deny-all policy and the API request gate policy; the
-- invite definer functions (20261113150001) are the only way in. The table grants follow the default
-- convention (authenticated holds the four data privileges, so the policy is what refuses them), because the
-- locked rls.audit.test.ts pins the TABLE_GRANTS key list (the event_log precedent, 20261113140000).
--
-- One active company per person (Q-0043; Q-0695 row 63) is enforced inside the functions that make a
-- membership active (accept_invite here, link_app_user, reactivate_member), each under a lock on the
-- person's rows (app_user or their memberships, for update). The partial unique index on
-- membership(user_id) for active rows that AC-EZD-105-7 names is not added: the locked test
-- rls.hook.test.ts T9 inserts two active memberships for one person and expects no error
-- (vault/build/assumptions.md, EZD-105).

create table public.invite (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  membership_id uuid not null unique,
  secret text not null check (secret ~ '^[0-9a-f]{64}$'),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  code_tries integer not null default 0 check (code_tries between 0 and 5),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.app_user (id) on delete set null,
  sent_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (membership_id, tenant_id) references public.membership (id, tenant_id) on delete cascade
);

create index invite_tenant_id_idx on public.invite (tenant_id, membership_id);
create index invite_created_by_idx on public.invite (created_by);
create index invite_sent_by_idx on public.invite (sent_by);

create trigger invite_set_updated_at
  before update on public.invite
  for each row execute function public.set_updated_at();

alter table public.invite enable row level security;

create policy invite_none on public.invite
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

create policy invite_api_gate on public.invite as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.invite from public, anon, authenticated;
grant select, insert, update, delete on public.invite to authenticated;
grant select, insert, update, delete on public.invite to service_role;

comment on table public.invite is 'Pending invites; reached only through the invite definer functions (EZD-105)';
