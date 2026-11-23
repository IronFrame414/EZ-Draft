// EZD-010a · T1, T2: app/src/styles/tokens.css and tokens.ts hold the 36 values of
// vault/spec/sections/04-app-shell-and-global-ui.md "Frame and visual system (Studio)" (lines 7-11).
// Expected values: vault/plans/EZD-010a.md Step 1 table (copied from 04), never from the code under test.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from './tokens';

type Group = 'color' | 'status' | 'radius' | 'shadow' | 'frame';

const EXPECTED: readonly (readonly [string, string, Group])[] = [
  ['--ez-cobalt', 'oklch(0.55 0.17 262)', 'color'],
  ['--ez-cobalt-text', 'oklch(0.45 0.17 262)', 'color'],
  ['--ez-cobalt-tint', '#eef1ff', 'color'],
  ['--ez-ink', '#14171c', 'color'],
  ['--ez-slate-700', '#3b424d', 'color'],
  ['--ez-slate-500', '#5e6672', 'color'],
  ['--ez-slate-400', '#7a828e', 'color'],
  ['--ez-slate-300', '#9aa3af', 'color'],
  ['--ez-border', '#dfe2e6', 'color'],
  ['--ez-divider', '#eef0f3', 'color'],
  ['--ez-hover', '#f2f4f7', 'color'],
  ['--ez-canvas', '#f6f7f9', 'color'],
  ['--ez-canvas-grid', '#e6e9ed', 'color'],
  ['--ez-surface', '#fff', 'color'],
  ['--ez-red', 'oklch(0.6 0.19 28)', 'status'],
  ['--ez-amber', 'oklch(0.72 0.16 65)', 'status'],
  ['--ez-amber-tint', 'oklch(0.96 0.04 80)', 'status'],
  ['--ez-green', 'oklch(0.42 0.12 150)', 'status'],
  ['--ez-green-tint', 'oklch(0.95 0.05 150)', 'status'],
  ['--ez-radius-5', '5px', 'radius'],
  ['--ez-radius-7', '7px', 'radius'],
  ['--ez-radius-8', '8px', 'radius'],
  ['--ez-radius-10', '10px', 'radius'],
  ['--ez-radius-12', '12px', 'radius'],
  ['--ez-radius-999', '999px', 'radius'],
  ['--ez-shadow-card', '0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)', 'shadow'],
  ['--ez-shadow-floating', '0 6px 20px rgba(20,30,50,.08)', 'shadow'],
  ['--ez-header-height', '60px', 'frame'],
  ['--ez-header-margin', '16px', 'frame'],
  ['--ez-body-padding', '16px', 'frame'],
  ['--ez-body-gap', '16px', 'frame'],
  ['--ez-rail-width', '56px', 'frame'],
  ['--ez-left-panel-width', '248px', 'frame'],
  ['--ez-inspector-width', '336px', 'frame'],
  ['--ez-status-bar-height', '30px', 'frame'],
  ['--ez-grid-size', '32px', 'frame'],
  // EZD-110 step 18 (vault/plans/EZD-110b.md): S01c notification list.
  ['--ez-unread-tint', '#f7f8ff', 'color'],
  ['--ez-slate-450', '#6b7280', 'color'],
  ['--ez-shadow-popover', '0 16px 48px rgba(10,15,30,.18)', 'shadow'],
  // EZD-140 step 10 (vault/plans/EZD-140.md): S01f notification settings (.row border, .kn shadow).
  ['--ez-divider-row', '#f0f2f5', 'color'],
  ['--ez-shadow-switch-knob', '0 1px 2px rgba(0,0,0,.2)', 'shadow'],
];

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, 'tokens.css');

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function readCss(): string {
  return squash(readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' '));
}

/** Ordered declarations of the file's rule blocks: { selectors, decls }. */
function parseCss() {
  const text = readCss();
  const blocks = [...text.matchAll(/([^{}]*)\{([^{}]*)\}/g)];
  const selectors = blocks.map((b) => squash(b[1]));
  const decls: { name: string; value: string }[] = [];
  for (const b of blocks) {
    for (const part of b[2].split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      decls.push({ name: squash(part.slice(0, i)), value: squash(part.slice(i + 1)) });
    }
  }
  return { text, selectors, decls };
}

function expectInOrder(names: string[]) {
  const expectedNames = EXPECTED.map((e) => e[0]);
  const filtered = names.filter((n) => expectedNames.includes(n));
  expect(filtered).toEqual(expectedNames);
}

