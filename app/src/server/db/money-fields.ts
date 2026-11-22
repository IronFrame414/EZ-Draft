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

export const MONEY_FIELDS: readonly MoneyField[] = [
  // EZD-401 (03c catalog_item; S09 Permissions: cost with See company costs; sell price and markup with See
  // sell prices).
  {
    schema: 'public',
    table: 'catalog_item',
    column: 'unit_cost',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-401; 03c catalog_item; S09 Permissions',
  },
  {
    schema: 'public',
    table: 'catalog_item',
    column: 'sell_price',
    moneyClass: 'sell_price',
    responseKeys: [],
    source: 'EZD-401; 03c catalog_item; S09 Permissions',
  },
  {
    schema: 'public',
    table: 'catalog_item',
    column: 'markup_pct',
    moneyClass: 'sell_price',
    responseKeys: [],
    source: 'EZD-401; 03c catalog_item; S09 Permissions',
  },
  // EZD-1102 (S15f; 13b R2: render cost and allowance dollars are See company costs).
  {
    schema: 'public',
    table: 'render_tier_model',
    column: 'cost_usd_per_render',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-1102; S15f Tiers; 13b R2',
  },
  {
    schema: 'public',
    table: 'render_allowance',
    column: 'amount_usd',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-1102; 03d render_allowance; 13b R2',
  },
  {
    schema: 'public',
    table: 'render_allowance',
    column: 'balance_usd',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-1102; 03d render_allowance; 13b R2',
  },
  {
    schema: 'public',
    table: 'render_allowance',
    column: 'refill_amount_usd',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-1102; 03d render_allowance; 13b R2',
  },
  // EZD-1009 (03c design_option internal_cost_lines; 13b R2: option cost lines are See company costs).
  {
    schema: 'public',
    table: 'design_option_cost_line',
    column: 'unit_cost',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-1009; 03c design_option; 13b R2',
  },
];

export const MONEY_PERMISSIONS: Readonly<Record<MoneyClass, PermissionKey>> = {
  company_cost: 'see_company_costs',
  sell_price: 'see_sell_prices',
};

const MONEY_CLASS_ORDER: readonly MoneyClass[] = ['company_cost', 'sell_price'];

// The money classes whose permission is not in `permissions`, company_cost first (Decided D8).
export function deniedMoneyClasses(permissions: ReadonlySet<PermissionKey>): MoneyClass[] {
  return MONEY_CLASS_ORDER.filter((moneyClass) => !permissions.has(MONEY_PERMISSIONS[moneyClass]));
}
