// EZD-207a U14-U16 (vault/plans/EZD-207a.md section 4; Decided "View changes", "First view", "Model changes",
// "Start failure"; C1, C4; AC-EZD-207-1, -4, -6, -8). A fake render root stands in for R3F (no WebGL in Vitest).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { describe, expect, test, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { createPlanController } from './controller';
import type { InputSurface } from './input';

const F1 = '00000000-0000-4000-8000-000000000002';
const W1 = '00000000-0000-4000-8000-000000000011';

function wall(end: { x: number; y: number }): ObjectValue {
  const made = createWallData({ start: { x: 0, y: 0 }, end, level: F1 });
  if (!made.ok) throw new Error('wall fixture');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: made.data as unknown as Record<string, unknown>,
  };
}

const floor = (name: string): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order: 1 },
});

const makeStore = () =>
  createModelStore({
    objects: new Map<string, ObjectValue>([
      [F1, floor('Floor 1')],
      [W1, wall({ x: 120, y: 0 })],
    ]),
  });

function makeFakeRoot() {
  return {
    start: vi.fn(async () => {}),
    resize: vi.fn(),
    setCamera: vi.fn(),
    invalidate: vi.fn(),
    stats: vi.fn(() => ({ frames: 0, drawCalls: 0 })),
    unmount: vi.fn(),
  };
}

function makeSurface() {
  const surface = new EventTarget() as unknown as InputSurface;
  Object.assign(surface, {
    getBoundingClientRect: () => ({ left: 16, top: 92, width: 1568, height: 862 }),
    setPointerCapture: vi.fn(),
  });
  return surface;
}

function setup(fake = makeFakeRoot(), report?: (e: unknown) => void) {
  const store = makeStore();
  const controller = createPlanController(
    { store },
    { createRoot: () => fake, keys: new EventTarget(), report },
  );
  controller.setCanvasRect({ left: 0, top: 0, width: 1600, height: 1000 });
  controller.setRegionRect({ left: 16, top: 92, width: 1568, height: 862 });
  return { store, controller, fake };
}

