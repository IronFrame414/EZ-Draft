// EZD-214 (AC-EZD-214-1, -2, -3, -6, -9; S03 Decisions; 09m Phase switch rows 1-6; Q-0668 (a); Q-0671 (a)). The
// phase filter over the drawing list, the hover and pick indexes, the plan controller, the selection controller and
// the drawing tools. Expected values: 09m (Existing hides New; Proposed hides Demo; eyes override), Q-0668 (a) (a
// hidden opening leaves its wall whole), Q-0671 (a) (hidden objects are not picked, boxed, taken by Select all or
// snapped to, and leave the selection), S03 Status bar "View" (Proposed: new objects are New). Fake render root
// and canvas handles; no browser, no live service.
import { CURRENT_SCHEMA_VERSION, type ObjectStatus, type Point } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { createSelectionController } from '../selection/selection-controller';
import { createPickIndex } from '../selection/pick-index';
import { createPhaseSetting } from '../status/phase-setting';
import { createDrawingController, type DrawingHandle } from '../tools/drawing-controller';
import {
  baseObjects,
  idSeq,
  roomsOf,
  uid,
  wallsOf,
  WHEN,
  WHO,
  withOpening,
  withWalls,
} from '../tools/test-utils/fixtures';
import { planDrawingList, openFloorId } from './batches';
import { createPlanController } from './controller';
import { createHoverIndex, pickWall } from './hover';
import type { PlanPointerEvent, PlanPointerReceiver } from './input';

const pt = (x: number, y: number): Point => ({ x, y });
const PPI = 8 / 3;
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const toModel = (s: Point): Point => ({ x: s.x / PPI, y: -s.y / PPI });

function withStatus(objects: Objects, id: string, status: ObjectStatus): Map<string, ObjectValue> {
  const next = new Map(objects);
  const v = next.get(id)!;
  next.set(id, { ...v, data: { ...v.data, status } });
  return next;
}

// uid(1) Existing (0,0)-(144,0); uid(2) New (0,60)-(144,60); uid(3) Demo (0,120)-(144,120).
function threeWalls(): Map<string, ObjectValue> {
  let o: Map<string, ObjectValue> = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false);
  o = withWalls(o, 2, [pt(0, 60), pt(144, 60)], false);
  o = withWalls(o, 3, [pt(0, 120), pt(144, 120)], false);
  o = withStatus(o, uid(2), 'new');
  return withStatus(o, uid(3), 'demo');
}

const drawnIds = (objects: Objects, phase: ReturnType<typeof createPhaseSetting> | null) =>
  new Set(planDrawingList(objects, {}, phase)!.items.map((i) => i.objectId?.toLowerCase()));

const setting = (view: 'existing' | 'proposed') =>
  createPhaseSetting({ view, canEdit: false, save: async () => true });

describe('EZD-214 drawing list filter', () => {
  it('09m rows 1-4: Existing hides New, Proposed hides Demo; Existing shows in both', () => {
    const o = threeWalls();
    const ex = drawnIds(o, setting('existing'));
    expect(ex.has(uid(1))).toBe(true);
    expect(ex.has(uid(2))).toBe(false);
    expect(ex.has(uid(3))).toBe(true);
    const pr = drawnIds(o, setting('proposed'));
    expect(pr.has(uid(1))).toBe(true);
    expect(pr.has(uid(2))).toBe(true);
    expect(pr.has(uid(3))).toBe(false);
  });

  it('09m rows 5, 6: an eye overrides the view', () => {
    const o = threeWalls();
    const pr = setting('proposed');
    pr.setEye('new', false);
    pr.setEye('demo', true);
    const ids = drawnIds(o, pr);
    expect(ids.has(uid(2))).toBe(false);
    expect(ids.has(uid(3))).toBe(true);
  });

  it('Q-0668 (a): a hidden New door leaves its Existing wall drawn whole', () => {
    const plain = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false);
    const door = withStatus(withOpening(plain, 9, 'door', 1, pt(72, 0)), uid(9), 'new');
    const wallItems = (objects: Objects) =>
      planDrawingList(objects, {}, setting('existing'))!.items.filter(
        (i) => i.objectId?.toLowerCase() === uid(1),
      );
    expect(drawnIds(door, setting('existing')).has(uid(9))).toBe(false);
    expect(wallItems(door)).toEqual(wallItems(plain));
    expect(drawnIds(door, setting('proposed')).has(uid(9))).toBe(true);
  });

  it('AC-6: without a filter every stored object is drawn (objects stored before phase 6 are Existing)', () => {
    const o = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false);
    expect(drawnIds(o, setting('existing')).has(uid(1))).toBe(true);
    expect(drawnIds(o, setting('proposed')).has(uid(1))).toBe(true);
  });
});

