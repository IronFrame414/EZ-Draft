// EZD-210a W1-W9 (vault/plans/EZD-210a.md sections 1 Decided "Wall *", "Close", "Snap context", 3 C15-C18, 4).
// Sources: S03 Wall; 09j Turn angle, Closure, Room area, Thickness side, Typed lengths; Q-0558; Q-0560; Q-0568;
// Q-0569 (b); Q-0570; P209 D-Turn, D-Enter; P206 seam; AC-EZD-210-1, -3, -4, -6, -10.
import { createWallData, roomAreaSqFt, wallLength, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  initialWallChainState,
  reduceWallChain,
  toModelObjects,
  wallSnapContext,
  type ToolContext,
  type ToolInput,
  type ToolStep,
  type WallChainState,
} from './index';
import {
  F1,
  baseObjects,
  drawWithWall,
  idSeq,
  roomsOf,
  typedEnws,
  uid,
  wallsOf,
} from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const press = (x: number, y: number): ToolInput => ({ type: 'press', at: p(x, y) });
const move = (x: number, y: number): ToolInput => ({ type: 'move', at: p(x, y) });
const typed = (length: number | null, angle: number | null): ToolInput => ({
  type: 'typed',
  values: { length, angle },
});

const makeCtx = (): ToolContext => ({
  level: F1,
  newId: idSeq(1),
  objects: toModelObjects(baseObjects(), F1),
});

function run(
  inputs: ToolInput[],
  ctx: ToolContext = makeCtx(),
  from: WallChainState = initialWallChainState(),
): { state: WallChainState; steps: ToolStep<WallChainState>[] } {
  let state = from;
  const steps: ToolStep<WallChainState>[] = [];
  for (const input of inputs) {
    const step = reduceWallChain(state, input, ctx);
    steps.push(step);
    state = step.state;
  }
  return { state, steps };
}

const RECT_PRESSES = [press(0, 0), press(144, 0), press(144, 120), press(0, 120), press(0, 0)];

