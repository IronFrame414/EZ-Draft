// EZD-211a R1, R3-R12 (vault/plans/EZD-211a.md sections 1 Decided "Reducer" to "Edge inputs", 3, 4). Sources:
// Q-0625 (a); P294 N7; Q-0630 09 rows 3, 14, 05 row 34, 03 row 6; Q-0633 row 2; Q-0634; Q-0636; Q-0640 row 6;
// Q-0641 rows 2, 3; Q-0642 row 1; Q-0643 (c); 09k Offset, Door resize; 03g row 2; AC-12, AC-15; ticket Done-when.
import {
  NO_NUMBERS,
  openingOffsets,
  type NumberHighs,
  type OpeningObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  initialOpeningToolState,
  reduceOpeningTool,
  type OpeningContext,
  type OpeningInput,
  type OpeningStep,
  type OpeningToolState,
} from './index';
import { baseObjects, idSeq, uid, wallsOf, withWalls } from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const PPI = 8 / 3;
const toScreen = (q: Point): Point => ({ x: q.x * PPI, y: -q.y * PPI });

const W = withWalls(baseObjects(), 1, [p(0, 0), p(144, 0), p(144, 120), p(0, 120)], true);
const walls = (): WallObject[] => wallsOf(W);
const HOST = uid(1);
const host = (): WallObject => walls().find((w) => w.id === HOST)!;

type Opts = { screen?: Point; touch?: boolean; wallId?: string | null };
const ptr = (kind: 'down' | 'move' | 'up' | 'cancel', at: Point, o: Opts = {}): OpeningInput => ({
  type: 'pointer',
  kind,
  at,
  screen: o.screen ?? toScreen(at),
  touch: o.touch ?? false,
  wallId: o.wallId === undefined ? HOST : o.wallId,
});
const move = (at: Point, o?: Opts) => ptr('move', at, o);
const down = (at: Point, o?: Opts) => ptr('down', at, o);
const up = (at: Point, o?: Opts) => ptr('up', at, o);
const click = (at: Point, o?: Opts) => [down(at, o), up(at, o)];
const typed = (
  v: { offsetLeft?: number; offsetRight?: number; width?: number },
  screen: Point | null = null,
): OpeningInput => ({
  type: 'typed',
  values: {
    offsetLeft: v.offsetLeft ?? null,
    offsetRight: v.offsetRight ?? null,
    width: v.width ?? null,
  },
  screen,
});
const SPACE: OpeningInput = { type: 'space' };
const ESCAPE: OpeningInput = { type: 'escape' };

type Ctx = { -readonly [K in keyof OpeningContext]: OpeningContext[K] };
const makeCtx = (highs: NumberHighs = NO_NUMBERS): Ctx => ({
  newId: idSeq(100),
  walls: walls(),
  openings: [],
  highs,
  pixelsPerInch: PPI,
});

// Folds reduceOpeningTool; each step's `save` goes into ctx.openings (same id replaced, else appended).
function run(
  state: OpeningToolState,
  inputs: OpeningInput[],
  ctx: Ctx,
): { state: OpeningToolState; steps: OpeningStep[] } {
  const steps: OpeningStep[] = [];
  for (const input of inputs) {
    const step = reduceOpeningTool(state, input, ctx);
    let next: OpeningObject[] = [...ctx.openings];
    for (const o of step.save) {
      const i = next.findIndex((x) => x.id === o.id);
      if (i >= 0) next = next.map((x, k) => (k === i ? o : x));
      else next.push(o);
    }
    ctx.openings = next;
    state = step.state;
    steps.push(step);
  }
  return { state, steps };
}
const fresh = (kind: 'door' | 'window', inputs: OpeningInput[], highs?: NumberHighs) => {
  const ctx = makeCtx(highs);
  return { ...run(initialOpeningToolState(kind), inputs, ctx), ctx };
};
const last = (steps: OpeningStep[]): OpeningStep => steps[steps.length - 1]!;
const offsetsOf = (o: OpeningObject) => {
  const r = openingOffsets(o, host(), walls());
  return { left: r?.left, right: r?.right };
};
const M = p(36 + 36 * Math.cos(Math.PI / 4), 36 * Math.sin(Math.PI / 4));

