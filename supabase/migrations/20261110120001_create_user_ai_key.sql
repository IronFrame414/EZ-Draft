-- EZD-5601 M1 (vault/plans/EZD-5601.md section 1 Data; Q-0637 key storage): each user's own Anthropic API key,
-- one row per (tenant, user), encrypted in the app with AES-256-GCM (key-crypto.ts) before it gets here, so the
-- table holds only base64 ciphertext, the encryption key's version number and the last 4 characters. No API
-- role reads or writes it: RLS on with one deny-all policy, no anon or authenticated privilege, and the
-- *_my_ai_key definer functions (M3) are the only way in.

create table public.user_ai_key (
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  ciphertext text not null check (
    char_length(ciphertext) between 40 and 512 and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'
  ),
  secret_version integer not null check (secret_version between 1 and 999999),
  last4 text not null check (last4 ~ '^[!-~]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, app_user_id)
);

create index user_ai_key_app_user_id_idx on public.user_ai_key (app_user_id);

create trigger user_ai_key_set_updated_at
  before update on public.user_ai_key
  for each row execute function public.set_updated_at();

alter table public.user_ai_key enable row level security;

create policy user_ai_key_none on public.user_ai_key
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

revoke all on public.user_ai_key from public, anon, authenticated;
grant select, insert, update, delete on public.user_ai_key to service_role;

comment on table public.user_ai_key is 'Each user''s own Anthropic API key, app-encrypted; reached only through the *_my_ai_key functions (EZD-5601)';
