-- EZD-033 Step 5 (vault/plans/EZD-033.md): the sign-in throttle table. Rows are written before anyone is
-- signed in and belong to no company, so the table is tenant-less (TENANTLESS_TABLES; Q-0094). It holds only
-- keyed hashes and times: no email, no address, no user id (Q-0094 "keyed hashes only"). Read and written only
-- by public.sign_in_throttle_take and public.sign_in_throttle_settle; uuid ids so an attempt id cannot be
-- guessed. RLS on with one deny-all policy; anon and authenticated hold no privilege (EZD-006 Table grants
-- convention).

create table public.sign_in_throttle (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'password', 'code', 'email')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  failed boolean not null default true,
  at timestamptz not null default now()
);

create index sign_in_throttle_key_at_idx on public.sign_in_throttle (kind, key_hash, at);
create index sign_in_throttle_at_idx on public.sign_in_throttle (at);

alter table public.sign_in_throttle enable row level security;

create policy sign_in_throttle_none on public.sign_in_throttle
  for all to authenticated using (false) with check (false);

revoke all on public.sign_in_throttle from public, anon, authenticated;
grant select, insert, update, delete on public.sign_in_throttle to service_role;
