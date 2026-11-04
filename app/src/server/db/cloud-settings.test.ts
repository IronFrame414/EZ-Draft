// EZD-171 T1-T3 (vault/plans/EZD-171.md section 4). T1 and T2 run the SQL file as postgres on the local stack.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { adminSql, withRollback } from '../../../test-harness/rls/db';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../../../supabase/checks/cloud-settings.sql');
const sqlText = () => readFileSync(FILE, 'utf8');

const IDS = [
  'api_gate_registered',
  'api_gate_hash_stored',
  'token_hook_executable',
  'end_sessions_can_delete',
  'session_check_can_read',
  'rls_on_every_table',
  'anon_no_table_grants',
  'no_default_table_grants',
];

type Row = { check_id: string; ok: boolean };

describe('EZD-171 cloud settings SQL', () => {
  const sql = adminSql();
  afterAll(async () => {
    await sql.end();
  });

  it('EZD-171 done when: the cloud settings check returns every row true on the local stack', async () => {
    const rows = await withRollback(sql, async (tx) => {
      await tx.unsafe('set transaction read only');
      return (await tx.unsafe(sqlText())) as unknown as Row[];
    });
    expect(rows.map((r) => r.check_id)).toEqual(IDS);
    expect(rows.every((r) => r.ok === true)).toBe(true);
  });

  const cases: [string, string, string][] = [
    ['a', 'alter table public.project disable row level security', 'rls_on_every_table'],
    ['b', 'grant select on public.project to anon', 'anon_no_table_grants'],
    ['c', 'alter role authenticator reset pgrst.db_pre_request', 'api_gate_registered'],
    [
      'd',
      'alter default privileges for role postgres in schema public grant select on tables to anon',
      'no_default_table_grants',
    ],
    [
      'e',
      'revoke execute on function private.custom_access_token_hook(jsonb) from supabase_auth_admin',
      'token_hook_executable',
    ],
  ];
  for (const [label, change, failing] of cases) {
    it(`EZD-171 T2 (${label}) only ${failing} turns false`, async () => {
      const rows = await withRollback(sql, async (tx) => {
        await tx.unsafe(change);
        return (await tx.unsafe(sqlText())) as unknown as Row[];
      });
      expect(rows.map((r) => r.check_id)).toEqual(IDS);
      for (const r of rows) expect(r.ok, r.check_id).toBe(r.check_id !== failing);
    });
  }

  it('EZD-171 T3 the file is one read-only select', () => {
    const text = sqlText()
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
      .trim();
    expect(text.startsWith('select')).toBe(true);
    expect(text.split(';').length - 1).toBe(1);
    expect(text.endsWith(';')).toBe(true);
    for (const w of [
      'begin',
      'set',
      'insert',
      'update',
      'alter',
      'create',
      'drop',
      'grant',
      'revoke',
      'notify',
    ]) {
      expect(new RegExp(`\\b${w}\\b`, 'i').test(text), w).toBe(false);
    }
  });
});
