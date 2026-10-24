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

-- EZD-101: one seeded person per other preset in tenant 1 (S15 Decision 13: Foreman and Crew are listed,
-- with no listed projects yet; example.com test addresses, Q-0033 (a)).
insert into public.app_user (id, name, email, language, role_preset)
values
  ('00000000-0000-4000-8000-000000001002', 'Seed Designer', 'designer@example.com', 'en', 'designer'),
  ('00000000-0000-4000-8000-000000001003', 'Seed Foreman', 'foreman@example.com', 'en', 'foreman'),
  ('00000000-0000-4000-8000-000000001004', 'Seed Crew', 'crew@example.com', 'en', 'crew');

insert into public.membership (tenant_id, user_id, status, scope)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', 'active', 'all'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', 'active', 'listed'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001004', 'active', 'listed');

-- EZD-016c: local test data for browser and isolation tests, never copied into
-- supabase/bootstrap/tenant-1.sql (Q-0033 (a)). The "keep the two files in step" note above covers
-- tenant 1 and Josh only.
insert into public.tenant (id, name)
values ('00000000-0000-4000-8000-000000000002', 'Test Tenant 2');

insert into public.app_user (id, name, email, language, role_preset)
values (
  '00000000-0000-4000-8000-000000002001',
  'Tenant 2 Owner',
  'tenant2-owner@example.com',
  'en',
  'owner'
);

insert into public.membership (tenant_id, user_id, status, scope)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000002001',
  'active',
  'all'
);

-- 200 tenant 1 projects (11 Performance rule 9: lists over 50 rows are paged).
insert into public.project (id, tenant_id, name, client_name, address, type, status, created_at, updated_at)
select
  ('00000000-0000-4000-8000-' || lpad((100000 + i)::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  'Seed project ' || lpad(i::text, 3, '0'),
  'Seed client ' || lpad(i::text, 3, '0'),
  'Seed address ' || lpad(i::text, 3, '0'),
  (array['kitchen', 'bath', 'whole_home_interior'])[(i - 1) % 3 + 1],
  (array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'])[(i - 1) % 5 + 1],
  timestamptz '2026-10-01T12:00:00Z' - (i - 1) * interval '1 hour',
  timestamptz '2026-10-01T12:00:00Z' - (i - 1) * interval '1 hour'
from generate_series(1, 200) as i;
