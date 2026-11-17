// Move tool reducer, drag session, outcomes and preview (EZD-212b; vault/plans/EZD-212b.md D2-D5b; S03 Move; Q-0630
// rows 11, 35; Q-0570; Q-0633 G12). Pure: no React, no DOM.
// EZD-227 Build (AC-EZD-227-1): a lone blocking drags along its wall as a lone opening does (slideBlocking).
import {
  blockingHostUpdates,
  blockingPickShape,
  slideBlocking,
  type BlockingObject,
  moveSelection,
  openingHostUpdates,
  fixturePickShape,
  openingPickShape,
  tileShowerPickShape,
  utilityPointPickShape,
  pointsEqual,
  slideOpening,
  typedMoveDelta,
  wallPickShape,
  type ModelObject,
  type MoveSelectionResult,
  type OpeningObject,
  type PickShape,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';

// D3: equal to the selection controller's SAME_SPOT_PX (not imported: that would close an import cycle).
export const MOVE_DRAG_PX = 10;

type Refusal = Extract<MoveSelectionResult, { ok: false }>['reason'];

export const MOVE_REFUSALS: Readonly<Record<Refusal, MessageKey>> = {
  zero_length: 'office.tools.gap.zero_length',
  too_long: 'office.tools.gap.too_long',
  join_lost: 'office.tools.gap.join_lost',
  not_found: 'office.tools.move.failed',
  invalid_delta: 'office.tools.move.failed',
};

export type MoveToolState = {
  readonly base: Point | null;
  readonly ids: readonly string[];
  readonly held: 'none' | 'select' | 'base' | 'target';
  readonly at: Point | null;
};

export type MoveInput =
  | { type: 'press'; at: Point; selected: readonly string[]; picked: readonly string[] }
  | { type: 'move'; at: Point }
  | { type: 'release'; at: Point; dragged: boolean }
  | { type: 'typed'; distance: number | null }
  | { type: 'escape' }
  | { type: 'cancel' };

export type MoveCommit = { ids: readonly string[]; delta: Point; drag: boolean };

export type MoveStep = {
  state: MoveToolState;
  select: readonly string[] | null;
  commit: MoveCommit | null;
  message: MessageKey | null;
  exit: boolean;
};

export type MoveDrag = {
  ids: readonly string[];
  base: Point;
  original: OpeningObject | null;
  slide: OpeningObject | null;
  blockOriginal?: BlockingObject | null;
  blockSlide?: BlockingObject | null;
};

export type MoveOutcome = { ok: true; changed: ModelObject[] } | { ok: false; message: MessageKey };

export function initialMoveToolState(): MoveToolState {
  return { base: null, ids: [], held: 'none', at: null };
}

const lower = (id: string) => id.toLowerCase();

const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

const reset = (at: Point | null): MoveToolState => ({ ...initialMoveToolState(), at });

const step = (state: MoveToolState, more: Partial<Omit<MoveStep, 'state'>> = {}): MoveStep => ({
  state,
  select: null,
  commit: null,
  message: null,
  exit: false,
  ...more,
});

export function reduceMoveTool(state: MoveToolState, input: MoveInput): MoveStep {
  switch (input.type) {
    case 'press': {
      if (state.held !== 'none') return step(state);
      const at = input.at;
      if (state.base === null) {
        if (input.selected.length === 0) {
          const first = input.picked[0];
          if (first === undefined) return step({ ...state, at });
          return step({ base: at, ids: [first], held: 'select', at }, { select: [first] });
        }
        return step({ base: at, ids: input.selected, held: 'base', at });
      }
      return step({ ...state, held: 'target', at });
    }
    case 'move':
      return step({ ...state, at: input.at });
    case 'release': {
      const at = input.at;
      if (state.held === 'none' || state.base === null) return step({ ...state, at });
      const delta = minus(at, state.base);
      if (state.held === 'target')
        return step(reset(at), { commit: { ids: state.ids, delta, drag: false } });
      if (input.dragged) return step(reset(at), { commit: { ids: state.ids, delta, drag: true } });
      if (state.held === 'select') return step(reset(at));
      return step({ ...state, held: 'none', at });
    }
    case 'typed': {
      if (input.distance === null) return step(state);
      if (state.base === null) return step(state, { message: 'office.tools.move.click_base' });
      const d = typedMoveDelta(input.distance, minus(state.at ?? state.base, state.base));
      if (d === null) return step(state, { message: 'office.tools.move.no_direction' });
      return step(reset(state.at), { commit: { ids: state.ids, delta: d, drag: false } });
    }
    case 'escape':
      if (state.base === null && state.held === 'none') return step(state, { exit: true });
      return step(reset(state.at));
    case 'cancel':
      if (state.held !== 'none') return step(reset(state.at));
      return step(state);
  }
}

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const levelWalls = (objects: readonly ModelObject[], level: string): WallObject[] =>
  objects.filter((o): o is WallObject => isWall(o) && lower(o.data.level) === lower(level));

export function startMoveDrag(
  objects: readonly ModelObject[],
  ids: readonly string[],
  base: Point,
): MoveDrag {
  let lone: OpeningObject | null = null;
  let block: BlockingObject | null = null;
  if (ids.length === 1) {
    const id = lower(ids[0]!);
    const o = objects.find((x) => lower(x.id) === id);
    if (o !== undefined && o.type === 'opening') lone = o;
    if (o !== undefined && o.type === 'blocking') block = o;
  }
  if (block !== null)
    return { ids, base, original: null, slide: null, blockOriginal: block, blockSlide: block };
  return { ids, base, original: lone, slide: lone };
}

export function dragTo(
  drag: MoveDrag,
  i: { objects: readonly ModelObject[]; level: string; at: Point; captureIn: number },
): MoveDrag {
  const { slide, original } = drag;
  const bo = drag.blockOriginal ?? null;
  if (bo !== null) {
    const delta = minus(i.at, drag.base);
    const blockSlide = slideBlocking({
      blocking: drag.blockSlide ?? bo,
      objects: i.objects,
      target: { x: bo.data.geometry.center.x + delta.x, y: bo.data.geometry.center.y + delta.y },
      captureIn: i.captureIn,
    });
    return { ...drag, blockSlide };
  }
  if (slide === null || original === null) return drag;
  const delta = minus(i.at, drag.base);
  const c = slideOpening({
    opening: slide,
    objects: i.objects,
    target: {
      x: original.data.geometry.center.x + delta.x,
      y: original.data.geometry.center.y + delta.y,
    },
    captureIn: i.captureIn,
  });
  const moved: OpeningObject = {
    ...slide,
    data: { ...slide.data, geometry: { ...slide.data.geometry, center: c } },
  };
  const walls = levelWalls(i.objects, i.level);
  const next =
    openingHostUpdates({ level: i.level, walls, previousWalls: walls, openings: [moved] })[0] ??
    moved;
  return { ...drag, slide: next };
}

export function clickOutcome(
  objects: readonly ModelObject[],
  ids: readonly string[],
  delta: Point,
): MoveOutcome {
  const r = moveSelection(objects, ids, delta);
  if (r.ok) return { ok: true, changed: r.changed };
  return { ok: false, message: MOVE_REFUSALS[r.reason] };
}

export function dragOutcome(
  drag: MoveDrag,
  i: { objects: readonly ModelObject[]; at: Point },
): MoveOutcome {
  const { slide, original } = drag;
  const bo = drag.blockOriginal ?? null;
  const bs = drag.blockSlide ?? null;
  if (bo !== null && bs !== null) {
    const a = bs.data.geometry;
    const b = bo.data.geometry;
    const same =
      pointsEqual(a.center, b.center) &&
      (a.hostWallId === null ? null : lower(a.hostWallId)) ===
        (b.hostWallId === null ? null : lower(b.hostWallId));
    return { ok: true, changed: same ? [] : [bs] };
  }
  if (slide !== null && original !== null) {
    const a = slide.data.geometry;
    const b = original.data.geometry;
    const sameHost =
      (a.hostWallId === null ? null : lower(a.hostWallId)) ===
      (b.hostWallId === null ? null : lower(b.hostWallId));
    return { ok: true, changed: pointsEqual(a.center, b.center) && sameHost ? [] : [slide] };
  }
  return clickOutcome(i.objects, drag.ids, minus(i.at, drag.base));
}

export function previewShapes(
  objects: readonly ModelObject[],
  level: string,
  changed: readonly ModelObject[],
): PickShape[] {
  const byId = new Map(changed.map((o) => [lower(o.id), o]));
  const after = objects.map((o) => byId.get(lower(o.id)) ?? o);
  const afterWalls = levelWalls(after, level);
  const previousWalls = levelWalls(objects, level);
  const out: PickShape[] = [];
  for (const o of changed) {
    let shape: PickShape | null = null;
    if (o.type === 'wall') shape = wallPickShape(o);
    else if (o.type === 'fixture') shape = fixturePickShape(o);
    else if (o.type === 'utility_point') shape = utilityPointPickShape(o);
    else if (o.type === 'tile_shower') shape = tileShowerPickShape(o);
    else if (o.type === 'blocking') {
      const placed =
        blockingHostUpdates({ level, walls: afterWalls, previousWalls, blockings: [o] })[0] ?? o;
      const hostId = placed.data.geometry.hostWallId;
      const host =
        hostId === null ? null : (afterWalls.find((w) => lower(w.id) === lower(hostId)) ?? null);
      shape = blockingPickShape(placed, host);
    } else if (o.type === 'opening') {
      const placed =
        openingHostUpdates({ level, walls: afterWalls, previousWalls, openings: [o] })[0] ?? o;
      const hostId = placed.data.geometry.hostWallId;
      const host =
        hostId === null ? null : (afterWalls.find((w) => lower(w.id) === lower(hostId)) ?? null);
      shape = openingPickShape(placed, host);
    }
    if (shape !== null) out.push(shape);
  }
  return out;
}