describe('EZD-210a wall chain', () => {
  it('EZD-210a W1 start and first typed wall', () => {
    // (a)
    const initial = initialWallChainState();
    const a = reduceWallChain(initial, typed(144, null), makeCtx());
    expect(a.message).toBe('office.tools.wall.click_start');
    expect(a.walls).toEqual([]);
    expect(a.state).toEqual(initialWallChainState());
    // (b)
    const b = run([press(0, 0), move(50, 0), typed(144, null)]);
    expect(b.steps[0]!.walls).toEqual([]);
    expect(b.steps[0]!.state.start).toEqual(p(0, 0));
    const made = createWallData({
      start: p(0, 0),
      end: p(144, 0),
      level: F1,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('createWallData refused the expected wall');
    expect(b.steps[2]!.walls).toEqual([{ id: uid(1), type: 'wall', data: made.data }]);
    expect(b.steps[2]!.message).toBeNull();
    // (c)
    const c = run([press(0, 0), move(0, 50), typed(144, null)]);
    expect(c.steps[2]!.walls).toHaveLength(1);
    const end = c.steps[2]!.walls[0]!.data.geometry.end;
    expect(end.x).toBeCloseTo(0, 9);
    expect(end.y).toBeCloseTo(144, 9);
  });

  it('EZD-210a W2 typed turns from the last wall', () => {
    const ctx = makeCtx();
    const base = run([press(0, 0), press(144, 0), press(144, 120)], ctx).state;
    const endOf = (inputs: ToolInput[]) => {
      const r = run(inputs, ctx, base);
      const last = r.steps[r.steps.length - 1]!;
      expect(last.walls).toHaveLength(1);
      return last.walls[0]!.data.geometry.end;
    };
    const cases: [ToolInput[], Point][] = [
      [[move(94, 120), typed(120, 90)], p(24, 120)],
      [[move(194, 120), typed(120, 90)], p(264, 120)],
      [[move(94, 170), typed(120, 45)], p(59.1471862576143, 204.8528137423857)],
      [[typed(120, 0)], p(144, 240)],
    ];
    for (const [inputs, want] of cases) {
      const got = endOf(inputs);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });

  it('EZD-210a W3 clicked segments and snap context', () => {
    const ctx = makeCtx();
    let state = initialWallChainState();
    expect(wallSnapContext(state)).toEqual({ anchor: null, referenceDirection: null });
    state = reduceWallChain(state, press(0, 0), ctx).state;
    expect(wallSnapContext(state)).toEqual({ anchor: p(0, 0), referenceDirection: null });
    const s1 = reduceWallChain(state, press(144, 0), ctx);
    expect(s1.walls.map((w) => w.id)).toEqual([uid(1)]);
    expect(s1.walls[0]!.data.geometry).toEqual({ start: p(0, 0), end: p(144, 0) });
    state = s1.state;
    expect(wallSnapContext(state)).toEqual({ anchor: p(144, 0), referenceDirection: p(144, 0) });
    const again = reduceWallChain(state, press(144, 0), ctx);
    expect(again.walls).toEqual([]);
    expect(again.state).toEqual(state);
    const s2 = reduceWallChain(again.state, press(144, 120), ctx);
    expect(s2.walls.map((w) => w.id)).toEqual([uid(2)]);
    expect(s2.walls[0]!.data.geometry).toEqual({ start: p(144, 0), end: p(144, 120) });
    expect(wallSnapContext(s2.state)).toEqual({
      anchor: p(144, 120),
      referenceDirection: p(0, 120),
    });
  });

  it('EZD-210a W4 typed chain closes into a room (done when: 12, 10, 12, 10 gives 120 SF)', () => {
    const r = drawWithWall(baseObjects(), typedEnws([144, 120, 144, 120]), 1);
    const last = r.steps[r.steps.length - 1]!;
    expect(last.walls.map((w) => w.id)).toEqual([uid(4)]);
    expect(last.walls[0]!.data.geometry.end).toEqual({ x: 0, y: 0 });
    expect(r.state.start).toBeNull();
    expect(r.state.walls).toEqual([]);
    const walls = wallsOf(r.objects);
    expect(walls).toHaveLength(4);
    expect(walls.map((w) => w.data.attributes.thicknessSide)).toEqual([
      'right',
      'right',
      'right',
      'right',
    ]);
    const rooms = roomsOf(r.objects);
    expect(rooms).toHaveLength(1);
    expect(roomAreaSqFt(rooms[0]!.data.geometry.boundary)).toBe(120);
  });

  it('EZD-210a W5 click to close, clockwise, folded back', () => {
    // (a)
    const a = drawWithWall(baseObjects(), RECT_PRESSES, 1);
    expect(a.steps[4]!.walls.map((w) => w.id)).toEqual([uid(4)]);
    const aRooms = roomsOf(a.objects);
    expect(aRooms).toHaveLength(1);
    expect(roomAreaSqFt(aRooms[0]!.data.geometry.boundary)).toBe(120);
    expect(wallsOf(a.objects).map((w) => w.data.attributes.thicknessSide)).toEqual([
      'right',
      'right',
      'right',
      'right',
    ]);
    // (b)
    const b = drawWithWall(
      baseObjects(),
      [press(0, 0), press(0, 120), press(144, 120), press(144, 0), press(0, 0)],
      1,
    );
    const bLast = b.steps[4]!.walls;
    expect(bLast.map((w) => w.id)).toEqual([uid(1), uid(2), uid(3), uid(4)]);
    expect(bLast.map((w) => w.data.attributes.thicknessSide)).toEqual([
      'left',
      'left',
      'left',
      'left',
    ]);
    const bRooms = roomsOf(b.objects);
    expect(bRooms).toHaveLength(1);
    expect(roomAreaSqFt(bRooms[0]!.data.geometry.boundary)).toBe(120);
    // (c)
    const c = drawWithWall(baseObjects(), [press(0, 0), press(144, 0), press(0, 0)], 1);
    expect(c.steps[2]!.walls).toEqual([]);
    expect(c.steps[2]!.state.walls).toHaveLength(1);
  });

  it('EZD-210a W6 finish by double-click or Enter', () => {
    const three = [press(0, 0), press(144, 0), press(144, 120)];
    // (a)
    const a = run([...three, { type: 'double' }]);
    const aStep = a.steps[3]!;
    expect(aStep.walls).toEqual([]);
    expect(aStep.state.start).toBeNull();
    expect(aStep.state.walls).toEqual([]);
    expect(aStep.exit).toBe(false);
    // (b), then a new chain
    const b = run([...three, { type: 'enter' }, press(300, 0)]);
    const bStep = b.steps[3]!;
    expect(bStep.walls).toEqual([]);
    expect(bStep.state.start).toBeNull();
    expect(bStep.state.walls).toEqual([]);
    expect(bStep.exit).toBe(false);
    const after = b.steps[4]!;
    expect(after.state.start).toEqual(p(300, 0));
    expect(after.walls).toEqual([]);
    // initial Enter
    const initial = initialWallChainState();
    const i = reduceWallChain(initial, { type: 'enter' }, makeCtx());
    expect(i.state).toEqual(initialWallChainState());
    expect(i.exit).toBe(false);
  });

  it('EZD-210a W7 Esc drops the segment, then leaves the tool', () => {
    const r = drawWithWall(
      baseObjects(),
      [
        press(0, 0),
        press(144, 0),
        press(144, 120),
        move(144, 200),
        { type: 'escape' },
        { type: 'escape' },
      ],
      1,
    );
    const first = r.steps[4]!;
    expect(first.walls).toEqual([]);
    expect(first.state.start).toBeNull();
    expect(first.exit).toBe(false);
    expect(wallsOf(r.objects)).toHaveLength(2);
    const second = r.steps[5]!;
    expect(second.exit).toBe(true);
    expect(second.state).toEqual(first.state);
    // the lone start
    const lone = run([press(0, 0), { type: 'escape' }]).steps[1]!;
    expect(lone.state.start).toBeNull();
    expect(lone.state.walls).toEqual([]);
    expect(lone.exit).toBe(false);
  });

  it('EZD-210a W8 refusals and bad input', () => {
    const ctx = makeCtx();
    const started = reduceWallChain(initialWallChainState(), press(0, 0), ctx).state;
    const long = reduceWallChain(started, press(2400.0625, 0), ctx);
    expect(long.message).toBe('office.tools.too_long');
    expect(long.walls).toEqual([]);
    expect(long.state).toEqual(started);
    const ok = reduceWallChain(long.state, press(2400, 0), ctx);
    expect(ok.walls).toHaveLength(1);
    expect(wallLength(ok.walls[0]!.data.geometry)).toBe(2400);
    // no direction
    const nd = run([press(0, 0), move(0, 0), typed(144, null)]).steps[2]!;
    expect(nd.message).toBe('office.tools.wall.no_direction');
    expect(nd.walls).toEqual([]);
    // null length after a start
    const nullLen = reduceWallChain(started, typed(null, null), makeCtx());
    expect(nullLen.message).toBeNull();
    expect(nullLen.walls).toEqual([]);
    expect(nullLen.state).toEqual(started);
    // NaN press after a start
    const nan = reduceWallChain(started, { type: 'press', at: { x: NaN, y: 0 } }, makeCtx());
    expect(nan.message).toBeNull();
    expect(nan.walls).toEqual([]);
    expect(nan.state).toEqual(started);
  });

  it('EZD-210a W9 partition is centred and splits the room', () => {
    const room = drawWithWall(baseObjects(), RECT_PRESSES, 1);
    const before = room.objects;
    const r = drawWithWall(before, [press(60, 0), press(60, 120)], 100);
    const step = r.steps[1]!;
    expect(step.walls).toHaveLength(1);
    expect(step.walls[0]!.data.attributes.thicknessSide).toBe('center');
    const rooms = roomsOf(r.objects);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((x) => roomAreaSqFt(x.data.geometry.boundary)).sort((x, y) => x - y)).toEqual([
      48, 68,
    ]);
    const changes = r.changes[1]!;
    expect(changes[0]!.id).toBe(step.walls[0]!.id);
    expect(changes[0]!.value?.type).toBe('wall');
    const rank = { create: 0, update: 1, delete: 2 } as const;
    const kinds = changes.slice(1).map((c) => {
      if (c.value === null) return rank.delete;
      expect(c.value.type).toBe('room');
      return before.has(c.id) ? rank.update : rank.create;
    });
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).toEqual([...kinds].sort((x, y) => x - y));
  });
});
