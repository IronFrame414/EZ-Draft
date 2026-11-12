// EZD-133 section 3 harness row `money/not-money-columns.ts` (vault/plans/EZD-133.md; R26 R2; 03c): every column
// whose name looks like money must be in MONEY_FIELDS or here with a reason. Entries are approved by the
// security-reviewer. Test-only.
import type { Sql, TransactionSql } from '../rls/db';
import type { MoneyField } from '../../src/server/db/money-fields';

export const MONEY_NAME_PATTERN =
  /(^|_)(cost|costs|sell|markup|price|prices|amount|amounts|total|totals|allowance|allowances|overhead|profit|margin|usd|dollar|dollars|cents|subtotal|fee|fees|rate|rates|tax|discount)(_|$)/;

export const NOT_MONEY_COLUMNS: ReadonlyArray<{
  schema: 'public' | 'private';
  table: string;
  column: string;
  reason: string;
}> = [
  // EZD-5602 E3 (vault/plans/EZD-5602.md section 4).
  {
    schema: 'public',
    table: 'ai_usage',
    column: 'cost_usd',
    reason: "The user's own Anthropic bill, not company cost or sell price (Q-0637 usage row)",
  },
];

export async function unlistedMoneyColumns(
  sql: Sql | TransactionSql,
  fields: readonly MoneyField[],
  notMoney: ReadonlyArray<{ schema: string; table: string; column: string }>,
): Promise<string[]> {
  const rows = await (sql as Sql)<
    { table_schema: string; table_name: string; column_name: string }[]
  >`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema in ('public', 'private')`;
  const known = new Set([...fields, ...notMoney].map((f) => `${f.schema}.${f.table}.${f.column}`));
  return rows
    .filter((r) => MONEY_NAME_PATTERN.test(r.column_name))
    .map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`)
    .filter((name) => !known.has(name))
    .sort();
}
