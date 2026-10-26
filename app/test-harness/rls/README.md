# RLS policy test harness (EZD-006)

Source: vault/plans/EZD-006.md Steps 6 and 7; vault/tickets/README.md ("a tenant-isolation test in the EZD-006 harness"). Test-only code: nothing under `app/src/` imports it.

## A ticket that creates a table

1. Its migration adds `tenant_id`, enables RLS, adds the policies on the Step 5 template (helpers wrapped in `(select …)`), the `tenant_id` and `project_id` indexes, and explicit grants that name the table (`service_role` always; `authenticated` per `table-grants.ts`).
2. Its test file, inside its own top-level `describe('EZD-xxx …')` (check C9), calls `describeTenantIsolation('<table>', { makeRow })` from `app/test-harness/rls/isolation.ts`. `makeRow(tenantId, ctx)` returns one insertable row for that tenant; `ctx` holds tenant A's `projectIds`, its `member` and a `spareAppUserId`. The helper asserts that another tenant's member reads no row, cannot update or delete it, and cannot insert one. It cleans up its own rows.
3. The `@smoke` audit (`app/src/server/db/rls.audit.test.ts`, `auditRls`) fails the gate on a missing policy, index, isolation test or explicit grant.

## Exemptions

- A table without `tenant_id` needs an entry in `tenancy-exemptions.ts` (`TENANTLESS_TABLES`) with a reason and the matching line in `docs/architecture.md`; the security-reviewer approves it.
- A table whose `authenticated` privileges are narrower than select/insert/update/delete needs an entry in `table-grants.ts` (`TABLE_GRANTS`) with a reason.
- A `public` function callable by `anon` or `authenticated` is added to `gate.ts` (`GATED_RPC_CALLS`).
- A `private` function that `anon`, `authenticated` or `service_role` may execute needs an entry in `private-execute.ts` (`PRIVATE_EXECUTE`) with a reason; no `private` function may be executable by PUBLIC (EZD-168).

## Files

`db.ts` (postgres.js client to `EZD_TEST_DB_URL`, `withRollback`), `fixtures.ts` (tenants, projects, members, sign-in through the Auth admin API, `serverDb` with the gate header / `browserDb` without, `anonDb`, `claimsOf`, `sessionCount`, `asClaims`, `cleanup`), `isolation.ts`, `audit.ts`, `tenancy-exemptions.ts`, `table-grants.ts`, `private-execute.ts`, `gate.ts`. The global setup `app/test-harness/supabase-env.global-setup.ts` sets `EZD_TEST_DB_URL` and a per-run `SUPABASE_API_GATE_SECRET`.
