// EZD-212b T1-T7 (vault/plans/EZD-212b.md section 4; AC-EZD-212-3, -6, -7, -15, -16, -18). Pure reducer, drag session,
// outcomes and preview. Expected values: the plan's rows and their cited sources (D2-D5b; S03 Move; Q-0630 rows 11,
// 35; Q-0570; 09j rows 1, 3; 09k Typed move), never the code. No browser, no live service.
import type { ModelObject, OpeningObject, PickShape, Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  MOVE_DRAG_PX,
  MOVE_REFUSALS,
  clickOutcome,
  dragOutcome,
  dragTo,
  initialMoveToolState,
  previewShapes,
  reduceMoveTool,
  startMoveDrag,
  type MoveInput,
  type MoveStep,
  type MoveToolState,
} from './move-tool';
import { DOOR, F1, ROOM, objs, uid } from './test-utils/fixtures';
import { SAME_SPOT_PX } from '../selection/selection-controller';

const p = (x: number, y: number): Point => ({ x, y });
const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

function run(inputs: MoveInput[], from: MoveToolState = initialMoveToolState()): MoveStep[] {
  const steps: MoveStep[] = [];
  let state = from;
  for (const input of inputs) {
    const step = reduceMoveTool(state, input);
    steps.push(step);
    state = step.state;
  }
  return steps;
}

const press = (at: Point, selected: string[], picked: string[]): MoveInput => ({
  type: 'press',
  at,
  selected,
  picked,
});
const release = (at: Point, dragged: boolean): MoveInput => ({ type: 'release', at, dragged });
const move = (at: Point): MoveInput => ({ type: 'move', at });
const typed = (distance: number | null): MoveInput => ({ type: 'typed', distance });

const nothing = (s: MoveStep) => {
  expect(s.select).toBeNull();
  expect(s.commit).toBeNull();
  expect(s.message).toBeNull();
  expect(s.exit).toBe(false);
};

