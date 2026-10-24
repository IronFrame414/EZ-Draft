// EZD-014a · U7 (vault/plans/EZD-014a.md Section 4).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, '..');

describe('EZD-014a phone imports', () => {
  it('EZD-014a done when: phone components import no shell code', () => {
    const files = readdirSync(here).filter(
      (f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
    for (const f of ['PhoneFrame.tsx', 'PhoneHeader.tsx', 'EditorPhoneNotice.tsx']) {
      expect(files).toContain(f);
    }
    const banned = [path.join(componentsDir, 'shell'), path.join(componentsDir, 'device')];
    for (const f of files) {
      const text = readFileSync(path.join(here, f), 'utf8');
      const specs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      for (const spec of specs) {
        if (spec.startsWith('.')) {
          const abs = path.resolve(here, spec);
          for (const b of banned) {
            expect(abs === b || abs.startsWith(b + path.sep), `${f} imports ${spec}`).toBe(false);
          }
        }
        expect(spec.startsWith('@/'), `${f}: ${spec}`).toBe(false);
        expect(
          spec === 'three' || spec.startsWith('three/') || spec.startsWith('@react-three/'),
          `${f}: ${spec}`,
        ).toBe(false);
      }
    }
  });
});
