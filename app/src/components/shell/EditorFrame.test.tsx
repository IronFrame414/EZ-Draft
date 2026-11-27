// EZD-2029 (Q-0909; AC-EZD-2029-1, -3, -4): on a touch screen the editor left panel starts folded and one control
// opens and folds it; with a mouse nothing changes. The open, fold and Esc behaviour on a device is in
// app/e2e/ezd-2029-touch-left-panel-fold.spec.ts; here the markup and the CSS rules that carry it.
// Expected values come from Q-0909 ("starts folded and opens on demand ... with a mouse nothing changes"), 04 Frame
// (rail 56 px) and 11 Accessibility (44 px targets), never from running the code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { EditorFrame } from './EditorFrame';

const here = path.dirname(fileURLToPath(import.meta.url));

function html(ui: ReactElement): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
}

const tagWith = (markup: string, attr: string) => {
  const i = markup.indexOf(attr);
  expect(i, `markup has ${attr}`).toBeGreaterThanOrEqual(0);
  const start = markup.lastIndexOf('<', i);
  return markup.slice(start, markup.indexOf('>', i) + 1);
};

const attr = (tag: string, name: string) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1];

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const css = squash(readFileSync(path.join(here, 'EditorFrame.module.css'), 'utf8'));

// The declarations of `selector` inside the block text given (top level or one media block).
function rule(block: string, selector: string): string {
  const hit = [...block.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((r) => squash(r[1]!) === selector);
  expect(hit, `rule ${selector}`).toBeDefined();
  return hit![2]!;
}

function coarseBlock(): string {
  const at = css.indexOf('@media (any-pointer: coarse) {');
  expect(at).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
  }
  throw new Error('unclosed media block');
}

const frame = (leftPanel: boolean) => (
  <EditorFrame
    rail={<nav data-shell-region="rail" />}
    leftPanel={leftPanel ? <p>panel body</p> : undefined}
    leftPanelLabel={leftPanel ? 'office.shell.left_panel' : undefined}
    inspectorLabel="office.shell.inspector"
    statusBar={<footer />}
  />
);

describe('EZD-2029 left panel fold on touch screens', () => {
  it('AC-EZD-2029-1: the panel is rendered folded, with one control that names it and says it is folded', () => {
    const markup = html(frame(true));
    const panel = tagWith(markup, 'data-shell-region="left-panel"');
    expect(attr(panel, 'data-open')).toBeUndefined();
    // The panel stays mounted while folded (its tab and scroll are kept); only CSS hides it.
    expect(markup).toContain('panel body');
    const toggle = tagWith(markup, 'data-testid="left-panel-toggle"');
    expect(toggle.startsWith('<button')).toBe(true);
    expect(attr(toggle, 'type')).toBe('button');
    expect(attr(toggle, 'aria-expanded')).toBe('false');
    expect(attr(toggle, 'aria-controls')).toBe(attr(panel, 'id'));
    expect(attr(toggle, 'aria-label')).toBe(en['common.shell.left_panel_toggle']);
    expect(markup.match(/data-testid="left-panel-toggle"/g)).toHaveLength(1);
  });

  it('AC-EZD-2029-1: a frame without a left panel has no fold control', () => {
    expect(html(frame(false))).not.toContain('left-panel-toggle');
  });

  it('AC-EZD-2029-1: under a coarse pointer the folded panel takes no width and the open one lies over the canvas', () => {
    const coarse = coarseBlock();
    expect(rule(coarse, '.leftPanel:not([data-open])')).toContain('display: none');
    const open = rule(coarse, '.leftPanel[data-open]');
    expect(open).toContain('position: absolute');
    // Below the tablet edit bar's row, as the zoom stack (EZD-1979): margin 14 + bar 66 + 12 = 92 px.
    expect(open).toContain('top: 92px');
    expect(open).toContain('bottom: 0');
    // One body gap to the right of the rail column, as the panel sits with a mouse (04 Frame).
    expect(open).toContain('left: calc(100% + var(--ez-body-gap))');
    expect(rule(coarse, '.railColumn')).toContain('position: relative');
    const toggle = rule(coarse, '.foldToggle');
    expect(toggle).toContain('display: flex');
    expect(toggle).toContain('width: var(--ez-rail-width)');
    expect(toggle).toContain('height: var(--ez-rail-width)');
  });

  it('AC-EZD-2029-3: with a fine pointer the control is not shown and the rail column takes no box', () => {
    const top = css.slice(0, css.indexOf('@media'));
    expect(rule(top, '.foldToggle')).toContain('display: none');
    expect(rule(top, '.railColumn')).toContain('display: contents');
    // The only rule that hides the panel is the coarse-pointer one.
    expect(top).not.toMatch(/\.leftPanel[^{]*\{[^}]*display: none/);
  });

  it('AC-EZD-2029-4: the spoken name is in the English and Spanish catalogs', () => {
    expect(en['common.shell.left_panel_toggle']).toBe('Show or hide the left panel');
    expect(es['common.shell.left_panel_toggle']).toBe('Mostrar u ocultar el panel izquierdo');
  });
});
