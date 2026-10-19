-- EZD-005b (vault/plans/EZD-005b.md Step 1): local seed only, loaded by `supabase db reset --local`
-- after the migrations. Cloud projects get these rows from supabase/bootstrap/tenant-1.sql; keep the
-- two files in step (same ids and values, except the email).

-- Worth Properties as tenant 1 (02 Scope "WP as tenant 1"; fixed id EZD-005.md Step 1.2).
insert into public.tenant (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Worth Properties');

-- Josh as owner (02 Users and role presets; Q-0029 (a), Q-0121 (a); example.com test address, Q-0033 (a)).
insert into public.app_user (id, name, email, language, role_preset)
values ('00000000-0000-4000-8000-000000001001', 'Josh Bishop', 'josh@example.com', 'en', 'owner');

-- Owner views every project (10 preset table); not invited, so invited_at stays null.
insert into public.membership (tenant_id, user_id, status, scope)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000001001',
  'active',
  'all'
);
