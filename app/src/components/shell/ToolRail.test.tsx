// EZD-012a · U1, U2, U8: ToolRail markup and CSS (vault/plans/EZD-012a.md Sections 3, 4).
// Sources: 04 Tool rail (names, keys V/C/?, active tool); S03 .rb/.rbon/.tip; Q-0040 (c); Section 3 markup.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ToolRail } from './index';
import type { RailEntry, RailTool } from './rail-types';
import { DRAWING_RAIL_TOOLS } from '../../editor/tools';

const here = path.dirname(fileURLToPath(import.meta.url));
const fn = () => {};

function render(ui: ReactElement): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const select: RailTool = {
  kind: 'tool',
  id: 'select',
  icon: 'arrow_selector_tool',
  label: 'office.tool.select',
  shortcut: 'V',
};
const cabinets: RailTool = {
  kind: 'tool',
  id: 'cabinets',
  icon: 'kitchen',
  label: 'office.tool.cabinets',
  shortcut: 'C',
};
const help: RailTool = {
  kind: 'tool',
  id: 'help',
  icon: 'help',
  label: 'office.tool.help',
  shortcut: '?',
};
const top: RailEntry[] = [select, { kind: 'separator' }, cabinets];

const count = (s: string, needle: string) => s.split(needle).length - 1;
const buttonFor = (html: string, id: string) => {
  const m = html.match(new RegExp(`<button[^>]*data-rail-tool="${id}"[^>]*>`));
  return m ? m[0] : '';
};

describe('EZD-012a ToolRail markup', () => {
  it('EZD-012a done when: U1 (a) rail markup with the active tool pressed', () => {
    const html = render(<ToolRail top={top} bottom={[help]} activeId="select" onSelect={fn} />);
    expect(count(html, '<nav')).toBe(1);
    expect(html).toMatch(/<nav[^>]*data-shell-region="rail"/);
    expect(html).toMatch(/<nav[^>]*aria-label="Tools"/);
    expect(count(html, '<button')).toBe(3);
    expect(count(html, 'type="button"')).toBe(3);
    expect(count(html, 'aria-pressed="true"')).toBe(1);
    expect(count(html, 'aria-pressed="false"')).toBe(2);
    expect(buttonFor(html, 'select')).toContain('aria-pressed="true"');
    expect(buttonFor(html, 'cabinets')).toContain('aria-pressed="false"');
    expect(buttonFor(html, 'help')).toContain('aria-pressed="false"');
    expect(buttonFor(html, 'select')).toContain('aria-label="Select"');
    expect(buttonFor(html, 'cabinets')).toContain('aria-label="Cabinets"');
    expect(buttonFor(html, 'help')).toContain('aria-label="Help"');
    expect(buttonFor(html, 'select')).toContain('aria-keyshortcuts="V"');
    expect(buttonFor(html, 'cabinets')).toContain('aria-keyshortcuts="C"');
    expect(buttonFor(html, 'help')).toContain('aria-keyshortcuts="?"');
    expect(count(html, '<svg')).toBe(3);
    expect(count(html, 'width="21"')).toBe(3);
    for (const n of ['arrow_selector_tool', 'kitchen', 'help']) {
      expect(html).toContain(`<use href="#ez-icon-${n}"`);
    }
    expect(count(html, 'role="separator"')).toBe(1);
    expect(html).toMatch(/<span(?=[^>]*data-rail="separator")(?=[^>]*role="separator")[^>]*>/);
    const iSel = html.indexOf('data-rail-tool="select"');
    const iSep = html.indexOf('role="separator"');
    const iCab = html.indexOf('data-rail-tool="cabinets"');
    const iTop = html.indexOf('data-rail="top"');
    const iBot = html.indexOf('data-rail="bottom"');
    const iHelp = html.indexOf('data-rail-tool="help"');
    expect(iSel).toBeLessThan(iSep);
    expect(iSep).toBeLessThan(iCab);
    expect(iTop).toBeGreaterThan(-1);
    expect(iTop).toBeLessThan(iBot);
    expect(iSel).toBeGreaterThan(iTop);
    expect(iCab).toBeLessThan(iBot);
    expect(iHelp).toBeGreaterThan(iBot);
    const tips = [...html.matchAll(/<span[^>]*data-rail-tooltip=""[^>]*>(.*?)<\/span>/g)];
    expect(count(html, 'data-rail-tooltip')).toBe(3);
    expect(tips).toHaveLength(3);
    for (const t of tips) expect(t[0]).toContain('aria-hidden="true"');
    expect(tips[0][1]).toMatch(/^Select<kbd[^>]*>V<\/kbd>$/);
    expect(tips[1][1]).toMatch(/^Cabinets<kbd[^>]*>C<\/kbd>$/);
    expect(tips[2][1]).toMatch(/^Help<kbd[^>]*>\?<\/kbd>$/);
  });

  it('EZD-012a done when: U1 (b) activeId null presses no tool', () => {
    const html = render(<ToolRail top={top} bottom={[help]} activeId={null} onSelect={fn} />);
    expect(count(html, 'aria-pressed="true"')).toBe(0);
    expect(count(html, 'aria-pressed="false"')).toBe(3);
  });

  it('U2 empty rail renders both groups and no button, separator or tooltip', () => {
    const html = render(<ToolRail top={[]} bottom={[]} activeId={null} onSelect={fn} />);
    expect(html).toMatch(/<nav[^>]*data-shell-region="rail"/);
    expect(html).toMatch(/<nav[^>]*aria-label="Tools"/);
    expect(html).toContain('data-rail="top"');
    expect(html).toContain('data-rail="bottom"');
    expect(count(html, '<button')).toBe(0);
    expect(count(html, 'role="separator"')).toBe(0);
    expect(count(html, 'data-rail-tooltip')).toBe(0);
  });
});

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .trim();

