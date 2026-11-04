// EZD-117a section 4 "Fixture S" (vault/plans/EZD-117a.md): the seven projects the DB, route and browser tests
// share. Rows go in with harnessSql() and an explicit updated_at (the update trigger does not run on insert).
// Customers carry emails (EZD-113). Cleanup is the caller's cleanup() (it removes the tenant and its projects).
import { harnessSql } from './rls/fixtures';

export type FixtureKey = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7';

type Row = {
  key: FixtureKey;
  name: string;
  client: string | null;
  status: string;
  open: number;
  updated: string;
  archived: boolean;
};

export const FIXTURE_S: readonly Row[] = [
  {
    key: 'P1',
    name: 'bravo',
    client: 'Zed Co',
    status: 'approved',
    open: 0,
    updated: '2026-10-05T12:00:00Z',
    archived: false,
  },
  {
    key: 'P2',
    name: 'Alpha',
    client: null,
    status: 'draft',
    open: 2,
    updated: '2026-10-04T12:00:00Z',
    archived: false,
  },
  {
    key: 'P3',
    name: 'charlie',
    client: 'acme',
    status: 'draft',
    open: 5,
    updated: '2026-10-03T12:00:00Z',
    archived: false,
  },
  {
    key: 'P4',
    name: 'Delta',
    client: 'Mid',
    status: 'in_build',
    open: 2,
    updated: '2026-10-06T12:00:00Z',
    archived: false,
  },
  {
    key: 'P5',
    name: 'echo',
    client: null,
    status: 'client_review',
    open: 0,
    updated: '2026-10-02T12:00:00Z',
    archived: false,
  },
  {
    key: 'P6',
    name: 'foxtrot',
    client: 'acme',
    status: 'permit_submitted',
    open: 1,
    updated: '2026-10-01T12:00:00Z',
    archived: false,
  },
  {
    key: 'P7',
    name: 'golf',
    client: null,
    status: 'draft',
    open: 0,
    updated: '2026-10-07T12:00:00Z',
    archived: true,
  },
];

export async function seedFixtureS(tenantId: string): Promise<Record<FixtureKey, string>> {
  const sql = harnessSql();
  const customerIds = new Map<string, string>();
  for (const name of ['Zed Co', 'acme', 'Mid']) {
    const email = `${name.toLowerCase().replace(/ /g, '')}@example.test`;
    const rows = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenantId}::uuid, ${name}, ${email}) returning id`;
    customerIds.set(name, rows[0].id);
  }
  const ids = {} as Record<FixtureKey, string>;
  for (const [i, r] of FIXTURE_S.entries()) {
    const customerId = r.client === null ? null : (customerIds.get(r.client) as string);
    const rows = await sql<{ id: string }[]>`
      insert into public.project
        (tenant_id, name, address, type, status, open_items_count, updated_at, archived_at, customer_id)
      values (${tenantId}::uuid, ${r.name}, ${`${i + 1} Sort St`}, 'kitchen', ${r.status}, ${r.open},
        ${r.updated}::timestamptz, ${r.archived ? sql`now()` : null}, ${customerId}::uuid)
      returning id`;
    ids[r.key] = rows[0].id;
  }
  return ids;
}

// B1 and B4: n projects by generate_series, status (i - 1) % 5, updated_at minus i minutes.
export async function seedGenerated(tenantId: string, n: number): Promise<void> {
  const sql = harnessSql();
  await sql`
    insert into public.project (tenant_id, name, address, type, status, updated_at)
    select ${tenantId}::uuid, 'gen ' || i, i || ' Gen St', 'kitchen',
      (array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'])[((i - 1) % 5) + 1],
      now() - i * interval '1 minute'
    from generate_series(1, ${n}::int) i`;
}
