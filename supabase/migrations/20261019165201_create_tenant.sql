-- EZD-005a (vault/plans/EZD-005a.md Data): Data model entity "tenant", one per GC company.
-- No tenant_id: this table is the tenant (docs/architecture.md Tenancy tables).
create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  logo_path text,
  license_no text,
  contact jsonb not null default '{}'::jsonb,
  title_block jsonb not null default '{}'::jsonb,
  code_edition text,
  defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant enable row level security;

create trigger tenant_set_updated_at
  before update on public.tenant
  for each row execute function public.set_updated_at();

comment on table public.tenant is 'Data model entity: tenant (EZD-005a)';