describe('EZD-207a controller', () => {
  test('EZD-207a U14 the handle fits once, reports the zoom, notifies listeners once per change and keeps the cursor', () => {
    const { controller } = setup();
    const { handle } = controller;
    expect(handle.getPixelsPerInch()).toBeCloseTo(1472 / 120, 9);
    const centre = handle.modelToScreen({ x: 60, y: -2.25 });
    expect(centre.x).toBeCloseTo(784, 9);
    expect(centre.y).toBeCloseTo(431, 9);

    const a = vi.fn();
    const b = vi.fn();
    const offA = handle.onCameraChange(a);
    handle.onCameraChange(b);
    handle.setView({ x: 0, y: 0, ppi: 8 / 3 });
    expect(handle.getPixelsPerInch()).toBeCloseTo(8 / 3, 9);
    handle.setView({ x: 0, y: 0, ppi: 8 / 3 });
    handle.setView({ x: 0, y: 0, ppi: 16 / 3 });
    expect(handle.getPixelsPerInch()).toBeCloseTo(16 / 3, 9);
    offA();
    offA();
    handle.setView({ x: 1, y: 0, ppi: 16 / 3 });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);

    const back = handle.screenToModel(handle.modelToScreen({ x: -3.5, y: 7.25 }));
    expect(back.x).toBeCloseTo(-3.5, 9);
    expect(back.y).toBeCloseTo(7.25, 9);

    const surface = makeSurface();
    controller.attachSurface(surface);
    expect(handle.getCursor()).toBeNull();
    surface.dispatchEvent(
      Object.assign(new Event('pointermove', { cancelable: true }), {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        clientX: 116,
        clientY: 192,
      }),
    );
    expect(handle.getCursor()).toEqual({ x: 100, y: 100 });
  });

  test('EZD-207a U15 a pan or zoom rebuilds nothing, a wall edit uploads two batches, a floor rename none', async () => {
    const { controller, store, fake } = setup();
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const uploads0 = controller.stats().bufferUploads;
    const invalidates0 = fake.invalidate.mock.calls.length;

    for (let i = 1; i <= 10; i++) controller.handle.setView({ x: -i, y: i, ppi: 8 / 3 });
    for (const ppi of [3, 4, 5]) controller.handle.setView({ x: -10, y: 10, ppi });
    expect(controller.stats().bufferUploads).toBe(uploads0);
    expect(fake.invalidate.mock.calls.length).toBe(invalidates0 + 13);

    store.applyEdit([{ id: W1, value: wall({ x: 144, y: 0 }) }]);
    expect(controller.stats().bufferUploads).toBe(uploads0 + 2);
    expect(fake.invalidate.mock.calls.length).toBe(invalidates0 + 14);

    store.applyEdit([{ id: F1, value: floor('Floor A') }]);
    expect(controller.stats().bufferUploads).toBe(uploads0 + 2);
    expect(fake.invalidate.mock.calls.length).toBe(invalidates0 + 14);
  });

  test('EZD-207a U16 a start failure is reported once and unmounts, a detach while pending unmounts without a report', async () => {
    const error = new Error('Error creating WebGL context.');
    const failing = makeFakeRoot();
    failing.start = vi.fn(async () => {
      throw error;
    });
    const report = vi.fn();
    const one = setup(failing, report);
    expect(await one.controller.attachCanvas({} as HTMLCanvasElement)).toBe('failed');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error);
    expect(failing.unmount).toHaveBeenCalled();

    let release: () => void = () => {};
    const held = makeFakeRoot();
    held.start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const report2 = vi.fn();
    const two = setup(held, report2);
    const pending = two.controller.attachCanvas({} as HTMLCanvasElement);
    two.controller.detachCanvas();
    release();
    expect(await pending).toBe('detached');
    expect(held.unmount).toHaveBeenCalledTimes(1);
    expect(report2).not.toHaveBeenCalled();
  });

  test('EZD-207a U17 a canvas that changed size while start was pending is resized once, an unchanged one is not', async () => {
    const heldRoot = () => {
      let release: () => void = () => {};
      const fake = makeFakeRoot();
      fake.start = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      return { fake, release: () => release() };
    };

    const changed = heldRoot();
    const one = setup(changed.fake);
    const pending = one.controller.attachCanvas({} as HTMLCanvasElement);
    one.controller.setCanvasRect({ left: 0, top: 0, width: 1200, height: 800 });
    changed.release();
    expect(await pending).toBe('ready');
    expect(changed.fake.resize).toHaveBeenCalledTimes(1);
    expect(changed.fake.resize).toHaveBeenCalledWith({ width: 1200, height: 800 });
    const last = changed.fake.setCamera.mock.calls.at(-1)![0] as {
      halfWidth: number;
      halfHeight: number;
    };
    expect(last.halfWidth).toBe(600);
    expect(last.halfHeight).toBe(400);

    const same = heldRoot();
    const two = setup(same.fake);
    const pendingSame = two.controller.attachCanvas({} as HTMLCanvasElement);
    same.release();
    expect(await pendingSame).toBe('ready');
    expect(same.fake.resize).not.toHaveBeenCalled();
  });
});

// EZD-207b U13-U16 (vault/plans/EZD-207b.md section 4; Decided "Zoom step", "Controller hover", "Hover triggers",
// "wallAt", "showObject", "Atlas in controller"; AC-EZD-207-2, -3, -4, -8, -10). Fixtures F1b, W1b, W2b, R1b.
const F1b = '11111111-1111-4111-8111-111111111111';
const W1b = '00000000-0000-4000-8000-000000000001';
const W2b = '00000000-0000-4000-8000-000000000002';
const R1b = '00000000-0000-4000-8000-0000000000a1';

function wallB(start: { x: number; y: number }, end: { x: number; y: number }): ObjectValue {
  const made = createWallData({ start, end, level: F1b });
  if (!made.ok) throw new Error('wall fixture');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: made.data as unknown as Record<string, unknown>,
  };
}
const floorB = (name: string): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order: 1 },
});
const roomB = (name: string): ObjectValue => ({
  type: 'room',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {
    geometry: {
      boundary: [
        { x: 0, y: 0 },
        { x: 141.5, y: 0 },
        { x: 141.5, y: 168 },
        { x: 0, y: 168 },
      ],
    },
    status: 'existing',
    level: F1b,
    attributes: { name },
    closureOverride: null,
  },
});
const W1V = () => wallB({ x: 0, y: 0 }, { x: 120, y: 0 });
const W2V = () => wallB({ x: 0, y: -24 }, { x: 120, y: -24 });

