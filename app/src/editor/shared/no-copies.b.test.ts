// EZD-1906b (AC-EZD-1906b-1 "no file in the ticket's folders defines its own copy of a helper that
// app/src/editor/shared provides"). The same copies EZD-1906a's no-copies test names (editor plan R1-R4, R7, R9),
// plus the forms they took in these folders: `const lower = (s: string) => s.toLowerCase()`, an inline
// `x.toLowerCase() === y.toLowerCase()` and a no-store subscribe `() => () => {}` handed straight to a hook.
// Source files only, not tests, subfolders included.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const EDITOR = fileURLToPath(new URL('..', import.meta.url));
const FOLDERS = ['electrical', 'assistant', 'inspector', 'versions', 'floors'];

const COPIES: Array<[string, RegExp]> = [
  ['idKey', /=\s*\((?:id|s): string\)\s*=>\s*(?:id|s)\.toLowerCase\(\)/],
  ['sameId', /\.toLowerCase\(\)\s*[!=]==\s*[\w.![\]]+\.toLowerCase\(\)/],
  ['sameIds', /\.every\(\((\w+), (\w+)\) => \1 === \w+\[\2\]\)/],
  ['useStoreValue', /\(\)\s*=>\s*\(\)\s*=>\s*\{\}/],
  ['createListeners / createValueStore', /new Set<\([^)]*\) => void>/],
  ['inchText', /`\$\{formatInches\([^)]*\)\}"`/],
];

const sources = FOLDERS.flatMap((folder) =>
  readdirSync(join(EDITOR, folder), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(folder, f)),
);

describe('EZD-1906b shared helpers have no copies in electrical, assistant, inspector, versions, floors', () => {
  it('finds the source files of all five folders', () => {
    for (const folder of FOLDERS) expect(sources.some((f) => f.startsWith(folder))).toBe(true);
    expect(sources.length).toBeGreaterThan(40);
  });

  it.each(COPIES)('no file defines its own %s', (_name, pattern) => {
    const found = sources.filter((f) => pattern.test(readFileSync(join(EDITOR, f), 'utf8')));
    expect(found).toEqual([]);
  });
});
