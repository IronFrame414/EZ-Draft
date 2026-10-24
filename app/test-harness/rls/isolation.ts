// EZD-006 Step 7 (vault/plans/EZD-006.md; vault/tickets/README.md rule "a tenant-isolation test in the
// EZD-006 harness"): describeTenantIsolation(table, { makeRow }) is called inside a ticket's own top-level
// describe (C9). Tenants A and B each get one all-scope member; one row from makeRow(A) is inserted with
// the admin client; as B's member (serverDb, gate header sent) the row is invisible and unwritable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  cleanupCreated,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  marker,
  signIn,
  since,
  type CreatedRefs,
  type Member,
  type Session,
} from './fixtures';

export type IsolationContext = {
  // Tenant A's fixtures the row may point at.
  projectIds: string[];
  member: Member;
  // An app_user with no membership anywhere (for membership-like rows).
  spareAppUserId: string;
};

export type Row = Record<string, unknown>;

export type IsolationOptions = {
  makeRow: (tenantId: string, ctx: IsolationContext) => Row | Promise<Row>;
  // Columns to set in the update attempt; default: the first non-key column of the row, to its own value.
  update?: Row;
};

const PRIVILEGE = '42501';

export function describeTenantIsolation(table: string, options: IsolationOptions): void {
  describe(`tenant isolation: ${table}`, () => {
    let refs: CreatedRefs = { tenantIds: [], authUserIds: [], appUserIds: [] };
    let tenantA = '';
    let ctx: IsolationContext;
    let b: Session;
    let row: Row;
    let key: Row;
    let keyColumns: string[] = [];

    beforeAll(async () => {
      const mark = marker();
      tenantA = await createTenant();
      const tenantB = await createTenant();
      const projectIds = await createProjects(tenantA, 1);
      const member = await createMember({ tenantId: tenantA, scope: 'all' });
      const spare = await createAppUser();
      ctx = { projectIds, member, spareAppUserId: spare.appUserId };
      const memberB = await createMember({ tenantId: tenantB, scope: 'all' });
      b = await signIn(memberB.email);
      refs = since(mark);

      const cols = await harnessSql()<{ attname: string }[]>`
        select a.attname
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
        where i.indisprimary and i.indrelid = ${'public.' + table}::regclass
        order by array_position(i.indkey, a.attnum)`;
      keyColumns = cols.map((c) => c.attname);
      expect(keyColumns.length, `${table} has a primary key`).toBeGreaterThan(0);

      const { data, error } = await adminDb()
        .from(table)
        .insert(await options.makeRow(tenantA, ctx))
        .select('*')
        .single();
      expect(error, `admin insert into ${table}`).toBeNull();
      row = data as Row;
      key = Object.fromEntries(keyColumns.map((c) => [c, row[c]]));
    });

    afterAll(async () => {
      await cleanupCreated(refs);
    });

    it(`select by key as another tenant's member returns no row (${table})`, async () => {
      const { data, error } = await b.serverDb.from(table).select('*').match(key);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`update as another tenant's member changes nothing (${table})`, async () => {
      const patch = options.update ?? defaultPatch(row, keyColumns);
      const { data, error } = await b.serverDb.from(table).update(patch).match(key).select('*');
      if (error) expect(error.code).toBe(PRIVILEGE);
      else expect(data).toEqual([]);
      await expectUnchanged(table, key, row);
    });

    it(`delete as another tenant's member changes nothing (${table})`, async () => {
      const { data, error } = await b.serverDb.from(table).delete().match(key).select('*');
      if (error) expect(error.code).toBe(PRIVILEGE);
      else expect(data).toEqual([]);
      await expectUnchanged(table, key, row);
    });

    it(`insert for the other tenant as its non-member is refused (${table})`, async () => {
      const fresh = await options.makeRow(tenantA, ctx);
      const { error } = await b.serverDb.from(table).insert(fresh);
      expect(error?.code).toBe(PRIVILEGE);
    });
  });
}

function defaultPatch(row: Row, keyColumns: string[]): Row {
  const col = Object.keys(row).find((c) => !keyColumns.includes(c));
  if (!col) throw new Error('row has no non-key column to update');
  return { [col]: row[col] };
}

async function expectUnchanged(table: string, key: Row, original: Row): Promise<void> {
  const { data, error } = await adminDb().from(table).select('*').match(key).single();
  expect(error).toBeNull();
  expect(data).toEqual(original);
}
