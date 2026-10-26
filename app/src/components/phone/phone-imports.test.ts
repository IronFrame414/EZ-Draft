// EZD-014a · U7 (vault/plans/EZD-014a.md Section 4).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, '..');

// EZD-158 D3: every phone file under phoneDir, subfolders included, checked with the same three rules.
function scanImports(phoneDir: string, componentsDir: string): string[] {
  const banned = [path.join(componentsDir, 'shell'), path.join(componentsDir, 'device')];
  const hits: string[] = [];
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      const name = entry.name;
      if (!/\.(ts|tsx|css)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
      const rel = path.relative(phoneDir, file).split(path.sep).join('/');
      const text = readFileSync(file, 'utf8');
      const specs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      for (const spec of specs) {
        if (spec.startsWith('.')) {
          const abs = path.resolve(dir, spec);
          if (banned.some((b) => abs === b || abs.startsWith(b + path.sep))) {
            hits.push(`${rel} imports ${spec}`);
          }
        }
        if (spec.startsWith('@/')) hits.push(`${rel} imports ${spec}`);
        if (spec === 'three' || spec.startsWith('three/') || spec.startsWith('@react-three/')) {
          hits.push(`${rel} imports ${spec}`);
        }
      }
    }
  };
  walk(phoneDir);
  return hits;
}

describe('EZD-014a phone imports', () => {
  it('EZD-014a done when: phone components import no shell code (EZD-158)', () => {
    const files = readdirSync(here).filter(
      (f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
    for (const f of ['PhoneFrame.tsx', 'PhoneHeader.tsx', 'EditorPhoneNotice.tsx']) {
      expect(files).toContain(f);
    }
    expect(scanImports(here, componentsDir)).toEqual([]);
  });
});

describe('EZD-158 phone imports in subfolders', () => {
  it('EZD-158 a shell import in a subfolder is found', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ezd-phone-'));
    try {
      const phone = path.join(root, 'components', 'phone');
      mkdirSync(path.join(phone, 'sub'), { recursive: true });
      mkdirSync(path.join(root, 'components', 'shell'), { recursive: true });
      writeFileSync(path.join(phone, 'Ok.tsx'), "import { x } from './sub/Bad';\n");
      writeFileSync(
        path.join(phone, 'sub', 'Bad.tsx'),
        "import { HeaderCard } from '../../shell/HeaderCard';\nexport const x = 1;\n",
      );
      expect(scanImports(phone, path.join(root, 'components'))).toEqual([
        'sub/Bad.tsx imports ../../shell/HeaderCard',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