describe('EZD-010a design tokens', () => {
  it('EZD-010a done when: tokens.css holds the 36 spec values and matches tokens.ts', () => {
    const { text, selectors, decls } = parseCss();

    // (a) each of the 36 names with exactly its value, in order
    for (const [name, value] of EXPECTED) {
      const found = decls.filter((d) => d.name === name);
      expect(found.length, `${name} must be declared once`).toBe(1);
      expect(found[0].value, name).toBe(value);
    }
    expectInOrder(decls.map((d) => d.name));

    // (b) exactly one rule block, selector :root, all names --ez-
    expect(selectors).toEqual([':root']);
    for (const d of decls) expect(d.name.startsWith('--ez-'), d.name).toBe(true);

    // (c) parity with TOKENS, no duplicates on either side
    const cssNames = decls.map((d) => d.name);
    expect(new Set(cssNames).size).toBe(cssNames.length);
    const tsNames = TOKENS.map((t) => t.name as string);
    expect(new Set(tsNames).size).toBe(tsNames.length);
    expect(new Set(tsNames)).toEqual(new Set(cssNames));
    for (const t of TOKENS) {
      expect(decls.find((d) => d.name === t.name)?.value, t.name).toBe(t.value);
    }

    // (d) no @supports (oklch ships with no sRGB fallback, Q-0026 (a))
    expect(text.includes('@supports')).toBe(false);
  });

  it('EZD-010a T2: TOKENS holds the 36 spec entries with their groups and mirrors tokens.css', () => {
    // (a) values, order and groups
    for (const [name, value, group] of EXPECTED) {
      const found = TOKENS.filter((t) => t.name === name);
      expect(found.length, `${name} must appear once`).toBe(1);
      expect(found[0].value, name).toBe(value);
      expect(found[0].group, name).toBe(group);
    }
    expectInOrder(TOKENS.map((t) => t.name as string));

    // (b) every group is one of the five, plus EZD-1954's type scale
    const groups = ['color', 'status', 'radius', 'shadow', 'frame', 'type'];
    for (const t of TOKENS) expect(groups, t.name).toContain(t.group);

    // (c) the full name/value sequence equals the one parsed from tokens.css
    const css = parseCss().decls.map((d) => [d.name, d.value]);
    expect(TOKENS.map((t) => [t.name, t.value])).toEqual(css);
  });
});

// EZD-1954 · audit 2026-11-23 U5: the type scale. Expected sizes are read from the Studio mockup HTML
// (vault/mockups/html/project/*.html), never from the code under test.
const mockupDir = path.join(here, '..', '..', '..', 'vault', 'mockups', 'html', 'project');

/** Every px font size the mockup HTML writes, in font-size declarations and the font shorthand. */
function mockupFontSizes(): Set<number> {
  const sizes = new Set<number>();
  for (const f of readdirSync(mockupDir).filter((n) => n.endsWith('.html'))) {
    const html = readFileSync(path.join(mockupDir, f), 'utf8');
    for (const m of html.matchAll(/font-size:\s*([0-9.]+)px/g)) sizes.add(Number(m[1]));
    for (const m of html.matchAll(/font:([^;"}]*)/g)) {
      const px = /(?:^|\s)([0-9.]+)px/.exec(m[1]);
      if (px) sizes.add(Number(px[1]));
    }
  }
  return sizes;
}

describe('EZD-1954 type scale', () => {
  const typeTokens = TOKENS.filter((t) => t.group === 'type');
  const screen = typeTokens.filter((t) => !t.name.startsWith('--ez-text-drawing-'));

  it('AC-EZD-1954-1: tokens.css has --ez-text-* tokens, each a size the Studio mockup HTML uses', () => {
    const mockup = mockupFontSizes();
    // the audit saw 11, 12, 13, 14 and 18 px in the mockups; the scale holds at least those
    for (const px of [11, 12, 13, 14, 18]) expect(mockup.has(px), `mockup uses ${px}px`).toBe(true);
    const names = screen.map((t) => t.name);
    for (const px of [11, 12, 13, 14, 18]) expect(names).toContain(`--ez-text-${px}`);
    const decls = parseCss().decls;
    for (const t of screen) {
      const m = /^([0-9.]+)px$/.exec(t.value);
      expect(m, t.name).not.toBeNull();
      const px = Number(m![1]);
      expect(t.name, 'name carries the size').toBe(`--ez-text-${String(px).replace('.', '-')}`);
      expect(mockup.has(px), `${t.name}: ${px}px appears in the mockup HTML`).toBe(true);
      expect(decls.find((d) => d.name === t.name)?.value, t.name).toBe(t.value);
    }
  });

  it('AC-EZD-1954-1: the drawing-unit sizes are only the two SVG label sizes of the cabinet run elevation', () => {
    const drawing = typeTokens.filter((t) => t.name.startsWith('--ez-text-drawing-'));
    expect(drawing.map((t) => [t.name, t.value])).toEqual([
      ['--ez-text-drawing-3', '3px'],
      ['--ez-text-drawing-3-5', '3.5px'],
    ]);
  });

  it('AC-EZD-1954-2: every var(--ez-text-*) a CSS module uses is defined in tokens.css', () => {
    const defined = new Set(parseCss().decls.map((d) => d.name));
    const srcDir = path.join(here, '..');
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.module.css')) {
          for (const m of readFileSync(full, 'utf8').matchAll(/var\((--ez-text-[\w-]+)\)/g)) used.add(m[1]);
        }
      }
    };
    walk(srcDir);
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(defined.has(name), name).toBe(true);
  });
});
