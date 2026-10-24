// EZD-006 Step 6 (vault/plans/EZD-006.md): the tenant-less tables and the scope key of `project`.
// docs/architecture.md "### Tenancy tables (EZD-005)" lists the same two tables (T18, T20 check both).
// A later ticket that adds a tenant-less table adds an entry with its reason and the docs line; the
// security-reviewer approves it. Exempt tables skip the tenant_id, index and helper codes of the audit
// but still need RLS and a policy.
export type TenantlessTable = { table: string; reason: string };

export const TENANTLESS_TABLES: TenantlessTable[] = [
  {
    table: 'app_user',
    reason:
      'One person across tenants, linked to each company by membership (user_id, tenant_id) (03 Tables; EZD-005a).',
  },
  {
    table: 'backup_run',
    reason:
      'System-wide off-site backup and restore-drill records (EZD-025); no tenant data; no API role can read it',
  },
  {
    table: 'sign_in_throttle',
    reason:
      'Sign-in throttle: rows are written before sign-in and belong to no company; they hold only keyed hashes and times (Q-0094).',
  },
  {
    table: 'tenant',
    reason: 'It is the tenant; its key is id (03 Tables; EZD-005a).',
  },
];

// Tables whose project scope key is not `project_id` (the audit's policy_missing_scope_helper code).
export const PROJECT_KEY: Record<string, string> = { project: 'id' };
