// EZD-210a R1-R4 (vault/plans/EZD-210a.md sections 1 Decided "Rectangle input", "Rectangle commit", 3 C19-C21,
// 4). Sources: S03 Room rectangle; 09j Room area rows 1-2; Q-0559; Q-0568; Q-0569 (b); Q-0570; AC-EZD-210-2, -3,
// -12; PHASES Slice 4 step 2.
import { roomAreaSqFt, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  initialRoomRectState,
  reduceRoomRect,
  toModelObjects,
  type RoomRectState,
  type ToolContext,
  type ToolInput,
  type ToolStep,
} from './index';
import { F1, baseObjects, drawWithRect, idSeq, roomsOf, uid, wallsOf } from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const press = (x: number, y: number): ToolInput => ({ type: 'press', at: p(x, y) });
const release = (x: number, y: number): ToolInput => ({ type: 'release', at: p(x, y) });
const move = (x: number, y: number): ToolInput => ({ type: 'move', at: p(x, y) });
const typed = (width: number, depth: number): ToolInput => ({
  type: 'typed',
  values: { width, depth },
});

const makeCtx = (): ToolContext => ({
  level: F1,
  newId: idSeq(1),
  objects: toModelObjects(baseObjects(), F1),
});

function run(
  inputs: ToolInput[],
  ctx: ToolContext = makeCtx(),
  from: RoomRectState = initialRoomRectState(),
): { state: RoomRectState; steps: ToolStep<RoomRectState>[] } {
  let state = from;
  const steps: ToolStep<RoomRectState>[] = [];
  for (const input of inputs) {
    const step = reduceRoomRect(state, input, ctx);
    steps.push(step);
    state = step.state;
  }
  return { state, steps };
}

const lastOf = <T>(xs: T[]): T => xs[xs.length - 1]!;
const starts = (step: ToolStep<RoomRectState>) => step.walls.map((w) => w.data.geometry.start);

describe('EZD-210a room rectangle', () => {
  it('EZD-210a R1 grows toward the cursor', () => {
    const cases: [ToolInput[], Point[], 'left' | 'right'][] = [
      [[], [p(0, 0), p(144, 0), p(144, -120), p(0, -120)], 'left'],
      [[move(10, 10)], [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], 'right'],
      [[move(-10, 10)], [p(0, 0), p(-144, 0), p(-144, 120), p(0, 120)], 'left'],
      [[move(-10, -10)], [p(0, 0), p(-144, 0), p(-144, -120), p(0, -120)], 'right'],
      [[move(0, 10)], [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], 'right'],
    ];
    for (const [moves, want, side] of cases) {
      const r = run([press(0, 0), release(0, 0), ...moves, typed(144, 120)]);
      const step = lastOf(r.steps);
      expect(step.walls.map((w) => w.id)).toEqual([uid(1), uid(2), uid(3), uid(4)]);
      expect(starts(step)).toEqual(want);
      expect(step.walls.map((w) => w.data.attributes.thicknessSide)).toEqual([
        side,
        side,
        side,
        side,
      ]);
      expect(r.state.corner).toBeNull();
      expect(r.state.pressed).toBe(false);
    }
  });

  it('EZD-210a R2 typed sizes make four walls and a room', () => {
    const a = drawWithRect(baseObjects(), [press(0, 0), release(0, 0), typed(144, 120)], 1);
    expect(wallsOf(a.objects)).toHaveLength(4);
    const aRooms = roomsOf(a.objects);
    expect(aRooms).toHaveLength(1);
    expect(roomAreaSqFt(aRooms[0]!.data.geometry.boundary)).toBe(120);
    const b = drawWithRect(baseObjects(), [press(0, 0), release(0, 0), typed(150, 120)], 1);
    const bRooms = roomsOf(b.objects);
    expect(bRooms).toHaveLength(1);
    expect(roomAreaSqFt(bRooms[0]!.data.geometry.boundary)).toBe(125);
    const none = reduceRoomRect(initialRoomRectState(), typed(144, 120), makeCtx());
    expect(none.message).toBe('office.tools.room_rect.click_corner');
    expect(none.walls).toEqual([]);
  });

  it('EZD-210a R3 drag, or click then click', () => {
    // (a)
    const a = run([press(0, 0), move(100, -50), release(144, -120)]);
    expect(starts(a.steps[2]!)).toEqual([p(0, 0), p(144, 0), p(144, -120), p(0, -120)]);
    // (b)
    const b = run([press(0, 0), release(0, 0), move(50, 50), press(144, 120), release(144, 120)]);
    expect(b.steps[1]!.walls).toEqual([]);
    expect(starts(b.steps[3]!)).toEqual([p(0, 0), p(144, 0), p(144, 120), p(0, 120)]);
    expect(b.steps[4]!.walls).toEqual([]);
  });

  it('EZD-210a R4 refusals and Esc', () => {
    const flat = run([press(0, 0), release(144, 0)]).steps[1]!;
    expect(flat.message).toBe('office.tools.room_rect.flat');
    expect(flat.walls).toEqual([]);
    expect(flat.state.corner).toEqual(p(0, 0));
    expect(flat.state.pressed).toBe(false);
    const long = run([press(0, 0), release(0, 0), press(2400.0625, 10)]).steps[2]!;
    expect(long.message).toBe('office.tools.too_long');
    expect(long.walls).toEqual([]);
    const withCorner = run([press(0, 0), release(0, 0)]).state;
    const esc = reduceRoomRect(withCorner, { type: 'escape' }, makeCtx());
    expect(esc.state.corner).toBeNull();
    expect(esc.exit).toBe(false);
    const escIdle = reduceRoomRect(initialRoomRectState(), { type: 'escape' }, makeCtx());
    expect(escIdle.exit).toBe(true);
    for (const input of [{ type: 'double' }, { type: 'enter' }] as ToolInput[]) {
      const s = reduceRoomRect(withCorner, input, makeCtx());
      expect(s.state).toEqual(withCorner);
      expect(s.walls).toEqual([]);
      expect(s.exit).toBe(false);
    }
  });
});
