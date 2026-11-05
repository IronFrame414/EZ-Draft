// EZD-133 Step 1 (vault/plans/EZD-133.md): the money field registry. Each entry is a database column that holds
// a company cost or a sell price (03 rule 2; R26 R2; Q-0507). `responseKeys` lists the response keys that differ
// from the column after normalising (lower case, `_` and `-` dropped). Every ticket that adds a money column adds
// its entry here; the money route and page tests read this list.
import type { PermissionKey } from '../../lib/permissions/catalog';

export type MoneyClass = 'company_cost' | 'sell_price';

export type MoneyField = {
  schema: 'public' | 'private';
  table: string;
  column: string;
  moneyClass: MoneyClass;
  responseKeys: readonly string[];
  source: string;
};

// No local column holds money yet (EZD-133 section 1, 2026-11-04).
export const MONEY_FIELDS: readonly MoneyField[] = [];

export const MONEY_PERMISSIONS: Readonly<Record<MoneyClass, PermissionKey>> = {
  company_cost: 'see_company_costs',
  sell_price: 'see_sell_prices',
};

const MONEY_CLASS_ORDER: readonly MoneyClass[] = ['company_cost', 'sell_price'];

// The money classes whose permission is not in `permissions`, company_cost first (Decided D8).
export function deniedMoneyClasses(permissions: ReadonlySet<PermissionKey>): MoneyClass[] {
  return MONEY_CLASS_ORDER.filter((moneyClass) => !permissions.has(MONEY_PERMISSIONS[moneyClass]));
}
