// EZD-026d A11 (vault/plans/EZD-026d.md section 4).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import { es } from './catalogs/es';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('EZD-026d route message keys', () => {
  it('EZD-026d done when: every literal route message_key in app/src is in the English catalog', () => {
    const found: { file: string; key: string }[] = [];
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/["']?message_key["']?\s*:\s*(['"`])([^'"`$]+)\1/g)) {
        found.push({ file, key: m[2] });
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.map((f) => f.key)).toContain('error.db_unavailable');
    for (const { file, key } of found) {
      expect(Object.hasOwn(en, key), `${file}: ${key} is not in the English catalog`).toBe(true);
    }
    const english: Record<string, unknown> = en;
    const spanish: Record<string, unknown> = es;
    expect(english['error.db_unavailable']).toBe(
      "Can't reach the database. Try again in a minute.",
    );
    const spa = spanish['error.db_unavailable'];
    expect(typeof spa).toBe('string');
    expect((spa as string).trim().length).toBeGreaterThan(0);
    expect(spa).not.toBe(english['error.db_unavailable']);
  });
});