describe('EZD-211a opening tool reducer', () => {
  it('EZD-211a R1 hover previews, click places and selects, away places nothing', () => {
    const a = fresh('door', [move(p(60, 5)), ...click(p(60, 5))], { wall: 4, door: 2, window: 0 });
    expect(a.steps[0]!.state.preview?.geometry.center).toEqual(p(60, 0));
    const placed = a.steps[2]!;
    expect(placed.save).toHaveLength(1);
    expect(placed.save[0]!.data.geometry.hostWallId).toBe(uid(1));
    expect(placed.save[0]!.data.attributes.number).toBe(3);
    expect(placed.select).toBe(uid(100));
    expect(placed.exit).toBe(false);
    expect(placed.state.preview).toBeNull();
    expect(placed.state.owned).toEqual({ id: uid(100), mode: 'pointer', at: null });

    const b = fresh('door', click(p(60, 40), { wallId: null }));
    const away = last(b.steps);
    expect(away.save).toEqual([]);
    expect(away.message).toBeNull();
    expect(away.select).toBeNull();
  });

  it('EZD-211a R3 typed offset left and right; window', () => {
    const a = fresh('door', [move(p(60, 5)), typed({ offsetLeft: 36 }, p(0, 0))]);
    const s = last(a.steps);
    expect(s.save).toHaveLength(1);
    expect(s.save[0]!.data.geometry.center).toEqual(p(54, 0));
    expect(offsetsOf(s.save[0]!)).toEqual({ left: 36, right: 72 });
    expect(s.state.owned).toEqual({ id: uid(100), mode: 'typed', at: p(0, 0) });

    const b = fresh('door', [move(p(60, 5)), typed({ offsetRight: 36 })]);
    const r = last(b.steps).save[0]!;
    expect(r.data.geometry.center).toEqual(p(90, 0));
    expect(offsetsOf(r)).toEqual({ left: 72, right: 36 });

    const c = fresh('window', [move(p(100, 5)), typed({ offsetLeft: 24 })]);
    const w = last(c.steps).save[0]!;
    expect(w.data.geometry.center).toEqual(p(42, 0));
    expect(offsetsOf(w)).toEqual({ left: 24, right: 84 });
    expect(w.data.attributes.sillHeight).toBe(36);
  });

  it('EZD-211a R4 typed offset edges', () => {
    const zero = last(fresh('door', [move(p(60, 5)), typed({ offsetLeft: 0 })]).steps).save[0]!;
    expect(zero.data.geometry.center).toEqual(p(18, 0));
    expect(offsetsOf(zero)).toEqual({ left: 0, right: 108 });

    const max = last(fresh('door', [move(p(60, 5)), typed({ offsetLeft: 108 })]).steps).save[0]!;
    expect(max.data.geometry.center).toEqual(p(126, 0));
    expect(offsetsOf(max)).toEqual({ left: 108, right: 0 });

    const past = last(fresh('door', [move(p(60, 5)), typed({ offsetLeft: 108.0625 })]).steps);
    expect(past.message).toBe('office.tools.opening.past_corner');
    expect(past.save).toEqual([]);
  });

  it('EZD-211a R5 typed width; next opening at default size', () => {
    const a = fresh('door', [
      move(p(60, 5)),
      typed({ offsetLeft: 36, width: 32 }, p(0, 0)),
      move(p(100, 5)),
    ]);
    const resized = a.steps[1]!.save[0]!;
    expect(resized.data.geometry.center).toEqual(p(52, 0));
    expect(resized.data.attributes.width).toBe(32);
    expect(resized.data.attributes.roughOpening).toEqual({ width: 34, height: 82.5 });
    expect(offsetsOf(resized)).toEqual({ left: 36, right: 76 });
    const next = a.steps[2]!.state.preview;
    expect(next?.attributes.width).toBe(36);
    expect(next?.attributes.roughOpening).toEqual({ width: 38, height: 82.5 });

    const b = fresh('door', [move(p(60, 5)), typed({ width: 32 })]);
    const w = last(b.steps).save[0]!;
    expect(w.data.geometry.center).toEqual(p(58, 0));
    expect(offsetsOf(w)).toEqual({ left: 42, right: 70 });
  });

  it('EZD-211a R6 both offsets typed', () => {
    const both = (offsetLeft: number, offsetRight: number) =>
      last(fresh('door', [move(p(60, 5)), typed({ offsetLeft, offsetRight })]).steps);
    expect(both(36, 72).save[0]?.data.geometry.center).toEqual(p(54, 0));
    expect(both(36, 72.015625).save[0]?.data.geometry.center).toEqual(p(54, 0));
    for (const [l, r] of [
      [30, 30],
      [36, 72.0625],
    ] as const) {
      const s = both(l, r);
      expect(s.message, `${l}/${r}`).toBe('office.tools.opening.offsets_mismatch');
      expect(s.save, `${l}/${r}`).toEqual([]);
    }
  });

  it('EZD-211a R7 new door and window defaults', () => {
    const d = last(fresh('door', [move(p(60, 5)), ...click(p(60, 5))]).steps).save[0]!;
    expect(d.data.attributes.width).toBe(36);
    expect(d.data.attributes.height).toBe(80);
    expect(d.data.attributes.roughOpening).toEqual({ width: 38, height: 82.5 });
    expect(d.data.attributes.hand).toBe('left');
    expect(d.data.status).toBe('existing');

    const w = last(fresh('window', [move(p(60, 5)), ...click(p(60, 5))]).steps).save[0]!;
    expect(w.data.attributes.width).toBe(36);
    expect(w.data.attributes.height).toBe(48);
    expect(w.data.attributes.sillHeight).toBe(36);
    expect(w.data.attributes.roughOpening).toEqual({ width: 36.5, height: 48.5 });
    expect(w.data.attributes.swing).toBeNull();
    expect(w.data.attributes.hand).toBeNull();
  });

  it('EZD-211a R8 swing side and Space', () => {
    const a = fresh('door', [
      move(p(60, -5)),
      move(p(60, 5)),
      move(p(60, 0)),
      SPACE,
      ...click(p(60, 0)),
      SPACE,
    ]);
    expect(a.steps[0]!.state.preview?.attributes.swing).toBe('right');
    expect(a.steps[1]!.state.preview?.attributes.swing).toBe('left');
    expect(a.steps[2]!.state.preview?.attributes.swing).toBe('left');
    expect(a.steps[3]!.state.preview?.attributes.swing).toBe('right');
    expect(a.steps[3]!.state.preview?.geometry.center).toEqual(p(60, 0));
    const placed = a.steps[5]!;
    expect(placed.save[0]?.data.attributes.swing).toBe('right');
    expect(placed.state.flipped).toBe(false);
    const flip = a.steps[6]!;
    expect(flip.save).toHaveLength(1);
    expect(flip.save[0]!.data.attributes.swing).toBe('left');
    expect(flip.save[0]!.data.geometry.center).toEqual(p(60, 0));

    const w = fresh('window', [move(p(60, 5)), SPACE]);
    const ws = last(w.steps);
    expect(ws.save).toEqual([]);
    expect(ws.state.preview?.attributes.swing).toBeNull();
  });

  it('EZD-211a R9 ownership by click, typing, touch', () => {
    const a = fresh('door', [...click(p(54, 3)), move(p(54, 3)), move(p(100, 5))]);
    expect(a.steps[2]!.state.owned).not.toBeNull();
    expect(a.steps[2]!.state.preview).toBeNull();
    expect(a.steps[3]!.state.owned).toBeNull();
    expect(a.steps[3]!.state.preview?.geometry.center).toEqual(p(100, 0));

    const b = fresh('door', [
      move(p(60, 5)),
      typed({ offsetLeft: 36 }, p(0, 0)),
      move(p(54, 3), { screen: p(9, 0) }),
      move(p(54, 3), { screen: p(11, 0) }),
    ]);
    expect(b.steps[2]!.state.owned).not.toBeNull();
    const released = b.steps[3]!.state;
    expect(released.owned).toBeNull();
    expect(released.preview).toBeNull();
    expect(released.previewFailure).toBe('overlap');

    const t = { touch: true };
    const c = fresh('door', [...click(p(54, 0), t), ...click(p(54, 0), t), down(p(120, 0), t)]);
    expect(c.steps[3]!.state.owned).not.toBeNull();
    expect(c.steps[3]!.save).toEqual([]);
    expect(c.steps[4]!.state.owned).toBeNull();
    expect(c.steps[4]!.state.preview?.geometry.center).toEqual(p(120, 0));
  });

  it('EZD-211a R10 arc and dot on the owned door', () => {
    const placed = click(p(54, 3));
    const nudge = (q: Point) => p(q.x + 11 / PPI, q.y);

    const arc = last(fresh('door', [...placed, ...click(M)]).steps);
    expect(arc.save).toHaveLength(1);
    expect(arc.save[0]!.data.attributes.swing).toBe('right');
    expect(arc.save[0]!.data.geometry.center).toEqual(p(54, 0));

    const dot = last(fresh('door', [...placed, ...click(p(36, 0))]).steps);
    expect(dot.save).toHaveLength(1);
    expect(dot.save[0]!.data.attributes.hand).toBe('right');
    expect(dot.save[0]!.data.geometry.center).toEqual(p(54, 0));

    const dotDrag = fresh('door', [
      ...placed,
      down(p(36, 0)),
      move(p(40.125, 0)),
      up(p(40.125, 0)),
    ]);
    expect(toScreen(p(40.125, 0)).x - toScreen(p(36, 0)).x).toBeCloseTo(11, 9);
    expect(last(dotDrag.steps).save).toEqual([]);

    const arcDrag = fresh('door', [...placed, down(M), move(nudge(M)), up(nudge(M))]);
    expect(last(arcDrag.steps).save).toEqual([]);
  });

  it('EZD-211a R11 tablet press, drag, lift', () => {
    const t = { touch: true };
    const a = fresh('door', [
      down(p(30, 0), t),
      move(p(60, 0), t),
      move(p(90, 0), t),
      up(p(90, 0), t),
    ]);
    expect(a.steps[0]!.state.preview?.geometry.center).toEqual(p(30, 0));
    expect(a.steps[1]!.state.preview?.geometry.center).toEqual(p(60, 0));
    expect(a.steps[2]!.state.preview?.geometry.center).toEqual(p(90, 0));
    const lift = a.steps[3]!;
    expect(lift.save).toHaveLength(1);
    expect(lift.save[0]!.data.geometry.center).toEqual(p(90, 0));
    expect(offsetsOf(lift.save[0]!).left).toBe(72);
    expect(lift.state.owned?.mode).toBe('touch');

    const b = fresh('door', [down(p(30, 0), t), ptr('cancel', p(30, 0), t), up(p(30, 0), t)]);
    expect(b.steps[1]!.save).toEqual([]);
    expect(b.steps[1]!.state.preview).toBeNull();
    expect(b.steps[2]!.save).toEqual([]);

    const c = fresh('door', [down(p(30, 0), t), typed({ offsetLeft: 36 }), up(p(30, 0), t)]);
    expect(c.steps[1]!.save).toHaveLength(1);
    expect(c.steps[1]!.save[0]!.data.geometry.center).toEqual(p(54, 0));
    expect(c.steps[2]!.save).toEqual([]);
  });

  it('EZD-211a R12 no target, edge inputs, Esc', () => {
    const none = last(fresh('door', [typed({ offsetLeft: 36 })]).steps);
    expect(none.message).toBe('office.tools.opening.no_wall');

    const wide = last(fresh('door', [move(p(60, 5)), typed({ width: 150 })]).steps);
    expect(wide.message).toBe('office.tools.opening.past_corner');
    expect(wide.save).toEqual([]);

    const nulls = fresh('door', [move(p(60, 5)), typed({}), typed({})]);
    expect(nulls.steps[1]!.save).toHaveLength(1);
    expect(nulls.steps[1]!.save[0]!.data.geometry.center).toEqual(p(60, 0));
    expect(nulls.steps[2]!.save).toEqual([]);
    expect(nulls.steps[2]!.message).toBeNull();

    const unknown = fresh('door', [move(p(60, 5), { wallId: uid(99) }), ESCAPE]);
    expect(unknown.steps[0]!.state.preview).toBeNull();
    const esc = unknown.steps[1]!;
    expect(esc.exit).toBe(true);
    expect(esc.state).toEqual(initialOpeningToolState('door'));
  });
});