type Extra = {
  createAtlas?: () => Promise<HTMLCanvasElement>;
  report?: (e: unknown) => void;
  withRoom?: boolean;
  withWalls?: boolean;
};

function setupB(extra: Extra = {}) {
  const entries: Array<[string, ObjectValue]> = [[F1b, floorB('Floor 1')]];
  if (extra.withWalls !== false) entries.push([W1b, W1V()], [W2b, W2V()]);
  if (extra.withRoom) entries.push([R1b, roomB('Kitchen')]);
  const store = createModelStore({ objects: new Map<string, ObjectValue>(entries) });
  const fake = makeFakeRoot();
  const controller = createPlanController(
    { store },
    {
      createRoot: () => fake,
      keys: new EventTarget(),
      report: extra.report,
      createAtlas: extra.createAtlas,
    },
  );
  controller.setCanvasRect({ left: 0, top: 0, width: 1600, height: 1000 });
  controller.setRegionRect({ left: 16, top: 92, width: 1568, height: 862 });
  const surface = makeSurface();
  controller.attachSurface(surface);
  return { store, controller, fake, surface };
}

const mouse = (surface: InputSurface, type: 'pointermove' | 'pointerleave', x: number, y: number) =>
  surface.dispatchEvent(
    Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      clientX: x + 16,
      clientY: y + 92,
    }),
  );
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const fakeAtlas = () => ({ width: 1024, height: 1024 }) as HTMLCanvasElement;

