// EZD-015a · U12 (vault/plans/EZD-015a.md Section 4). Sources: plan Decided CSS rows; 02 Named tools;
// EZD-014b hover rule; P-V13.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