describe('EZD-212b move reducer', () => {
  it('EZD-212b T1 reducer: first click selects, base then target', () => {
    const s = run([
      press(p(10, 10), [], []),
      press(p(10, 10), [], ['b', 'a']),
      release(p(10, 10), false),
      press(p(10, 10), ['x', 'y'], ['b']),
      release(p(10, 10), false),
      move(p(16, 10)),
      press(p(16, 10), ['x', 'y'], ['b']),
      release(p(16, 10), false),
    ]);
    nothing(s[0]!);
    expect(s[0]!.state.base).toBeNull();
    expect(s[0]!.state.held).toBe('none');

    expect(s[1]!.select).toEqual(['b']);
    expect(s[1]!.state.held).toBe('select');
    expect(s[1]!.commit).toBeNull();

    nothing(s[2]!);
    expect(s[2]!.state.held).toBe('none');
    expect(s[2]!.state.base).toBeNull();
    expect(s[2]!.state.ids).toEqual([]);

    expect(s[3]!.state.held).toBe('base');
    expect(s[3]!.state.ids).toEqual(['x', 'y']);
    expect(s[3]!.select).toBeNull();
    expect(s[3]!.commit).toBeNull();

    nothing(s[4]!);
    expect(s[4]!.state.held).toBe('none');
    expect(s[4]!.state.base).toEqual(p(10, 10));

    expect(s[5]!.state.at).toEqual(p(16, 10));
    expect(s[5]!.state.base).toEqual(p(10, 10));

    expect(s[6]!.state.held).toBe('target');
    expect(s[6]!.commit).toBeNull();

    expect(s[7]!.commit).toEqual({ ids: ['x', 'y'], delta: p(6, 0), drag: false });
    expect(s[7]!.state.base).toBeNull();
    expect(s[7]!.state.held).toBe('none');
  });

  it('EZD-212b T2 reducer: drags commit on release', () => {
    const a = run([press(p(0, 0), ['x'], []), release(p(5, 5), true)]);
    expect(a[1]!.commit).toEqual({ ids: ['x'], delta: p(5, 5), drag: true });
    expect(a[1]!.state.base).toBeNull();
    expect(a[1]!.state.held).toBe('none');

    const b = run([press(p(0, 0), [], ['b']), release(p(3, 0), true)]);
    expect(b[0]!.select).toEqual(['b']);
    expect(b[1]!.commit).toEqual({ ids: ['b'], delta: p(3, 0), drag: true });

    const base: MoveToolState = { base: p(0, 0), ids: ['x'], held: 'none', at: null };
    const c = run([press(p(9, 0), ['x'], []), release(p(9, 0), true)], base);
    expect(c[0]!.state.held).toBe('target');
    expect(c[1]!.commit).toEqual({ ids: ['x'], delta: p(9, 0), drag: false });

    nothing(run([release(p(1, 1), true)])[0]!);

    const held: MoveToolState = { base: p(0, 0), ids: ['x'], held: 'base', at: p(0, 0) };
    const d = run([press(p(4, 4), ['x'], ['z'])], held)[0]!;
    nothing(d);
    expect(d.state).toEqual(held);
  });

  it('EZD-212b T3 reducer: typed distance', () => {
    const a = run([typed(6)])[0]!;
    expect(a.message).toBe('office.tools.move.click_base');
    expect(a.commit).toBeNull();

    const b = run([
      press(p(0, 0), ['x'], []),
      release(p(0, 0), false),
      move(p(10, 0)),
      typed(6.0625),
    ]);
    expect(b[3]!.commit).toEqual({ ids: ['x'], delta: p(6.0625, 0), drag: false });
    expect(b[3]!.state.base).toBeNull();

    const c = run([
      press(p(0, 0), ['x'], []),
      release(p(0, 0), false),
      move(p(0, 0)),
      typed(6),
    ]);
    expect(c[3]!.message).toBe('office.tools.move.no_direction');
    expect(c[3]!.commit).toBeNull();
    expect(c[3]!.state.base).toEqual(p(0, 0));

    const d = run([press(p(0, 0), ['x'], []), release(p(0, 0), false), typed(null)]);
    nothing(d[2]!);

    const e = run([
      press(p(0, 0), ['x'], []),
      release(p(0, 0), false),
      move(p(3, 4)),
      typed(0),
    ]);
    const delta = e[3]!.commit!.delta;
    expect(Object.is(delta.x, 0)).toBe(true);
    expect(Object.is(delta.y, 0)).toBe(true);
  });

  it('EZD-212b T4 reducer: Esc and cancel', () => {
    const withBase = run([press(p(0, 0), ['x'], []), release(p(0, 0), false)]);
    const baseState = withBase[1]!.state;
    expect(baseState.base).toEqual(p(0, 0));
    const esc = reduceMoveTool(baseState, { type: 'escape' });
    expect(esc.state.base).toBeNull();
    expect(esc.state.held).toBe('none');
    expect(esc.state.ids).toEqual([]);
    expect(esc.exit).toBe(false);

    expect(reduceMoveTool(initialMoveToolState(), { type: 'escape' }).exit).toBe(true);

    const held = run([press(p(0, 0), ['x'], [])])[0]!.state;
    expect(held.held).toBe('base');
    const cancelled = reduceMoveTool(held, { type: 'cancel' });
    expect(cancelled.state.held).toBe('none');
    expect(cancelled.state.base).toBeNull();
    expect(cancelled.commit).toBeNull();

    const idle = initialMoveToolState();
    expect(reduceMoveTool(idle, { type: 'cancel' }).state).toEqual(idle);
  });
});

const openingOf = (objects: readonly ModelObject[], id: string): OpeningObject =>
  objects.find((o): o is OpeningObject => o.type === 'opening' && o.id === id)!;

const withCenter = (o: OpeningObject, center: Point): OpeningObject => ({
  ...o,
  data: { ...o.data, geometry: { ...o.data.geometry, center } },
});

