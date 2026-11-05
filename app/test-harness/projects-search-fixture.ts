// EZD-117b section 4 "Fixture H" and "Fixture E" (vault/plans/EZD-117b.md): the five projects and the members the
// search tests share. Rows go in with harnessSql() and an explicit updated_at (the update trigger does not run on
// insert). Cleanup is the caller's cleanup() (it removes the tenant and its projects).
import { PERMISSION_KEYS, type PermissionKey } from '../src/lib/permissions/catalog';
import { setPermissions } from './permissions/grant';
import { createMember, harnessSql, type Member } from './rls/fixtures';

export type HKey = 'kitchen' | 'primary' | 'guest' | 'laundry' | 'hall';

const ROWS: readonly {
  key: HKey;
  name: string;
  address: string;
  client: string | null;
  status: string;
  updated: string;
}[] = [
  {
    key: 'kitchen',
    name: 'Kitchen remodel',
    address: '12 Palm Ave',
    client: 'Hendricks Family',
    status: 'draft',
    updated: '2026-10-05T12:00:00Z',
  },
  {
    key: 'primary',
    name: 'Primary bath',
    address: '40 Hendricks Rd',
    client: null,
    status: 'client_review',
    updated: '2026-10-04T12:00:00Z',
  },
  {
    key: 'guest',
    name: 'Guest bath',
    address: '7 Oak St',
    client: 'Oak Lane',
    status: 'approved',
    updated: '2026-10-03T12:00:00Z',
  },
  {
    key: 'laundry',
    name: 'Laundry',
    address: '9 Elm Ct',
    client: null,
    status: 'in_build',
    updated: '2026-10-02T12:00:00Z',
  },
  {
    key: 'hall',
    name: 'Hall bath',
    address: '3 Pine Way',
    client: null,
    status: 'draft',
    updated: '2026-10-01T12:00:00Z',
  },
];

export const H_NAMES = ROWS.map((r) => r.name);

export async function seedFixtureH(tenantId: string): Promise<Record<HKey, string>> {
  const sql = harnessSql();
  const customerIds = new Map<string, string>();
  for (const name of ['Hendricks Family', 'Oak Lane']) {
    const email = `${name.toLowerCase().replace(/ /g, '')}@example.test`;
    const rows = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenantId}::uuid, ${name}, ${email}) returning id`;
    customerIds.set(name, rows[0].id);
  }
  const ids = {} as Record<HKey, string>;
  for (const r of ROWS) {
    const customerId = r.client === null ? null : (customerIds.get(r.client) as string);
    const rows = await sql<{ id: string }[]>`
      insert into public.project (tenant_id, name, address, type, status, updated_at, customer_id)
      values (${tenantId}::uuid, ${r.name}, ${r.address}, 'kitchen', ${r.status},
        ${r.updated}::timestamptz, ${customerId}::uuid)
      returning id`;
    ids[r.key] = rows[0].id;
  }
  return ids;
}

async function member(
  tenantId: string,
  permissions: readonly PermissionKey[],
  scope: 'all' | 'listed' = 'all',
  listed: string[] = [],
): Promise<Member> {
  const m = await createMember({ tenantId, scope, listed });
  await setPermissions(tenantId, m.membershipId, permissions);
  return m;
}

// The owner (every switch) is named "Pat Owner", so the avatar initials are "PO".
export async function ownerMember(tenantId: string): Promise<Member> {
  const m = await member(tenantId, PERMISSION_KEYS);
  await harnessSql()`update public.app_user set name = 'Pat Owner' where id = ${m.appUserId}::uuid`;
  return m;
}

export const viewerMember = (tenantId: string) => member(tenantId, ['view_projects']);
export const catalogMember = (tenantId: string) =>
  member(tenantId, ['view_projects', 'settings_catalog']);
export const noviewMember = (tenantId: string) => member(tenantId, []);
export const listedViewer = (tenantId: string, listed: string[]) =>
  member(tenantId, ['view_projects'], 'listed', listed);
