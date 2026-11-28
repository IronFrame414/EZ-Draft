// EZD-1918 (editor plan 5.1; S03 Controls rail): DrawingTools.tsx is split into DrawingRail.tsx, DrawingLayer.tsx
// and the tools' own layer parts in tools/parts/. Markup only (node environment); the browser runs the drawing-tools,
// measure, door-window and fixtures e2e specs unchanged.
import fs from 'node:fs';
import path from 'node:path';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { createSurfaceSetting } from '../../ceiling/surface';
import type { PlanCanvasHandle } from '../../plan/controller';
import { editorRail, PAUSED_TOOL_IDS } from '../../selection/selection-controller';
import { DrawingLayer } from '../DrawingLayer';
import { DrawingRail } from '../DrawingRail';
import type { DrawingController, DrawingUi } from '../drawing-controller';
import { barModule } from './dimension';
import { tooltipModule } from './door';
import { layerParts } from './index.generated';

const TOOLS_DIR = path.resolve(__dirname, '..');

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );

// The top group's buttons in order, each with its states.
function topButtons(html: string) {
  const top = /data-rail="top"[^>]*>(.*?)<div[^>]*data-rail="bottom"/s.exec(html)?.[1] ?? '';
  return [...top.matchAll(/<button([^>]*)>/g)].map((m) => {
    const attrs = m[1]!;
    return {
      id: /data-rail-tool="([a-z-]+)"/.exec(attrs)?.[1],
      disabled: /\sdisabled=""/.test(attrs),
      paused: /data-rail-paused=""/.test(attrs),
    };
  });
}

