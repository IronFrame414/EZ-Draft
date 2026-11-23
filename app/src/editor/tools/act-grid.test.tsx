// EZD-511 ACT grid (AC-EZD-511-1 "Acceptance: ACT borders are never below half a tile."; phase-05 EZD-511 "2x2 or 2x4
// module, direction, start point; balancing picks a start point with edge tiles at least half a tile; minimum border
// in Defaults; warning when overridden; troffers snap into tiles"). Expected values: S05 Validation "edge tiles at
// least half a tile (12" on a 2x2 module; 12" or 24" on 2x4 per direction)"; board S05Ceiling legend "Grid balanced:
// borders {a} and {b}" and tag "CLG 8' 0" · ACT 2x2"; vault/build/assumptions.md EZD-511 rows (balancing rule and the
// worked examples 94" -> 23" and 114" -> 21", wording). The grid room is 114" x 94" at the origin: its long wall runs
// along x, so with the long wall the mains run along x; balanced at half a tile, 114" gives 21" borders (cross tees
// at x = 21, 45, 69, 93) and 94" gives 23" borders (mains at y = 23, 47, 71); the start is (21, 23). Hand worked from
// the rule, never from running the code. Markup through renderToStaticMarkup in the real office catalog, English.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { planDetailItems } from '../../lazy/room-fields/details-drawing';
import { tagText } from '../ceiling/ceiling-shapes';
import { actGridItems, rcpList, trofferItems } from '../ceiling/rcp';
import { createSurfaceSetting } from '../ceiling/surface';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { planDrawingList } from '../plan/batches';
import type { PlanPointerEvent } from '../plan/input';
import { createPickIndex } from '../selection/pick-index';
import {
  actGridEdit,
  actGridOf,
  actGridView,
  placeActGrid,
  snapToActTile,
} from './act-grid-edits';
import { actGridReceiver } from './act-grid-tool';
import { ActLegend } from './ActGridPanel';
import { ceilingAware } from './beam-tool';
import { deviceToolReceiver } from './ceiling-device-receiver';
import { placeCeilingDevice } from './fixture-tool';
import { DOOR, F1, roomValue, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const GRID_ID = uid(90);
const LIGHT_ID = uid(91);
const HALF = 0.5;

function room(w = 114, h = 94): Map<string, ObjectValue> {
  const objects = new Map(DOOR);
  objects.set(ROOM_ID, roomValue([P(0, 0), P(w, 0), P(w, h), P(0, h)], 'Laundry', null));
  return objects;
}

function apply(objects: Objects, change: { id: string; value: ObjectValue | null }) {
  const next = new Map(objects);
  if (change.value === null) next.delete(change.id);
  else next.set(change.id, change.value);
  return next;
}

function withGrid(objects = room()): Map<string, ObjectValue> {
  const r = placeActGrid(objects, F1, P(50, 50), 'new', () => GRID_ID, HALF);
  if (r.kind !== 'placed') throw new Error('not placed');
  return apply(objects, r.change);
}

function edited(
  objects: Map<string, ObjectValue>,
  edit: Parameters<typeof actGridEdit>[2],
  share = HALF,
): Map<string, ObjectValue> {
  const r = actGridEdit(objects, GRID_ID, edit, share);
  if (!r.ok || r.change === null) throw new Error('no change');
  return apply(objects, r.change);
}

/** The element's text with the markup's character references read back. */
const text = (inner: string): string =>
  textOf(inner).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const click = (model: Point): PlanPointerEvent => ({
  kind: 'click',
  model,
  screen: model,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

describe('EZD-511 placing a grid', () => {
  it('a click in a flat room places a balanced 2x2 grid with the long wall, saved with the room, and selects it', () => {
    const store = createModelStore({ objects: room() });
    const select = vi.fn();
    const onMessage = vi.fn();
    const receive = actGridReceiver({
      store,
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => GRID_ID,
      select,
      onMessage,
      minShare: () => HALF,
      place: placeActGrid,
    });
    receive(click(P(500, 500)));
    expect(onMessage).toHaveBeenCalledWith('office.ceiling.act.click_room');
    receive({ ...click(P(50, 50)), kind: 'down' });
    expect(store.getState().objects.has(GRID_ID)).toBe(false);
    receive(click(P(50, 50)));
    expect(select).toHaveBeenCalledWith([GRID_ID]);
    const saved = store.getState().objects.get(GRID_ID)!;
    const parsed = parseStoredObject({
      id: GRID_ID,
      type: saved.type,
      schema_version: saved.schemaVersion,
      data: saved.data,
    });
    expect(parsed.ok && parsed.object.type === 'act_grid').toBe(true);
    expect(saved.data).toEqual({
      geometry: { roomId: ROOM_ID, start: { x: 21, y: 23 } },
      status: 'new',
      level: F1,
      attributes: { module: '2x2', direction: 'with_long_wall', balanced: true },
    });
    // One grid per room: a second click selects the one there.
    select.mockClear();
    const before = store.getState().objects;
    receive(click(P(80, 80)));
    expect(select).toHaveBeenCalledWith([GRID_ID]);
    expect(store.getState().objects).toBe(before);
  });

  it('a room whose ceiling is not flat is refused: "ACT needs a flat ceiling."', () => {
    const objects = room();
    const v = objects.get(ROOM_ID)!;
    const data = v.data as { attributes: Record<string, unknown> };
    objects.set(ROOM_ID, { ...v, data: { ...data, attributes: { ...data.attributes, ceilingType: 'vaulted' } } });
    const r = placeActGrid(objects, F1, P(50, 50), 'new', () => GRID_ID, HALF);
    expect(r).toEqual({ kind: 'refused', messageKey: 'office.ceiling.act.flat_only' });
    expect(catalogFor('office', 'en')['office.ceiling.act.flat_only']).toBe('ACT needs a flat ceiling.');
  });
});

describe('EZD-511 AC-1 balanced borders', () => {
  it('AC-EZD-511-1 the balanced grid has borders of 21" and 23", both at least half a tile (12")', () => {
    const view = actGridView(withGrid(), GRID_ID, HALF)!;
    expect(view.borders).toEqual([21, 23]);
    expect(view.layout.alongMain.lines).toEqual([21, 45, 69, 93]);
    expect(view.layout.acrossMains.lines).toEqual([23, 47, 71]);
    expect(view.warnings).toEqual([]);
    for (const a of [view.layout.alongMain, view.layout.acrossMains])
      for (const b of a.borders) expect(b).toBeGreaterThanOrEqual(a.tile / 2);
  });

  it('AC-EZD-511-1 on 2x4 the 48" direction balances to at least 24": 94" gives 47" borders', () => {
    // 94 on 48: n = 1, r = 46, 23 < 24, so (46 + 48) / 2 = 47 and no whole tile.
    const view = actGridView(edited(withGrid(), { field: 'module', value: '2x4' }), GRID_ID, HALF)!;
    expect(view.balanced).toBe(true);
    expect(view.layout.acrossMains.lines).toEqual([47]);
    expect(view.layout.acrossMains.borders).toEqual([47, 47]);
    expect(view.borders).toEqual([21, 47]);
  });

  it('AC-EZD-511-1 every room from 24" to 240" in 6" steps balances to borders of at least half a tile', () => {
    for (const mod of ['2x2', '2x4'] as const)
      for (const direction of ['with_long_wall', 'across_long_wall'] as const)
        for (let w = 24; w <= 240; w += 6)
          for (const h of [24, 30, 47, 94, 120]) {
            let objects = room(w, h);
            const r = placeActGrid(objects, F1, P(1, 1), 'new', () => GRID_ID, HALF);
            if (r.kind !== 'placed') throw new Error('not placed');
            objects = apply(objects, r.change);
            const grid = actGridOf(objects, GRID_ID)!;
            objects = apply(objects, {
              id: GRID_ID,
              value: {
                type: 'act_grid',
                schemaVersion: CURRENT_SCHEMA_VERSION,
                data: { ...grid.data, attributes: { ...grid.data.attributes, module: mod, direction } },
              },
            });
            const view = actGridView(objects, GRID_ID, HALF)!;
            for (const a of [view.layout.alongMain, view.layout.acrossMains])
              for (const b of a.borders) expect(b).toBeGreaterThanOrEqual(a.tile / 2 - 1e-9);
          }
  });

  it('the Defaults minimum (a quarter tile, 6") balances 114" to 9" borders', () => {
    // 114 on 24: n = 4, r = 18, 9 >= 6.
    const view = actGridView(withGrid(), GRID_ID, 0.25)!;
    expect(view.layout.alongMain.borders).toEqual([9, 9]);
  });
});

describe('EZD-511 inspector edits and the override warning', () => {
  it('Across long wall turns the mains; the grid stays balanced', () => {
    const view = actGridView(
      edited(withGrid(), { field: 'direction', value: 'across_long_wall' }),
      GRID_ID,
      HALF,
    )!;
    expect(view.direction).toBe('across_long_wall');
    expect(view.balanced).toBe(true);
    // The mains now run along y; along a main (94") the borders are 23", across (114") 21".
    expect(view.borders).toEqual([23, 21]);
  });

  it('a typed start point turns balancing off; a 6" border warns, Balance puts the balanced start back', () => {
    const over = edited(withGrid(), { field: 'start', direction: 'along_main', text: '6' });
    const view = actGridView(over, GRID_ID, HALF)!;
    expect(view.balanced).toBe(false);
    // Cross tees at 6, 30, 54, 78, 102: borders 6" and 12".
    expect(view.layout.alongMain.borders).toEqual([6, 12]);
    expect(view.warnings).toEqual([{ direction: 'along_main', border: 6, min: 12 }]);
    // The mains are kept where they were.
    expect(view.layout.acrossMains.lines).toEqual([23, 47, 71]);
    const back = actGridView(edited(over, { field: 'balance' }), GRID_ID, HALF)!;
    expect(back.balanced).toBe(true);
    expect(back.borders).toEqual([21, 23]);
    expect(back.warnings).toEqual([]);
  });

  it('a start that meets the minimum does not warn; a bad length is refused and not applied', () => {
    // Start 1' 6": cross tees at 18, 42, 66, 90, so the borders are 18" and a whole 24" tile.
    const over = edited(withGrid(), { field: 'start', direction: 'along_main', text: `1' 6"` });
    expect(actGridView(over, GRID_ID, HALF)!.layout.alongMain.borders).toEqual([18, 24]);
    expect(actGridView(over, GRID_ID, HALF)!.warnings).toEqual([]);
    const bad = actGridEdit(withGrid(), GRID_ID, { field: 'start', direction: 'along_main', text: 'abc' }, HALF);
    expect(bad.ok).toBe(false);
    const long = actGridEdit(withGrid(), GRID_ID, { field: 'start', direction: 'along_main', text: '120' }, HALF);
    expect(long).toEqual({ ok: false, messageKey: 'office.ceiling.act.start_too_long' });
  });

  function render(objects: Map<string, ObjectValue>, canEdit = true): string {
    const store = createModelStore({ objects });
    const ui = { ids: [GRID_ID], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <InspectorPanel store={store} selection={selection} canEdit={canEdit} drawing={null} />
        <ActLegend store={store} selection={selection} />
      </MessagesProvider>,
    );
  }

  it('one grid alone shows its inspector and the legend shows "Grid balanced: borders {a} and {b}"', () => {
    const html = render(withGrid());
    expect(textOf(elements(html, 'inspector-title')[0]!.inner)).toBe('Acoustical grid');
    expect(text(elements(html, 'legend-act-borders')[0]!.inner)).toBe(
      `Grid balanced: borders 1' 9" and 1' 11"`,
    );
    expect(elements(html, 'act-grid-balance')).toHaveLength(0);
    expect(elements(html, 'act-grid-warning-along_main')).toHaveLength(0);
  });

  it('after an override under the minimum: the warning, "Grid borders", and Balance', () => {
    const html = render(edited(withGrid(), { field: 'start', direction: 'along_main', text: '6' }));
    expect(text(elements(html, 'act-grid-warning-along_main')[0]!.inner)).toBe(
      `Border 6" is under the 1' 0" minimum.`,
    );
    expect(text(elements(html, 'legend-act-borders')[0]!.inner)).toBe(`Grid borders 6" and 1' 11"`);
    expect(elements(html, 'act-grid-balance')).toHaveLength(1);
  });

  it('without Edit model every field is read only', () => {
    const html = render(withGrid(), false);
    for (const id of ['act-grid-module', 'act-grid-direction', 'act-grid-start-along', 'act-grid-start-across'])
      expect(elements(html, id)[0]!.attrs).toContain('disabled');
    expect(elements(html, 'inspector-view-only')).toHaveLength(1);
  });
});

describe('EZD-511 drawing, picking and troffers', () => {
  it('the RCP draws the 4 cross tees and 3 mains clipped to the room, and the start mark', () => {
    const items = actGridItems(withGrid(), F1, new Set([ROOM_ID]), HALF);
    const lines = items.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(7);
    expect(lines.every((l) => l.layer === 'rooms' && l.objectId === GRID_ID)).toBe(true);
    const marks = items.filter((i) => i.kind === 'arc');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.kind === 'arc' && marks[0]!.center).toEqual({ x: 21, y: 23 });
    // An override under the minimum draws on the flagged layer.
    const over = edited(withGrid(), { field: 'start', direction: 'along_main', text: '6' });
    expect(actGridItems(over, F1, new Set([ROOM_ID]), HALF).every((i) => i.layer === 'flagged')).toBe(true);
  });

  it('the grid is a ceiling item that picks by its start mark; elsewhere the room still picks', () => {
    const surface = createSurfaceSetting();
    const base = { version: () => 1, shown: () => true, subscribe: () => () => {} };
    expect(ceilingAware(base, surface).shownObject!('act_grid', 'new')).toBe(false);
    const index = createPickIndex();
    const objects = withGrid();
    index.sync(objects, F1, []);
    expect(index.pick(P(21, 23), 1)[0]).toBe(GRID_ID);
    expect(index.pick(P(80, 70), 1)).not.toContain(GRID_ID);
  });

  it('a light placed in the grid snaps to the centre of the tile under it, or the nearest whole tile', () => {
    // Tile [45, 69] x [47, 71] holds (50, 50): centre (57, 59). (5, 5) is in a cut border: nearest whole tile
    // [21, 45] x [23, 47], centre (33, 35).
    const objects = withGrid();
    expect(snapToActTile(objects, F1, P(50, 50), HALF)).toEqual({ x: 57, y: 59 });
    expect(snapToActTile(objects, F1, P(5, 5), HALF)).toEqual({ x: 33, y: 35 });
    // Outside every grid it stays.
    expect(snapToActTile(room(), F1, P(50, 50), HALF)).toEqual({ x: 50, y: 50 });

    const store = createModelStore({ objects });
    const receive = deviceToolReceiver({
      store,
      tool: 'recessed-light',
      choice: { get: () => 'recessed_light' },
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => LIGHT_ID,
      select: () => {},
      onMessage: () => {},
      place: placeCeilingDevice,
      actMinShare: () => HALF,
    });
    receive(click(P(50, 50)));
    const light = store.getState().objects.get(LIGHT_ID)!;
    expect((light.data as { geometry: { point: Point } }).geometry.point).toEqual({ x: 57, y: 59 });
  });

  it('a light in the grid draws as its troffer (the tile and an inset lens) in place of the can', () => {
    const r = placeCeilingDevice('recessed_light', P(57, 59), { level: F1, newId: () => LIGHT_ID, status: 'new' });
    const objects = apply(withGrid(), r!);
    const troffers = trofferItems(objects, F1, HALF);
    const items = troffers.get(LIGHT_ID)!;
    expect(items).toHaveLength(8);
    const first = items[0]!;
    expect(first.kind === 'line' && first.from).toEqual({ x: 45, y: 47 });
    const list = rcpList(planDrawingList(objects, { extraItems: planDetailItems }, null, null), objects, { fanClearance: null })!;
    const drawn = list.items.filter((i) => i.objectId.toLowerCase() === LIGHT_ID);
    expect(drawn).toEqual(items);
  });

  it('a light the phase view hides draws no troffer', () => {
    const r = placeCeilingDevice('recessed_light', P(57, 59), { level: F1, newId: () => LIGHT_ID, status: 'demo' });
    const objects = apply(withGrid(), r!);
    const hideDemo = { version: () => 1, shown: (s: string) => s !== 'demo' };
    const list = rcpList(planDrawingList(objects, { extraItems: planDetailItems }, hideDemo as never, null), objects, { fanClearance: null })!;
    expect(list.items.filter((i) => i.objectId.toLowerCase() === LIGHT_ID)).toEqual([]);
  });

  it('with a quarter-tile minimum the grid still picks at its drawn start mark', () => {
    // 114 at 6": borders 9", so the drawn mark is at x = 9; 94 at 6": n = 3, r = 22, 11 >= 6, borders 11", y = 11.
    const objects = withGrid();
    const mark = actGridItems(objects, F1, new Set([ROOM_ID]), 0.25).find((i) => i.kind === 'arc')!;
    expect(mark.kind === 'arc' && mark.center).toEqual({ x: 9, y: 11 });
    const index = createPickIndex();
    index.sync(objects, F1, []);
    expect(index.pick(P(9, 11), 1)[0]).toBe(GRID_ID);
  });

  it('the tag on an ACT ceiling reads its module, as the board: "CLG 8\' 0" · ACT 2x2"', () => {
    const objects = withGrid(room(144, 120));
    expect(tagText(objects, F1, P(72, 60))).toBe(`CLG 8' 0" · ACT 2x2`);
    const four = edited(objects, { field: 'module', value: '2x4' });
    expect(tagText(four, F1, P(72, 60))).toBe(`CLG 8' 0" · ACT 2x4`);
  });
});
