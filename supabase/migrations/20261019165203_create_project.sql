-- EZD-005a (vault/plans/EZD-005a.md Data): Data model entity "project" with the Round 26 added
-- fields and the ticket Scope columns (archived_at, thumbnail_path, open_items_count).
-- unique (id, tenant_id) is the target of membership_project's composite foreign key.
create table public.project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id),
  name text not null check (length(btrim(name)) > 0),
  client_name text,
  address text not null check (length(btrim(address)) > 0),
  type text not null check (type in ('kitchen', 'bath', 'whole_home_interior')),
  status text not null default 'draft'
    check (status in ('draft', 'client_review', 'permit_submitted', 'approved', 'in_build')),
  ezbinder_job_id text,
  ezbinder_job_no text,
  property_record_id uuid,
  submittal_profile_id uuid,
  code_edition text,
  phase_default text,
  scope_of_work text,
  settings jsonb not null default '{}'::jsonb,
  thumbnail_path text,
  open_items_count integer not null default 0 check (open_items_count >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create index project_tenant_id_idx on public.project (tenant_id);

alter table public.project enable row level security;

create trigger project_set_updated_at
  before update on public.project
  for each row execute function public.set_updated_at();

comment on table public.project is 'Data model entity: project (EZD-005a)';
