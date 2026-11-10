// EZD-219 U9-U12, U16 (vault/plans/EZD-219.md section 4; 09m Snap rows 1-6; Decided "Snap increments",
// "Snap store life", "Scale save", "Save failure / offline", "Cursor value"; Q-0680; L-062). The save and the
// online source are stubs; no network.
import {
  DEFAULT_SNAP_SETTINGS,
  createWallData,
  createWallSnapIndex,
  snap,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineSource } from '../../lib/network/online';
import type { PlanScale } from '../../lib/plan/plan-scale';
import {
  PLAN_SCALE_LABELS,
  createScaleSetting,
  createSnapSettings,
  formatCursor,
  snapIncrementLabel,
  type SnapToggle,
} from './view-settings';

const F = '00000000-0000-4000-8000-000000000002';
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function stubOnline(initial: boolean) {
  let flag = initial;
  let callback: (() => void) | null = null;
  const online: OnlineSource = {
    getSnapshot: () => flag,
    subscribe: (cb) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
  };
  return {
    online,
    set: (v: boolean) => {
      flag = v;
    },
    fire: () => callback?.(),
  };
}

describe('EZD-219 view settings', () => {
  it('EZD-219 U9 snap settings store and the 09m snap rows', () => {
    const s = createSnapSettings();
    expect(s.get()).toEqual(DEFAULT_SNAP_SETTINGS);
    const listener = vi.fn();
    s.subscribe(listener);
    const first = s.get();
    s.setIncrement(0.3);
    expect(s.get()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    s.setIncrement(12);
    s.setIncrement(12);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.get()).not.toBe(first);
    expect(s.get().incrementIn).toBe(12);

    const rows: [number, number, number][] = [
      [1 / 16, 37.3, 37.3125],
      [1 / 16, 0.02, 0],
      [1 / 4, 37.3, 37.25],
      [1, 37.5, 38],
      [12, 37.3, 36],
      [12, 42, 48],
    ];
    for (const [inc, x, expected] of rows) {
      const row = createSnapSettings();
      row.setIncrement(inc);
      const result = snap(createWallSnapIndex([]), {
        cursor: { x, y: 0 },
        pixelsPerInch: 4,
        anchor: null,
        referenceDirection: null,
        settings: row.get(),
      });
      expect(result.point.x, `${inc} ${x}`).toBeCloseTo(expected, 9);
    }
  });

  it('EZD-219 U10 a toggle off stops its kind', () => {
    const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level: F });
    if (!made.ok) throw new Error('wall fixture');
    const w1: WallObject = { id: 'w1', type: 'wall', data: made.data };
    const withWall = createWallSnapIndex([w1]);
    const empty = createWallSnapIndex([]);

    const run = (
      kind: SnapToggle,
      on: boolean,
      index: typeof withWall,
      cursor: Point,
      anchor: Point | null,
    ) => {
      const s = createSnapSettings();
      if (!on) s.setToggle(kind, false);
      return snap(index, {
        cursor,
        pixelsPerInch: 4,
        anchor,
        referenceDirection: null,
        settings: s.get(),
      });
    };
    const expectAt = (r: ReturnType<typeof snap>, p: Point, kind: string, digits = 9) => {
      expect(r.kind).toBe(kind);
      expect(r.point.x).toBeCloseTo(p.x, digits);
      expect(r.point.y).toBeCloseTo(p.y, digits);
    };

    expectAt(
      run('endpoints', true, withWall, { x: 0.5, y: 0.5 }, null),
      { x: 0, y: 0 },
      'endpoint',
    );
    expectAt(run('endpoints', false, withWall, { x: 0.5, y: 0.5 }, null), { x: 0.5, y: 0 }, 'face');
    expectAt(
      run('midpoints', true, withWall, { x: 60, y: 0.5 }, null),
      { x: 60, y: 0 },
      'midpoint',
    );
    expectAt(run('midpoints', false, withWall, { x: 60, y: 0.5 }, null), { x: 60, y: 0 }, 'face');
    expectAt(run('faces', true, withWall, { x: 30, y: -4 }, null), { x: 30, y: -4.5 }, 'face');
    expectAt(run('faces', false, withWall, { x: 30, y: -4 }, null), { x: 30, y: -4 }, 'increment');
    expectAt(
      run('angles', true, empty, { x: 37.3, y: 2 }, { x: 0, y: 0 }),
      { x: 37.5, y: 0 },
      'angle',
    );
    const off = run('angles', false, empty, { x: 37.3, y: 2 }, { x: 0, y: 0 });
    expect(off.kind).toBe('increment');
    expect(Math.abs(off.point.x - 37.446)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(off.point.y - 2.008)).toBeLessThanOrEqual(0.001);
  });

  it('EZD-219 U11 the scale save queue sends one at a time, newest wins, never for view-only', async () => {
    const holds: Array<ReturnType<typeof deferred<boolean>>> = [];
    const calls: PlanScale[] = [];
    const save = (s: PlanScale) => {
      calls.push(s);
      const d = deferred<boolean>();
      holds.push(d);
      return d.promise;
    };
    const setting = createScaleSetting({ scale: 0.5, canEdit: true, save });
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.set(0.25);
    setting.set(0.75);
    setting.set(1);
    expect(calls).toEqual([0.25]);
    holds[0]!.resolve(true);
    await flush();
    expect(calls).toEqual([0.25, 1]);
    holds[1]!.resolve(true);
    await flush();
    expect(calls).toEqual([0.25, 1]);
    expect(setting.get()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(3);
    setting.set(1);
    await flush();
    expect(calls).toEqual([0.25, 1]);

    const viewSave = vi.fn(async () => true);
    const view = createScaleSetting({ scale: 0.5, canEdit: false, save: viewSave });
    view.set(0.25);
    await flush();
    expect(view.get()).toBe(0.25);
    expect(viewSave).not.toHaveBeenCalled();

    const rejecting = createScaleSetting({
      scale: 0.5,
      canEdit: true,
      save: async () => {
        throw new Error('save failed');
      },
    });
    expect(() => rejecting.set(0.25)).not.toThrow();
    await flush();
    expect(rejecting.get()).toBe(0.25);
  });

  it('EZD-219 U12 scale and increment labels and the cursor text', () => {
    expect(PLAN_SCALE_LABELS[0.1875]).toBe(`3/16" = 1'-0"`);
    expect(PLAN_SCALE_LABELS[1]).toBe(`1" = 1'-0"`);
    expect(snapIncrementLabel(0.0625)).toBe('1/16"');
    expect(snapIncrementLabel(12)).toBe('12"');
    expect(formatCursor({ x: 98, y: 55.5 })).toBe(`8' 2" , 4' 7 1/2"`);
    expect(formatCursor({ x: -6, y: 0.2 })).toBe('-6" , 0"');
    expect(formatCursor({ x: -0.2, y: 0.25 })).toBe('0" , 1/2"');
    expect(formatCursor(null)).toBe('—');
  });

  it('EZD-219 U16 scale offline and a failed save', async () => {
    // (i) offline: nothing is sent; the newest choice goes once the source fires online.
    {
      const net = stubOnline(false);
      const save = vi.fn(async (_s: PlanScale) => true);
      const setting = createScaleSetting({ scale: 0.5, canEdit: true, save, online: net.online });
      setting.set(0.25);
      setting.set(0.75);
      await flush();
      expect(save).not.toHaveBeenCalled();
      net.set(true);
      net.fire();
      await flush();
      expect(save.mock.calls).toEqual([[0.75]]);
      expect(setting.failed()).toBe(false);
    }
    // (ii) online, the save answers false: failed, listeners told; retry sends the held choice.
    {
      const net = stubOnline(true);
      const answers = [false, true];
      const save = vi.fn(async (_s: PlanScale) => answers.shift()!);
      const setting = createScaleSetting({ scale: 0.5, canEdit: true, save, online: net.online });
      const listener = vi.fn();
      setting.subscribe(listener);
      setting.set(0.25);
      const afterSet = listener.mock.calls.length;
      await flush();
      expect(setting.failed()).toBe(true);
      expect(listener.mock.calls.length).toBeGreaterThan(afterSet);
      setting.retry();
      await flush();
      expect(save.mock.calls).toEqual([[0.25], [0.25]]);
      expect(setting.failed()).toBe(false);
    }
    // (iii) the save answers false after the source went offline during the hold: held, no failure.
    {
      const net = stubOnline(true);
      const hold = deferred<boolean>();
      const answers: Array<Promise<boolean>> = [hold.promise, Promise.resolve(true)];
      const save = vi.fn((_s: PlanScale) => answers.shift()!);
      const setting = createScaleSetting({ scale: 0.5, canEdit: true, save, online: net.online });
      setting.set(0.25);
      net.set(false);
      hold.resolve(false);
      await flush();
      expect(setting.failed()).toBe(false);
      expect(save).toHaveBeenCalledTimes(1);
      net.set(true);
      net.fire();
      await flush();
      expect(save.mock.calls).toEqual([[0.25], [0.25]]);
    }
    // (iv) retry when not failed sends nothing.
    {
      const net = stubOnline(true);
      const save = vi.fn(async (_s: PlanScale) => true);
      const setting = createScaleSetting({ scale: 0.5, canEdit: true, save, online: net.online });
      setting.retry();
      await flush();
      expect(save).not.toHaveBeenCalled();
    }
    // (v) dispose while offline with a held choice: nothing is sent when the source fires.
    {
      const net = stubOnline(false);
      const save = vi.fn(async (_s: PlanScale) => true);
      const setting = createScaleSetting({ scale: 0.5, canEdit: true, save, online: net.online });
      setting.set(0.25);
      setting.dispose();
      net.set(true);
      net.fire();
      await flush();
      expect(save).not.toHaveBeenCalled();
    }
  });
});