describe('EZD-012a ToolRail CSS', () => {
  it('U8 40 px buttons, cobalt active tool, dark tooltip only on hover or focus', () => {
    const css = squash(readFileSync(path.join(here, 'ToolRail.module.css'), 'utf8'));
    const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((r) => ({
      sel: squash(r[1]),
      decls: r[2]
        .split(';')
        .map((d) => squash(d))
        .filter((d) => d.length > 0),
    }));
    const block = (sel: string) => rules.find((r) => r.sel === sel)?.decls ?? [];
    const tool = block('.tool');
    for (const d of [
      'width: 40px',
      'height: 40px',
      'border-radius: var(--ez-radius-8)',
      'background: transparent',
      'color: var(--ez-slate-700)',
    ]) {
      expect(tool).toContain(d);
    }
    expect(block('.tool:hover')).toContain('background: var(--ez-hover)');
    const pressedSel = ".tool[aria-pressed='true'], .tool[aria-pressed='true']:hover";
    const pressed = block(pressedSel);
    expect(pressed).toContain('background: var(--ez-cobalt)');
    expect(pressed).toContain('color: var(--ez-surface)');
    const idx = (s: string) => rules.findIndex((r) => r.sel === s);
    expect(idx('.tool:hover')).toBeGreaterThan(-1);
    expect(idx(pressedSel)).toBeGreaterThan(idx('.tool:hover'));
    const tip = block('.tip');
    for (const d of [
      'display: none',
      'position: absolute',
      'left: 52px',
      'font-size: 12px',
      'background: var(--ez-ink)',
      'color: var(--ez-surface)',
      'border-radius: var(--ez-radius-6)',
    ]) {
      expect(tip).toContain(d);
    }
    expect(tip.join(';')).not.toContain('pointer-events');
    // Q-0245 (b): hover half inside @media (hover: hover), focus rule outside (EZD-014b).
    expect(block('.slot:hover .tip')).toContain('display: flex');
    expect(block('.tool:focus-visible + .tip')).toContain('display: flex');
    expect(rules.filter((r) => r.sel.includes('.tip'))).toHaveLength(3);
    const key = block('.key');
    expect(key).toContain('font-family: var(--ez-font-mono)');
    expect(key).toContain('color: var(--ez-slate-300)');
  });
});

describe('EZD-210b ToolRail disabled', () => {
  it('R1 disabled renders every button disabled; without it nothing is disabled; the CSS greys it', () => {
    const drawing = [...DRAWING_RAIL_TOOLS];
    const off = render(
      <ToolRail top={drawing} bottom={[]} activeId={null} onSelect={fn} disabled />,
    );
    expect(count(off, '<button')).toBe(5);
    expect(count(off, 'disabled=""')).toBe(5);
    const on = render(<ToolRail top={drawing} bottom={[]} activeId={null} onSelect={fn} />);
    expect(count(on, '<button')).toBe(5);
    expect(count(on, 'disabled=""')).toBe(0);
    const css = squash(readFileSync(path.join(here, 'ToolRail.module.css'), 'utf8'));
    const rule = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find(
      (r) => squash(r[1]) === ".tool:disabled, .tool[aria-pressed='true']:disabled",
    );
    expect(rule).toBeDefined();
    const decls = rule![2]
      .split(';')
      .map((d) => squash(d))
      .filter((d) => d.length > 0);
    expect(decls).toContain('background: transparent');
    expect(decls).toContain('color: var(--ez-slate-300)');
    expect(decls).toContain('cursor: default');
  });
});

// EZD-5603a T21 (vault/plans/EZD-5603a.md section 4; AC-EZD-5603-1; board S03cAIAssistant.dc.html:83; Decided
// "Rail button"). The tool is imported inside the test so the describes above keep running.
describe('EZD-5603a ToolRail assistant toggle', () => {
  const tipOf = (html: string, id: string) => {
    const at = html.indexOf(`data-rail-tool="${id}"`);
    const m = /<span[^>]*data-rail-tooltip=""[^>]*>([\s\S]*?)<\/span>/.exec(html.slice(at));
    return m ? m[1]! : '';
  };

  it('T21 pressedIds presses the assistant button; no shortcut; tooltip is "Assistant" alone', async () => {
    const { ASSISTANT_RAIL_TOOL } = await import('../../editor/assistant/assistant-ui');
    const on = render(
      <ToolRail
        top={top}
        bottom={[ASSISTANT_RAIL_TOOL]}
        activeId="select"
        pressedIds={['assistant']}
        onSelect={fn}
      />,
    );
    const btn = buttonFor(on, 'assistant');
    expect(btn).toContain('aria-pressed="true"');
    expect(btn).not.toContain('aria-keyshortcuts');
    expect(tipOf(on, 'assistant')).toBe('Assistant');
    expect(tipOf(on, 'assistant')).not.toContain('<kbd');
    expect(buttonFor(on, 'select')).toContain('aria-pressed="true"');

    const off = render(
      <ToolRail top={top} bottom={[ASSISTANT_RAIL_TOOL]} activeId="select" onSelect={fn} />,
    );
    expect(buttonFor(off, 'assistant')).toContain('aria-pressed="false"');
    expect(buttonFor(off, 'select')).toContain('aria-pressed="true"');
  });
});