describe('EZD-214 hover and pick indexes', () => {
  it('a hidden wall is not hovered; a new filter version resyncs in full', () => {
    const o = threeWalls();
    const phase = setting('existing');
    const hover = createHoverIndex();
    hover.sync(o, openFloorId(o), [], phase);
    expect(pickWall(hover.index, pt(72, 60), 1)).toBeNull();
    expect(pickWall(hover.index, pt(72, 120), 1)).toBe(uid(3));
    phase.setView('proposed');
    hover.sync(o, openFloorId(o), [], phase);
    expect(pickWall(hover.index, pt(72, 60), 1)?.toLowerCase()).toBe(uid(2));
    expect(pickWall(hover.index, pt(72, 120), 1)).toBeNull();
  });

  it('Q-0671 (a): a hidden object is not picked, boxed or in all()', () => {
    const o = threeWalls();
    const phase = setting('existing');
    const pick = createPickIndex();
    pick.sync(o, openFloorId(o), [], phase);
    const all = pick.all().map((id) => id.toLowerCase());
    expect(all).toContain(uid(1));
    expect(all).toContain(uid(3));
    expect(all).not.toContain(uid(2));
    expect(pick.pick(pt(72, 60), 1)).toEqual([]);
    expect(
      pick
        .inRect({ minX: -10, minY: -10, maxX: 200, maxY: 200 }, 'touch')
        .map((id) => id.toLowerCase()),
    ).not.toContain(uid(2));
    phase.setView('proposed');
    pick.sync(o, openFloorId(o), [], phase);
    expect(pick.has(uid(2))).toBe(true);
    expect(pick.has(uid(3))).toBe(false);
  });
});

function fakeRoot() {
  return {
    start: vi.fn(async () => {}),
    resize: vi.fn(),
    setCamera: vi.fn(),
    invalidate: vi.fn(),
    stats: vi.fn(() => ({ frames: 0, drawCalls: 0 })),
    unmount: vi.fn(),
  };
}

describe('EZD-214 plan controller', () => {
  it('AC-2, AC-9: a View switch rebuilds once and the canvas follows; no model change', () => {
    const store = createModelStore({ objects: threeWalls() });
    const phase = createPhaseSetting({ view: 'existing', canEdit: false, save: async () => true });
    const root = fakeRoot();
    const controller = createPlanController(
      { store, phase },
      { createRoot: () => root, keys: new EventTarget() },
    );
    controller.setCanvasRect({ left: 0, top: 0, width: 1600, height: 1000 });
    controller.setRegionRect({ left: 0, top: 0, width: 1600, height: 1000 });
    const { handle } = controller;
    const at = (p: Point) => handle.wallAt(handle.modelToScreen(p))?.toLowerCase() ?? null;
    expect(at(pt(72, 60))).toBeNull();
    expect(at(pt(72, 120))).toBe(uid(3));
    const objectsBefore = store.getState().objects;
    const uploads = controller.stats().bufferUploads;

    phase.setView('proposed');
    expect(controller.stats().bufferUploads).toBeGreaterThan(uploads);
    expect(at(pt(72, 60))).toBe(uid(2));
    expect(at(pt(72, 120))).toBeNull();
    expect(store.getState().objects).toBe(objectsBefore);
    expect(store.getState().past).toHaveLength(0);
    controller.dispose();
  });
});

function selectionHandle() {
  const handle = {
    getPixelsPerInch: () => PPI,
    screenToModel: toModel,
    setHoverMode: () => {},
    setHoverPicker: () => {},
    setBodyLookup: () => {},
    setSelectedIds: () => {},
  };
  return handle;
}

describe('EZD-214 selection', () => {
  it('Q-0671 (a): Select all takes only shown objects; a selected object leaves when it becomes hidden', () => {
    const store = createModelStore({ objects: threeWalls() });
    const phase = createPhaseSetting({ view: 'proposed', canEdit: false, save: async () => true });
    const selection = createSelectionController({
      handle: selectionHandle(),
      store,
      drawing: null,
      setReceiver: () => {},
      phase,
    });
    selection.selectAll();
    const ids = () =>
      selection
        .getUi()
        .ids.map((id) => id.toLowerCase())
        .sort();
    expect(ids()).toEqual([uid(1), uid(2)].sort());
    phase.setView('existing');
    expect(ids()).toEqual([uid(1)]);
    selection.dispose();
  });
});

function drawingHandle() {
  const receivers: Array<PlanPointerReceiver | null> = [];
  let touchHit: string | null = null;
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void receivers.push(r),
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: () => touchHit,
  };
  const send = (kind: PlanPointerEvent['kind'], x: number, y: number) =>
    receivers.at(-1)!({
      kind,
      model: pt(x, y),
      screen: toScreen(pt(x, y)),
      pointerType: 'mouse',
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });
  return { handle, send, setTouchHit: (id: string | null) => void (touchHit = id) };
}

