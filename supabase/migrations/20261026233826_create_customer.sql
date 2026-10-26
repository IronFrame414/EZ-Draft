-- EZD-113 Step 1 (vault/plans/EZD-113.md M1): Data model entity "customer" (03d; S15a Customers).
-- Name and email required; email unique per tenant ignoring case, archived rows included (Q-0227; Q-0232).
-- No delete in v1: customers are archived (Q-0227), so authenticated gets no delete privilege or policy.
create table public.customer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  phone text,
  address text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index customer_tenant_email_key on public.customer (tenant_id, lower(email));
create index customer_tenant_name_idx on public.customer (tenant_id, lower(name), id);
alter table public.customer enable row level security;
create trigger customer_set_updated_at before update on public.customer
  for each row execute function public.set_updated_at();
create policy customer_select on public.customer for select to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy customer_insert on public.customer for insert to authenticated
  with check (tenant_id = (select private.tenant_id()));
create policy customer_update on public.customer for update to authenticated
  using (tenant_id = (select private.tenant_id()))
  with check (tenant_id = (select private.tenant_id()));
grant select, insert, update on public.customer to authenticated;
grant select, insert, update, delete on public.customer to service_role;
comment on table public.customer is 'Data model entity: customer (EZD-113)';
