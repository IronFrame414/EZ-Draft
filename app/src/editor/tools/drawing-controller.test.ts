// EZD-210b D1-D11 (vault/plans/EZD-210b.md section 4; AC-EZD-207-6, -7, AC-EZD-210-1 to -10). Real model store over
// the P210a fixtures; the canvas handle is a local fake. Expected values: the plan's rows and their cited sources
// (09j, Q-0568 rounding, Q-0570, P210a messages). No browser, no live service.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SNAP_SETTINGS,
  createWallData,
  formatLength,
  parseLength,
  PLAN_DISPLAY_DENOMINATOR,
  roomAreaSqFt,
  wallLength,
  type NumberHighs,
  type Point,
  type SnapSettings,
} from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { HoverMode } from '../plan/hover';
import {
  createDrawingController,
  railMode,
  type DrawingFrame,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { openingsOn } from './model-changes';
import {
  baseObjects,
  DOOR,
  F1,
  idSeq,
  ROOM,
  roomsOf,
  uid,
  wallsOf,
  WHEN,
  WHO,
  withOpening,
  withWalls,
} from './test-utils/fixtures';
import type { ObjectValue } from '../../lib/outbox/model-api';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });

function fakeHandle() {
  const receiverCalls: Array<PlanPointerReceiver | null> = [];
  const modes: HoverMode[] = [];
  let hovered: string | null = null;
  let touchHit: string | null = null;
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void receiverCalls.push(r),
    setHoverMode: (m) => void modes.push(m),
    getHoveredWallId: () => hovered,
    wallAt: () => touchHit,
  };
  return {
    handle,
    receiver: () => receiverCalls.at(-1) ?? null,
    receiverCalls,
    modes,
    setHovered: (id: string | null) => void (hovered = id),
    setTouchHit: (id: string | null) => void (touchHit = id),
  };
}

function ev(
  kind: PlanPointerEvent['kind'],
  x: number,
  y: number,
  pointerType = 'mouse',
): PlanPointerEvent {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
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

const GAP_POINTS = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0.5)];
const gapObjects = () => withWalls(baseObjects(), 1, GAP_POINTS, false);

function setup(
  objects: Map<string, ObjectValue> = baseObjects(),
  canEdit = true,
  numberHighs?: NumberHighs,
  snapSettings?: () => Readonly<SnapSettings>,
) {
  const store = createModelStore({ objects, numberHighs });
  const h = fakeHandle();
  const msgs: string[] = [];
  const controller = createDrawingController({
    handle: h.handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: (key) => void msgs.push(key),
    newId: idSeq(100),
    now: () => WHEN,
    ...(snapSettings ? { snapSettings } : {}),
  });
  const send = (e: PlanPointerEvent) => {
    const r = h.receiver();
    if (!r) throw new Error('no pointer receiver set');
    r(e);
  };
  // A mouse click: down then up at one point.
  const click = (x: number, y: number) => {
    send(ev('down', x, y));
    send(ev('up', x, y));
  };
  const walls = () => wallsOf(store.getState().objects);
  const rooms = () => roomsOf(store.getState().objects);
  return { store, controller, h, msgs, send, click, walls, rooms };
}

