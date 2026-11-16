// EZD-6001 U8 (vault/plans/EZD-6001.md section 4; Decided D-Wire, D-Gone; AC-EZD-6001-1; Q-0509 "the canvas shows
// one floor at a time"). A fake render root stands in for R3F, as in controller.test.ts.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { describe, expect, test, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createFloorView } from '../floors/floors';
import { createModelStore } from '../model/model-store';
import { createPlanController } from './controller';

const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const F3 = '00000000-0000-4000-8000-0000000000f3';
const W1 = '00000000-0000-4000-8000-000000000011';
const W2 = '00000000-0000-4000-8000-000000000012';

function wall(level: string, y: number): ObjectValue {
  const made = createWallData({ start: { x: 0, y }, end: { x: 120, y }, level });
  if (!made.ok) throw new Error('wall fixture');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: made.data as unknown as Record<string, unknown>,
  };
}

const floor = (name: string, order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order },
});

const fakeRoot = () => ({
  start: vi.fn(async () => {}),
  resize: vi.fn(),
  setCamera: vi.fn(),
  invalidate: vi.fn(),
  stats: vi.fn(() => ({ frames: 0, drawCalls: 0 })),
  unmount: vi.fn(),
});

describe('EZD-6001 plan controller floors', () => {
  test('EZD-6001 U8 a floor switch draws only that floor; undo of a removed floor goes back to the lowest', async () => {
    const store = createModelStore({
      objects: new Map<string, ObjectValue>([
        [F1, floor('Floor 1', 1)],
        [F2, floor('Floor 2', 2)],
        [W1, wall(F1, 0)],
        [W2, wall(F2, 96)],
      ]),
    });
    const floors = createFloorView();
    const controller = createPlanController(
      { store, floors },
      { createRoot: fakeRoot, keys: new EventTarget() },
    );
    controller.setCanvasRect({ left: 0, top: 0, width: 1600, height: 1000 });
    controller.setRegionRect({ left: 16, top: 92, width: 1568, height: 862 });
    expect(await controller.attachCanvas({} as HTMLCanvasElement)).toBe('ready');
    const { handle } = controller;
    expect(handle.showObject(W1)).toBe(true);
    expect(handle.showObject(W2)).toBe(false);

    const uploads = controller.stats().bufferUploads;
    floors.setOpenFloor(F2);
    expect(handle.showObject(W2)).toBe(true);
    expect(handle.showObject(W1)).toBe(false);
    expect(controller.stats().bufferUploads).toBeGreaterThanOrEqual(uploads + 1);
    expect(store.getState().past).toHaveLength(0);

    store.applyEdit([{ id: F3, value: floor('Floor 3', 3) }]);
    floors.setOpenFloor(F3);
    expect(handle.showObject(W2)).toBe(false);
    store.undo();
    expect(handle.showObject(W1)).toBe(true);
    store.redo();
    expect(handle.showObject(W1)).toBe(false);
    controller.dispose();
  });
});
