// EZD-222 (AC-EZD-222-1 "Rebinding the Wall key changes the tool shortcut and tooltip"; 04 Tool rail "hovering shows
// a dark tooltip with name and shortcut", "Help | ? | Shortcuts and help"; S03 Help "Rail, bottom | Opens help and
// shortcut list"). Markup only (node environment); the browser test clicks through.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolRail } from '../../components/shell/ToolRail';
import { MessagesProvider } from '../../lib/messages';
import { DEFAULT_BINDINGS, effectiveBindings } from '../../lib/defaults/shortcuts';
import { catalogFor } from '../../server/messages/catalog';
import { DRAWING_RAIL_TOOLS } from '../tools/tool-defs';
import { DrawingRail } from '../tools/DrawingTools';
import { HelpPanel } from './HelpPanel';
import { railToolsWithKeys } from './rail-keys';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
const slotFor = (html: string, id: string) =>
  new RegExp(`<button[^>]*data-rail-tool="${id}"[^>]*>.*?</button><span[^>]*data-rail-tooltip[^>]*>(.*?)</span>`).exec(
    html,
  );
const noop = () => {};

describe('EZD-222 rail keys', () => {
  it('AC-EZD-222-1: Wall moved to B shows B in its tooltip and key hint; the others keep theirs', () => {
    const tools = railToolsWithKeys(DRAWING_RAIL_TOOLS, effectiveBindings({ wall: 'B' }));
    const html = render(<ToolRail top={tools} bottom={[]} activeId={null} onSelect={noop} />);
    const wall = slotFor(html, 'wall');
    expect(wall?.[0]).toContain('aria-keyshortcuts="B"');
    expect(wall?.[1]).toMatch(/^Wall<kbd[^>]*>B<\/kbd>$/);
    expect(slotFor(html, 'room-rect')?.[1]).toMatch(/^Room rectangle<kbd[^>]*>R<\/kbd>$/);
  });

  it('a cleared row shows no key; the default map keeps the 04 keys', () => {
    const cleared = railToolsWithKeys(DRAWING_RAIL_TOOLS, effectiveBindings({ wall: '' }));
    expect(cleared.find((t) => t.id === 'wall')?.shortcut).toBeUndefined();
    const plain = railToolsWithKeys(DRAWING_RAIL_TOOLS, DEFAULT_BINDINGS);
    expect(plain.map((t) => [t.id, t.shortcut])).toEqual([
      ['move', 'M'],
      ['wall', 'W'],
      ['room-rect', 'R'],
      ['door', 'D'],
      ['window', 'N'],
      ['fixtures', 'F'],
      ['sketch', 'S'],
    ]);
  });
});

describe('EZD-222 Help', () => {
  it('the Help button is last at the bottom of the rail with its key', () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: DRAWING_RAIL_TOOLS, disabled: false }}
        assistant={{ open: false, onToggle: noop }}
        help={{ shortcut: '?', onOpen: noop }}
      />,
    );
    const bottom = /data-rail="bottom">(.*)<\/div><\/nav>/.exec(html)?.[1] ?? '';
    const ids = [...bottom.matchAll(/data-rail-tool="([a-z-]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['assistant', 'help']);
    expect(slotFor(html, 'help')?.[1]).toMatch(/^Help<kbd[^>]*>\?<\/kbd>$/);
  });

  it('lists every command with the company key, Not set for a cleared row', () => {
    const html = render(
      <HelpPanel bindings={effectiveBindings({ wall: 'B', door: '' })} onClose={noop} />,
    );
    expect(html).toContain('role="dialog"');
    const rows = [
      ...html.matchAll(/data-command="([a-z-]+)"><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g),
    ].map((m) => [m[1], m[2], m[3]]);
    expect(rows).toContainEqual(['wall', 'Wall', 'B']);
    expect(rows).toContainEqual(['door', 'Door', 'Not set']);
    expect(rows).toContainEqual(['measure', 'Measure', 'Shift+L']);
    expect(rows).toContainEqual(['help', 'Help', '?']);
    expect(rows).toContainEqual(['redo', 'Redo', 'Ctrl+Shift+Z']);
    expect(rows).toHaveLength(17);
  });
});
