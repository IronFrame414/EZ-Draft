// EZD-103a U8 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1).
// Expected values: plan Decided "CSS" (frame sizes and active colour from tokens; :hover only under
// (hover: hover), ARCH Device layouts; no composes, the shell CSS is never imported); step 2 (the
// --ez-cobalt-link token, B15 a{color}); ARCH C10 (no literal colours outside tokens.css).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../styles/tokens';

const here = path.dirname(fileURLToPath(import.meta.url));

const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const squash = (s: string) => noComments(s).replace(/\s+/g, ' ').trim();
const norm = (s: string) =>
  s
    .replace(/"/g, "'")
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim();

// Every rule body whose selector list holds `selector`, declarations normalized.
function declarations(css: string, selector: string): string[][] {
  const out: string[][] = [];
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim());
    if (!selectors.includes(selector)) continue;
    out.push(
      m[2]
        .split(';')
        .map(norm)
        .filter((d) => d.length > 0),
    );
  }
  return out;
}

// The CSS with every @media (hover: hover) { ... } block removed (brace matched).
function withoutHoverMedia(css: string): string {
  const open = /@media\s*\(\s*hover\s*:\s*hover\s*\)\s*\{/g;
  let out = '';
  let from = 0;
  for (let m = open.exec(css); m; m = open.exec(css)) {
    out += css.slice(from, m.index);
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    from = i;
    open.lastIndex = i;
  }
  return out + css.slice(from);
}

describe('EZD-103a settings CSS and token', () => {
  it('U8 shell CSS takes sizes and colours from tokens; the --ez-cobalt-link token', () => {
    const raw = readFileSync(path.join(here, 'SettingsShell.module.css'), 'utf8');
    const css = squash(raw);
    const expectDecl = (selector: string, decl: string) => {
      const rules = declarations(css, selector);
      expect(rules.length, selector).toBeGreaterThan(0);
      expect(
        rules.some((r) => r.includes(decl)),
        `${selector} { ${decl} }`,
      ).toBe(true);
    };
    expectDecl('.nav', 'width: var(--ez-left-panel-width)');
    expectDecl('.header', 'height: var(--ez-header-height)');
    expectDecl('.status', 'height: var(--ez-status-bar-height)');
    expectDecl(".item[aria-current='page']", 'background: var(--ez-cobalt-tint)');
    expectDecl('.location', 'color: var(--ez-ink)');

    expect(withoutHoverMedia(noComments(raw))).not.toContain(':hover');
    expect(css).not.toContain('composes');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/oklch\(/i);
    expect(css).not.toMatch(/rgba?\(/i);

    const tokensCss = readFileSync(path.join(here, '../../styles/tokens.css'), 'utf8');
    const decl = /--ez-cobalt-link:\s*oklch\(0\.5 0\.17 262\)\s*;/g;
    expect(tokensCss.match(decl) ?? []).toHaveLength(1);
    // Comments removed first, so a brace inside any comment cannot end the `:root` block early.
    const rootBlock = noComments(tokensCss).match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(rootBlock.match(decl) ?? []).toHaveLength(1);
    const hits = TOKENS.filter((t) => t.name === '--ez-cobalt-link');
    expect(hits.map((t) => [t.name, t.value, t.group])).toEqual([
      ['--ez-cobalt-link', 'oklch(0.5 0.17 262)', 'color'],
    ]);
  });
});