const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('EZD-210b drawing controller', () => {
  it('D1 selecting tools, viewers and dispose', () => {
    const { controller, h } = setup();
    let calls = 0;
    controller.subscribe(() => void calls++);
    const ui0 = controller.getUi();
    expect(ui0.enabled).toBe(true);
    expect(ui0.boxes).toEqual([]);
    expect(ui0.tool).toBeNull();
    expect(ui0.pick).toBeNull();
    expect(ui0.gapMessage).toBeNull();
    expect(ui0.lastLength).toBeNull();

    controller.selectTool('wall');
    expect(controller.getUi().tool).toBe('wall');
    expect(h.modes).toEqual(['off']);
    expect(h.receiver()).not.toBeNull();
    const before = calls;
    expect(before).toBeGreaterThan(0);
    controller.selectTool('wall');
    expect(calls).toBe(before);
    expect(h.modes).toHaveLength(1);

    controller.selectTool('room-rect');
    expect(controller.getUi().tool).toBe('room-rect');
    expect(h.modes).toHaveLength(1);

    controller.keyDown(ke('Escape'));
    expect(controller.getUi().tool).toBeNull();
    expect(h.modes).toEqual(['off', 'select']);
    expect(h.receiver()).toBeNull();

    const v = setup(baseObjects(), false);
    expect(v.controller.getUi().enabled).toBe(false);
    v.controller.selectTool('wall');
    expect(v.controller.getUi().tool).toBeNull();
    expect(v.controller.keyDown(ke('w'))).toBe(false);
    expect(v.h.modes).toEqual([]);
    expect(v.h.receiverCalls).toEqual([]);

    const d = setup();
    let dCalls = 0;
    d.controller.subscribe(() => void dCalls++);
    d.controller.selectTool('wall');
    d.controller.dispose();
    expect(d.h.receiverCalls.at(-1)).toBeNull();
    const after = dCalls;
    const w = createWallData({ start: pt(300, 0), end: pt(400, 0), level: F1 });
    if (!w.ok) throw new Error('wall data');
    d.store.applyEdit([
      {
        id: uid(50),
        value: {
          type: 'wall',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: w.data as unknown as Record<string, unknown>,
        },
      },
    ]);
    expect(dCalls).toBe(after);
  });

  it('D2 keys: W, R, Enter and Esc, never in a field or with a modifier', () => {
    const { controller } = setup();
    expect(controller.keyDown(ke('w'))).toBe(true);
    expect(controller.getUi().tool).toBe('wall');
    expect(controller.keyDown(ke('R', { shiftKey: true }))).toBe(true);
    expect(controller.getUi().tool).toBe('room-rect');
    expect(controller.keyDown(ke('w', { ctrlKey: true }))).toBe(false);
    expect(controller.keyDown(ke('w', { defaultPrevented: true }))).toBe(false);
    expect(controller.keyDown(ke('w', { target: { tagName: 'INPUT' } }))).toBe(false);
    expect(controller.keyDown(ke('x'))).toBe(false);
    expect(controller.getUi().tool).toBe('room-rect');
    expect(controller.keyDown(ke('Enter'))).toBe(true);
    expect(controller.keyDown(ke('Escape'))).toBe(true);
    expect(controller.getUi().tool).toBeNull();
    expect(controller.keyDown(ke('Escape'))).toBe(false);
    expect(controller.keyDown(ke('Enter'))).toBe(false);
  });

  it('D3 a click chain draws four walls and closes on the start point', () => {
    const { controller, store, click, send, walls, rooms, msgs } = setup();
    controller.selectTool('wall');
    click(0, 0);
    click(120, 0);
    click(120, 96);
    click(0, 96);
    send(ev('move', 1, 0.5));
    click(1, 0.5);
    const w = walls();
    expect(w).toHaveLength(4);
    near(w[0]!.data.geometry.start, pt(0, 0));
    near(w[0]!.data.geometry.end, pt(120, 0));
    near(w[1]!.data.geometry.end, pt(120, 96));
    near(w[2]!.data.geometry.end, pt(0, 96));
    expect(w[3]!.data.geometry.end).toEqual(pt(0, 0));
    const r = rooms();
    expect(r).toHaveLength(1);
    expect(r[0]!.data.attributes.name).toBe('Room 1');
    expect(roomAreaSqFt(r[0]!.data.geometry.boundary)).toBe(80);
    expect(store.getState().past).toHaveLength(4);
    expect(controller.getUi().tool).toBe('wall');
    expect(controller.getUi().lastLength).toBe(96);
    expect(msgs).toEqual([]);
  });

  it('D4 a rectangle from typed width and depth grows down and right; a drag draws a second room', () => {
    const { controller, click, send, walls, rooms } = setup();
    controller.selectTool('room-rect');
    click(0, 0);
    controller.typed({ width: 144, depth: 120 });
    let w = walls();
    expect(w).toHaveLength(4);
    near(w[0]!.data.geometry.start, pt(0, 0));
    near(w[0]!.data.geometry.end, pt(144, 0));
    near(w[1]!.data.geometry.end, pt(144, -120));
    near(w[2]!.data.geometry.end, pt(0, -120));
    expect(rooms()).toHaveLength(1);
    expect(roomAreaSqFt(rooms()[0]!.data.geometry.boundary)).toBe(120);
    expect(controller.getUi().lastLength).toBe(120);

    send(ev('down', 200, 0));
    send(ev('move', 260, 40));
    send(ev('up', 260, 40));
    w = walls();
    expect(w).toHaveLength(8);
    const r = rooms();
    expect(r).toHaveLength(2);
    const second = r.find((x) => x.data.attributes.name === 'Room 2');
    expect(second).toBeDefined();
    expect(roomAreaSqFt(second!.data.geometry.boundary)).toBe(17);
  });

  it('D5 typed lengths need a start first, then draw a closed 12 by 10 room', () => {
    const { controller, store, click, send, walls, rooms, msgs } = setup();
    controller.selectTool('wall');
    controller.typed({ length: 144, angle: null });
    expect(msgs).toEqual(['office.tools.wall.click_start']);
    expect(walls()).toHaveLength(0);

    click(0, 0);
    send(ev('move', 60, 0));
    controller.typed({ length: 144, angle: null });
    send(ev('move', 144, 50));
    controller.typed({ length: 120, angle: 90 });
    send(ev('move', 94, 120));
    controller.typed({ length: 144, angle: 90 });
    send(ev('move', 0, 70));
    controller.typed({ length: 120, angle: 90 });
    expect(walls()).toHaveLength(4);
    expect(rooms()).toHaveLength(1);
    expect(roomAreaSqFt(rooms()[0]!.data.geometry.boundary)).toBe(120);
    expect(controller.getUi().lastLength).toBeCloseTo(120, 9);

    const pastLength = store.getState().past.length;
    expect(controller.keyDown(ke('Enter'))).toBe(true);
    expect(walls()).toHaveLength(4);
    expect(store.getState().past).toHaveLength(pastLength);
  });

  it('D6 a touch draws on lift, not on press, and a cancel drops the press', () => {
    const { controller, send, walls } = setup();
    controller.selectTool('wall');
    send(ev('down', 0, 0, 'touch'));
    send(ev('cancel', 0, 0, 'touch'));
    expect(controller.getFrame()!.from).toBeNull();

    send(ev('down', 0, 0, 'touch'));
    send(ev('up', 0, 0, 'touch'));
    near(controller.getFrame()!.from!, pt(0, 0));
    expect(walls()).toHaveLength(0);

    send(ev('down', 120, 0, 'touch'));
    send(ev('cancel', 120, 0, 'touch'));
    expect(walls()).toHaveLength(0);

    send(ev('down', 120, 0, 'touch'));
    send(ev('move', 120, 0, 'touch'));
    send(ev('up', 120, 0, 'touch'));
    const w = walls();
    expect(w).toHaveLength(1);
    near(w[0]!.data.geometry.start, pt(0, 0));
    near(w[0]!.data.geometry.end, pt(120, 0));
  });

  it('D7 a pointer move makes one snap frame and no ui notification', () => {
    const { controller, send } = setup(withWalls(baseObjects(), 1, [pt(0, 0), pt(120, 0)], false));
    controller.selectTool('wall');
    const frames: Array<DrawingFrame | null> = [];
    controller.onFrame((f) => void frames.push(f === null ? null : structuredClone(f)));
    let uiCalls = 0;
    controller.subscribe(() => void uiCalls++);
    for (let i = 0; i < 50; i++) send(i % 2 === 0 ? ev('move', 2, 1) : ev('move', 60, 30));
    expect(frames).toHaveLength(50);
    expect(uiCalls).toBe(0);
    const first = frames[0]!;
    expect(first.marker?.kind).toBe('endpoint');
    expect(first.marker?.shape).toBe('square');
    near(first.marker!.at, pt(0, 0));
    near(first.to!, pt(0, 0));
    expect(first.from).toBeNull();

    send(ev('move', 60, 0.5));
    const last = controller.getFrame()!;
    expect(last.marker?.kind).toBe('midpoint');
    expect(last.marker?.shape).toBe('triangle');
    near(last.marker!.at, pt(60, 0));
  });

  it('D8 the snap index follows the store: a wall added snaps, a wall removed stops snapping', () => {
    const { controller, store, send } = setup();
    controller.selectTool('wall');
    const made = createWallData({ start: pt(300, 0), end: pt(400, 0), level: F1 });
    if (!made.ok) throw new Error('wall data');
    const W2 = uid(60);
    store.applyEdit([
      {
        id: W2,
        value: {
          type: 'wall',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: made.data as unknown as Record<string, unknown>,
        },
      },
    ]);
    send(ev('move', 301, 1));
    expect(controller.getFrame()!.marker?.kind).toBe('endpoint');
    near(controller.getFrame()!.marker!.at, pt(300, 0));

    store.applyEdit([{ id: W2, value: null }]);
    send(ev('move', 301, 1));
    expect(controller.getFrame()!.marker?.kind).toBe('increment');
    near(controller.getFrame()!.marker!.at, pt(301, 1));
  });

  it('D9 a gap offers a pick; a wall across it is refused; Esc leaves; the west wall closes the room', () => {
    const { controller, h, send, rooms } = setup(gapObjects());
    const boxes = controller.getUi().boxes;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.sizeText).toBe('1/2"');
    expect(boxes[0]!.actions).toEqual(['absorb', 'keep']);

    controller.startPick(boxes[0]!.wallIds);
    expect(controller.getUi().pick).not.toBeNull();
    expect(h.modes.at(-1) ?? 'wall').toBe('wall');
    expect(h.receiver()).not.toBeNull();

    h.setHovered(uid(1));
    send(ev('down', 72, 0));
    expect(controller.getUi().gapMessage?.key).toBe('office.tools.gap.across');
    expect(rooms()).toHaveLength(0);
    expect(controller.getUi().pick).not.toBeNull();

    expect(controller.keyDown(ke('Escape'))).toBe(true);
    expect(controller.getUi().pick).toBeNull();
    expect(controller.getUi().gapMessage).toBeNull();

    controller.startPick(controller.getUi().boxes[0]!.wallIds);
    h.setHovered(uid(4));
    send(ev('down', 0, 60));
    const r = rooms();
    expect(r).toHaveLength(1);
    expect(roomAreaSqFt(r[0]!.data.geometry.boundary)).toBe(120);
    expect(controller.getUi().pick).toBeNull();
    expect(controller.getUi().boxes).toEqual([]);
    expect(h.receiver()).toBeNull();
  });

  it('EZD-208a DC1 the hover mode returns to select', () => {
    // EZD-208a DC1 (vault/plans/EZD-208a.md section 4; section 1 R13; AC-EZD-208-9).
    const { controller, h } = setup(gapObjects());
    controller.startPick(controller.getUi().boxes[0]!.wallIds);
    expect(controller.keyDown(ke('Escape'))).toBe(true);
    expect(h.modes).toEqual(['wall', 'select']);
  });

  it('D10 keeping the room out of square stores who and when; a viewer sees the box with no actions', () => {
    const { controller, rooms } = setup(gapObjects());
    controller.keep(controller.getUi().boxes[0]!.wallIds);
    const r = rooms();
    expect(r).toHaveLength(1);
    expect(r[0]!.data.closureOverride?.who).toBe(WHO);
    expect(r[0]!.data.closureOverride?.when).toBe(WHEN);
    expect(roomAreaSqFt(r[0]!.data.geometry.boundary)).toBe(120);
    expect(controller.getUi().boxes).toEqual([]);

    const viewer = setup(gapObjects(), false);
    expect(viewer.controller.getUi().boxes).toHaveLength(1);
    expect(viewer.controller.getUi().boxes[0]!.actions).toEqual([]);
  });

  it('D11 railMode: hidden, disabled or enabled', () => {
    const ready = {
      editor: 'ready',
      canEdit: true,
      canvasFailed: false,
      controllerEnabled: true,
    } as const;
    expect(railMode({ ...ready, editor: 'loading' })).toBe('disabled');
    expect(railMode({ ...ready, editor: 'failed' })).toBe('hidden');
    expect(railMode({ ...ready, editor: 'no-access' })).toBe('hidden');
    expect(railMode({ ...ready, editor: 'not-found' })).toBe('hidden');
    expect(railMode({ ...ready, canEdit: false })).toBe('hidden');
    expect(railMode({ ...ready, canvasFailed: true })).toBe('disabled');
    expect(railMode({ ...ready, controllerEnabled: false })).toBe('disabled');
    expect(railMode(ready)).toBe('enabled');
  });
});

