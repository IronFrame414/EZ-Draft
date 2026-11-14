// EZD-102 section 3 harness row (vault/plans/EZD-102.md): set one membership's 37 switches directly in the
// database. Deletes the membership's user_permission rows (including any EZD-101's seeding trigger wrote),
// then inserts one row per PERMISSION_KEYS key in one statement, granted = key in `granted` (the table's
// only columns, EZD-101 Data). Test-only; never imported by app code.
import { PERMISSION_KEYS, type PermissionKey } from '../../src/lib/permissions/catalog';
import { harnessSql } from '../rls/fixtures';

export async function setPermissions(
  tenantId: string,
  membershipId: string,
  granted: readonly PermissionKey[],
): Promise<void> {
  const sql = harnessSql();
  const on = new Set<PermissionKey>(granted);
  const rows = PERMISSION_KEYS.map((key) => ({
    tenant_id: tenantId,
    membership_id: membershipId,
    permission_key: key,
    granted: on.has(key),
  }));
  // One transaction: EZD-106's deferred last-holder guard sees the final rows, not the empty middle.
  await sql.begin(async (tx) => {
    await tx`delete from public.user_permission where membership_id = ${membershipId}::uuid`;
    await tx`insert into public.user_permission ${tx(rows, 'tenant_id', 'membership_id', 'permission_key', 'granted')}`;
  });
}
