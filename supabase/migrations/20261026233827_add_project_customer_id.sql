-- EZD-113 Step 2 (vault/plans/EZD-113.md M2): the project's customer, read by the Customers project count.
-- Nullable; composite foreign key so a project can only point at a customer of its own company.
alter table public.project add column customer_id uuid;
alter table public.project add constraint project_customer_fk
  foreign key (customer_id, tenant_id) references public.customer (id, tenant_id);
create index project_customer_id_idx on public.project (customer_id);
