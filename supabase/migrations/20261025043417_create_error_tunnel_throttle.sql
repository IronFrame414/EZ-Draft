-- EZD-143 (vault/plans/EZD-143.md D1-D4; Q-0276 (a)): the error tunnel's per-address count. Rows are written
-- for anonymous error reports and belong to no company, so the table is tenant-less (TENANTLESS_TABLES). It
-- holds only keyed hashes and times: no address, no user id. Read and written only by
-- public.error_tunnel_take. RLS on with one deny-all policy; anon and authenticated hold no privilege
-- (EZD-006 Table grants convention).

create table public.error_tunnel_throttle (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);

create index error_tunnel_throttle_key_at_idx on public.error_tunnel_throttle (key_hash, at);
create index error_tunnel_throttle_at_idx on public.error_tunnel_throttle (at);

alter table public.error_tunnel_throttle enable row level security;

create policy error_tunnel_throttle_none on public.error_tunnel_throttle
  for all to authenticated using (false) with check (false);

revoke all on public.error_tunnel_throttle from public, anon, authenticated;
grant select, insert, update, delete on public.error_tunnel_throttle to service_role;

comment on table public.error_tunnel_throttle is 'Error tunnel events per client address key, rolling hour (EZD-143)';
