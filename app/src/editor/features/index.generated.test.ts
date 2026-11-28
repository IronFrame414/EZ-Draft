// EZD-1910 (AC-EZD-1910-3; editor plan 5.4): features/index.generated.ts is made by app/tools/gen-registry.mjs from
// the folder listing. This test fails when the file is stale and when anything it imports reaches app/src/lazy/
// statically (EZD-120c B11: the editor entry holds no lazy code). The fixture cases prove both checks catch a fault.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_ROOT,
  INDEX_FILE,
  TARGETS,
  isStale,
  lazyReaches,
  listEntries,
  renderIndex,
} from '../../../tools/gen-registry.mjs';

const FEATURES = TARGETS.find((t) => t.dir === 'src/editor/features')!;
const SRC = path.join(APP_ROOT, 'src');

describe('EZD-1910 features/index.generated.ts', () => {
  it('is what the script makes from the folder listing now', () => {
    expect(isStale(FEATURES, path.join(APP_ROOT, FEATURES.dir))).toBe(false);
  });

  it('reaches nothing in app/src/lazy through static imports', () => {
    const entry = path.join(APP_ROOT, FEATURES.dir, INDEX_FILE);
    expect(lazyReaches(entry, { srcRoot: SRC, lazyRoot: path.join(SRC, 'lazy') })).toEqual([]);
  });
});

// EZD-1914 (editor plan 5.3 "ceiling/tools/"): the ceiling tools' index is made the same way.
const CEILING_TOOLS = TARGETS.find((t) => t.dir === 'src/editor/ceiling/tools')!;

describe('EZD-1914 ceiling/tools/index.generated.ts', () => {
  it('is what the script makes from the folder listing now', () => {
    expect(CEILING_TOOLS).toBeDefined();
    expect(isStale(CEILING_TOOLS, path.join(APP_ROOT, CEILING_TOOLS.dir))).toBe(false);
  });

  it('reaches nothing in app/src/lazy through static imports', () => {
    const entry = path.join(APP_ROOT, CEILING_TOOLS.dir, INDEX_FILE);
    expect(lazyReaches(entry, { srcRoot: SRC, lazyRoot: path.join(SRC, 'lazy') })).toEqual([]);
  });
});

// EZD-1918 (editor plan 5.1): the tools' layer parts index is made the same way.
const LAYER_PARTS = TARGETS.find((t) => t.dir === 'src/editor/tools/parts')!;

describe('EZD-1918 tools/parts/index.generated.ts', () => {
  it('is what the script makes from the folder listing now', () => {
    expect(LAYER_PARTS).toBeDefined();
    expect(isStale(LAYER_PARTS, path.join(APP_ROOT, LAYER_PARTS.dir))).toBe(false);
  });

  it('reaches nothing in app/src/lazy through static imports', () => {
    const entry = path.join(APP_ROOT, LAYER_PARTS.dir, INDEX_FILE);
    expect(lazyReaches(entry, { srcRoot: SRC, lazyRoot: path.join(SRC, 'lazy') })).toEqual([]);
  });
});

let tmp: string | null = null;

afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

// A small app/src tree in a temp folder: src/editor/features, src/editor/shared, src/lazy.
function fixture(files: Record<string, string>) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd-1910-'));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const src = path.join(tmp, 'src');
  return { src, features: path.join(src, 'editor/features'), lazy: path.join(src, 'lazy') };
}

const FEATURE = (name: string) => `import type { EditorFeature } from './types';
export const feature: EditorFeature = { id: '${name}', order: 1, active: () => true };
`;

