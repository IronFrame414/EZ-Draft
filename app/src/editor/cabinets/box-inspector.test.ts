// EZD-406 (S04 Controls (inspector); S04 Data shown "position ("Box 4 of 6")"; board S04Cabinets; AC-EZD-406-1 "Swap
// keeps the run position", AC-EZD-406-2 "cost is absent without the permission"). Expected values come from the board
// run (F3, B15, DW24, SB36, B18, B21 below two uppers; the board reads "SB36 · Sink base", "Box 3 of 5 in back wall
// run", 36" × 24" × 34 1/2", "False drawer + 2 doors", hinges Pair), S04 "Code updates (e.g. B15 to B18)", S04's sink
// base layout list and the R23 seed codes (B, DB, SB, W, F by width).
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../lib/catalog/catalog';
import type { Change, Objects } from '../model/patches';
import {
  boxEditChanges,
  boxInspectorView,
  catalogCost,
  catalogItemText,
  compatibleBoxes,
  faceLayoutOptions,
  hingesFor,
  swapBoxChanges,
} from './box-inspector';
import { cabinetView, modelObjects } from './cabinet-view';
import { boardModel, CAB_FLOOR, CAB_RUN, cabId } from './test-utils/board-run';

const F3 = cabId(1);
const B15 = cabId(2);
const SB36 = cabId(4);
const W1530 = cabId(7);

