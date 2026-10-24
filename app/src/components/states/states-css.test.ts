// EZD-015a · U12 (vault/plans/EZD-015a.md Section 4). Sources: plan Decided CSS rows; 02 Named tools;
// EZD-014b hover rule; P-V13.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../styles/tokens';

const here = path.dirname(fileURLToPath(import.meta.url));

type Rule = { media: string | null; sel: string; decls: string[] };

function strip(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'");
}

function cssRules(text: string): Rule[] {
  const out: Rule[] = [];
  const stack: { prelude: string; isMedia: boolean }[] = [];
  let buf = '';
  for (const ch of strip(text)) {
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      stack.push({ prelude, isMedia: prelude.startsWith('@media') });
      continue;
    }
    if (ch === '}') {
      const top = stack.pop();
      if (top && !top.isMedia) {
        const media = stack.find((x) => x.isMedia)?.prelude ?? null;
        out.push({
          media,
          sel: top.prelude,
          decls: buf
            .split(';')
            .map((d) => d.trim())
            .filter((d) => d.length > 0),
        });
      }
      buf = '';
      continue;
    }
    buf += ch;
  }
  return out;
}

const read = (f: string) => readFileSync(path.join(here, f), 'utf8');

describe('EZD-015a states CSS', () => {
  it('U12 uses the design tokens', () => {
    const expected: Record<string, string[]> = {
      'Skeleton.module.css': [
        'var(--ez-divider)',
        'var(--ez-radius-5)',
        'var(--ez-radius-8)',
        'var(--ez-radius-12)',
      ],
      'banner.module.css': [
        'var(--ez-red)',
        'var(--ez-radius-10)',
        'var(--ez-hover)',
        'var(--ez-ink)',
        'var(--ez-slate-500)',
      ],
      'StateButton.module.css': [
        'var(--ez-font-sans)',
        'var(--ez-border-hover)',
        'var(--ez-cobalt)',
        'var(--ez-red)',
        'var(--ez-radius-8)',
      ],
    };
    for (const [file, tokens] of Object.entries(expected)) {
      const css = strip(read(file));
      for (const t of tokens) expect(css, `${file} ${t}`).toContain(t);
    }
    const files = readdirSync(here).filter((f) => f.endsWith('.module.css'));
    for (const f of Object.keys(expected)) expect(files).toContain(f);
    for (const f of files) {
      const css = strip(read(f));
      expect(css, `${f} hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const fn of ['rgb(', 'rgba(', 'hsl(', 'oklch(', '44px']) {
        expect(css, `${f} ${fn}`).not.toContain(fn);
      }
      for (const r of cssRules(read(f))) {
        if (r.sel.includes(':hover')) {
          expect(r.media, `${f} ${r.sel}`).toContain('(hover: hover)');
        }
      }
    }
  });
});

describe('EZD-015b toast and dialog CSS', () => {
  const decls = (file: string, sel: string) =>
    cssRules(read(file))
      .filter((r) => r.sel === sel && r.media === null)
      .flatMap((r) => r.decls);

  it('EZD-015b done when: the toast and dialog styles use the design tokens (U12b)', () => {
    const T = 'Toast.module.css';
    const C = 'ConfirmDialog.module.css';
    expect(decls(T, '.viewport')).toEqual(
      expect.arrayContaining(['position: fixed', 'right: 16px', 'bottom: 16px', 'z-index: 102']),
    );
    expect(decls(T, '.toast')).toEqual(
      expect.arrayContaining([
        'border: 1px solid var(--ez-border)',
        'border-radius: var(--ez-radius-10)',
        'background: var(--ez-surface)',
        'box-shadow: var(--ez-shadow-card)',
        'color: var(--ez-ink)',
      ]),
    );
    expect(decls(C, '.overlay')).toEqual(
      expect.arrayContaining(['background: var(--ez-overlay)', 'z-index: 100']),
    );
    expect(decls(C, '.content')).toEqual(
      expect.arrayContaining([
        'border-radius: var(--ez-radius-14)',
        'box-shadow: var(--ez-shadow-dialog)',
        'background: var(--ez-surface)',
        'z-index: 101',
      ]),
    );
    expect(decls(C, '.message')).toContain('color: var(--ez-slate-500)');
    expect(decls(C, '.footer')).toContain('border-top: 1px solid var(--ez-border)');
    for (const f of [T, C]) {
      const css = strip(read(f));
      expect(css, `${f} hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const fn of ['rgb(', 'rgba(', 'hsl(', 'oklch(', '44px']) {
        expect(css, `${f} ${fn}`).not.toContain(fn);
      }
      for (const r of cssRules(read(f))) {
        for (const d of r.decls) {
          if (d.startsWith('border-radius:')) {
            expect(d, f).toMatch(/^border-radius: var\(--ez-radius-/);
          }
          if (d.startsWith('box-shadow:')) {
            expect(d, f).toMatch(/^box-shadow: var\(--ez-shadow-/);
          }
        }
      }
    }
  });

  it('U13 token rows', () => {
    let dir = process.cwd();
    while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const up = path.dirname(dir);
      if (up === dir) throw new Error('pnpm-workspace.yaml not found');
      dir = up;
    }
    const css = readFileSync(path.join(dir, 'app/src/styles/tokens.css'), 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const [name, value] of [
      ['--ez-overlay', 'rgba(20,23,28,.46)'],
      ['--ez-shadow-dialog', '0 24px 64px rgba(10,15,30,.28)'],
      ['--ez-radius-14', '14px'],
    ]) {
      const re = new RegExp(`${name}\\s*:`, 'g');
      expect(root.match(re)?.length, name).toBe(1);
      expect(root, name).toContain(`${name}: ${value};`);
    }
    const mine = TOKENS.filter((t) =>
      ['--ez-overlay', '--ez-shadow-dialog', '--ez-radius-14'].includes(t.name),
    );
    expect(mine.map((t) => [t.name, t.value, t.group]).sort()).toEqual(
      [
        ['--ez-overlay', 'rgba(20,23,28,.46)', 'color'],
        ['--ez-shadow-dialog', '0 24px 64px rgba(10,15,30,.28)', 'shadow'],
        ['--ez-radius-14', '14px', 'radius'],
      ].sort(),
    );
  });
});