// EZD-294 C1 (vault/plans/EZD-294.md section 4; Decided "Store highs"; AC-EZD-294-1).
describe('EZD-294 drawing controller numbers', () => {
  it("EZD-294 C1 the controller numbers from the store's highs", () => {
    const { controller, click, walls, store } = setup(baseObjects(), true, {
      wall: 12,
      door: 0,
      window: 0,
    });
    controller.selectTool('room-rect');
    click(0, 0);
    controller.typed({ width: 144, depth: 120 });
    expect(walls().map((w) => w.data.attributes.number)).toEqual([13, 14, 15, 16]);
    expect(store.getState().numberHighs.wall).toBe(16);
  });
});

// EZD-219 U13 (vault/plans/EZD-219.md section 4; 09m Snap row 5; Q-0569 (a); Decided "Every snap call").
describe('EZD-219 drawing uses the snap settings', () => {
  it('EZD-219 U13 the drawing controller snaps with the given increment', () => {
    const twelve = setup(baseObjects(), true, undefined, () => ({
      ...DEFAULT_SNAP_SETTINGS,
      incrementIn: 12,
    }));
    twelve.controller.selectTool('wall');
    twelve.click(0, 0);
    twelve.send(ev('move', 37.3, 0));
    near(twelve.controller.getFrame()!.to!, pt(36, 0));

    const control = setup();
    control.controller.selectTool('wall');
    control.click(0, 0);
    control.send(ev('move', 37.3, 0));
    near(control.controller.getFrame()!.to!, pt(37.5, 0));
  });
});