describe('EZD-207b controller', () => {
  test('EZD-207b U13 hover moves redraw only when the wall changes, and mode off clears it', async () => {
    const { controller, fake, surface } = setupB();
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const { handle } = controller;
    handle.setView({ x: -24, y: 24, ppi: 8 });
    const uploads0 = controller.stats().bufferUploads;
    let calls = fake.invalidate.mock.calls.length;
    const step = (act: () => void, id: string | null, plus: number) => {
      act();
      expect(handle.getHoveredWallId()).toBe(id);
      expect(fake.invalidate.mock.calls.length - calls).toBe(plus);
      calls = fake.invalidate.mock.calls.length;
    };
    step(() => mouse(surface, 'pointermove', 600, 210), W1b, 1);
    step(() => mouse(surface, 'pointermove', 610, 212), W1b, 0);
    step(() => mouse(surface, 'pointermove', 600, 402), W2b, 1);
    step(() => mouse(surface, 'pointermove', 600, 300), null, 1);
    step(() => mouse(surface, 'pointermove', 600, 210), W1b, 1);
    step(() => handle.setHoverMode('off'), null, 1);
    step(() => mouse(surface, 'pointermove', 600, 212), null, 0);
    step(() => handle.setHoverMode('wall'), W1b, 1);
    step(() => handle.setHoverMode('bogus' as never), W1b, 0);
    step(() => mouse(surface, 'pointerleave', 600, 212), null, 1);
    expect(controller.stats().highlightUploads).toBe(4);
    expect(controller.stats().bufferUploads).toBe(uploads0);
  });

  test('EZD-207b U14 hover follows the model and the camera, and wallAt answers whatever the mode', async () => {
    const { controller, store, fake, surface } = setupB();
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const { handle } = controller;
    handle.setView({ x: -24, y: 24, ppi: 8 });
    mouse(surface, 'pointermove', 600, 210);
    expect(handle.getHoveredWallId()).toBe(W1b);
    let calls = fake.invalidate.mock.calls.length;
    const since = () => {
      const n = fake.invalidate.mock.calls.length - calls;
      calls = fake.invalidate.mock.calls.length;
      return n;
    };

    store.applyEdit([{ id: W1b, value: wallB({ x: 0, y: -60 }, { x: 120, y: -60 }) }]);
    expect(handle.getHoveredWallId()).toBeNull();
    expect(since()).toBe(1);
    store.applyEdit([{ id: W1b, value: W1V() }]);
    expect(handle.getHoveredWallId()).toBe(W1b);
    expect(since()).toBe(1);
    store.applyEdit([{ id: F1b, value: floorB('Ground') }]);
    expect(handle.getHoveredWallId()).toBe(W1b);
    expect(since()).toBe(0);

    handle.setView({ x: -24, y: 24, ppi: 8 / 3 });
    expect(handle.getHoveredWallId()).toBeNull();
    expect(since()).toBe(1);
    handle.setHoverMode('off');
    since();
    expect(handle.wallAt({ x: 600, y: 210 })).toBeNull();
    handle.setView({ x: -24, y: 24, ppi: 8 });
    expect(handle.wallAt({ x: 600, y: 210 })).toBe(W1b);
    expect(handle.wallAt({ x: Number.NaN, y: 0 })).toBeNull();
  });

  test('EZD-207b U15 zoom steps about the region centre, stops at the limit, and Show fits one object', async () => {
    const { controller, fake } = setupB({ withWalls: false });
    controller.handle.setView({ x: 0, y: 0, ppi: 8 / 3 });
    const { handle } = controller;
    await controller.attachCanvas({} as HTMLCanvasElement);
    handle.zoomIn();
    expect(handle.getPixelsPerInch()).toBeCloseTo(10 / 3, 9);
    const c = handle.modelToScreen({ x: 294, y: -161.625 });
    expect(c.x).toBeCloseTo(784, 9);
    expect(c.y).toBeCloseTo(431, 9);
    handle.zoomOut();
    handle.zoomOut();
    expect(handle.getPixelsPerInch()).toBeCloseTo(32 / 15, 9);

    handle.setView({ x: 0, y: 0, ppi: 64 });
    const atMax = handle.getView();
    const calls = fake.invalidate.mock.calls.length;
    handle.zoomIn();
    expect(handle.getView()).toEqual(atMax);
    expect(fake.invalidate.mock.calls.length).toBe(calls);

    const w = setupB();
    await w.controller.attachCanvas({} as HTMLCanvasElement);
    const h = w.controller.handle;
    h.setView({ x: 0, y: 0, ppi: 8 / 3 });
    expect(h.showObject(W1b)).toBe(true);
    expect(h.getPixelsPerInch()).toBeCloseTo(1472 / 120, 9);
    const s = h.modelToScreen({ x: 60, y: -2.25 });
    expect(s.x).toBeCloseTo(784, 9);
    expect(s.y).toBeCloseTo(431, 9);
    expect(h.showObject(W1b.toUpperCase())).toBe(true);
    h.setView({ x: 5, y: 5, ppi: 4 });
    const before = h.getView();
    expect(h.showObject('nope')).toBe(false);
    expect(h.getView()).toEqual(before);

    w.controller.setRegionRect({ left: 0, top: 0, width: 0, height: 0 });
    h.zoomIn();
    expect(h.getView()).toEqual(before);
    expect(h.showObject(W1b)).toBe(false);
    expect(h.getView()).toEqual(before);
  });

  test('EZD-207b U16 room text comes from one atlas made once per controller, and a failed atlas is reported once', async () => {
    let release: (canvas: HTMLCanvasElement) => void = () => {};
    const createAtlas = vi.fn(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          release = resolve;
        }),
    );
    const a = setupB({ withRoom: true, withWalls: false, createAtlas });
    const first = a.controller.attachCanvas({} as HTMLCanvasElement);
    await flush();
    expect(createAtlas).toHaveBeenCalledTimes(1);
    expect(a.controller.stats().glyphs).toBe(0);
    const uploads0 = a.controller.stats().bufferUploads;
    const invalidates0 = a.fake.invalidate.mock.calls.length;
    release(fakeAtlas());
    expect(await first).toBe('ready');
    await flush();
    expect(a.controller.stats().bufferUploads).toBe(uploads0 + 1);
    expect(a.fake.invalidate.mock.calls.length).toBe(invalidates0 + 1);
    expect(a.controller.stats().glyphs).toBe(13);
    a.controller.detachCanvas();
    expect(await a.controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    await flush();
    expect(createAtlas).toHaveBeenCalledTimes(1);
    expect(a.controller.stats().glyphs).toBe(13);

    const uploads = a.controller.stats().bufferUploads;
    a.store.applyEdit([{ id: R1b, value: roomB('Pantry') }]);
    expect(a.controller.stats().glyphs).toBe(12);
    expect(a.controller.stats().bufferUploads).toBe(uploads + 1);

    const report = vi.fn();
    const b = setupB({
      withRoom: true,
      withWalls: false,
      report,
      createAtlas: () => Promise.reject(new Error('y')),
    });
    await b.controller.attachCanvas({} as HTMLCanvasElement);
    await flush();
    expect(report).toHaveBeenCalledTimes(1);
    const err = report.mock.calls[0][0] as Error & { cause?: Error };
    expect(err.message).toBe('plan.glyph_atlas');
    expect(err.cause?.message).toBe('y');
    expect(b.controller.stats().glyphs).toBe(0);

    const c = setupB({ withRoom: true, withWalls: false });
    await c.controller.attachCanvas({} as HTMLCanvasElement);
    await flush();
    expect(c.controller.stats().glyphs).toBe(0);

    let resolveAtlas: (canvas: HTMLCanvasElement) => void = () => {};
    const d = setupB({
      withRoom: true,
      withWalls: false,
      createAtlas: () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolveAtlas = resolve;
        }),
    });
    const pending = d.controller.attachCanvas({} as HTMLCanvasElement);
    await flush();
    d.controller.dispose();
    const calls = d.fake.invalidate.mock.calls.length;
    resolveAtlas(fakeAtlas());
    await pending;
    await flush();
    expect(d.fake.invalidate.mock.calls.length).toBe(calls);
  });
});

