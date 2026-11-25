// EZD-1906c (AC-EZD-1906c-1 "no file in the ticket's folders defines its own copy of a helper that app/src/editor/shared
// (EZD-1906a) provides, and STATUSES and CM_PER_IN are defined once"). The copies EZD-1906b's no-copies test names
// (editor plan R1-R4, R7, R9) over the countertops and cabinets folders and their lazy screens; then R8 and R9: the
// status list and centimetres per inch are written once, in packages/geometry/src/schema/common.ts, across the app and
// geometry sources. Source files only, not tests, subfolders included.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CM_PER_IN, OBJECT_STATUSES } from '@ezdraft/geometry';

const APP_SRC = fileURLToPath(new URL('../..', import.meta.url));
const GEOMETRY_SRC = fileURLToPath(new URL('../../../../packages/geometry/src', import.meta.url));
const FOLDERS = [
  'editor/countertops',
  'editor/cabinets',
  'lazy/countertops',
  'lazy/cabinet-run',
  'lazy/edit-menu',
];

const COPIES: Array<[string, RegExp]> = [
  ['idKey', /=\s*\((?:id|s): string\)\s*=>\s*(?:id|s)\.toLowerCase\(\)/],
  ['sameId', /\.toLowerCase\(\)\s*[!=]==\s*[\w.![\]]+\.toLowerCase\(\)/],
  ['sameIds', /\.every\(\((\w+), (\w+)\) => \1 === \w+\[\2\]\)/],
  ['useStoreValue', /\(\)\s*=>\s*\(\)\s*=>\s*\{\}/],
  ['createListeners / createValueStore', /new Set<\([^)]*\) => void>|subs: Set</],
  ['inchText', /`\$\{formatInches\([^)]*\)\}"`/],
];

const sourcesIn = (root: string, folder = '') =>
  readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('node_modules'))
    .map((f) => join(root, folder, f));

const sources = FOLDERS.flatMap((folder) => sourcesIn(APP_SRC, folder));
const read = (f: string) => readFileSync(f, 'utf8');
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const rel = (f: string) => relative(REPO, f);

describe('EZD-1906c shared helpers have no copies in countertops, cabinets and their lazy screens', () => {
  it('finds the source files of all five folders', () => {
    for (const folder of FOLDERS)
      expect(sources.some((f) => f.startsWith(join(APP_SRC, folder)))).toBe(true);
    expect(sources.length).toBeGreaterThan(30);
  });

  it.each(COPIES)('no file defines its own %s', (_name, pattern) => {
    expect(sources.filter((f) => pattern.test(read(f))).map(rel)).toEqual([]);
  });
});

describe('EZD-1906c STATUSES and CM_PER_IN are defined once', () => {
  const everything = [...sourcesIn(APP_SRC), ...sourcesIn(GEOMETRY_SRC)];
  const COMMON = 'packages/geometry/src/schema/common.ts';

  it('the shared values are the schema status order and 2.54 cm per inch (exact by definition)', () => {
    expect([...OBJECT_STATUSES]).toEqual(['existing', 'demo', 'new']);
    expect(CM_PER_IN).toBe(2.54);
  });

  // R8's four copies (BoxInspector, EditMenu, InspectorPanel, inspector-edits) read OBJECT_STATUSES; no file defines
  // a STATUSES of its own. The drawing-layer sets (sheet-svg, batches) name layers, not statuses, and the left panel's
  // PHASE_ROWS is its row order (vault/build/assumptions.md EZD-1906c).
  it('only schema/common.ts defines a STATUSES list of object statuses', () => {
    const own = /\bSTATUSES\b[^=\n]*=\s*(?:new Set\()?\[/;
    expect(everything.filter((f) => own.test(read(f))).map(rel)).toEqual([]);
    const list = /\[\s*'existing',\s*'demo',\s*'new',?\s*\]/;
    expect(everything.filter((f) => /OBJECT_STATUSES = \[/.test(read(f))).map(rel)).toEqual([COMMON]);
    const inspector = sourcesIn(APP_SRC, 'editor/inspector');
    expect([...sources, ...inspector].filter((f) => list.test(read(f))).map(rel)).toEqual([]);
  });

  it('only schema/common.ts defines CM_PER_IN', () => {
    expect(everything.filter((f) => /\bCM_PER_IN\s*=/.test(read(f))).map(rel)).toEqual([COMMON]);
  });

  it('no file in the ticket folders writes 2.54 itself', () => {
    expect(sources.filter((f) => /\b2\.54\b/.test(read(f))).map(rel)).toEqual([]);
  });
});