describe('EZD-1918 AC-EZD-1918-1 the rail and the layer are their own files', () => {
  it('DrawingRail.tsx and DrawingLayer.tsx exist and DrawingTools.tsx is gone', () => {
    expect(fs.existsSync(path.join(TOOLS_DIR, 'DrawingRail.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(TOOLS_DIR, 'DrawingLayer.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(TOOLS_DIR, 'DrawingTools.tsx'))).toBe(false);
    expect(typeof DrawingRail).toBe('function');
    expect(typeof DrawingLayer).toBe('function');
  });

  it('the layer names no tool of its own: the tool pieces come from the parts registry', () => {
    const layer = fs.readFileSync(path.join(TOOLS_DIR, 'DrawingLayer.tsx'), 'utf8');
    for (const id of ['sketch-strokes', 'measure-readout', 'door-tooltip', 'dimension-mode'])
      expect(layer).not.toContain(`data-testid="${id}"`);
    for (const tool of ["'fixtures'", "'sketch'", "'measure'", "'cabinets'", "'countertops'"])
      expect(layer).not.toContain(`ui.tool !== ${tool}`);
  });
});

describe('EZD-1918 AC-EZD-1918-1 the tools layer parts are registered', () => {
  it('lists the fixtures, sketch and measure parts (and the door, dimension, text and cabinets parts)', () => {
    const ids = layerParts.map((p) => p.id);
    for (const id of ['fixtures', 'sketch', 'measure', 'door', 'dimension', 'text', 'cabinets'])
      expect(ids).toContain(id);
    expect(layerParts.find((p) => p.id === 'sketch')?.Svg).toBeDefined();
    expect(layerParts.find((p) => p.id === 'measure')?.Chips).toBeDefined();
    expect(layerParts.find((p) => p.id === 'fixtures')?.Layer).toBeDefined();
  });

  it('is sorted by order', () => {
    const orders = layerParts.map((p) => p.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

// The rail's top group, in order (S03 Controls rail; EZD-412 and EZD-601: Countertops and Electrical follow Cabinets;
// 04 Tool rail: Measure after the drawing tools; EZD-502: Ceiling ends the top group).
const ORDER = [
  'select',
  'move',
  'wall',
  'room-rect',
  'door',
  'window',
  'cabinets',
  'countertops',
  'electrical',
  'fixtures',
  'dimension',
  'text',
  'sketch',
  'revision-cloud',
  'measure',
  'ceiling',
];
const ready = { editor: 'ready', canvasFailed: false, controllerEnabled: true } as const;

describe('EZD-1918 AC-EZD-1918-1 the rail keeps its tool order and states', () => {
  it('holding the lock: every tool, in order, on', () => {
    const rail = editorRail({ ...ready, canEdit: true })!;
    const html = render(
      <DrawingRail drawing={null} selection={null} rail={rail} surface={createSurfaceSetting()} />,
    );
    const buttons = topButtons(html);
    expect(buttons.map((b) => b.id)).toEqual(ORDER);
    expect(buttons.filter((b) => b.disabled || b.paused)).toEqual([]);
  });

  it('the user order moves the tools; the Ceiling tool stays last unless moved', () => {
    const rail = editorRail({ ...ready, canEdit: true })!;
    const html = render(
      <DrawingRail
        drawing={null}
        selection={null}
        rail={rail}
        surface={createSurfaceSetting()}
        order={['wall', 'move']}
      />,
    );
    const ids = topButtons(html).map((b) => b.id);
    expect(ids.indexOf('wall')).toBeLessThan(ids.indexOf('move'));
    expect(ids.at(-1)).toBe('ceiling');
  });

  it('loading: every tool disabled', () => {
    const rail = editorRail({ ...ready, editor: 'loading', canEdit: false })!;
    const buttons = topButtons(
      render(
        <DrawingRail
          drawing={null}
          selection={null}
          rail={rail}
          surface={createSurfaceSetting()}
        />,
      ),
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('Edit model without the lock: the drawing tools paused, the rest on (EZD-225)', () => {
    const rail = editorRail({ ...ready, canEdit: false, canEditModel: true })!;
    const buttons = topButtons(render(<DrawingRail drawing={null} selection={null} rail={rail} />));
    expect(buttons.map((b) => b.id)).toEqual(ORDER.filter((id) => id !== 'ceiling'));
    for (const b of buttons) {
      const paused = PAUSED_TOOL_IDS.includes(b.id!);
      expect(b.paused, b.id).toBe(paused);
      expect(b.disabled, b.id).toBe(paused);
    }
  });

  it('view only: Select, Cabinets, Countertops, Electrical and Measure (select-only rail)', () => {
    const rail = editorRail({ ...ready, canEdit: false, canEditModel: false })!;
    const buttons = topButtons(render(<DrawingRail drawing={null} selection={null} rail={rail} />));
    expect(buttons.map((b) => b.id)).toEqual([
      'select',
      'cabinets',
      'countertops',
      'electrical',
      'measure',
    ]);
    expect(buttons.filter((b) => b.disabled)).toEqual([]);
  });

  it('only one tool on: every other tool disabled', () => {
    const rail = { ...editorRail({ ...ready, canEdit: true })!, only: 'fixtures' };
    const buttons = topButtons(render(<DrawingRail drawing={null} selection={null} rail={rail} />));
    for (const b of buttons) expect(b.disabled, b.id).toBe(b.id !== 'fixtures');
  });
});

// A drawing ui with nothing on; each case sets what it needs.
const IDLE: DrawingUi = {
  enabled: true,
  tool: null,
  pick: null as never,
  boxes: [],
  gapMessage: null,
  lastLength: null,
  doorTarget: null,
  openingWidth: null,
  entry: null,
  fixtureChoice: null,
  utilities: null,
  dimensionMode: null,
  textBox: null,
};

function layerHtml(ui: DrawingUi) {
  const controller = {
    subscribe: () => () => {},
    getUi: () => ui,
    getFrame: () => null,
    onFrame: () => () => {},
  } as unknown as DrawingController;
  const handle = {
    modelToScreen: (p: { x: number; y: number }) => p,
    onCameraChange: () => () => {},
    onSpaceTap: () => () => {},
    getCursor: () => ({ x: 100, y: 50 }),
  } as unknown as PlanCanvasHandle;
  return render(
    <DrawingLayer controller={controller} handle={handle} canEdit onCancel={() => {}} />,
  );
}

describe('EZD-1918 AC-EZD-1918-2 the layer draws the parts where the pieces were', () => {
  it('the sketch strokes path is the overlay SVG’s first element', () => {
    const html = layerHtml(IDLE);
    expect(html).toMatch(/data-testid="tool-overlay"[^>]*><path[^>]*data-testid="sketch-strokes"/);
  });

  it('the measure chip is the last of the selection chips', () => {
    const html = layerHtml(IDLE);
    const chips =
      /data-testid="selection-chips"[^>]*>(.*?)<\/div><\/div>(?!<div[^>]*chipSlot)/s.exec(
        html,
      )?.[0] ?? '';
    expect(chips).toContain('data-testid="measure-readout"');
    expect(chips.indexOf('data-testid="size-chip"')).toBeLessThan(
      chips.indexOf('data-testid="measure-readout"'),
    );
  });

  it('the door tooltip at the cursor + 12 px, then the dimension bar, while their tools need them', async () => {
    // The tooltip's and the bar's code is lazy (first input in the page); here it is loaded first.
    await tooltipModule.load();
    const html = layerHtml({ ...IDLE, tool: 'door', doorTarget: 'arc' });
    expect(html).toMatch(/data-testid="door-tooltip"[^>]*style="left:112px;top:62px"/);
    expect(layerHtml(IDLE)).not.toContain('door-tooltip');
    await barModule.load();
    const dim = layerHtml({ ...IDLE, tool: 'dimension', dimensionMode: 'linear' });
    expect(dim).toContain('data-testid="dimension-mode"');
    expect(
      layerHtml({ ...IDLE, tool: 'dimension', dimensionMode: 'linear', enabled: false }),
    ).not.toContain('dimension-mode');
  });

  it('the typed bar: a typed tool’s own, an entry’s under the other tools, none on the cabinet and countertop screens', () => {
    const typed = (ui: DrawingUi) => layerHtml(ui).includes('data-testid="typed-entry-layer"');
    const entry = { kind: 'handle', id: 'w1', objectKind: 'wall' } as const;
    for (const tool of ['wall', 'room-rect', 'door', 'window', 'move'] as const)
      expect(typed({ ...IDLE, tool }), tool).toBe(true);
    for (const tool of [
      'fixtures',
      'sketch',
      'measure',
      'dimension',
      'text',
      'revision-cloud',
      'electrical',
    ] as const) {
      expect(typed({ ...IDLE, tool }), tool).toBe(false);
      expect(typed({ ...IDLE, tool, entry }), tool).toBe(true);
    }
    expect(typed({ ...IDLE, entry })).toBe(true);
    for (const tool of ['cabinets', 'countertops'] as const)
      expect(typed({ ...IDLE, tool, entry }), tool).toBe(false);
  });
});