// EZD-208a K1, K2 (vault/plans/EZD-208a.md section 4; section 1 R10-R12; section 3 A6, A7; AC-EZD-208-3, -9).
// Fixtures F1b, W1b, W2b, setupB and mouse are the EZD-207b ones above.
describe('EZD-208a controller selection seams', () => {
  test('EZD-208a K1 select hover mode', async () => {
    const { controller, surface } = setupB();
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const { handle } = controller;
    handle.setView({ x: -24, y: 24, ppi: 8 });

    handle.setHoverMode('select');
    mouse(surface, 'pointermove', 600, 210);
    expect(handle.getHoveredId()).toBe(W1b);
    expect(handle.getHoveredWallId()).toBe(W1b);
    const uploads0 = controller.stats().highlightUploads;

    handle.setHoverPicker(() => W2b);
    expect(handle.getHoveredId()).toBe(W2b);
    expect(handle.getHoveredWallId()).toBeNull();

    handle.setHoverPicker(null);
    expect(handle.getHoveredId()).toBe(W1b);
    expect(handle.getHoveredWallId()).toBe(W1b);
    expect(controller.stats().highlightUploads).toBe(uploads0 + 2);

    handle.setHoverMode('off');
    expect(handle.getHoveredId()).toBeNull();
    expect(handle.getHoveredWallId()).toBeNull();
  });

  test('EZD-208a K2 selection uploads only on change', async () => {
    const { controller, store, fake } = setupB();
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const { handle } = controller;
    handle.setView({ x: -24, y: 24, ppi: 8 });
    const invalidates = () => fake.invalidate.mock.calls.length;
    const buffers0 = controller.stats().bufferUploads;
    expect(controller.stats().selectionUploads).toBe(0);

    let calls = invalidates();
    handle.setSelectedIds([W1b]);
    expect(controller.stats().selectionUploads).toBe(1);
    expect(invalidates() - calls).toBe(1);

    calls = invalidates();
    handle.setSelectedIds([W1b.toUpperCase()]);
    expect(controller.stats().selectionUploads).toBe(1);
    expect(invalidates() - calls).toBe(0);
    expect(controller.stats().bufferUploads).toBe(buffers0);

    store.applyEdit([{ id: W1b, value: wallB({ x: 0, y: -60 }, { x: 120, y: -60 }) }]);
    expect(controller.stats().selectionUploads).toBe(2);

    calls = invalidates();
    handle.setSelectedIds([]);
    expect(controller.stats().selectionUploads).toBe(3);
    expect(invalidates() - calls).toBe(1);
  });
});

