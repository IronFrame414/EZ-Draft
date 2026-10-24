-- EZD-005a (vault/plans/EZD-005a.md Data): Data model entity "user" as public.app_user
-- ("user" is reserved in PostgreSQL). One person across tenants, linked by membership; no tenant_id.
-- auth_user_id is filled at first sign-in by EZD-007.
create table public.app_user (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text,
  email text not null unique check (email = lower(email) and length(btrim(email)) > 0),
  language text not null default 'en' check (language in ('en', 'es')),
  ipad_input_mode text check (ipad_input_mode in ('pencil', 'finger')),
  role_preset text check (role_preset in ('owner', 'designer', 'foreman', 'crew')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_user enable row level security;

create trigger app_user_set_updated_at
  before update on public.app_user
  for each row execute function public.set_updated_at();

comment on table public.app_user is 'Data model entity: user (EZD-005a)';
