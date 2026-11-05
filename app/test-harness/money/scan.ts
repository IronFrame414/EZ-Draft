// EZD-133 section 3 harness row `money/scan.ts` (vault/plans/EZD-133.md; Decided D6 registry, D7 key match). Finds
// money keys in a response: a key is a hit when its normalised form equals the normalised `column` or a
// `responseKeys` entry of a registry field whose class is denied. Only keys are matched in JSON (a value that
// reads `unit_cost` is not a hit); the text scan matches names bounded by non-[A-Za-z0-9_] characters or the ends.
// Test-only; never imported by app code.
import type { MoneyClass, MoneyField } from '../../src/server/db/money-fields';

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function deniedFields(fields: readonly MoneyField[], denied: readonly MoneyClass[]): MoneyField[] {
  return fields.filter((f) => denied.includes(f.moneyClass));
}

export function moneyViolations(
  body: unknown,
  fields: readonly MoneyField[],
  denied: readonly MoneyClass[],
): string[] {
  const names = new Set<string>();
  for (const f of deniedFields(fields, denied)) {
    names.add(normalizeKey(f.column));
    for (const k of f.responseKeys) names.add(normalizeKey(k));
  }
  const found: string[] = [];
  const walk = (value: unknown, at: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${at}[${i}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        const here = `${at}.${key}`;
        if (names.has(normalizeKey(key))) found.push(here);
        walk(inner, here);
      }
    }
  };
  walk(body, '$');
  return found;
}

const camel = (column: string): string =>
  column.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function moneyTextViolations(
  text: string,
  fields: readonly MoneyField[],
  denied: readonly MoneyClass[],
): string[] {
  const found: string[] = [];
  for (const f of deniedFields(fields, denied)) {
    for (const name of new Set([f.column, camel(f.column), ...f.responseKeys])) {
      const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`);
      const hit = `text:${name}`;
      if (re.test(text) && !found.includes(hit)) found.push(hit);
    }
  }
  return found;
}
