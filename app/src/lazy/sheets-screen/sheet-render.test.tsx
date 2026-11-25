// EZD-702b AC-EZD-702b-2 "an edit on the Plan tab triggers no sheet render" (11 rule 2 "Recompute only what changed,
// and only what is on screen"; phase-07 EZD-702b "only the open sheet is drawn live"). The screen draws through an
// injected renderer, so the count is the number of sheet renders asked for.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { Change } from '../../editor/model/patches';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { catalogFor } from '../../server/messages/catalog';
import type { SheetRenderer, SheetRenderRequest } from '../sheets';
import { SheetsCanvas } from './SheetsCanvas';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const SETS: SheetSetSummary[] = [
  {
    id: null,
    kind: 'permit',
    size: '24x36',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: defaultSheetSet([]),
  },
];
const fetchSets = async () => new Response(JSON.stringify({ sets: SETS }), { status: 200 });

const floor: ObjectValue = { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } };
function wallChange(id: string, x: number): Change {
  const made = createWallData({ start: { x, y: 0 }, end: { x, y: 120 }, level: FLOOR, thicknessSide: 'right' });
  if (!made.ok) throw new Error('wall data');
  return { id, value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const store = createModelStore({ objects: new Map([[FLOOR, floor]]) });
  const asked: SheetRenderRequest[] = [];
  const renderer: SheetRenderer = {
    render: vi.fn(async (req: SheetRenderRequest) => {
      asked.push(req);
      return { markup: `<line data-object-id="n${req.objects.size}"/>`, shown: [] };
    }),
    dispose: vi.fn(),
  };
  const loadRenderer = vi.fn(async () => renderer);
  const screen = createSheetsScreen(PROJECT, fetchSets, { loadRenderer });
  return { store, screen, asked, loadRenderer };
}

describe('EZD-702b sheet renders', () => {
  it('EZD-702b AC-2 an edit on the Plan tab triggers no sheet render', async () => {
    const { store, screen, asked, loadRenderer } = setup();
    await screen.load();
    screen.setModel(store);
    // Plan is shown: the model is there, the screen is not shown, nothing is drawn or loaded.
    store.applyEdit([wallChange('w1', 0)]);
    await flush();
    expect(asked).toHaveLength(0);
    expect(loadRenderer).not.toHaveBeenCalled();

    // Sheets shown on a plan sheet: the open sheet is drawn once.
    screen.open('A1.0');
    screen.setShown(true);
    await flush();
    expect(asked).toHaveLength(1);
    expect(screen.get().renders).toBe(1);
    expect(screen.get().drawing).toEqual({ sheet: 'A1.0', size: '24x36', markup: '<line data-object-id="n2"/>' });

    // Back on Plan: three edits draw no sheet.
    screen.setShown(false);
    store.applyEdit([wallChange('w2', 48)]);
    store.applyEdit([wallChange('w3', 96)]);
    store.applyEdit([wallChange('w4', 144)]);
    await flush();
    expect(asked).toHaveLength(1);
    expect(screen.get().renders).toBe(1);

    // Sheets again: the open sheet is drawn once, from the model as it is now.
    screen.setShown(true);
    await flush();
    expect(asked).toHaveLength(2);
    expect(asked[1]!.objects.size).toBe(5);
    // Showing again with no change draws nothing more.
    screen.setShown(false);
    screen.setShown(true);
    await flush();
    expect(asked).toHaveLength(2);
  });

  it('EZD-702b only the open sheet is drawn, and only a plan sheet', async () => {
    const { store, screen, asked, loadRenderer } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    // The permit set opens on A0.0 Cover, which has no plan: no render, the renderer is not loaded.
    await flush();
    expect(screen.get().open).toBe('A0.0');
    expect(asked).toHaveLength(0);
    expect(loadRenderer).not.toHaveBeenCalled();

    screen.open('A3.0');
    await flush();
    expect(asked).toHaveLength(1);
    // An edit while the sheet is shown draws it again.
    store.applyEdit([wallChange('w1', 0)]);
    await flush();
    expect(asked).toHaveLength(2);
    expect(screen.get().drawing?.sheet).toBe('A3.0');
  });

  it('EZD-702b the canvas draws the open sheet drawing inside the page', async () => {
    const { store, screen } = setup();
    await screen.load();
    screen.setModel(store);
    screen.open('A1.0');
    screen.setShown(true);
    await flush();
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <SheetsCanvas screen={screen} />
      </MessagesProvider>,
    );
    expect(html).toContain('data-testid="sheet-drawing"><line data-object-id="n1"/></g>');
    expect(html).toContain('data-sheet-renders="1"');
    // Another sheet does not show A1.0's drawing.
    screen.open('A0.0');
    const cover = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <SheetsCanvas screen={screen} />
      </MessagesProvider>,
    );
    expect(cover).not.toContain('sheet-drawing');
  });
});
