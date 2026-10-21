// EZD-012a · S1 part a, U7: rail CSS uses tokens; --ez-radius-6 in both token files (vault/plans/EZD-012a.md Section 4).
// Sources: 04 Frame tokens; C10; EZD-011a card module; Q-0040 (c); S03 .tip border-radius:6px.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../styles/tokens';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = (() => {
  let d = here;
  while (!existsSync(path.join(d, 'pnpm-workspace.yaml'))) {
    const up = path.dirname(d);
    if (up === d) throw new Error('pnpm-workspace.yaml not found above ' + here);
    d = up;
  }
  return d;
})();

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('EZD-012a frame CSS', () => {
  it('S1 part a: rail CSS uses tokens and passes check C10', () => {
    const raw = readFileSync(path.join(here, 'ToolRail.module.css'), 'utf8');
    const css = squash(raw);
    for (const v of [
      'var(--ez-rail-width)',
      'var(--ez-cobalt)',
      'var(--ez-ink)',
      'var(--ez-radius-6)',
    ]) {
      expect(css).toContain(v);
    }
    const rail = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((r) => squash(r[1]) === '.rail');
    const first = rail?.[2].split(';')[0].trim().replace(/"/g, "'");
    expect(first).toBe("composes: card from './card.module.css'");
    expect(css).not.toMatch(/border-radius:\s*6px/);
    for (const bad of ['56px', '248px', '336px', '30px', '60px']) {
      expect(css).not.toContain(bad);
    }
    const r = spawnSync('node', ['scripts/conventions/check.mjs', '.'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('EZD-012a done when: U7 --ez-radius-6 is in tokens.css and TOKENS', () => {
    const cssText = readFileSync(path.join(here, '../../styles/tokens.css'), 'utf8');
    const rootBlock = cssText.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(rootBlock.match(/--ez-radius-6:\s*6px\s*;/g) ?? []).toHaveLength(1);
    const hits = TOKENS.filter((t) => t.name === '--ez-radius-6');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({ name: '--ez-radius-6', value: '6px', group: 'radius' });
  });
});
