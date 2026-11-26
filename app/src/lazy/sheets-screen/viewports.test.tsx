// EZD-703 (S13 Rail: Viewport "Add or edit a viewport; set scale per viewport", "Plans 1/4\", elevations 1/2\"
// default"; S13 Layout status bar "Scale"; 03b rule 3 "viewports ... are model objects"; AC-EZD-703-1 "A1.0 shows
// existing only and A2.0 shows demo"): the Sheets screen asks the renderer for each sheet's viewports, and a viewport
// edit is one model change on the set's sheet_set object, drawn again at once.
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { catalogFor } from '../../server/messages/catalog';
import type { SheetRenderer, SheetRenderRequest } from '../sheets';
import { SheetsStatusStart } from './SheetsStatus';
import { ViewportTool } from './ViewportTool';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const FLOOR2 = '22222222-2222-4222-8222-222222222222';
const STORED_SET = '33333333-3333-4333-8333-333333333333';
const set = (over: Partial<SheetSetSummary> = {}): SheetSetSummary => ({
  id: null,
  kind: 'permit',
  size: '24x36',
  keyPlacement: 'every_sheet',
  lastIssuedVersionId: null,
  sheets: defaultSheetSet([]),
  ...over,
});
const floor = (name: string, order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

let ids = 0;
const newId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++ids).padStart(12, '0')}`;

function setup(summary: SheetSetSummary = set(), objects: [string, ObjectValue][] = []) {
  const store = createModelStore({ objects: new Map([[FLOOR, floor('Floor 1', 1)], ...objects]) });
  const asked: SheetRenderRequest[] = [];
  const renderer: SheetRenderer = {
    render: vi.fn(async (req: SheetRenderRequest) => {
      asked.push(req);
      return { markup: '', shown: [] };
    }),
    dispose: vi.fn(),
  };
  const fetchSets = async () => new Response(JSON.stringify({ sets: [summary] }), { status: 200 });
  const screen = createSheetsScreen(PROJECT, fetchSets, { loadRenderer: async () => renderer, newId });
  return { store, screen, asked };
}

const html = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-703 viewports on the Sheets screen', () => {
  it('EZD-703 AC-1 A1.0 is drawn in the Existing view and A2.0 in the Demo view, each at 1/4"', async () => {
    const { store, screen, asked } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A1.0');
    await flush();
    screen.open('A2.0');
    await flush();
    screen.open('A3.0');
    await flush();
    expect(asked.map((r) => r.viewports.map((v) => [v.kind, v.view, v.scale]))).toEqual([
      [['plan', 'existing', '1/4']],
      [['plan', 'demo', '1/4']],
      [['plan', 'proposed', '1/4']],
    ]);
  });

  it('a sheet with no viewport is not drawn; A4.0 holds an elevation at 1/2", drawn since EZD-707', async () => {
    const { store, screen, asked } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A4.0');
    await flush();
    expect(screen.get().viewports.map((v) => [v.kind, v.scale])).toEqual([['elevation', '1/2']]);
    screen.open('A5.0');
    await flush();
    expect(screen.get().viewports).toEqual([]);
    expect(asked.map((r) => r.viewports.map((v) => v.kind))).toEqual([['elevation']]);
  });

  it('setting a scale writes the permit set as one sheet_set object holding that sheet, and draws again', async () => {
    const { store, screen, asked } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A1.0');
    await flush();
    expect(screen.editViewport({ kind: 'update', index: 0, patch: { scale: '1/2' } })).toBe(true);
    await flush();
    const sets = [...store.getState().objects].filter(([, v]) => v.type === 'sheet_set');
    expect(sets).toHaveLength(1);
    const [id, value] = sets[0]!;
    const parsed = parseStoredObject({ id, type: value.type, schema_version: value.schemaVersion, data: value.data });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.object.type !== 'sheet_set') return;
    expect(parsed.object.data.kind).toBe('permit');
    expect(parsed.object.data.size).toBe('24x36');
    expect(parsed.object.data.viewports?.map((v) => [v.sheet, v.view, v.scale])).toEqual([['A1.0', 'existing', '1/2']]);
    expect(parsed.object.data.viewportSheets).toEqual(['A1.0']);
    // The other sheets keep their defaults.
    screen.open('A2.0');
    await flush();
    expect(screen.get().viewports.map((v) => [v.view, v.scale, v.id])).toEqual([['demo', '1/4', null]]);
    screen.open('A1.0');
    await flush();
    expect(asked.at(-1)?.viewports.map((v) => v.scale)).toEqual(['1/2']);
    expect(screen.get().viewports.map((v) => v.scale)).toEqual(['1/2']);
    // Undo puts the defaults back.
    store.undo();
    await flush();
    expect(screen.get().viewports.map((v) => v.scale)).toEqual(['1/4']);
  });

  it('an edit keeps the stored set id; add and remove change only the open sheet', async () => {
    const stored: ObjectValue = {
      type: 'sheet_set',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        kind: 'permit',
        sheetIds: [],
        size: '24x36',
        keyPlacement: 'cover_only',
        submittalProfileId: null,
        lastIssuedVersionId: null,
        viewports: [
          { id: newId(), sheet: 'A1.0', kind: 'plan', level: null, view: 'existing', scale: '3/8' },
        ],
        viewportSheets: ['A1.0', 'A2.0'],
      },
    };
    const { store, screen } = setup(set({ id: STORED_SET, keyPlacement: 'cover_only' }), [[STORED_SET, stored]]);
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A2.0');
    await flush();
    // A2.0 was changed and has no viewport left: a removed default stays removed.
    expect(screen.get().viewports).toEqual([]);
    expect(screen.editViewport({ kind: 'remove', index: 0 })).toBe(false);
    screen.editViewport({ kind: 'add', viewport: { sheet: 'A2.0', kind: 'plan', level: null, view: 'demo', scale: '1/4' } });
    await flush();
    const sets = [...store.getState().objects].filter(([, v]) => v.type === 'sheet_set');
    expect(sets.map(([id]) => id)).toEqual([STORED_SET]);
    const data = sets[0]![1].data as { keyPlacement: string; viewports: { sheet: string }[] };
    expect(data.keyPlacement).toBe('cover_only');
    expect(data.viewports.map((v) => v.sheet)).toEqual(['A1.0', 'A2.0']);
    screen.editViewport({ kind: 'remove', index: 0 });
    await flush();
    expect(screen.get().viewports).toEqual([]);
    screen.open('A1.0');
    expect(screen.get().viewports.map((v) => v.scale)).toEqual(['3/8']);
  });

  it('a read-only source cannot change viewports', async () => {
    const { store, screen } = setup();
    await screen.load();
    screen.setModel({ getState: store.getState, subscribe: store.subscribe });
    screen.setShown(true);
    screen.open('A1.0');
    expect(screen.editViewport({ kind: 'update', index: 0, patch: { scale: '1/2' } })).toBe(false);
  });

  it('the status bar shows the open sheet scale; the tool shows its pickers only to an editor', async () => {
    const { store, screen } = setup(set(), [[FLOOR2, floor('Floor 2', 2)]]);
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A1.0');
    await flush();
    expect(html(<SheetsStatusStart screen={screen} />)).toContain(`1/4&quot; = 1&#x27;-0&quot;`);
    const edit = html(<ViewportTool screen={screen} canEdit />);
    expect(edit).toContain('data-testid="sheet-viewport-add"');
    expect(edit).toContain('data-testid="sheet-viewport-0-floor"');
    expect(edit).toContain('<option value="existing" selected="">Existing</option>');
    const view = html(<ViewportTool screen={screen} canEdit={false} />);
    expect(view).not.toContain('sheet-viewport-add');
    expect(view).not.toContain('sheet-viewport-0-remove');
    expect(view).toContain('disabled=""');
    screen.open('A0.0');
    await flush();
    expect(html(<SheetsStatusStart screen={screen} />)).toContain('—');
  });

  it('Q-0509 a second floor adds its plan sheets, drawn on that floor; removing the floor removes them', async () => {
    const { store, screen, asked } = setup(set(), [[FLOOR2, floor('Floor 2', 2)]]);
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    const numbers = () => screen.get().sets[0]!.sheets.map((s) => s.number);
    expect(numbers()).toContain('A1.1');
    screen.open('A1.1');
    await flush();
    expect(asked.at(-1)?.viewports).toEqual([{ id: null, sheet: 'A1.1', kind: 'plan', level: FLOOR2, view: 'existing', scale: '1/4' }]);
    store.applyEdit([{ id: FLOOR2, value: null }]);
    await flush();
    expect(numbers()).not.toContain('A1.1');
    expect(screen.get().open).toBe('A0.0');
  });

  it('removing the only viewport of A1.0 clears its drawing; making it an elevation draws the elevation', async () => {
    const { store, screen, asked } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A1.0');
    await flush();
    expect(screen.get().drawing?.sheet).toBe('A1.0');
    screen.editViewport({ kind: 'update', index: 0, patch: { kind: 'elevation' } });
    await flush();
    expect(asked.at(-1)?.viewports.map((v) => [v.kind, v.scale])).toEqual([['elevation', '1/2']]);
    store.undo();
    await flush();
    expect(screen.get().drawing?.sheet).toBe('A1.0');
    screen.editViewport({ kind: 'remove', index: 0 });
    await flush();
    expect(screen.get().viewports).toEqual([]);
    expect(screen.get().drawing).toBeNull();
  });
});

