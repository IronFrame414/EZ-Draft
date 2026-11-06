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
