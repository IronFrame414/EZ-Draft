// EZD-208a C1-C12 (vault/plans/EZD-208a.md section 4; section 1 R3-R9, R14, R15; section 3 A10-A13; AC-EZD-208-2, -4,
// -7, -8, -9, -10, -11, -12, -13, -14, -15, -16). Real model store over the P210a fixtures; the canvas handle and the
// drawing controller are local fakes. Expected values: the plan's rows and their cited sources (S03 Canvas
// interactions; Q-0630 rows 7, 9, 28, 36), never the code. No browser, no live service.
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  parseStoredObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { DrawingUi, ToolKeyEvent } from '../tools/drawing-controller';
import {
  DRAWING_RAIL_TOOLS,
  MOVE_DRAG_PX,
  type DrawingToolId,
  type PickState,
} from '../tools/index';
import { DOOR, baseObjects, F1, uid, withWalls } from '../tools/test-utils/fixtures';
import {
  SAME_SPOT_PX,
  SELECT_RAIL_TOOL,
  createSelectionController,
  editorRail,
  shareReceiver,
  type SelectionBox,
  type SelectionDeps,
} from './selection-controller';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const toModel = (s: Point): Point => ({ x: s.x / PPI, y: -s.y / PPI });

function wallOf(objects: Objects, id: string): WallObject {
  const v = objects.get(id);
  if (v === undefined) throw new Error(`no ${id}`);
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  if (!r.ok || r.object.type !== 'wall') throw new Error(`${id} is not a wall`);
  return r.object;
}

function openingValue(kind: 'door' | 'window', host: WallObject, center: Point): ObjectValue {
  return {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: createOpeningData({ kind, host, center }) as unknown as Record<string, unknown>,
  };
}

// C1 of the plan: one wall (0,0)-(144,0) centred, plus the door uid(2) at (72,0).
function c1(): Map<string, ObjectValue> {
  const o = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false, 'center');
  o.set(uid(2), openingValue('door', wallOf(o, uid(1)), pt(72, 0)));
  return o;
}

function ev(
  kind: PlanPointerEvent['kind'],
  x: number,
  y: number,
  over: Partial<PlanPointerEvent> = {},
): PlanPointerEvent {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...over,
  };
}

function ke(key: string, over: Partial<ToolKeyEvent> = {}): ToolKeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
    ...over,
  };
}

function fakeHandle() {
  const modes: string[] = [];
  const setSelected: Array<readonly string[]> = [];
  let picker: ((screen: Point) => string | null) | null = null;
  let lookup: ((id: string) => readonly Point[] | null) | null = null;
  const handle: SelectionDeps['handle'] = {
    getPixelsPerInch: () => PPI,
    screenToModel: toModel,
    setHoverMode: (m) => void modes.push(m),
    setHoverPicker: (p) => void (picker = p),
    setBodyLookup: (l) => void (lookup = l),
    setSelectedIds: (ids) => void setSelected.push([...ids]),
  };
  return {
    handle,
    modes,
    setSelected,
    picker: () => picker,
    lookup: () => lookup,
  };
}

// The plan's local fake: a drawing controller whose tool and pick state the test sets.
// EZD-212b T20 (vault/plans/EZD-212b.md section 4): options `enabled` (default true) and `drag` (default false; when
// true the fake also has startDrag and dragPointer, recorded in `starts` and `drags`).
function fakeDrawing(o: {
  tool: DrawingToolId | null;
  pick: PickState;
  enabled?: boolean;
  drag?: boolean;
}) {
  let tool = o.tool;
  let pick = o.pick;
  let toolEscSeen = false;
  const keys: ToolKeyEvent[] = [];
  const selected: Array<DrawingToolId | null> = [];
  const starts: Array<{ ids: readonly string[]; press: Point }> = [];
  const drags: PlanPointerEvent[] = [];
  const drawing: NonNullable<SelectionDeps['drawing']> = {
    getUi: (): DrawingUi => ({
      enabled: o.enabled ?? true,
      tool,
      pick,
      boxes: [],
      gapMessage: null,
      lastLength: null,
      doorTarget: null,
      openingWidth: null,
      entry: null,
    }),
    keyDown: (e) => {
      keys.push(e);
      if (e.key === 'Escape' && tool !== null) {
        if (!toolEscSeen) {
          toolEscSeen = true;
          return true;
        }
        tool = null;
        return true;
      }
      if (e.key === 'Escape' && pick !== null) {
        pick = null;
        return true;
      }
      return false;
    },
    selectTool: (id) => {
      selected.push(id);
      tool = id;
    },
    ...(o.drag === true
      ? {
          startDrag: (ids: readonly string[], press: Point) => void starts.push({ ids, press }),
          dragPointer: (event: PlanPointerEvent) => void drags.push(event),
        }
      : {}),
  };
  return { drawing, keys, selected, starts, drags };
}

