// EZD-133 section 3 harness row `money/run-case.ts` (vault/plans/EZD-133.md): call one route handler directly
// and scan the answer. JSON bodies are scanned by key, anything else as text; an empty body has no hits. `after`
// runs only when the status is the expected one. A body that claims JSON and does not parse throws, so it can
// never pass unscanned (L-019). Test-only.
import type { MoneyClass, MoneyField } from '../../src/server/db/money-fields';
import type { CaseEnv, MoneyRouteCase } from './route-cases';
import { moneyTextViolations, moneyViolations } from './scan';

export async function runMoneyCase(
  c: MoneyRouteCase,
  env: CaseEnv,
  fields: readonly MoneyField[],
  denied: readonly MoneyClass[],
): Promise<{ status: number; violations: string[] }> {
  const mod = await c.load();
  const { request, params } = await c.request(env);
  const handler = mod[c.method] as (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ) => Response | Promise<Response>;
  const res = await handler(request, { params: Promise.resolve(params ?? {}) });
  const text = await res.text();
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  let violations: string[] = [];
  let body: unknown = text;
  if (text !== '') {
    if (isJson) {
      body = JSON.parse(text);
      violations = moneyViolations(body, fields, denied);
    } else {
      violations = moneyTextViolations(text, fields, denied);
    }
  }
  if (res.status === c.expectStatus) c.after?.(body, env);
  return { status: res.status, violations };
}
