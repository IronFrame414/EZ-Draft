// EZD-136 · U5: the disclaimer, home and status-bar CSS (vault/plans/EZD-136.md sections 1, 4; AC-EZD-136-1).
// Sources: Decided "CSS" and "Narrow status bar" (Q-0229 "small grey line"; Q-0272 (a); 04 Type).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSrc = path.resolve(here, '../..');

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The declarations of the rule whose selector is exactly `selector`, each as `prop: value` with collapsed
// whitespace and no trailing semicolon.
function declarations(css: string, selector: string): string[] {
  const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((r) => squash(r[1]) === selector);
  expect(rules.length, `one ${selector} rule`).toBe(1);
  return rules[0][2]
    .split(';')
    .map((d) => squash(d).replace(/\s*:\s*/, ': '))
    .filter((d) => d !== '');
}

function readCss(rel: string): string {
  const file = path.join(appSrc, rel);
  expect(existsSync(file), `${rel} exists`).toBe(true);
  return squash(readFileSync(file, 'utf8'));
}

const EXPECTED: { file: string; selector: string; decls: string[] }[] = [
  {
    file: 'components/disclaimer/Disclaimer.module.css',
    selector: '.bar',
    decls: [
      'margin: 0',
      'flex: 0 1000 auto',
      'min-width: 0',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'font-family: var(--ez-font-sans)',
      'font-size: 12px',
      'line-height: 16px',
      'color: var(--ez-slate-500)',
    ],
  },
  {
    file: 'components/disclaimer/Disclaimer.module.css',
    selector: '.page',
    decls: [
      'margin: 0',
      'padding: 16px',
      'font-family: var(--ez-font-sans)',
      'font-size: 12px',
      'line-height: 16px',
      'color: var(--ez-slate-500)',
      'text-align: center',
    ],
  },
  {
    file: 'app/home.module.css',
    selector: '.page',
    decls: [
      'box-sizing: border-box',
      'min-height: 100vh',
      'display: flex',
      'flex-direction: column',
      'justify-content: space-between',
      'padding: 24px',
    ],
  },
  {
    file: 'app/home.module.css',
    selector: '.message',
    decls: ['margin: 0', 'font-size: 15px', 'line-height: 1.45', 'color: var(--ez-ink)'],
  },
];

describe('EZD-136 disclaimer CSS', () => {
  it('U5 CSS: the Decided declarations are in their classes and the status bar start flexes 1 1 auto', () => {
    const bar = readCss('components/shell/StatusBar.module.css');
    const start = declarations(bar, '.start');
    expect.soft(start).toContain('flex: 1 1 auto');
    expect.soft(start).not.toContain('flex: 1');
    for (const e of EXPECTED) {
      const css = existsSync(path.join(appSrc, e.file)) ? readCss(e.file) : '';
      expect.soft(css, `${e.file} exists`).not.toBe('');
      if (css === '') continue;
      const have = declarations(css, e.selector);
      for (const d of e.decls) expect.soft(have, `${e.file} ${e.selector}`).toContain(d);
    }
  });
});