// EZD-219 U6-U8 (vault/plans/EZD-219.md section 4; 09m Scale; Q-0664; Decided "Scale change", "Typed zoom apply",
// "Controller"). Fixtures setupB and mouse are the EZD-207b ones above. Region centre (784, 431).
describe('EZD-219 controller scale, typed zoom and cursor', () => {
  const span = (h: { modelToScreen(p: { x: number; y: number }): { x: number; y: number } }) =>
    h.modelToScreen({ x: 120, y: 0 }).x - h.modelToScreen({ x: 0, y: 0 }).x;

  test('EZD-219 U6 a scale change keeps the zoom percent and moves nothing', async () => {
    const { controller, store } = setupB();
    await controller.attachCanvas({} as HTMLCanvasElement);
    const { handle } = controller;
    handle.setZoomPercent(100);
    expect(span(handle)).toBeCloseTo(480, 9);

    const centre = handle.screenToModel({ x: 784, y: 431 });
    const objects = store.getState().objects;
    handle.setScale(0.25);
    expect(span(handle)).toBeCloseTo(240, 9);
    expect(handle.getZoomPercent()).toBe(100);
    const after = handle.screenToModel({ x: 784, y: 431 });
    expect(Math.abs(after.x - centre.x)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(after.y - centre.y)).toBeLessThanOrEqual(1e-9);
    expect(store.getState().objects).toBe(objects);

    handle.setScale(1);
    expect(span(handle)).toBeCloseTo(960, 9);
    handle.setScale(0.1875);
    expect(span(handle)).toBeCloseTo(180, 9);
    handle.setScale(0.125);
    expect(span(handle)).toBeCloseTo(120, 9);

    handle.setScale(0.25);
    const camera = vi.fn();
    handle.onCameraChange(camera);
    handle.setScale(0.25);
    handle.setScale(0.3 as never);
    expect(camera).not.toHaveBeenCalled();
    expect(handle.getScale()).toBe(0.25);
  });

  test('EZD-219 U7 setZoomPercent sets the zoom about the region centre within the limits', async () => {
    const { controller } = setupB();
    await controller.attachCanvas({} as HTMLCanvasElement);
    const { handle } = controller;
    const centre = handle.screenToModel({ x: 784, y: 431 });
    handle.setZoomPercent(33);
    expect(handle.getPixelsPerInch()).toBeCloseTo(1.32, 9);
    expect(handle.getZoomPercent()).toBe(33);
    const kept = handle.screenToModel({ x: 784, y: 431 });
    expect(kept.x).toBeCloseTo(centre.x, 9);
    expect(kept.y).toBeCloseTo(centre.y, 9);

    handle.setZoomPercent(2000);
    expect(handle.getPixelsPerInch()).toBeCloseTo(64, 9);
    expect(handle.getZoomPercent()).toBe(1600);
    handle.setZoomPercent(4);
    expect(handle.getPixelsPerInch()).toBeCloseTo(0.2, 9);
    expect(handle.getZoomPercent()).toBe(5);

    const camera = vi.fn();
    handle.onCameraChange(camera);
    handle.setZoomPercent(Number.NaN);
    expect(camera).not.toHaveBeenCalled();
    handle.setZoomPercent(5);
    expect(camera).not.toHaveBeenCalled();

    handle.setZoomPercent(100);
    handle.zoomIn();
    expect(handle.getZoomPercent()).toBe(125);
  });

  test('EZD-219 U8 the cursor follows the pointer and the camera', async () => {
    const { controller, surface } = setupB();
    await controller.attachCanvas({} as HTMLCanvasElement);
    const { handle } = controller;
    const fn = vi.fn();
    const off = handle.onCursorChange(fn);

    mouse(surface, 'pointermove', 400, 300);
    const before = handle.screenToModel({ x: 400, y: 300 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0].x).toBeCloseTo(before.x, 9);
    expect(fn.mock.calls[0]![0].y).toBeCloseTo(before.y, 9);

    handle.setView({ ...handle.getView(), x: handle.getView().x + 10 });
    const moved = handle.screenToModel({ x: 400, y: 300 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1]![0].x).toBeCloseTo(moved.x, 9);
    expect(fn.mock.calls[1]![0].y).toBeCloseTo(moved.y, 9);

    mouse(surface, 'pointerleave', 400, 300);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls[2]![0]).toBeNull();
    handle.setView({ ...handle.getView(), x: handle.getView().x + 10 });
    expect(fn).toHaveBeenCalledTimes(3);

    off();
    mouse(surface, 'pointermove', 400, 300);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// EZD-217 V1 (vault/plans/EZD-217.md section 4; Decided "getViewCenter"; AC-EZD-217-14): the model point at the
// centre of the measured region, from `view.ts` regionToModel at (width / 2, height / 2).
describe('EZD-217 getViewCenter', () => {
  test('EZD-217 V1 getViewCenter', () => {
    const { controller } = setup();
    controller.handle.setView({ x: -48, y: 144, ppi: 8 / 3 });
    expect(controller.handle.getViewCenter()).toEqual({ x: 246, y: -17.625 });
    controller.setRegionRect({ left: 16, top: 92, width: 0, height: 862 });
    expect(controller.handle.getViewCenter()).toBeNull();
  });
});
