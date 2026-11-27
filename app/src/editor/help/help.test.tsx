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
import { createSurfaceSetting } from '../ceiling/surface';
import { editorRail } from '../selection/selection-controller';
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
      ['dimension', 'L'],
      ['text', 'T'],
      ['sketch', 'S'],
      ['revision-cloud', 'Q'],
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
      ...html.matchAll(/data-command="([a-z0-9-]+)"><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g),
    ].map((m) => [m[1], m[2], m[3]]);
    expect(rows).toContainEqual(['wall', 'Wall', 'B']);
    expect(rows).toContainEqual(['door', 'Door', 'Not set']);
    expect(rows).toContainEqual(['measure', 'Measure', 'Shift+L']);
    expect(rows).toContainEqual(['help', 'Help', '?']);
    expect(rows).toContainEqual(['redo', 'Redo', 'Ctrl+Shift+Z']);
    // EZD-230: the full key map (04 rail table, Pan, Look up, tabs 1 to 4, the edit keys and Save).
    expect(rows).toContainEqual(['reference', 'Reference', 'Shift+R']);
    expect(rows).toContainEqual(['tab-3d', '3D tab', '2']);
    expect(rows).toHaveLength(34);
  });
});

// EZD-230 (AC-EZD-230-1 "Every rail tool that is shown shows its default key in its tooltip"; 04 Tool rail table,
// the keys written out here; Q-0038 per-user order). The rail the editor shows an editor, with the Ceiling tool.
describe('EZD-230 full rail', () => {
  const SPEC_KEYS: Record<string, string> = {
    select: 'V', move: 'M', wall: 'W', 'room-rect': 'R', door: 'D', window: 'N', cabinets: 'C', countertops: 'K',
    fixtures: 'F', electrical: 'E', ceiling: 'G', catalog: 'P', dimension: 'L', text: 'T', sketch: 'S',
    'detail-callout': 'X', 'revision-cloud': 'Q', reference: 'Shift+R', markup: 'Shift+M',
    'supplier-markup': 'Shift+S', measure: 'Shift+L', check: 'Shift+C', help: '?',
  };
  const editorTools = () => {
    const spec = editorRail({ editor: 'ready', canEdit: true, canvasFailed: false, controllerEnabled: true });
    return railToolsWithKeys(spec!.tools, DEFAULT_BINDINGS);
  };
  const shown = (html: string) => [...html.matchAll(/data-rail-tool="([a-z0-9-]+)"/g)].map((m) => m[1]!);

  it('AC-EZD-230-1: every shown rail tool with a 04 key shows that key in its tooltip, Ceiling G included', () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: editorTools(), disabled: false }}
        surface={createSurfaceSetting()}
        assistant={{ open: false, onToggle: noop }}
        help={{ shortcut: '?', onOpen: noop }}
        bindings={DEFAULT_BINDINGS}
      />,
    );
    const ids = shown(html);
    expect(ids).toContain('ceiling');
    // Assistant is not in the 04 table and has no default key (vault/build/assumptions.md EZD-230).
    for (const id of ids.filter((x) => x !== 'assistant')) {
      expect(SPEC_KEYS[id], id).toBeDefined();
      const tip = slotFor(html, id)?.[1] ?? '';
      expect(tip, id).toMatch(new RegExp(`<kbd[^>]*>${SPEC_KEYS[id]!.replace(/[?+]/g, '\\$&')}</kbd>$`));
    }
    // Tools not built yet are not on the rail (phase-02.md EZD-230); Dimension and Text are built (EZD-216), Revision cloud too (EZD-232).
    for (const id of ['catalog', 'detail-callout', 'reference', 'markup']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('a rebound Ceiling key shows in its tooltip', () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: editorTools(), disabled: false }}
        surface={createSurfaceSetting()}
        bindings={effectiveBindings({ ceiling: 'J' })}
      />,
    );
    expect(slotFor(html, 'ceiling')?.[1]).toMatch(/^Ceiling<kbd[^>]*>J<\/kbd>$/);
  });

  it("the user's order puts the listed tools first and keeps the rest in default order", () => {
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={{ tools: editorTools(), disabled: false }}
        surface={createSurfaceSetting()}
        bindings={DEFAULT_BINDINGS}
        order={['ceiling', 'wall', 'not-a-tool']}
        onReorder={noop}
      />,
    );
    const top = shown(/data-rail="top">(.*?)<\/div><div[^>]*data-rail="bottom"/.exec(html)?.[1] ?? '');
    expect(top.slice(0, 4)).toEqual(['ceiling', 'wall', 'select', 'move']);
    expect(top).toHaveLength(editorTools().length + 1);
  });
});