describe('EZD-1910 gen-registry staleness', () => {
  it('lists the feature files sorted, leaving out types, the index and tests', () => {
    const { features } = fixture({
      'src/editor/features/types.ts': 'export type EditorFeature = { order: number };\n',
      'src/editor/features/zeta.tsx': FEATURE('zeta'),
      'src/editor/features/beta-two.ts': FEATURE('beta-two'),
      'src/editor/features/alpha.tsx': FEATURE('alpha'),
      'src/editor/features/alpha.test.tsx': '',
      'src/editor/features/index.generated.ts': '',
    });
    expect(listEntries(features)).toEqual(['alpha.tsx', 'beta-two.ts', 'zeta.tsx']);
    const text = renderIndex(FEATURES, features);
    expect(text).toContain("import { feature as alpha } from './alpha';");
    expect(text).toContain("import { feature as betaTwo } from './beta-two';");
    expect(text.indexOf('as alpha')).toBeLessThan(text.indexOf('as betaTwo'));
    expect(text.indexOf('as betaTwo')).toBeLessThan(text.indexOf('as zeta'));
    expect(text).toContain('export const features: readonly EditorFeature[] = [');
  });

  it('fails when a feature file is added, the index is edited by hand, or the index is missing', () => {
    const { features } = fixture({
      'src/editor/features/types.ts': 'export type EditorFeature = { order: number };\n',
      'src/editor/features/alpha.tsx': FEATURE('alpha'),
    });
    const index = path.join(features, INDEX_FILE);
    expect(isStale(FEATURES, features)).toBe(true);
    fs.writeFileSync(index, renderIndex(FEATURES, features));
    expect(isStale(FEATURES, features)).toBe(false);

    fs.writeFileSync(path.join(features, 'beta.tsx'), FEATURE('beta'));
    expect(isStale(FEATURES, features)).toBe(true);
    fs.writeFileSync(index, renderIndex(FEATURES, features));
    expect(isStale(FEATURES, features)).toBe(false);

    fs.appendFileSync(index, '// edited\n');
    expect(isStale(FEATURES, features)).toBe(true);

    fs.rmSync(index);
    expect(isStale(FEATURES, features)).toBe(true);
  });
});

describe('EZD-1910 gen-registry lazy reach', () => {
  it('flags a feature that reaches app/src/lazy through a chain of imports and re-exports', () => {
    const { src, features, lazy } = fixture({
      'src/editor/features/types.ts': 'export type EditorFeature = { order: number };\n',
      'src/editor/features/alpha.tsx': `import { helper } from '../shared/helper';\n${FEATURE('alpha')}`,
      'src/editor/features/beta.tsx': `export { Panel } from '@/lazy/panel';\n${FEATURE('beta')}`,
      'src/editor/shared/helper.ts':
        "import {\n  Big,\n  type Small,\n} from '../../lazy/big';\nexport const helper = 1;\n",
      'src/lazy/big/index.ts': 'export const Big = 1; export type Small = 2;\n',
      'src/lazy/panel/index.tsx': 'export const Panel = 1;\n',
    });
    fs.writeFileSync(path.join(features, INDEX_FILE), renderIndex(FEATURES, features));
    const chains = lazyReaches(path.join(features, INDEX_FILE), { srcRoot: src, lazyRoot: lazy });
    const rel = chains.map((c) => c.map((f) => path.relative(src, f)));
    expect(rel).toContainEqual([
      'editor/features/index.generated.ts',
      'editor/features/alpha.tsx',
      'editor/shared/helper.ts',
      'lazy/big/index.ts',
    ]);
    expect(rel).toContainEqual([
      'editor/features/index.generated.ts',
      'editor/features/beta.tsx',
      'lazy/panel/index.tsx',
    ]);
    expect(rel).toHaveLength(2);
  });

  it('allows type-only imports, dynamic imports and comments that name app/src/lazy', () => {
    const { src, features, lazy } = fixture({
      'src/editor/features/types.ts': 'export type EditorFeature = { order: number };\n',
      'src/editor/features/alpha.tsx': [
        "import type { PanelProps } from '../../lazy/panel';",
        "export type { Big } from '@/lazy/big';",
        "// import { Panel } from '../../lazy/panel';",
        "/* export * from '../../lazy/big'; */",
        "const load = () => import('../../lazy/panel');",
        "import { lazyModule } from 'some-package';",
        FEATURE('alpha'),
      ].join('\n'),
      'src/lazy/big/index.ts': 'export type Big = 1;\n',
      'src/lazy/panel/index.tsx': 'export type PanelProps = {};\n',
    });
    fs.writeFileSync(path.join(features, INDEX_FILE), renderIndex(FEATURES, features));
    expect(lazyReaches(path.join(features, INDEX_FILE), { srcRoot: src, lazyRoot: lazy })).toEqual(
      [],
    );
  });
});
