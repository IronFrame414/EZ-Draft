-- EZD-005a (vault/plans/EZD-005a.md Data): the listed projects of a scoped membership (ticket Scope).
-- Composite foreign keys carry tenant_id so a listed project can never belong to another company.
create table public.membership_project (
  tenant_id uuid not null references public.tenant (id),
  membership_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, project_id),
  foreign key (membership_id, tenant_id) references public.membership (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index membership_project_tenant_id_idx on public.membership_project (tenant_id);
create index membership_project_project_id_idx on public.membership_project (project_id);

alter table public.membership_project enable row level security;

comment on table public.membership_project is 'Data model entity: membership listed projects (EZD-005a)';
