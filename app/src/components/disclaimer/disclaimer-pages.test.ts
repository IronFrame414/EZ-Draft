// EZD-136 · U6: every page and not-found file outside app/src/app/dev/ has exactly one DISCLAIMER_PAGES row
// (vault/plans/EZD-136.md sections 3, 4; AC-EZD-136-1). Sources: section 3 rule; Q-0273 (b).
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER_PAGES } from '../../../test-harness/e2e/disclaimer-pages';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../..');
const routesDir = path.join(appDir, 'src', 'app');
const devDir = path.join(routesDir, 'dev');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === devDir) continue;
      out.push(...pageFiles(full));
    } else if (entry.isFile() && (entry.name === 'page.tsx' || entry.name === 'not-found.tsx')) {
      out.push(path.relative(appDir, full).split(path.sep).join('/'));
    }
  }
  return out;
}

describe('EZD-136 disclaimer page list', () => {
  it('U6 every page listed: page.tsx and not-found.tsx files outside app/src/app/dev/ equal the DISCLAIMER_PAGES files', () => {
    const found = pageFiles(routesDir).sort();
    const listed = DISCLAIMER_PAGES.map((p) => p.file);
    expect(found).toContain('src/app/not-found.tsx');
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set(found)).toEqual(new Set(listed));
    for (const p of DISCLAIMER_PAGES) expect(p.path.startsWith('/'), p.file).toBe(true);
  });
});