let n = 0;
const item = (over: Partial<CatalogItem>): CatalogItem => ({
  id: `d0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  category: 'cabinets',
  subcategory: 'base',
  line: 'Generic',
  name: 'Base cabinet',
  brand: null,
  model: null,
  width: null,
  depth: 24,
  height: 34.5,
  finish: null,
  ...over,
});

// The R23 seed rows a swap list reads from, plus one other-line sink base and one non-cabinet item.
const SB36_SHAKER = item({
  subcategory: 'sink_base',
  line: 'Shaker',
  brand: 'Supplier',
  name: 'Sink base',
  model: 'SB36-SH',
  width: 36,
  finish: 'Shaker, Midnight',
});
const CATALOG: CatalogItem[] = [
  item({ model: 'B15', width: 15 }),
  item({ model: 'B18', width: 18 }),
  item({ model: 'B36', width: 36 }),
  item({ subcategory: 'drawer_base', name: 'Drawer base', model: 'DB36', width: 36 }),
  item({ subcategory: 'sink_base', name: 'Sink base', model: 'SB30', width: 30 }),
  item({ subcategory: 'sink_base', name: 'Sink base', model: 'SB36', width: 36 }),
  SB36_SHAKER,
  item({ subcategory: 'wall', name: 'Wall cabinet', model: 'W15', width: 15, depth: 12, height: 30 }),
  item({ subcategory: 'wall', name: 'Wall cabinet', model: 'W36', width: 36, depth: 12, height: 30 }),
  item({ subcategory: 'filler', name: 'Filler', model: 'F3', width: 3 }),
  item({ subcategory: 'filler', name: 'Filler', model: 'F6', width: 6 }),
  item({ category: 'appliances', subcategory: null, name: 'Dishwasher', model: 'DW36', width: 36 }),
];

const apply = (objects: Objects, changes: Change[]): Objects => {
  const next = new Map(objects);
  for (const c of changes) {
    if (c.value === null) next.delete(c.id);
    else next.set(c.id, c.value);
  }
  return next;
};

const setup = (objects: Objects = boardModel()) => {
  const parsed = modelObjects(objects);
  const view = cabinetView(parsed, CAB_FLOOR)!;
  return { objects, parsed, view };
};

describe('EZD-406 box inspector fields', () => {
  it('reads board S04: SB36 · Sink base, box 3 of 5, 36" × 24" × 34 1/2", false drawer + 2 doors', () => {
    const { parsed, view } = setup();
    const v = boxInspectorView(view, parsed, SB36)!;
    expect(v).toMatchObject({
      code: 'SB36',
      kind: 'box',
      boxType: 'sink_base',
      row: 'base',
      position: { n: 3, of: 5 },
      runName: 'Back wall run',
      status: 'new',
      width: 36,
      depth: 24,
      height: 34.5,
      catalogItemId: null,
      finish: null,
    });
    expect(v.face).toMatchObject({ layout: 'false_drawer_doors_2', hasDoors: true, finishedEnds: 'none' });
  });

  it('a filler has its size and catalog but no box position and no Face section', () => {
    const { parsed, view } = setup();
    const v = boxInspectorView(view, parsed, F3)!;
    expect(v).toMatchObject({ kind: 'filler', code: 'F3', position: null, face: null, width: 3 });
  });

  it('is null for an id that is not in the run', () => {
    const { parsed, view } = setup();
    expect(boxInspectorView(view, parsed, CAB_RUN)).toBeNull();
  });

  it("the sink base's layouts are S04's list: False drawer + 2 doors; 2 doors; Drawer + 2 doors", () => {
    expect(faceLayoutOptions('sink_base')).toEqual(['false_drawer_doors_2', 'doors_2', 'drawer_doors_2']);
    // A drawer base never offers doors; a box keeps its own layout among the options.
    expect(faceLayoutOptions('drawer_base')).not.toContain('doors_2');
    expect(faceLayoutOptions('drawer_base', 'door_1')[0]).toBe('door_1');
  });

  it('two doors hinge as a pair, one door keeps its side, no door has none', () => {
    expect(hingesFor('doors_2', 'left')).toBe('pair');
    expect(hingesFor('door_1', 'right')).toBe('right');
    expect(hingesFor('door_1', 'pair')).toBe('left');
    expect(hingesFor('drawers_3', 'left')).toBe('none');
  });
});

describe('EZD-406 inspector edits', () => {
  it('a typed width goes through the resize: B15 at 18" becomes B18 (S04 "Code updates")', () => {
    const { parsed, view } = setup();
    const changes = boxEditChanges(view, parsed, B15, { field: 'width', value: 18 });
    expect(changes).toHaveLength(1);
    const after = setup(apply(boardModel(), changes));
    expect(boxInspectorView(after.view, after.parsed, B15)).toMatchObject({ code: 'B18', width: 18 });
  });

  it('depth, height, status, finished ends and finish change only that box', () => {
    let o = boardModel();
    for (const e of [
      { field: 'depth', value: 21 },
      { field: 'height', value: 30 },
      { field: 'status', value: 'existing' },
      { field: 'finishedEnds', value: 'both' },
      { field: 'finish', value: 'Shaker, Midnight' },
    ] as const) {
      const { parsed, view } = setup(o);
      const changes = boxEditChanges(view, parsed, SB36, e);
      expect(changes.map((c) => c.id)).toEqual([SB36]);
      o = apply(o, changes);
    }
    const after = setup(o);
    expect(boxInspectorView(after.view, after.parsed, SB36)).toMatchObject({
      depth: 21,
      height: 30,
      status: 'existing',
      finish: 'Shaker, Midnight',
      face: { finishedEnds: 'both' },
    });
  });

  it('a new layout redraws the faces and takes its hinge side; hinges on a door-less layout are refused', () => {
    const { parsed, view } = setup();
    const changes = boxEditChanges(view, parsed, B15, { field: 'faceLayout', value: 'doors_2' });
    const after = setup(apply(boardModel(), changes));
    expect(boxInspectorView(after.view, after.parsed, B15)!.face).toMatchObject({
      layout: 'doors_2',
      hinges: 'pair',
    });
    const b15 = after.view.layout.base.find((s) => s.id === B15)!;
    expect(b15.faces.map((f) => f.kind)).toEqual(['door', 'door']);
    // A layout the box type does not offer is refused (a sink base has no drawer stack).
    expect(boxEditChanges(view, parsed, SB36, { field: 'faceLayout', value: 'drawers_3' })).toEqual([]);
  });

  it('an unchanged value is no change', () => {
    const { parsed, view } = setup();
    expect(boxEditChanges(view, parsed, SB36, { field: 'width', value: 36 })).toEqual([]);
    expect(boxEditChanges(view, parsed, SB36, { field: 'status', value: 'new' })).toEqual([]);
  });
});

describe('EZD-406 Swap box', () => {
  it('lists base-row items of the same width or the same kind, same width first; never wall cabinets or fillers', () => {
    const { parsed, view } = setup();
    const models = compatibleBoxes(view, parsed, SB36, CATALOG).map((i) => i.model);
    expect(models).toEqual(['B36', 'DB36', 'SB36', 'SB36-SH', 'SB30']);
  });

  it('an upper lists only wall cabinets; a filler only fillers', () => {
    const { parsed, view } = setup();
    expect(compatibleBoxes(view, parsed, W1530, CATALOG).map((i) => i.model)).toEqual(['W15', 'W36']);
    expect(compatibleBoxes(view, parsed, F3, CATALOG).map((i) => i.model)).toEqual(['F3', 'F6']);
  });

  it("leaves out the box's own catalog item", () => {
    const { objects, parsed, view } = setup();
    const linked = setup(apply(objects, swapBoxChanges(view, parsed, SB36, SB36_SHAKER)));
    const models = compatibleBoxes(linked.view, linked.parsed, SB36, CATALOG).map((i) => i.model);
    expect(models).not.toContain('SB36-SH');
    expect(models).toContain('SB36');
  });

  it('AC-EZD-406-1: swap keeps the run position', () => {
    const { objects, parsed, view } = setup();
    const before = view.run.data.attributes;
    const changes = swapBoxChanges(view, parsed, SB36, SB36_SHAKER);
    // Only the box itself changes, under its own id: the run's rows are not touched.
    expect(changes.map((c) => c.id)).toEqual([SB36]);
    const after = setup(apply(objects, changes));
    expect(after.view.run.data.attributes.base).toEqual(before.base);
    expect(after.view.run.data.attributes.upper).toEqual(before.upper);
    const v = boxInspectorView(after.view, after.parsed, SB36)!;
    expect(v).toMatchObject({
      code: 'SB36-SH',
      position: { n: 3, of: 5 },
      catalogItemId: SB36_SHAKER.id,
      finish: 'Shaker, Midnight',
      status: 'new',
    });
    // It still stands where it stood: after F3, B15 and DW24 (3 + 15 + 24 = 42").
    expect(after.view.layout.base.find((s) => s.id === SB36)!.x).toBe(42);
  });

  it('swapping to another width keeps the place; the boxes after it shift', () => {
    const { objects, parsed, view } = setup();
    const b18 = CATALOG.find((i) => i.model === 'B18')!;
    const after = setup(apply(objects, swapBoxChanges(view, parsed, B15, b18)));
    expect(after.view.run.data.attributes.base.indexOf(B15)).toBe(1);
    expect(boxInspectorView(after.view, after.parsed, B15)).toMatchObject({
      code: 'B18',
      width: 18,
      position: { n: 1, of: 5 },
    });
    // DW24 now starts at 3 + 18 = 21".
    expect(after.view.layout.base.find((s) => s.id === cabId(3))!.x).toBe(21);
  });

  it('a swap to a different kind takes its type and a layout that type offers', () => {
    const { objects, parsed, view } = setup();
    const db36 = CATALOG.find((i) => i.model === 'DB36')!;
    const after = setup(apply(objects, swapBoxChanges(view, parsed, SB36, db36)));
    const v = boxInspectorView(after.view, after.parsed, SB36)!;
    expect(v.boxType).toBe('drawer_base');
    expect(faceLayoutOptions('drawer_base')).toContain(v.face!.layout);
    expect(v.face!.hinges).toBe('none');
  });

  it('an item that is not compatible is refused', () => {
    const { parsed, view } = setup();
    const w36 = CATALOG.find((i) => i.model === 'W36')!;
    expect(swapBoxChanges(view, parsed, SB36, w36)).toEqual([]);
  });
});

describe('EZD-406 Catalog section', () => {
  it('Item reads "[Supplier] SB36-SH" (board S04), the line when there is no brand', () => {
    expect(catalogItemText(SB36_SHAKER)).toBe('[Supplier] SB36-SH');
    expect(catalogItemText(CATALOG[0]!)).toBe('[Generic] B15');
    expect(catalogItemText(null)).toBeNull();
  });

  it('AC-EZD-406-2: Cost is hidden when the server sent no cost (no See company costs)', () => {
    expect(catalogCost(SB36_SHAKER)).toEqual({ kind: 'hidden' });
    expect(catalogCost(null)).toEqual({ kind: 'hidden' });
    expect(catalogCost({ ...SB36_SHAKER, unitCost: null })).toEqual({ kind: 'none' });
    expect(catalogCost({ ...SB36_SHAKER, unitCost: 1.25 })).toEqual({ kind: 'amount', text: '$1.25' });
  });
});
