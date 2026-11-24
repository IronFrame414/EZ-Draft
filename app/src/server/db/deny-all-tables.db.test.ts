// EZD-1932 (audit 2026-11-23 S2; AC-EZD-1932-4; CLAUDE.md rule 4, deny-all form): the three tenant-less,
// service-role-only tables. An all-scope member of one company and an all-scope member of another company can
// neither read nor write a row: select is refused or empty, insert is refused, update and delete are refused or
// touch nothing, and the seeded row is unchanged afterwards. Local database through the EZD-006 harness.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { adminSql, type Sql } from '../../../test-harness/rls/db';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

const hex64 = () => randomBytes(32).toString('hex');

type Table = {
  table: 'sign_in_throttle' | 'backup_run' | 'error_tunnel_throttle';
  seed: (sql: Sql) => Promise<string>;
  newRow: () => Record<string, unknown>;
  change: Record<string, unknown>;
  // A column read back through adminSql to show the row did not change.
  probe: string;
  // EZD-1947: the files that clear this whole table (tunnel-limits.db.test.ts, route-throttle.test.ts) hold the
  // error-alert lock while they do; this file holds it too, so its seeded row is not deleted under it.
  lock?: () => Promise<() => Promise<void>>;
};

const TABLES: Table[] = [
  {
    table: 'sign_in_throttle',
    seed: async (sql) => {
      const r =
        await sql`insert into public.sign_in_throttle (kind, key_hash) values ('ip', ${hex64()}) returning id`;
      return r[0].id as string;
    },
    newRow: () => ({ kind: 'ip', key_hash: hex64() }),
    change: { failed: false },
    probe: 'failed',
  },
  {
    // Old, finished rows so the backup status reads of other tests never pick this one up.
    table: 'backup_run',
    seed: async (sql) => {
      const r = await sql`
        insert into public.backup_run (kind, status, started_at, finished_at)
        values ('files', 'succeeded', '2000-01-01T00:00:00Z', '2000-01-01T00:01:00Z') returning id`;
      return r[0].id as string;
    },
    newRow: () => ({ kind: 'files' }),
    change: { status: 'failed' },
    probe: 'status',
  },
  {
    table: 'error_tunnel_throttle',
    seed: async (sql) => {
      const r =
        await sql`insert into public.error_tunnel_throttle (key_hash) values (${hex64()}) returning id`;
      return r[0].id as string;
    },
    newRow: () => ({ key_hash: hex64() }),
    change: { key_hash: hex64() },
    probe: 'key_hash',
    lock: holdErrorAlertLock,
  },
];

describe('EZD-1932 deny-all tables: no member of any company reads or writes a row', () => {
  let sql: Sql;
  const seeded: { table: string; id: string }[] = [];
  const members: { label: string; session: Session }[] = [];

  beforeAll(async () => {
    sql = adminSql();
    for (const label of ['company A', 'company B']) {
      const tenantId = await createTenant();
      const member = await createMember({ tenantId, scope: 'all' });
      members.push({ label, session: await signIn(member.email) });
    }
  });

  afterAll(async () => {
    for (const { table, id } of seeded) {
      await sql.unsafe(`delete from public.${table} where id = $1`, [id]);
    }
    await sql.end({ timeout: 5 });
    await cleanup();
    await closeHarness();
  });

  for (const t of TABLES) {
    it(`EZD-1932 D1 ${t.table}: an all-scope member of company A and of company B can neither read nor write a row`, async () => {
      const unlock = t.lock ? await t.lock() : null;
      try {
        const id = await t.seed(sql);
        seeded.push({ table: t.table, id });
        const before = await sql.unsafe(`select * from public.${t.table} where id = $1`, [id]);
        expect(before.length).toBe(1);

        for (const { label, session } of members) {
          const db = session.serverDb;
          const tag = `${t.table} ${label}`;

          const read = await db.from(t.table).select('*').eq('id', id);
          const readRefused = read.error?.code === '42501';
          const readEmpty = read.error === null && (read.data ?? []).length === 0;
          expect(readRefused || readEmpty, `${tag} select: ${JSON.stringify(read)}`).toBe(true);

          const insert = await db.from(t.table).insert(t.newRow());
          expect(insert.error?.code, `${tag} insert`).toBe('42501');

          const update = await db.from(t.table).update(t.change).eq('id', id).select('id');
          const updateRefused = update.error?.code === '42501';
          const updateNone = update.error === null && (update.data ?? []).length === 0;
          expect(updateRefused || updateNone, `${tag} update: ${JSON.stringify(update)}`).toBe(
            true,
          );

          const del = await db.from(t.table).delete().eq('id', id).select('id');
          const deleteRefused = del.error?.code === '42501';
          const deleteNone = del.error === null && (del.data ?? []).length === 0;
          expect(deleteRefused || deleteNone, `${tag} delete: ${JSON.stringify(del)}`).toBe(true);
        }

        const after = await sql.unsafe(`select * from public.${t.table} where id = $1`, [id]);
        expect(after.length).toBe(1);
        expect(after[0][t.probe]).toEqual(before[0][t.probe]);
      } finally {
        await unlock?.();
      }
    }, 180000);
  }
});