// EZD-375 D1, D2 (vault/plans/EZD-375.md section 4; AC-EZD-375-1, -2; 09j rows 11, 12; Q-0560, Q-0570).
describe('EZD-375 typed angled wall length', () => {
  it('EZD-375 D1 done when: a wall typed 12\' 6 1/4" at 45 degrees from (150, 0) shows 12\' 6 1/2"', () => {
    expect(parseLength('12\' 6 1/4"', 'wall_room')).toEqual({ ok: true, inches: 150.25 });
    const { controller, click, send, walls } = setup();
    controller.selectTool('wall');
    click(150, 0);
    send(ev('move', 200, 50));
    controller.typed({ length: 150.25, angle: 45 });
    expect(walls()).toHaveLength(1);
    const g = walls()[0]!.data.geometry;
    near(g.start, pt(150, 0));
    near(g.end, pt(256.24279387327874, 106.24279387327876));
    const last = controller.getUi().lastLength;
    expect(last).toBeLessThan(150.25);
    expect(last).toBeCloseTo(150.25, 9);
    expect(formatLength(last!, PLAN_DISPLAY_DENOMINATOR)).toBe('12\' 6 1/2"');
  });

  it('EZD-375 D2 a wall typed 11\' 11 3/4" at 10 degrees shows 12\' 0"', () => {
    expect(parseLength('11\' 11 3/4"', 'wall_room')).toEqual({ ok: true, inches: 143.75 });
    const { controller, click, send, walls } = setup();
    controller.selectTool('wall');
    click(150, 0);
    send(ev('move', 200, 50));
    controller.typed({ length: 143.75, angle: 10 });
    expect(walls()).toHaveLength(1);
    near(walls()[0]!.data.geometry.end, pt(291.5661144955049, 24.961925539621234));
    const last = controller.getUi().lastLength;
    expect(last).toBeLessThan(143.75);
    expect(last).toBeCloseTo(143.75, 9);
    expect(formatLength(last!, 2)).toBe('12\' 0"');
  });
});

