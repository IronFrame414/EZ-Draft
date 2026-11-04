// EZD-133 R1, G1, G2, G3 (vault/plans/EZD-133.md section 4; AC-EZD-133-2). Expected values: Decided D8 (class to
// switch map and order), D6 (registry columns exist), the name pattern row of section 3 (R26 R2; 03c) and the
// 0-row query of section 1 for G2.
import { afterAll, describe, expect, it } from 'vitest';
import {
  NOT_MONEY_COLUMNS,
  unlistedMoneyColumns,
} from '../../../test-harness/money/not-money-columns';
import { adminSql, withRollback } from '../../../test-harness/rls/db';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { PERMISSION_KEYS } from '../../lib/permissions/catalog';
import { deniedMoneyClasses, MONEY_FIELDS, MONEY_PERMISSIONS } from './money-fields';

describe('EZD-133 money field registry', () => {
  afterAll(async () => {
    await closeHarness();
  });

  it('R1 each money class is tied to its permission and the missing classes come back in order', () => {
    expect(MONEY_PERMISSIONS).toEqual({
      company_cost: 'see_company_costs',
      sell_price: 'see_sell_prices',
    });
    const all = new Set(PERMISSION_KEYS);
    expect(deniedMoneyClasses(all)).toEqual([]);
    const noCost = new Set(PERMISSION_KEYS.filter((k) => k !== 'see_company_costs'));
    expect(deniedMoneyClasses(noCost)).toEqual(['company_cost']);
    const neither = new Set(
      PERMISSION_KEYS.filter((k) => k !== 'see_company_costs' && k !== 'see_sell_prices'),
    );
    expect(deniedMoneyClasses(neither)).toEqual(['company_cost', 'sell_price']);
  });

  it('G1 every registry entry names a column that exists @smoke', async () => {
    const rows = await harnessSql()<{ name: string }[]>`
      select table_schema || '.' || table_name || '.' || column_name as name
      from information_schema.columns where table_schema in ('public', 'private')`;
    const existing = new Set(rows.map((r) => r.name));
    const missing = MONEY_FIELDS.map((f) => `${f.schema}.${f.table}.${f.column}`).filter(
      (name) => !existing.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('G2 no column named like money is missing from the registry or the not-money list @smoke', async () => {
    expect(await unlistedMoneyColumns(harnessSql(), MONEY_FIELDS, NOT_MONEY_COLUMNS)).toEqual([]);
  });

  it('G3 the name pattern finds cost, sell and markup columns and not a name that only contains a word', async () => {
    const sql = adminSql();
    try {
      const found = await withRollback(sql, async (tx) => {
        await tx`create table public.ezd133_probe (unit_cost numeric, sell_price numeric, markup_pct numeric, note text, costume text)`;
        return unlistedMoneyColumns(tx, [], []);
      });
      expect(found.filter((name) => name.startsWith('public.ezd133_probe.'))).toEqual([
        'public.ezd133_probe.markup_pct',
        'public.ezd133_probe.sell_price',
        'public.ezd133_probe.unit_cost',
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