describe('EZD-212b move outcomes', () => {
  it('EZD-212b T5 drag session slides, stays and re-hosts', () => {
    const objects = objs(DOOR);
    let drag = startMoveDrag(objects, [uid(50).toUpperCase()], p(144, 60));
    expect(drag.slide).not.toBeNull();
    const at = (x: number, y: number) => {
      drag = dragTo(drag, { objects, level: F1, at: p(x, y), captureIn: 3.75 });
      return drag.slide!;
    };
    let s = at(144, 80);
    near(s.data.geometry.center, p(144, 80));
    expect(s.data.geometry.hostWallId).toBe(uid(2));
    s = at(200, 80);
    near(s.data.geometry.center, p(144, 80));
    s = at(100, 120);
    near(s.data.geometry.center, p(100, 120));
    expect(s.data.geometry.hostWallId).toBe(uid(3));
    s = at(60, 90);
    near(s.data.geometry.center, p(100, 120));
    expect(s.data.geometry.hostWallId).toBe(uid(3));

    const out = dragOutcome(drag, { objects, at: p(60, 90) });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.changed).toHaveLength(1);
      const moved = out.changed[0] as OpeningObject;
      near(moved.data.geometry.center, p(100, 120));
      expect(moved.data.geometry.hostWallId).toBe(uid(3));
    }

    expect(startMoveDrag(objects, [uid(2)], p(144, 60)).slide).toBeNull();
    expect(startMoveDrag(objects, [uid(50), uid(2)], p(144, 60)).slide).toBeNull();
  });

  it('EZD-212b T6 clickOutcome and refusals', () => {
    const objects = objs(ROOM);
    const a = clickOutcome(objects, [uid(2)], p(6, 0));
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.changed.map((o) => o.id)).toEqual([uid(2), uid(1), uid(3)]);

    expect(clickOutcome(objects, [uid(2)], p(-144, 0))).toEqual({
      ok: false,
      message: 'office.tools.gap.zero_length',
    });
    const max = clickOutcome(objects, [uid(2)], p(2256, 0));
    expect(max.ok).toBe(true);
    if (max.ok) {
      const s = max.changed.find((o) => o.id === uid(1))!;
      if (s.type !== 'wall') throw new Error('not a wall');
      expect(s.data.geometry.end.x - s.data.geometry.start.x).toBeCloseTo(2400, 9);
    }
    expect(clickOutcome(objects, [uid(2)], p(2256.0625, 0))).toEqual({
      ok: false,
      message: 'office.tools.gap.too_long',
    });
    expect(clickOutcome(objects, [uid(255)], p(1, 0))).toEqual({
      ok: false,
      message: 'office.tools.move.failed',
    });
    expect(clickOutcome(objects, [uid(2)], p(Number.NaN, 0))).toEqual({
      ok: false,
      message: 'office.tools.move.failed',
    });
    expect(MOVE_REFUSALS).toEqual({
      zero_length: 'office.tools.gap.zero_length',
      too_long: 'office.tools.gap.too_long',
      join_lost: 'office.tools.gap.join_lost',
      not_found: 'office.tools.move.failed',
      invalid_delta: 'office.tools.move.failed',
    });
    expect(MOVE_DRAG_PX).toBe(SAME_SPOT_PX);
  });

  it('EZD-212b T7 previewShapes', () => {
    const objects = objs(ROOM);
    const a = clickOutcome(objects, [uid(2)], p(6, 0));
    if (!a.ok) throw new Error('move refused');
    const shapes = previewShapes(objects, F1, a.changed);
    expect(shapes).toHaveLength(3);
    expect(shapes.every((s: PickShape) => s.kind === 'quad')).toBe(true);
    const first = shapes[0]!;
    if (first.kind !== 'quad') throw new Error('not a quad');
    for (const want of [p(150, 0), p(150, 120)])
      expect(
        first.points.some((q) => Math.abs(q.x - want.x) < 1e-9 && Math.abs(q.y - want.y) < 1e-9),
      ).toBe(true);

    const doorObjects = objs(DOOR);
    const door = withCenter(openingOf(doorObjects, uid(50)), p(120, 60));
    const b = previewShapes(doorObjects, F1, [door]);
    expect(b).toHaveLength(1);
    const bar = b[0]!;
    expect(bar.kind).toBe('bar');
    if (bar.kind === 'bar') {
      near(bar.from, p(120, 42));
      near(bar.to, p(120, 78));
    }
  });
});
