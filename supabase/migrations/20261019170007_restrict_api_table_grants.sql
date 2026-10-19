-- EZD-006 Step 5 grants (vault/plans/EZD-006.md; orchestrator's brief 2026-10-12): every privilege an
-- API role holds on a table is granted explicitly, by name, in a migration. Default privileges in
-- public grant nothing (the local CLI and the cloud setting "Automatically expose new tables" work
-- through role postgres's default privileges in public, pg_default_acl; migrations run as postgres),
-- so the app behaves the same with that setting on or off. anon never gets a table (03 rule 11).
-- TRUNCATE, REFERENCES and TRIGGER are never granted to an API role (TRUNCATE is not subject to RLS).
-- No sequence grants: the tables use uuid keys.

-- 1. Schema usage (anon only for public.health(); service_role for jobs and seeds).
grant usage on schema public to anon, authenticated, service_role;

-- 2. Defaults grant nothing: a later table has no API privileges until its migration grants them.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

-- 3. Start the five tables from nothing.
revoke all on public.tenant, public.app_user, public.membership, public.membership_project, public.project
  from anon, authenticated, service_role;

-- 4. Explicit grants. The four tenancy tables decide who sees what, so a signed-in member may not
-- write them (TABLE_GRANTS in app/test-harness/rls/table-grants.ts records the reasons); EZD-105,
-- 106, 112 and 129 add reviewed write paths.
grant select, insert, update, delete on public.project to authenticated;
grant select on public.tenant, public.app_user, public.membership, public.membership_project to authenticated;
grant select, insert, update, delete
  on public.tenant, public.app_user, public.membership, public.membership_project, public.project
  to service_role;
