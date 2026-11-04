// EZD-133 S1-S4, C2, C3, C5, W0 (vault/plans/EZD-133.md section 4; AC-EZD-133-2, -3, -4). Pure unit tests of the
// money scan and the route and page listings; temp folders are built here, never read from the live tree.
// Expected values: Decided D6, D7 (key match), the scan row of section 3, HTTP_METHODS order, PAGE_FILE.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { MoneyClass, MoneyField } from '../../src/server/db/money-fields';
import type { TrafficResponse } from '../e2e/traffic';
import { CANARY_FIELDS } from './canary-route';
import { pageViolations, uncoveredPages } from './pages';
import { routeMethodsIn, uncoveredRoutes } from './routes';
import { moneyTextViolations, moneyViolations } from './scan';

const field = (
  column: string,
  moneyClass: MoneyClass,
  responseKeys: readonly string[] = [],
): MoneyField => ({ schema: 'public', table: 't', column, moneyClass, responseKeys, source: 'test' });

const temps: string[] = [];
function tempTree(files: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd133-'));
  temps.push(dir);
  for (const f of files) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), '');
  }
  return dir;
}
function put(dir: string, file: string, source: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), source);
}

const response = (
  method: string,
  p: string,
  resourceType: string,
  body: string,
): TrafficResponse => ({
  method,
  path: p,
  resourceType,
  status: 200,
  fromServiceWorker: false,
  headerValues: [],
  body,
  redirectedTo: null,
});

describe('EZD-133 money scan', () => {
  afterAll(() => {
    for (const d of temps) rmSync(d, { recursive: true, force: true });
  });

  it('S1 a denied key is found at its path, depth first', () => {
    const body = { a: { items: [{ id: 1, unitCost: 3 }] } };
    expect(moneyViolations(body, [field('unit_cost', 'company_cost')], ['company_cost'])).toEqual([
      '$.a.items[0].unitCost',
    ]);
  });

  it('S2 keys match after lower-casing and dropping _ and -, and a responseKeys entry matches too', () => {
    const body = { unit_cost: 1, unitCost: 2, 'UNIT-COST': 3 };
    expect(moneyViolations(body, [field('unit_cost', 'company_cost')], ['company_cost'])).toEqual([
      '$.unit_cost',
      '$.unitCost',
      '$.UNIT-COST',
    ]);
    expect(
      moneyViolations(
        { renderDollars: 1 },
        [field('cost_usd', 'company_cost', ['renderDollars'])],
        ['company_cost'],
      ),
    ).toEqual(['$.renderDollars']);
  });

  it('S3 a field of a class that is not denied, or a value that only reads like a key, is not a hit', () => {
    expect(
      moneyViolations({ sellPrice: 1 }, [field('sell_price', 'sell_price')], ['company_cost']),
    ).toEqual([]);
    expect(
      moneyViolations({ note: 'unit_cost' }, [field('unit_cost', 'company_cost')], ['company_cost']),
    ).toEqual([]);
  });

  it('S4 the text scan finds the column and its camelCase, bounded by non-word characters', () => {
    expect(
      moneyTextViolations('x unit_cost; unitCost; unit_costs; myunitCost', [
        field('unit_cost', 'company_cost'),
      ], ['company_cost']),
    ).toEqual(['text:unit_cost', 'text:unitCost']);
  });

  it('C2 uncoveredRoutes lists each exported method of a route file that has no case, and a case with no method', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd133-'));
    temps.push(dir);
    put(dir, 'app/api/probe/route.ts', 'export function GET() {}\nexport const POST = () => {};\n');
    put(dir, 'app/api/star/route.ts', "export * from './x';\n");
    const result = uncoveredRoutes(dir, [{ file: 'app/src/app/api/gone/route.ts', method: 'GET' }]);
    expect(result.missing).toEqual([
      { file: 'app/src/app/api/probe/route.ts', method: 'GET' },
      { file: 'app/src/app/api/probe/route.ts', method: 'POST' },
      { file: 'app/src/app/api/star/route.ts', method: '*' },
    ]);
    expect(result.stale).toEqual([{ file: 'app/src/app/api/gone/route.ts', method: 'GET' }]);
  });

  it('C3 routeMethodsIn reads every export form and returns the methods in HTTP_METHODS order', () => {
    const source = [
      'export async function GET() {}',
      'export function HEAD() {}',
      'export const OPTIONS = () => {};',
      'const h = () => {};',
      'export { h as DELETE };',
      "export const dynamic = 'force-dynamic';",
    ].join('\n');
    expect(routeMethodsIn(source)).toEqual(['GET', 'HEAD', 'DELETE', 'OPTIONS']);
  });

  it('C5 uncoveredPages lists page files by the Next.js page extensions and a case with no file', () => {
    const dir = tempTree([
      'app/page.tsx',
      'app/(g)/a/page.ts',
      'app/b/Page.tsx',
      'app/b/page.module.css',
    ]);
    const result = uncoveredPages(dir, [{ file: 'app/src/app/gone/page.tsx' }]);
    expect(result.missing).toEqual(['app/src/app/(g)/a/page.ts', 'app/src/app/page.tsx']);
    expect(result.stale).toEqual(['app/src/app/gone/page.tsx']);
  });

  it('W0 the page scan reads documents, fetches and XHRs, not scripts, and names each hit', () => {
    const responses = [
      response('GET', '/d', 'document', String.raw`self.__next_f.push([1,"{\"canaryCost\":12.5}"])`),
      response('GET', '/c.js', 'script', 'canaryCost'),
      response('GET', '/f', 'fetch', '{"canarySell":20}'),
      response('GET', '/x', 'xhr', 'canary_cost'),
    ];
    expect(pageViolations(responses, CANARY_FIELDS, ['company_cost'])).toEqual([
      'GET /d: text:canaryCost',
      'GET /x: text:canary_cost',
    ]);
  });
});