// EZD-212b T12-T19 (vault/plans/EZD-212b.md section 4, D7; AC-EZD-212-3, -6, -7, -15, -16, -18). Real model store over
// the fixtures; a fake selection link (ids, pickAt) passed to attachSelection. Expected values: the plan's rows and
// their cited sources (09j rows 1, 3; 09k On a wall, Typed move; Q-0630 rows 11, 35; Q-0570; Q-0214), never the code.
describe('EZD-212b Move tool and drags in the drawing controller', () => {
  function withLink(
    objects: Map<string, ObjectValue>,
    ids: string[],
    picked: string[] = [],
    canEdit = true,
  ) {
    const a = setup(objects, canEdit);
    let current = ids;
    const selects: string[][] = [];
    const link = {
      getUi: () => ({ ids: current, selectMore: false }),
      select: (records: readonly string[]) => {
        selects.push([...records]);
        current = [...records];
      },
      subscribe: () => () => {},
      pickAt: () => picked,
    };
    a.controller.attachSelection(
      link as unknown as Parameters<typeof a.controller.attachSelection>[0],
    );
    return { ...a, selects };
  }
  const wall = (a: Pick<ReturnType<typeof setup>, 'store'>, id: string) =>
    wallsOf(a.store.getState().objects).find((w) => w.id === id)!;
  const door = (a: Pick<ReturnType<typeof setup>, 'store'>, id = uid(50)) =>
    openingsOn(a.store.getState().objects, F1).find((o) => o.id === id)!;
  const pastLen = (a: Pick<ReturnType<typeof setup>, 'store'>) =>
    a.store.getState().past.length;
  const dragEv = (a: ReturnType<typeof setup>, kind: PlanPointerEvent['kind'], x: number, y: number) =>
    a.controller.dragPointer(ev(kind, x, y));

  it('EZD-212b T12 M picks Move and hovers what a click selects', () => {
    const a = setup(ROOM);
    expect(a.controller.keyDown(ke('w'))).toBe(true);
    expect(a.controller.keyDown(ke('m'))).toBe(true);
    expect(a.controller.getUi().tool).toBe('move');
    expect(a.h.receiver()).not.toBeNull();
    expect(a.h.modes.slice(-2)).toEqual(['off', 'select']);

    const v = setup(ROOM, false);
    expect(v.controller.keyDown(ke('m'))).toBe(false);
    expect(v.controller.getUi().tool).toBeNull();
  });

  it('EZD-212b T13 base point then target point', () => {
    const a = withLink(DOOR, [], [uid(2)]);
    a.controller.keyDown(ke('m'));
    a.click(144, 100);
    expect(a.selects).toEqual([[uid(2)]]);
    expect(pastLen(a)).toBe(0);
    a.click(144, 100);
    a.send(ev('move', 150, 100));
    a.click(150, 100);
    near(wall(a, uid(2)).data.geometry.start, pt(150, 0));
    near(wall(a, uid(2)).data.geometry.end, pt(150, 120));
    near(wall(a, uid(1)).data.geometry.end, pt(150, 0));
    near(wall(a, uid(3)).data.geometry.start, pt(150, 120));
    near(wall(a, uid(4)).data.geometry.start, pt(0, 120));
    near(wall(a, uid(4)).data.geometry.end, pt(0, 0));
    const o = door(a);
    near(o.data.geometry.center, pt(144, 60));
    expect(o.data.geometry.hostWallId).toBeNull();
    near(o.data.geometry.axis!, pt(0, 1));
    expect(pastLen(a)).toBe(1);
    expect(a.controller.getUi().tool).toBe('move');
  });

  it('EZD-212b T14 typed move uses the snapped direction', () => {
    const a = withLink(ROOM, [uid(2)]);
    a.controller.keyDown(ke('m'));
    a.click(144, 100);
    a.send(ev('move', 150, 100));
    const six = parseLength('6 1/32"', 'other');
    if (!six.ok) throw new Error('parse');
    a.controller.typed({ distance: six.inches });
    expect(wall(a, uid(2)).data.geometry.start.x).toBeCloseTo(150.0625, 9);
    near(wall(a, uid(2)).data.geometry.start, pt(150.0625, 0));
    expect(formatLength(wallLength(wall(a, uid(1)).data.geometry), 2)).toBe('12\' 6"');
    expect(Math.round(roomAreaSqFt(a.rooms()[0]!.data.geometry.boundary))).toBe(125);

    const b = withLink(ROOM, [uid(2)]);
    b.controller.keyDown(ke('m'));
    b.click(144, 100);
    b.send(ev('move', 150, 100));
    const tiny = parseLength('1/64"', 'other');
    if (!tiny.ok) throw new Error('parse');
    expect(tiny.inches).toBe(0);
    b.controller.typed({ distance: tiny.inches });
    expect(pastLen(b)).toBe(0);

    const c = withLink(ROOM, [uid(2)]);
    c.controller.keyDown(ke('m'));
    c.click(144, 100);
    c.send(ev('move', 100, 103));
    c.controller.typed({ distance: 6 });
    near(wall(c, uid(2)).data.geometry.start, pt(138, 0));
    near(wall(c, uid(2)).data.geometry.end, pt(138, 120));
  });

  it('EZD-212b T15 snaps and the marker while moving', () => {
    const a = withLink(ROOM, [uid(2)]);
    a.controller.keyDown(ke('m'));
    a.click(144, 100);
    a.send(ev('move', 150, 100));
    const first = a.controller.getFrame()!;
    near(first.from!, pt(144, 100));
    near(first.to!, pt(150, 100));
    expect(first.marker?.kind).toBe('angle');
    expect(first.marker?.shape).toBe('arc');
    expect(first.preview).toHaveLength(3);
    a.send(ev('move', 144, 118));
    const next = a.controller.getFrame()!;
    expect(next.marker?.kind).toBe('endpoint');
    expect(next.marker?.shape).toBe('square');
    near(next.marker!.at, pt(144, 120));
  });

  it('EZD-212b T16 Select drag slides a door, holds it, re-hosts it', () => {
    const a = setup(DOOR);
    a.controller.startDrag([uid(50)], pt(144, 60));
    dragEv(a, 'move', 146, 80);
    dragEv(a, 'up', 146, 80);
    near(door(a).data.geometry.center, pt(144, 80));
    expect(door(a).data.geometry.hostWallId).toBe(uid(2));

    a.controller.startDrag([uid(50)], pt(144, 80));
    dragEv(a, 'move', 144, 100);
    dragEv(a, 'move', 200, 100);
    dragEv(a, 'up', 200, 100);
    near(door(a).data.geometry.center, pt(144, 100));
    expect(door(a).data.geometry.hostWallId).toBe(uid(2));

    a.controller.startDrag([uid(50)], pt(144, 100));
    dragEv(a, 'move', 100, 118);
    dragEv(a, 'up', 100, 118);
    near(door(a).data.geometry.center, pt(100, 120));
    expect(door(a).data.geometry.hostWallId).toBe(uid(3));
    expect(pastLen(a)).toBe(3);
  });

  it('EZD-212b T17 a flagged door follows the cursor until on a wall', () => {
    const a = setup(withOpening(ROOM, 52, 'door', null, pt(72, 60)));
    a.controller.startDrag([uid(52)], pt(72, 60));
    dragEv(a, 'move', 80, 60);
    dragEv(a, 'up', 80, 60);
    near(door(a, uid(52)).data.geometry.center, pt(80, 60));
    expect(door(a, uid(52)).data.geometry.hostWallId).toBeNull();

    a.controller.startDrag([uid(52)], pt(80, 60));
    dragEv(a, 'move', 142, 60);
    dragEv(a, 'move', 120, 60);
    dragEv(a, 'up', 120, 60);
    near(door(a, uid(52)).data.geometry.center, pt(144, 60));
    expect(door(a, uid(52)).data.geometry.hostWallId).toBe(uid(2));
  });

  it('EZD-212b T18 selected wall and door move, unselected window stays', () => {
    const O = withOpening(DOOR, 51, 'window', 1, pt(72, 0));
    const a = setup(O);
    a.controller.startDrag([uid(2), uid(50)], pt(144, 100));
    dragEv(a, 'move', 150, 100);
    dragEv(a, 'up', 150, 100);
    expect(wall(a, uid(2)).data.geometry.start.x).toBeCloseTo(150, 9);
    near(door(a).data.geometry.center, pt(150, 60));
    expect(door(a).data.geometry.hostWallId).toBe(uid(2));
    near(door(a, uid(51)).data.geometry.center, pt(72, 0));
    expect(door(a, uid(51)).data.geometry.hostWallId).toBe(uid(1));
    expect(pastLen(a)).toBe(1);
  });

  it('EZD-212b T19 refusals, messages, Esc and view-only', () => {
    const a = withLink(ROOM, [uid(2)]);
    a.controller.keyDown(ke('m'));
    a.controller.typed({ distance: 6 });
    expect(a.msgs).toEqual(['office.tools.move.click_base']);

    const b = withLink(ROOM, [uid(2)]);
    b.controller.keyDown(ke('m'));
    b.click(144, 100);
    b.send(ev('move', 100, 100));
    b.controller.typed({ distance: 144 });
    expect(b.msgs).toEqual(['office.tools.gap.zero_length']);
    expect(pastLen(b)).toBe(0);

    const c = withLink(ROOM, [uid(2)]);
    c.controller.keyDown(ke('m'));
    c.click(144, 100);
    expect(c.controller.getFrame()!.from).not.toBeNull();
    expect(c.controller.keyDown(ke('Escape'))).toBe(true);
    expect(c.controller.getUi().tool).toBe('move');
    expect(c.controller.getFrame()!.from).toBeNull();
    c.controller.keyDown(ke('Escape'));
    expect(c.controller.getUi().tool).toBeNull();

    const v = setup(ROOM, false);
    v.controller.startDrag([uid(2)], pt(144, 100));
    dragEv(v, 'move', 150, 100);
    dragEv(v, 'up', 150, 100);
    expect(pastLen(v)).toBe(0);
    expect(v.controller.getFrame()).toBeNull();

    const d = setup(ROOM);
    dragEv(d, 'up', 150, 100);
    expect(pastLen(d)).toBe(0);
    d.controller.startDrag([], pt(144, 100));
    dragEv(d, 'up', 150, 100);
    expect(pastLen(d)).toBe(0);

    const e = setup(ROOM);
    e.controller.selectTool('move');
    e.controller.startDrag([uid(2)], pt(144, 100));
    dragEv(e, 'up', 150, 100);
    expect(pastLen(e)).toBe(0);
  });
});
