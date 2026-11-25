// EZD-611a (09c Code check engine; R26 R34 "The catalog file in the repo is the source of truth"): the catalog rules in
// public.code_rule are exactly vault/spec/code-rules.json, through the one mapping both this test and the migration
// generator use (scripts/code-rules/catalog-row.mjs). When the file changes, this test fails until a new migration is
// written with `node scripts/code-rules/write-migration.mjs <name>`. Expected counts: 09c (1,248 rules; Automatic 277,
// Needs data 276, Reminder 695; 756 from the code text, 312 from published summaries, 180 unverified).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CATALOG_COLUMNS, CATALOG_PATH, catalogRow } from '../../../../scripts/code-rules/catalog-row.mjs';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const entries = JSON.parse(readFileSync(path.join(repoRoot, CATALOG_PATH), 'utf8')) as Record<string, string>[];
type Row = Record<string, unknown>;
const byId = (a: Row, b: Row) => String(a.rule_id).localeCompare(String(b.rule_id));

describe('EZD-611a code_rule matches the Code rules catalog file', () => {
  afterAll(async () => {
    await closeHarness();
  });

  it('the file holds the 1,248 rules of 09c', () => {
    const count = (key: string) => Object.fromEntries(
      [...new Set(entries.map((e) => e[key]))].map((v) => [v, entries.filter((e) => e[key] === v).length]),
    );
    expect(entries).toHaveLength(1248);
    expect(new Set(entries.map((e) => e.id)).size).toBe(1248);
    expect(count('type')).toEqual({ Automatic: 277, 'Needs data': 276, Reminder: 695 });
    expect(count('source')).toEqual({ 'Code text': 756, 'Published summary': 312, Unverified: 180 });
  });

  it('the catalog rows of the table and the file do not differ', async () => {
    const rows = await harnessSql().unsafe(
      `select ${CATALOG_COLUMNS.join(', ')} from public.code_rule where tenant_id is null`,
    );
    const table: Row[] = rows.map((r) => ({ ...r })).sort(byId);
    const file: Row[] = entries.map(catalogRow).sort(byId);
    expect(table).toHaveLength(file.length);
    expect(table).toEqual(file);
  });

  it('no catalog rule starts verified (R19)', async () => {
    const [row] = await harnessSql()`
      select count(*)::int as n from public.code_rule
      where tenant_id is null and (verified_at is not null or verified_by is not null)`;
    expect(row?.n).toBe(0);
  });
});