function setup(o: { objects?: Map<string, ObjectValue>; drawing?: SelectionDeps['drawing'] } = {}) {
  const store = createModelStore({ objects: o.objects ?? c1() });
  const h = fakeHandle();
  const receivers: Array<PlanPointerReceiver | null> = [];
  const controller = createSelectionController({
    handle: h.handle,
    store,
    drawing: o.drawing ?? null,
    setReceiver: (r) => void receivers.push(r),
  });
  const send = (e: PlanPointerEvent) => {
    const r = receivers.at(-1);
    if (!r) throw new Error('no pointer receiver set');
    r(e);
  };
  const click = (x: number, y: number, over: Partial<PlanPointerEvent> = {}) => {
    send(ev('down', x, y, over));
    send(ev('up', x, y, over));
  };
  const ids = () => controller.getUi().ids;
  return { store, controller, h, receivers, send, click, ids };
}

describe('EZD-208a selection controller', () => {
  it('EZD-208a C1 done when: clicks on a door in a wall cycle door, wall, door and a move over 10 px resets', () => {
    expect(SAME_SPOT_PX).toBe(10);
    const a = setup();
    a.click(72, 0);
    expect(a.ids()).toEqual([uid(2)]);
    a.click(72, 0);
    expect(a.ids()).toEqual([uid(1)]);
    a.click(72, 0);
    expect(a.ids()).toEqual([uid(2)]);

    const b = setup();
    b.click(72, 0);
    expect(b.ids()).toEqual([uid(2)]);
    b.send(ev('move', 76.125, 0));
    b.send(ev('move', 72, 0));
    b.click(72, 0);
    expect(b.ids()).toEqual([uid(2)]);

    b.send(ev('move', 75.75, 0));
    b.click(75.75, 0);
    expect(b.ids()).toEqual([uid(1)]);
  });

  it('EZD-208a C2 Shift and empty clicks', () => {
    const s = setup();
    s.click(72, 0, { shiftKey: true });
    expect(s.ids()).toEqual([uid(2)]);
    s.click(20, 0, { shiftKey: true });
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    s.click(72, 0, { shiftKey: true });
    expect(s.ids()).toEqual([uid(1)]);

    s.click(20, 48);
    expect(s.ids()).toEqual([]);

    s.click(72, 0);
    expect(s.ids()).toEqual([uid(2)]);
    s.click(20, 48, { shiftKey: true });
    expect(s.ids()).toEqual([uid(2)]);
  });

  it('EZD-208a C3 box by direction', () => {
    const s = setup();
    const seen: Array<SelectionBox | null> = [];
    s.controller.onBox((b) => void seen.push(b === null ? null : { ...b }));

    s.send(ev('down', 72, 24));
    s.send(ev('move', 168, -24));
    const first = s.controller.getBox();
    expect(first?.mode).toBe('inside');
    expect(first?.from).toEqual(toScreen(pt(72, 24)));
    expect(first?.to).toEqual(toScreen(pt(168, -24)));
    s.send(ev('up', 168, -24));
    expect(s.ids()).toEqual([]);
    expect(seen.at(-1)).toBeNull();
    expect(s.controller.getBox()).toBeNull();

    s.send(ev('down', 168, 24));
    s.send(ev('move', 72, -24));
    expect(s.controller.getBox()?.mode).toBe('touch');
    s.send(ev('up', 72, -24));
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    expect(seen.at(-1)).toBeNull();
    const modes = seen.filter((b): b is SelectionBox => b !== null).map((b) => b.mode);
    expect(modes).toContain('inside');
    expect(modes).toContain('touch');

    const before = seen.length;
    s.send(ev('down', 72, 0));
    s.send(ev('move', 120, -24));
    expect(s.controller.getBox()).toBeNull();
    s.send(ev('up', 120, -24));
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    expect(seen.slice(before).filter((b) => b !== null)).toEqual([]);
    expect(seen.at(-1)).toBeNull();
  });

  it('EZD-208a C4 Esc chain and typing', () => {
    const f = fakeDrawing({ tool: 'wall', pick: null });
    const s = setup({ drawing: f.drawing });
    s.controller.select([uid(1)]);
    expect(s.controller.keyDown(ke('Escape'))).toBe(true);
    expect(s.ids()).toEqual([uid(1)]);
    expect(s.controller.keyDown(ke('Escape'))).toBe(true);
    expect(s.ids()).toEqual([]);

    const g = fakeDrawing({ tool: null, pick: null });
    const t = setup({ drawing: g.drawing });
    t.controller.select([uid(1)]);
    expect(t.controller.keyDown(ke('Escape'))).toBe(true);
    expect(t.ids()).toEqual([]);
    expect(t.controller.keyDown(ke('Escape'))).toBe(false);

    t.controller.select([uid(1)]);
    const calls = g.keys.length;
    expect(t.controller.keyDown(ke('Escape', { target: { tagName: 'INPUT' } }))).toBe(false);
    expect(t.controller.keyDown(ke('a', { ctrlKey: true, target: { tagName: 'INPUT' } }))).toBe(
      false,
    );
    expect(t.ids()).toEqual([uid(1)]);
    expect(g.keys.length).toBe(calls);
  });

  it('EZD-208a C5 select all', () => {
    const f = fakeDrawing({ tool: 'wall', pick: null });
    const s = setup({ drawing: f.drawing });
    expect(s.controller.keyDown(ke('a', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(s.ids()).toEqual([]);
    expect(s.controller.keyDown(ke('a', { ctrlKey: true }))).toBe(true);
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    s.controller.clear();
    expect(s.controller.keyDown(ke('A', { metaKey: true }))).toBe(true);
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    expect(f.selected).toEqual([]);
  });

  it('EZD-208a C6 Select more taps', () => {
    const s = setup();
    s.controller.setSelectMore(true);
    expect(s.controller.getUi().selectMore).toBe(true);
    const tap = (x: number, y: number) => s.click(x, y, { pointerType: 'touch' });
    tap(72, 0);
    expect(s.ids()).toEqual([uid(2)]);
    tap(20, 0);
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    tap(20, 48);
    expect(s.ids()).toEqual([uid(2), uid(1)]);
    tap(72, 0);
    expect(s.ids()).toEqual([uid(1)]);

    expect(s.controller.keyDown(ke('Escape'))).toBe(true);
    expect(s.ids()).toEqual([]);
    expect(s.controller.getUi().selectMore).toBe(false);
  });

  it('EZD-208a C7 a second finger cancels the box', () => {
    const s = setup();
    const seen: Array<SelectionBox | null> = [];
    s.controller.onBox((b) => void seen.push(b === null ? null : { ...b }));
    s.controller.select([uid(1)]);
    s.send(ev('down', -24, 24, { pointerType: 'touch' }));
    s.send(ev('move', -9, 24, { pointerType: 'touch' }));
    expect(s.controller.getBox()?.mode).toBe('inside');
    s.send(ev('cancel', -9, 24, { pointerType: 'touch' }));
    expect(seen.map((b) => (b === null ? null : b.mode))).toEqual(['inside', null]);
    expect(s.controller.getBox()).toBeNull();
    expect(s.ids()).toEqual([uid(1)]);
  });

  it('EZD-208a C8 the hover picker follows the cycle', () => {
    const s = setup();
    const picker = () => {
      const p = s.h.picker();
      if (p === null) throw new Error('no hover picker set');
      return p;
    };
    expect(picker()(toScreen(pt(72, 0)))).toBe(uid(2));
    s.click(72, 0);
    expect(picker()(toScreen(pt(72, 0)))).toBe(uid(1));
    expect(picker()(toScreen(pt(20, 48)))).toBeNull();
  });

  it('EZD-208a C9 editorRail', () => {
    expect(SELECT_RAIL_TOOL).toEqual({
      kind: 'tool',
      id: 'select',
      icon: 'arrow_selector_tool',
      label: 'office.tool.select',
      shortcut: 'V',
    });
    const all = [SELECT_RAIL_TOOL, ...DRAWING_RAIL_TOOLS];
    const base = { canvasFailed: false, controllerEnabled: true };
    for (const canEdit of [true, false]) {
      const loading = editorRail({ ...base, editor: 'loading', canEdit });
      expect(loading?.tools).toEqual(all);
      expect(loading?.disabled).toBe(true);
      for (const editor of ['failed', 'no-access', 'not-found'] as const) {
        expect(editorRail({ ...base, editor, canEdit })).toBeNull();
      }
    }
    const edit = editorRail({ ...base, editor: 'ready', canEdit: true });
    expect(edit?.tools.map((t) => t.id)).toEqual(['select', 'move', 'wall', 'room-rect', 'door', 'window']);
    expect(edit?.disabled).toBe(false);
    const off = editorRail({ ...base, editor: 'ready', canEdit: true, controllerEnabled: false });
    expect(off?.tools).toEqual(all);
    expect(off?.disabled).toBe(true);

    const view = editorRail({ ...base, editor: 'ready', canEdit: false });
    expect(view?.tools).toEqual([SELECT_RAIL_TOOL]);
    expect(view?.disabled).toBe(false);
    const failed = editorRail({ ...base, editor: 'ready', canEdit: false, canvasFailed: true });
    expect(failed?.tools).toEqual([SELECT_RAIL_TOOL]);
    expect(failed?.disabled).toBe(true);
  });

  it('EZD-208a C10 shareReceiver', () => {
    const calls: Array<PlanPointerReceiver | null> = [];
    const slots = shareReceiver((r) => void calls.push(r));
    const rS: PlanPointerReceiver = () => {};
    const rD: PlanPointerReceiver = () => {};
    slots.selection(rS);
    slots.drawing(rD);
    slots.drawing(rD);
    slots.drawing(null);
    slots.selection(null);
    expect(calls).toEqual([rS, rD, rS, null]);
    expect(calls[0]).toBe(rS);
    expect(calls[1]).toBe(rD);
    expect(calls[2]).toBe(rS);
  });

  it('EZD-208a C11 V and the Select tool', () => {
    const on = fakeDrawing({ tool: 'wall', pick: null });
    const a = setup({ drawing: on.drawing });
    a.controller.select([uid(1)]);
    expect(a.controller.keyDown(ke('v'))).toBe(true);
    expect(on.selected).toEqual([null]);
    expect(a.ids()).toEqual([]);

    const picking = fakeDrawing({ tool: null, pick: { gapWallIds: [uid(1)] } });
    const b = setup({ drawing: picking.drawing });
    b.controller.select([uid(1)]);
    expect(b.controller.keyDown(ke('V'))).toBe(true);
    expect(picking.selected).toEqual([]);
    expect(picking.keys).toEqual([ke('Escape')]);
    expect(b.ids()).toEqual([uid(1)]);

    const idle = fakeDrawing({ tool: null, pick: null });
    const c = setup({ drawing: idle.drawing });
    expect(c.controller.keyDown(ke('v'))).toBe(false);
    expect(idle.selected).toEqual([]);
    expect(idle.keys).toEqual([]);
  });

  it('EZD-208a C12 model changes, select and dispose', () => {
    // floorDataSchema needs order >= 1, so Floor 1 moves up to order 2 and the added floor sorts below it.
    const objects = c1();
    objects.set(F1, {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name: 'Floor 1', order: 2 },
    });
    const s = setup({ objects });
    s.controller.select([uid(2)]);
    let notified = 0;
    s.controller.subscribe(() => void notified++);
    let calls = s.h.setSelected.length;

    s.store.applyEdit([{ id: uid(2), value: null }]);
    expect(s.ids()).toEqual([]);
    expect(notified).toBe(1);
    expect(s.h.setSelected.length).toBeGreaterThan(calls);
    expect(s.h.setSelected.at(-1)).toEqual([]);

    calls = s.h.setSelected.length;
    const wall = wallOf(s.store.getState().objects, uid(1));
    s.store.applyEdit([{ id: uid(2), value: openingValue('door', wall, pt(72, 0)) }]);
    expect(s.ids()).toEqual([]);
    expect(notified).toBe(1);
    expect(s.h.setSelected.length).toBeGreaterThan(calls);

    s.controller.select([uid(1).toUpperCase(), 'missing', uid(2)]);
    expect(s.ids()).toEqual([uid(2), uid(1)]);

    s.store.applyEdit([
      {
        id: uid(50),
        value: {
          type: 'floor',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: { name: 'Floor 0', order: 1 },
        },
      },
    ]);
    expect(s.ids()).toEqual([]);

    const receiver = s.receivers.at(-1)!;
    expect(receiver).not.toBeNull();
    s.controller.dispose();
    expect(s.h.setSelected.at(-1)).toEqual([]);
    expect(s.h.picker()).toBeNull();
    expect(s.h.lookup()).toBeNull();
    expect(s.receivers.at(-1)).toBeNull();

    const afterDispose = s.h.setSelected.length;
    const heard = notified;
    receiver(ev('down', 72, 0));
    receiver(ev('up', 72, 0));
    expect(s.h.setSelected.length).toBe(afterDispose);
    expect(s.ids()).toEqual([]);
    s.store.applyEdit([{ id: uid(2), value: null }]);
    expect(s.h.setSelected.length).toBe(afterDispose);
    expect(notified).toBe(heard);
    expect(s.controller.keyDown(ke('Escape'))).toBe(false);
  });

  // EZD-212b T20, T21 (vault/plans/EZD-212b.md section 4, D3, D8; AC-EZD-212-15, -16; Q-0630 row 35; Q-0214).
  it('EZD-212b T20 Select drag hands over after 10 px', () => {
    const f = fakeDrawing({ tool: null, pick: null, drag: true });
    const s = setup({ objects: DOOR, drawing: f.drawing });
    s.send(ev('down', 144, 60));
    s.send(ev('move', 144 + 5 / PPI, 60));
    expect(f.starts).toHaveLength(0);
    s.send(ev('move', 144 + 20 / PPI, 60));
    expect(s.ids()).toEqual([uid(50)]);
    expect(f.starts).toHaveLength(1);
    expect(f.starts[0]!.ids).toEqual([uid(50)]);
    expect(f.starts[0]!.press).toEqual(pt(144, 60));
    s.send(ev('move', 144 + 30 / PPI, 60));
    s.send(ev('up', 144 + 30 / PPI, 60));
    expect(f.drags.slice(-2).map((e) => e.kind)).toEqual(['move', 'up']);
    expect(f.starts).toHaveLength(1);
    expect(s.ids()).toEqual([uid(50)]);
  });

  it('EZD-212b T21 a drag moves the selection, needs Edit model; pickAt', () => {
    const f = fakeDrawing({ tool: null, pick: null, drag: true });
    const s = setup({ objects: DOOR, drawing: f.drawing });
    s.controller.select([uid(2), uid(50)]);
    const picked = s.ids();
    expect([...picked].sort()).toEqual([uid(2), uid(50)].sort());
    s.send(ev('down', 144, 100));
    s.send(ev('move', 144 + 20 / PPI, 100));
    expect(f.starts).toHaveLength(1);
    expect(f.starts[0]!.ids).toEqual(picked);
    expect(s.ids()).toEqual(picked);

    const off = fakeDrawing({ tool: null, pick: null, drag: true, enabled: false });
    const t = setup({ objects: DOOR, drawing: off.drawing });
    t.controller.select([uid(2), uid(50)]);
    const before = t.ids();
    t.send(ev('down', 144, 100));
    t.send(ev('move', 144 + 20 / PPI, 100));
    t.send(ev('up', 144 + 20 / PPI, 100));
    expect(off.starts).toHaveLength(0);
    expect(t.ids()).toEqual(before);

    expect(s.controller.pickAt(pt(144, 60))).toEqual([uid(50), uid(2)]);
    expect(MOVE_DRAG_PX).toBe(SAME_SPOT_PX);
  });
});