// EZD-707 (R24 "any other wall is added with Add elevation"; AC-EZD-707-3 "Add elevation adds a wall that has no
// cabinets"): on A4.0 the Add elevation picker lists the floor's walls not drawn yet, by their project number, and
// picking one stores it on the sheet's elevation viewport and draws the sheet again with it.
describe('EZD-707 Add elevation on the Sheets screen', () => {
  const WALL_A = '44444444-4444-4444-8444-444444444441';
  const WALL_B = '44444444-4444-4444-8444-444444444442';
  const wallValue = (x0: number, x1: number, number: number): ObjectValue => ({
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { start: { x: x0, y: 0 }, end: { x: x1, y: 0 } },
      status: 'existing',
      level: FLOOR,
      attributes: {
        thickness: 4.5,
        thicknessSide: 'right',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        number,
        layers: [
          { material: 'drywall', thickness: 0.5 },
          { material: 'stud', thickness: 3.5 },
          { material: 'drywall', thickness: 0.5 },
        ],
      },
    },
  });

  it('AC-EZD-707-3: picking a wall with no cabinets adds its elevation to A4.0', async () => {
    const { store, screen, asked } = setup(set(), [
      [WALL_A, wallValue(0, 120, 1)],
      [WALL_B, wallValue(0, 120, 2)],
    ]);
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('A4.0');
    await flush();
    expect(screen.get().elevationWalls).toEqual([
      { id: WALL_A, number: 1 },
      { id: WALL_B, number: 2 },
    ]);
    const edit = html(<ViewportTool screen={screen} canEdit />);
    expect(edit).toContain('data-testid="sheet-elevation-add"');
    expect(edit).toContain('Add elevation');
    expect(edit).toContain('Wall 2');
    // Read only: no picker.
    expect(html(<ViewportTool screen={screen} canEdit={false} />)).not.toContain('sheet-elevation-add');

    expect(screen.addElevation(WALL_B)).toBe(true);
    await flush();
    const sets = [...store.getState().objects].filter(([, v]) => v.type === 'sheet_set');
    expect(sets).toHaveLength(1);
    const [id, value] = sets[0]!;
    const parsed = parseStoredObject({ id, type: value.type, schema_version: value.schemaVersion, data: value.data });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.object.type !== 'sheet_set') return;
    expect(parsed.object.data.viewports?.map((v) => [v.sheet, v.kind, v.scale, v.walls])).toEqual([
      ['A4.0', 'elevation', '1/2', [WALL_B]],
    ]);
    expect(asked.at(-1)?.viewports.map((v) => v.walls)).toEqual([[WALL_B]]);
    expect(screen.get().elevationWalls.map((w) => w.id)).toEqual([WALL_A]);
    // The same wall again changes nothing.
    expect(screen.addElevation(WALL_B)).toBe(false);
  });

  // 40 codes overflow A4.0's table (36 codes on a 24x36 sheet), so the set gains A4.1, drawn with its sheet number.
  it('a cabinet schedule too long for A4.0 adds A4.1 to the set; opening it asks for its table', async () => {
    const RUN = '55555555-5555-4555-8555-555555555500';
    const boxId = (i: number) => `55555555-5555-4555-8555-${String(i + 1).padStart(12, '0')}`;
    const boxes: [string, ObjectValue][] = Array.from({ length: 40 }, (_, i) => [
      boxId(i),
      {
        type: 'cabinet_box',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          status: 'new',
          level: FLOOR,
          attributes: {
            code: `X${i + 1}`,
            boxType: 'base',
            width: 15,
            depth: 24,
            height: 34.5,
            faceLayout: 'door_1',
            hingeSide: 'left',
            finishedEnds: 'none',
            catalogItemId: null,
            finish: null,
          },
        },
      },
    ]);
    const run: [string, ObjectValue] = [
      RUN,
      {
        type: 'cabinet_run',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
          level: FLOOR,
          attributes: { name: 'Island', base: boxes.map(([id]) => id), upper: [] },
        },
      },
    ];
    const { store, screen, asked } = setup(set(), [run, ...boxes]);
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    await flush();
    const numbers = screen.set()!.sheets.map((x) => x.number);
    expect(numbers.slice(numbers.indexOf('A4.0'), numbers.indexOf('A4.0') + 3)).toEqual(['A4.0', 'A4.1', 'A5.0']);
    screen.open('A4.1');
    await flush();
    expect(asked.at(-1)?.sheet).toBe('A4.1');
    expect(asked.at(-1)?.viewports).toEqual([]);
  });
});
