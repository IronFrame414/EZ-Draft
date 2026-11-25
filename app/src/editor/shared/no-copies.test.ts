// EZD-1906a (AC-EZD-1906a-1 "no file in the ticket's folders defines its own copy"). The patterns are the copies the
// editor plan names: R1/R2 (`(id) => id.toLowerCase()`, `a.toLowerCase() === b.toLowerCase()`), R3 (a no-store subscribe, `() => () => {}`, under any name),
// R4 (hand-written `new Set` of listeners), R7 (`${formatInches(n)}"`), R9 (`sameIds`). Source files only, not tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const EDITOR = fileURLToPath(new URL('..', import.meta.url));
const FOLDERS = ['tools', 'selection', 'edit'];

const COPIES: Array<[string, RegExp]> = [
  ['idKey', /=\s*\(id: string\)\s*=>\s*id\.toLowerCase\(\)/],
  ['sameId', /=>\s*a\.toLowerCase\(\) === b\.toLowerCase\(\)/],
  ['sameIds', /a\.every\(\(id, i\) => id === b\[i\]\)/],
  ['useStoreValue', /=\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\}/],
  ['createListeners / createValueStore', /new Set<\([^)]*\) => void>/],
  ['inchText', /`\$\{formatInches\([^)]*\)\}"`/],
];

const sources = FOLDERS.flatMap((folder) =>
  readdirSync(join(EDITOR, folder))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(folder, f)),
);

describe('EZD-1906a shared helpers have no copies in tools, selection, edit', () => {
  it('finds the source files', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it.each(COPIES)('no file defines its own %s', (_name, pattern) => {
    const found = sources.filter((f) => pattern.test(readFileSync(join(EDITOR, f), 'utf8')));
    expect(found).toEqual([]);
  });
});
