// EZD-015a · U15 (vault/plans/EZD-015a.md Section 4). Pattern: components/phone/phone-imports.test.ts.
// Sources: AC-6; 11 rule 7; P-Step 6.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..');
const networkDir = path.join(src, 'lib', 'network');

const required = [
  ...[
    'Skeleton.module.css',
    'Skeleton.tsx',
    'StateButton.module.css',
    'StateButton.tsx',
    'banner.module.css',
    'InlineError.tsx',
    'OfflineBanner.tsx',
    'async-state.ts',
    'use-async.ts',
    'AsyncView.tsx',
    'index.ts',
  ].map((f) => path.join(here, f)),
  path.join(networkDir, 'online.ts'),
  path.join(networkDir, 'index.ts'),
];

const scan = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
        .map((f) => path.join(dir, f))
    : [];
const files = [...scan(here), ...scan(networkDir)];

describe('EZD-015a states imports', () => {
  it('EZD-015a done when: the state components import no shell, phone, device or 3D code', () => {
    const banned = [
      path.join(src, 'components', 'shell'),
      path.join(src, 'components', 'phone'),
      path.join(src, 'components', 'device'),
      path.join(src, 'lib', 'device'),
    ];
    for (const f of required) expect(files, f).toContain(f);
    for (const f of files) {
      expect(existsSync(f), `${f} exists`).toBe(true);
      const text = readFileSync(f, 'utf8');
      const specs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      for (const spec of specs) {
        if (spec.startsWith('.')) {
          const abs = path.resolve(path.dirname(f), spec);
          for (const b of banned) {
            expect(
              abs === b || abs.startsWith(b + path.sep),
              `${path.basename(f)} imports ${spec}`,
            ).toBe(false);
          }
        }
        expect(spec.startsWith('@/'), `${f}: ${spec}`).toBe(false);
        expect(
          spec === 'three' ||
            spec.startsWith('three/') ||
            spec.startsWith('@react-three/') ||
            spec === 'three-bvh-csg' ||
            spec === 'three-gpu-pathtracer',
          `${f}: ${spec}`,
        ).toBe(false);
      }
    }
  });
});
