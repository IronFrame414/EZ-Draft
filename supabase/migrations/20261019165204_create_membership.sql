-- EZD-005a (vault/plans/EZD-005a.md Data): Data model entity "membership", one person in one tenant.
-- role_id is added by EZD-101. unique (id, tenant_id) is the target of membership_project's composite
-- foreign key; unique (tenant_id, user_id) leads with tenant_id (11 rule 10).
create table public.membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id),
  user_id uuid not null references public.app_user (id),
  status text not null check (status in ('invited', 'active', 'deactivated')),
  scope text not null check (scope in ('all', 'listed')),
  invited_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, user_id)
);

create index membership_user_id_idx on public.membership (user_id);

alter table public.membership enable row level security;

create trigger membership_set_updated_at
  before update on public.membership
  for each row execute function public.set_updated_at();

comment on table public.membership is 'Data model entity: membership (EZD-005a)';
