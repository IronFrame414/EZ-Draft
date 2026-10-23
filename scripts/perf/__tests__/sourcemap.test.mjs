// EZD-020 C1-C3 (vault/plans/EZD-020.md section 4; Step 5): scripts/perf/sourcemap.mjs.
// Expected values are the plan's hand computations from the Source Map v3 / ECMA-426 Base64 VLQ format.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './helpers.mjs';

const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'perf', 'sourcemap.mjs')).href);
const { decodeVlq, attribute, normalizeSource, groupKey } = mod;

// bytesBySource may be a Map or a plain object; the plan names only the three fields.
const bytes = (r, src) =>
  r.bytesBySource instanceof Map ? r.bytesBySource.get(src) : r.bytesBySource[src];

describe('EZD-020 source map attribution', () => {
  test('EZD-020 C1 VLQ and byte attribution', () => {
    assert.deepEqual(decodeVlq('KCAA'), [5, 1, 0, 0]);
    assert.deepEqual(decodeVlq('GDAA'), [3, -1, 0, 0]);
    assert.deepEqual(decodeVlq('gB'), [16]);
    assert.deepEqual(decodeVlq('I'), [4]);

    const one = attribute('AAAAABBBCC\nXY', {
      version: 3,
      sources: ['a.ts', 'b.ts'],
      names: [],
      mappings: 'AAAA,KCAA,GDAA;',
    });
    assert.equal(bytes(one, 'a.ts'), 7);
    assert.equal(bytes(one, 'b.ts'), 3);
    assert.equal(one.unmapped, 3);
    assert.equal(one.total, 13);

    const two = attribute('AAAABB', {
      version: 3,
      sources: ['a.ts'],
      names: [],
      mappings: 'AAAA,I',
    });
    assert.equal(bytes(two, 'a.ts'), 4);
    assert.equal(two.unmapped, 2);

    const three = attribute('é\nA', { version: 3, sources: ['a.ts'], names: [], mappings: 'AAAA' });
    assert.equal(bytes(three, 'a.ts'), 2);
    assert.equal(three.unmapped, 2);
    assert.equal(three.total, 4);
  });

  test('EZD-020 C2 index maps and sourceRoot', () => {
    const r = attribute('ABC\nDE', {
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: { version: 3, sources: ['x.ts'], names: [], mappings: 'AAAA' },
        },
        {
          offset: { line: 1, column: 0 },
          map: { version: 3, sources: ['y.ts'], names: [], mappings: 'AAAA' },
        },
      ],
    });
    assert.equal(bytes(r, 'x.ts'), 3);
    assert.equal(bytes(r, 'y.ts'), 2);
    assert.equal(r.unmapped, 1);

    const s = attribute('xxxx', {
      version: 3,
      sourceRoot: 'webpack://_N_E/',
      sources: ['./src/lib/a.ts'],
      names: [],
      mappings: 'AAAA',
    });
    const src = 'webpack://_N_E/./src/lib/a.ts';
    assert.equal(bytes(s, src), 4);
    assert.equal(normalizeSource(src).key, 'app:lib/a.ts');
  });

  test('EZD-020 C3 normalizing and grouping', () => {
    const cases = [
      ['webpack://_N_E/./src/components/shell/EditorFrame.tsx', 'app:components/shell/EditorFrame.tsx'],
      [
        'turbopack:///[project]/app/src/components/shell/EditorFrame.tsx',
        'app:components/shell/EditorFrame.tsx',
      ],
      [
        'webpack://_N_E/../../node_modules/.pnpm/three@0.170.0/node_modules/three/build/three.module.js',
        'pkg:three',
        'build/three.module.js',
      ],
      [
        'turbopack:///[project]/node_modules/.pnpm/@react-three+fiber@9.0.0/node_modules/@react-three/fiber/dist/index.js',
        'pkg:@react-three/fiber',
      ],
      [
        'turbopack:///[project]/node_modules/.pnpm/three@0.170.0/node_modules/three/examples/jsm/exporters/GLTFExporter.js',
        'pkg:three',
        'examples/jsm/exporters/GLTFExporter.js',
      ],
      ['webpack://_N_E/../packages/geometry/src/index.ts', 'geometry:index.ts'],
      [
        'turbopack:///[project]/app/src/app/(editor)/dev/entry/editor/page.tsx',
        'app:app/(editor)/dev/entry/editor/page.tsx',
      ],
      ['webpack://_N_E/webpack/runtime/x', 'other:webpack/runtime/x'],
    ];
    for (const [input, key, subpath] of cases) {
      const n = normalizeSource(input);
      assert.equal(n.key, key, input);
      if (subpath !== undefined) assert.equal(n.subpath, subpath, input);
    }
    const groups = [
      ['app:components/shell/EditorFrame.tsx', 'app:components/shell'],
      ['app:app/(editor)/dev/entry/editor/page.tsx', 'app:app/(editor)'],
      ['geometry:index.ts', 'geometry:'],
      ['pkg:three', 'pkg:three'],
      ['pkg:@react-three/fiber', 'pkg:@react-three/fiber'],
    ];
    for (const [key, group] of groups) assert.equal(groupKey(key), group, key);
  });
});
