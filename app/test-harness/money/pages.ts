// EZD-133 section 3 harness row `money/pages.ts` (vault/plans/EZD-133.md): list every page file under
// `<appSrcDir>/app/` (Next.js default pageExtensions) and scan the text a page loads for money names.
// Scripts are static, so only documents and data requests are scanned. Test-only.
import path from 'node:path';
import type { MoneyClass, MoneyField } from '../../src/server/db/money-fields';
import type { TrafficResponse } from '../e2e/traffic';
import { moneyTextViolations } from './scan';
import { repoRelative, walkFiles } from './routes';

export const PAGE_FILE = /^page\.(tsx|ts|jsx|js)$/;
export const PAGE_SCAN_TYPES = ['document', 'fetch', 'xhr'] as const;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function listPages(appSrcDir: string): string[] {
  return walkFiles(path.join(appSrcDir, 'app'))
    .filter((f) => PAGE_FILE.test(path.basename(f)))
    .map((f) => repoRelative(appSrcDir, f))
    .sort(byText);
}

export function uncoveredPages(
  appSrcDir: string,
  cases: readonly { file: string }[],
): { missing: string[]; stale: string[] } {
  const listed = listPages(appSrcDir);
  const have = new Set(cases.map((c) => c.file));
  const real = new Set(listed);
  return {
    missing: listed.filter((f) => !have.has(f)),
    stale: cases.map((c) => c.file).filter((f) => !real.has(f)),
  };
}

export function pageViolations(
  responses: readonly TrafficResponse[],
  fields: readonly MoneyField[],
  denied: readonly MoneyClass[],
): string[] {
  const out: string[] = [];
  for (const r of responses) {
    if (!(PAGE_SCAN_TYPES as readonly string[]).includes(r.resourceType)) continue;
    for (const v of moneyTextViolations(r.body, fields, denied)) {
      out.push(`${r.method} ${r.path}: ${v}`);
    }
  }
  return out;
}
