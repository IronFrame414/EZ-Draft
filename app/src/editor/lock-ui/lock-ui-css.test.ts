// EZD-126 U15 (board S06 lines 54, 86-91, 209-211, 256; ARCH Design tokens: colours by var(--ez-*) only). The rule
// reader is copied from app/src/components/states/states-css.test.ts.
import { readFileSync } from 'node:fs';
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

const css = readFileSync(path.join(here, 'LockUi.module.css'), 'utf8');
const decls = (sel: string) =>
  cssRules(css)
    .filter((r) => r.sel === sel && r.media === null)
    .flatMap((r) => r.decls);

describe('EZD-126 lock UI CSS', () => {
  it('EZD-126 U15 banner, avatars and green toast as on the board, colours by token', () => {
    expect(decls('.banner')).toEqual(
      expect.arrayContaining([
        'background: var(--ez-amber-tint)',
        'border: 1px solid var(--ez-lock-border)',
        'color: var(--ez-lock-text)',
        'padding: 10px 12px 10px 14px',
        'font-size: 14px',
      ]),
    );
    expect(decls('.banner .lockButton')).toEqual(
      expect.arrayContaining(['border-color: var(--ez-lock-button-border)']),
    );
    expect(decls('.viewOnly')).toEqual(expect.arrayContaining(['color: var(--ez-amber-text)']));
    expect(decls('.avatar')).toEqual(
      expect.arrayContaining([
        'box-sizing: content-box',
        'width: 30px',
        'height: 30px',
        'border: 2px solid var(--ez-surface)',
        'font-size: 11px',
      ]),
    );
    expect(decls('.avatar + .avatar')).toEqual(['margin-left: -8px']);
    expect(decls('.holder')).toEqual(
      expect.arrayContaining(['background: var(--ez-amber)', 'box-shadow: 0 0 0 1px var(--ez-amber)']),
    );
    expect(decls('.toasts[data-toast-viewport]')).toEqual(
      expect.arrayContaining(['position: absolute', 'right: 14px', 'bottom: 14px']),
    );
    expect(decls('[data-toast].success')).toEqual(
      expect.arrayContaining([
        'background: var(--ez-green-tint)',
        'border-color: var(--ez-green-border)',
        'color: var(--ez-green)',
      ]),
    );
    expect(decls('.success [data-toast-action]')).toEqual(
      expect.arrayContaining([
        'padding: 5px 10px',
        'font-size: 12px',
        'border-color: var(--ez-green-button-border)',
      ]),
    );
    expect(strip(css)).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb/i);
  });
});
