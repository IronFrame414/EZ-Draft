// EZD-014b · T1, T2: touch targets, hover only where the device can hover, icon-only header buttons
// (vault/plans/EZD-014b.md Sections 3, 4). Sources: 11 Accessibility (44 px); Q-0055 (a); Q-0245 (b).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKENS } from './tokens';

function findApp(): string {
  let dir = process.cwd();
  for (;;) {
    try {
      readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8');
      return path.join(dir, 'app');
    } catch {
      const up = path.dirname(dir);
      if (up === dir) throw new Error('pnpm-workspace.yaml not found');
      dir = up;
    }
  }
}
const appDir = findApp();
const read = (rel: string) => readFileSync(path.join(appDir, rel), 'utf8');

type Rule = { media: string | null; sel: string; decls: string[] };

function cssRules(text: string): Rule[] {
  const s = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'");
  const out: Rule[] = [];
  const stack: { prelude: string; isMedia: boolean }[] = [];
  let buf = '';
  for (const ch of s) {
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
const first = (rules: Rule[], sel: string) => rules.find((r) => r.sel === sel);
const idx = (rules: Rule[], sel: string, media: string | null) =>
  rules.findIndex((r) => r.sel === sel && r.media === media);
const inMedia = (rules: Rule[], sel: string, media: string) =>
  rules.find((r) => r.sel === sel && r.media === media);

const COARSE = '@media (any-pointer: coarse)';
const HOVER = '@media (hover: hover)';
const FILES = [
  'src/components/shell/ToolRail.module.css',
  'src/components/shell/HeaderButton.module.css',
  'src/components/shell/Wordmark.module.css',
  'src/components/shell/EditorHeader.module.css',
];

const ALL_FILES = ['src/styles/touch.module.css', ...FILES];

describe('EZD-014b touch and hover CSS', () => {
  it('EZD-014b done when: coarse-pointer 44 px targets, hover only where the device can hover, icon-only header buttons below 1600 px', () => {
    const T = 'var(--ez-touch-target)';
    // (a) touch.module.css
    const touch = cssRules(read('src/styles/touch.module.css'));
    for (const sel of ['.target', '.hitArea', '.hitArea::after']) {
      expect(first(touch, sel)?.media, sel).toBe(COARSE);
    }
    const target = first(touch, '.target')?.decls ?? [];
    for (const d of ['box-sizing: border-box', `min-width: ${T}`, `min-height: ${T}`]) {
      expect(target).toContain(d);
    }
    expect(first(touch, '.hitArea')?.decls).toContain('position: relative');
    const after = first(touch, '.hitArea::after')?.decls ?? [];
    expect(after).toContain("content: ''");
    expect(after).toContain('position: absolute');
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(after).toContain(`${side}: min(0px, calc(50% - var(--ez-touch-target) / 2))`);
    }

    // (b) rail
    const rail = cssRules(read(FILES[0]));
    expect(first(rail, '.tool')?.media).toBeNull();
    expect(first(rail, '.tool')?.decls).toContain('width: 40px');
    expect(first(rail, '.tool')?.decls).toContain('height: 40px');
    const railCoarse = inMedia(rail, '.tool', COARSE);
    expect(railCoarse?.decls).toContain(`width: ${T}`);
    expect(railCoarse?.decls).toContain(`height: ${T}`);
    expect(rail.indexOf(railCoarse!)).toBeGreaterThan(rail.indexOf(first(rail, '.tool')!));

    // (c) header button
    const hb = cssRules(read(FILES[1]));
    const btn = first(hb, '.button');
    expect(btn?.media).toBeNull();
    for (const d of ['white-space: nowrap', 'flex-shrink: 0', 'padding: 9px 14px']) {
      expect(btn?.decls).toContain(d);
    }
    expect(inMedia(hb, '.button', COARSE)?.decls).toContain(`min-width: ${T}`);
    expect(inMedia(hb, '.button', COARSE)?.decls).toContain(`min-height: ${T}`);
    expect(inMedia(hb, '.label', '@media (width < 1600px)')?.decls).toContain('display: none');
    expect(inMedia(hb, '.icon', '@media (width >= 1600px)')?.decls).toContain('display: none');
    expect(first(hb, '.icon')?.media).toBeNull();
    expect(first(hb, '.icon')?.decls).toContain('display: flex');
    expect(idx(hb, '.icon', null)).toBeLessThan(idx(hb, '.icon', '@media (width >= 1600px)'));
    expect(hb.some((r) => r.sel === '.label' && r.media === null)).toBe(false);

    // (d) wordmark
    const wm = cssRules(read(FILES[2]));
    expect(first(wm, '.wordmark')?.media).toBeNull();
    expect(first(wm, '.wordmark')?.decls).toContain('align-items: baseline');
    expect(first(wm, '.wordmark')?.decls).toContain('flex-shrink: 0');
    const wmc = inMedia(wm, '.wordmark', COARSE)?.decls ?? [];
    expect(wmc).toContain(`min-width: ${T}`);
    expect(wmc).toContain(`min-height: ${T}`);
    expect(wmc).toContain('align-items: center');

    // (e) editor header
    const eh = cssRules(read(FILES[3]));
    expect(first(eh, '.tab')?.media).toBeNull();
    expect(first(eh, '.tab')?.decls).toContain('white-space: nowrap');
    expect(first(eh, '.tab')?.decls).toContain('flex-shrink: 0');
    expect(inMedia(eh, '.tab', COARSE)?.decls).toContain(`min-width: ${T}`);
    const tb = inMedia(eh, '.titleBlock', COARSE)?.decls ?? [];
    for (const d of ['position: relative', 'align-self: stretch', 'justify-content: center']) {
      expect(tb).toContain(d);
    }
    const nameAfter = inMedia(eh, 'button.name::after', COARSE)?.decls ?? [];
    for (const d of ["content: ''", 'position: absolute', 'inset: 0']) {
      expect(nameAfter).toContain(d);
    }

    // (f) hover
    const pressedSel = ".tool[aria-pressed='true'], .tool[aria-pressed='true']:hover";
    for (const f of ALL_FILES) {
      for (const r of cssRules(read(f))) {
        if (!r.sel.includes(':hover')) continue;
        expect(r.media, `${f} ${r.sel}`).toBe(r.sel === pressedSel ? null : HOVER);
      }
    }
    expect(
      rail
        .filter((r) => r.media === HOVER)
        .map((r) => r.sel)
        .sort(),
    ).toEqual(['.slot:hover .tip', '.tool:hover'].sort());
    expect(hb.filter((r) => r.media === HOVER).map((r) => r.sel)).toEqual(['.button:hover']);

    // (g)
    expect(first(rail, '.tool:focus-visible + .tip')?.media).toBeNull();
    expect(first(rail, '.tool:focus-visible + .tip')?.decls).toContain('display: flex');

    // (h)
    for (const f of ALL_FILES) expect(read(f), f).not.toContain('44px');
  });

  it('T2 U9 touch-target token', () => {
    const css = read('src/styles/tokens.css');
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(root.match(/--ez-touch-target\s*:\s*44px\s*;/g)?.length).toBe(1);
    expect(root.match(/--ez-touch-target\s*:/g)?.length).toBe(1);
    expect(TOKENS.filter((t) => t.name === '--ez-touch-target')).toEqual([
      { name: '--ez-touch-target', value: '44px', group: 'frame' },
    ]);
  });
});