function drawingSetup(view: 'existing' | 'proposed', objects = baseObjects()) {
  const store = createModelStore({ objects });
  const phase = createPhaseSetting({ view, canEdit: true, save: async () => true });
  const h = drawingHandle();
  const controller = createDrawingController({
    handle: h.handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: () => {},
    newId: idSeq(100),
    now: () => WHEN,
    phase,
  });
  const click = (x: number, y: number) => {
    h.send('down', x, y);
    h.send('up', x, y);
  };
  return { store, phase, controller, click, h };
}

describe('EZD-214 new objects take the view status', () => {
  it('AC-1: a wall drawn in Proposed is New; one drawn in Existing is Existing', () => {
    for (const [view, status] of [
      ['proposed', 'new'],
      ['existing', 'existing'],
    ] as const) {
      const { store, controller, click, h } = drawingSetup(view);
      controller.selectTool('wall');
      click(0, 0);
      h.send('move', 60, 0);
      controller.typed({ length: 144, angle: null });
      const walls = wallsOf(store.getState().objects);
      expect(walls.length, view).toBeGreaterThan(0);
      for (const w of walls) expect(w.data.status, view).toBe(status);
      controller.dispose();
    }
  });

  it('AC-1, AC-5: a room rectangle drawn in Proposed makes New walls and a New room', () => {
    const { store, controller, click } = drawingSetup('proposed');
    controller.selectTool('room-rect');
    click(0, 0);
    controller.typed({ width: 144, depth: 120 });
    const walls = wallsOf(store.getState().objects);
    expect(walls).toHaveLength(4);
    for (const w of walls) expect(w.data.status).toBe('new');
    const rooms = roomsOf(store.getState().objects);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.data.status).toBe('new');
    controller.dispose();
  });

  it('09m row 2: a door placed in Proposed is New', () => {
    const room = withWalls(
      baseObjects(),
      1,
      [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)],
      true,
    );
    const { store, controller, h } = drawingSetup('proposed', room);
    controller.selectTool('door');
    h.setTouchHit(uid(1));
    h.send('move', 60, 2);
    h.send('down', 60, 2);
    h.send('up', 60, 2);
    const doors = [...store.getState().objects.values()].filter((v) => v.type === 'opening');
    expect(doors).toHaveLength(1);
    expect(doors[0]!.data.status).toBe('new');
    controller.dispose();
  });

  it('Q-0671 (a): a hidden wall is not snapped to while drawing', () => {
    // One New wall (0,0)-(144,0). In Proposed its end snaps a new wall's start; in Existing it does not.
    const one = withStatus(
      withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false),
      uid(1),
      'new',
    );
    const starts: Point[] = [];
    for (const view of ['proposed', 'existing'] as const) {
      const { store, controller, click } = drawingSetup(view, one);
      controller.selectTool('wall');
      click(143.6, 0.3);
      click(143.6, 60.3);
      const made = wallsOf(store.getState().objects).find((w) => w.id.toLowerCase() !== uid(1));
      expect(made, view).toBeDefined();
      starts.push(made!.data.geometry.start);
      controller.dispose();
    }
    expect(starts[0]).toEqual(pt(144, 0));
    expect(starts[1]).not.toEqual(pt(144, 0));
  });

  it('the store and the dataset are untouched by a View switch (display only)', () => {
    const { store, phase } = drawingSetup('existing', threeWalls());
    const before = store.getState().objects;
    phase.setView('proposed');
    expect(store.getState().objects).toBe(before);
  });
});

describe('EZD-214 Show on a hidden object', () => {
  it('turns that status eye on, then fits the object', () => {
    const store = createModelStore({ objects: threeWalls() });
    const phase = createPhaseSetting({ view: 'existing', canEdit: false, save: async () => true });
    const controller = createPlanController(
      { store, phase },
      { createRoot: () => fakeRoot(), keys: new EventTarget() },
    );
    controller.setCanvasRect({ left: 0, top: 0, width: 1600, height: 1000 });
    controller.setRegionRect({ left: 0, top: 0, width: 1600, height: 1000 });
    expect(controller.handle.showObject(uid(2))).toBe(true);
    expect(phase.get()).toEqual({ view: 'existing', eyes: { existing: true, demo: true, new: true } });
    controller.dispose();
  });
});

describe('EZD-214 fixtures take the view status', () => {
  it('AC-1: a fixture, utility point or tile shower placed in Proposed is New, in Existing is Existing', async () => {
    const { fixtureChoice, placeFixture, tileShowerChoice, utilityChoice } = await import(
      '../tools/fixture-tool'
    );
    const ctx = { level: uid(900), objects: [], newId: idSeq(500) };
    for (const choice of [fixtureChoice('toilet'), utilityChoice('water'), tileShowerChoice()]) {
      const statusOf = (s?: ObjectStatus) =>
        (placeFixture(choice, pt(10, 10), { ...ctx, ...(s ? { status: s } : {}) })?.value?.data as {
          status: string;
        }).status;
      expect(statusOf('new'), choice.type).toBe('new');
      expect(statusOf('existing'), choice.type).toBe('existing');
      expect(statusOf(), choice.type).toBe('existing');
    }
  });
});
