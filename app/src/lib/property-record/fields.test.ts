// Performance audit 2026-11-26 (11 Performance rule 7; the rule of EZD-332 for lib/notifications/kinds.ts): the
// Projects page must not download zod for the property record screens. fields.ts has no imports, the screens take
// their values from it, and the zod schemas of property-record.ts reach the browser only through a dynamic import
// when an appraiser read answers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as fields from './fields';
import * as record from './property-record';
import { fetchReadJob, startRead } from '../../components/property-record/appraiser-read-client';

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

/** The module names of every static import or re-export that is not type-only. */
function staticValueImports(text: string): string[] {
  const found: string[] = [];
  const re = /^(import|export)\s+(type\s+)?[^;]*?\sfrom\s+'([^']+)';/gms;
  for (const m of text.matchAll(re)) if (m[2] === undefined) found.push(m[3]!);
  for (const m of text.matchAll(/^import\s+'([^']+)';/gm)) found.push(m[1]!);
  return found;
}

const SCREENS = [
  '../../components/property-record/PropertyAppraiserLink.tsx',
  '../../components/property-record/PropertyRecordDialog.tsx',
  '../../components/property-record/appraiser-read-client.ts',
];

describe('EZD-711 property record: no zod in the browser screens', () => {
  it('fields.ts imports nothing', () => {
    const text = source('./fields.ts');
    expect(staticValueImports(text)).toEqual([]);
    expect(text).not.toMatch(/\bimport\s*\(/);
  });

  it('the screens import no zod and take property-record.ts only as types', () => {
    for (const path of SCREENS) {
      const imports = staticValueImports(source(path));
      expect(imports, path).not.toContain('zod');
      expect(imports, path).not.toContain('zod/mini');
      expect(imports, path).not.toContain('../../lib/property-record/property-record');
    }
  });

  it('the checker itself sees a value import, a mixed import and a type-only import', () => {
    const text = [
      "import { a } from 'one';",
      "import {\n  b,\n  type C,\n} from 'two';",
      "import type { D } from 'three';",
      "export * from 'four';",
      "export type { E } from 'five';",
      "import 'six';",
    ].join('\n');
    expect(staticValueImports(text)).toEqual(['one', 'two', 'four', 'six']);
  });

  it('property-record.ts still exports everything fields.ts has, as the same values', () => {
    for (const [name, value] of Object.entries(fields)) {
      expect((record as Record<string, unknown>)[name], name).toBe(value);
    }
  });
});

describe('EZD-711 property record: the read answer is still checked by the schema', () => {
  const READ = { parcelNo: '00-42', owner: 'A Owner', legalDescription: null, yearBuilt: 1986, livingArea: 2140 };

  it('startRead keeps a valid answer and fails one the schema refuses', async () => {
    const good = vi.fn(async () => Response.json({ output: { status: 'read', fields: READ } }));
    expect(await startRead(null, { kind: 'text', text: 'page' }, good as typeof fetch)).toEqual({
      status: 'read',
      fields: READ,
    });
    // 1599 is under YEAR_BUILT_MIN (1600), so the schema refuses the answer.
    const bad = vi.fn(async () => Response.json({ output: { status: 'read', fields: { ...READ, yearBuilt: 1599 } } }));
    expect(await startRead(null, { kind: 'text', text: 'page' }, bad as typeof fetch)).toEqual({ status: 'failed' });
  });

  it('fetchReadJob keeps a valid finished job, fails a refused one and waits on a running one', async () => {
    const job = (j: unknown) => vi.fn(async () => Response.json({ job: j })) as typeof fetch;
    expect(await fetchReadJob('j1', job({ status: 'done', result: { output: { status: 'unreadable' } } }))).toEqual({
      status: 'unreadable',
    });
    expect(await fetchReadJob('j1', job({ status: 'done', result: { output: { status: 'other' } } }))).toEqual({
      status: 'failed',
    });
    expect(await fetchReadJob('j1', job({ status: 'running', result: null }))).toBeNull();
  });
});
