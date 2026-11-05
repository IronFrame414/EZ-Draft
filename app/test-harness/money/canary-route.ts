// EZD-133 section 3 harness row `money/canary-route.ts` (vault/plans/EZD-133.md): a route that always leaks two
// money keys, so the scan is proven to find them (K1, K2). Not an app route. Test-only.
import type { MoneyField } from '../../src/server/db/money-fields';
import type { MoneyRouteCase } from './route-cases';

export function GET(): Response {
  return Response.json({ item: { id: 'canary-1', canaryCost: 12.5, canarySell: 20 } });
}

export const CANARY_FIELDS: readonly MoneyField[] = [
  {
    schema: 'public',
    table: 'ezd133_canary',
    column: 'canary_cost',
    moneyClass: 'company_cost',
    responseKeys: [],
    source: 'EZD-133 canary',
  },
  {
    schema: 'public',
    table: 'ezd133_canary',
    column: 'canary_sell',
    moneyClass: 'sell_price',
    responseKeys: [],
    source: 'EZD-133 canary',
  },
];

export const CANARY_CASE: MoneyRouteCase = {
  file: 'app/test-harness/money/canary-route.ts',
  method: 'GET',
  load: async () => ({ GET }),
  request: async () => ({ request: new Request('http://localhost/canary') }),
  expectStatus: 200,
};
