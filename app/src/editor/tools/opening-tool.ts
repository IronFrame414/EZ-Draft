// Door and window tool reducer (EZD-211a; vault/plans/EZD-211a.md section 1 Decided "Reducer" to "Edge inputs",
// section 3; S03 Door, Window; Q-0625 (a); Q-0630 09 rows 3, 14; Q-0633 row 2; Q-0634; Q-0636; Q-0640 row 6;
// Q-0641 rows 2, 3; Q-0642 row 1; Q-0643 (c)). Pure: no React, no DOM; never snaps (the pointer is projected on the
// host wall).
import {
  coordsEqual,
  DEFAULT_DOOR_SIZE,
  DEFAULT_WINDOW_SIZE,
  DOOR_TARGET_PX,
  doorTargetAt,
  flipHand,
  flipSwing,
  hostCorners,
  numberNewObjects,
  openingOffsets,
  openingOwnedAt,
  openingPreview,
  placeAtOffset,
  PRESS_MOVE_PX,
  SNAP_CAPTURE_PX,
  wallLength,
  withOpeningSize,
  type NumberHighs,
  type OpeningData,
  type OpeningFailure,
  type OpeningObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { TypedValues } from '../typed-entry/typed-entry';

export type OpeningInput =
  | {
      type: 'pointer';
      kind: 'down' | 'move' | 'up' | 'cancel';
      at: Point;
      screen: Point;
      touch: boolean;
      wallId: string | null;
    }
  | { type: 'typed'; values: TypedValues; screen: Point | null }
  | { type: 'space' }
  | { type: 'escape' };

export type OpeningContext = {
  newId: () => string;
  walls: readonly WallObject[];
  openings: readonly OpeningObject[];
  highs: NumberHighs;
  pixelsPerInch: number;
};

export type Owned = { id: string; mode: 'pointer' | 'typed' | 'touch'; at: Point | null };

export type OpeningPress = {
  screen: Point;
  host: string | null;
  target: 'arc' | 'dot' | 'owned' | null;
  moved: boolean;
};

export type OpeningToolState = {
  kind: 'door' | 'window';
  preview: OpeningData | null;
  previewFailure: OpeningFailure | null;
  flipped: boolean;
  owned: Owned | null;
  press: OpeningPress | null;
};

export type OpeningStep = {
  state: OpeningToolState;
  save: OpeningObject[];
  select: string | null;
  message: MessageKey | null;
  exit: boolean;
};

type PointerInput = Extract<OpeningInput, { type: 'pointer' }>;
type TypedInput = Extract<OpeningInput, { type: 'typed' }>;

export function initialOpeningToolState(kind: 'door' | 'window'): OpeningToolState {
  return { kind, preview: null, previewFailure: null, flipped: false, owned: null, press: null };
}

const step = (
  state: OpeningToolState,
  save: OpeningObject[] = [],
  select: string | null = null,
  message: MessageKey | null = null,
  exit = false,
): OpeningStep => ({ state, save, select, message, exit });

const lower = (id: string) => id.toLowerCase();
const screenDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function wallById(ctx: OpeningContext, id: string | null): WallObject | null {
  if (id === null) return null;
  return ctx.walls.find((w) => lower(w.id) === lower(id)) ?? null;
}

function openingById(ctx: OpeningContext, id: string): OpeningObject | null {
  return ctx.openings.find((o) => lower(o.id) === lower(id)) ?? null;
}

const hostOf = (o: OpeningObject, ctx: OpeningContext) => wallById(ctx, o.data.geometry.hostWallId);

function failureMessage(reason: OpeningFailure | null): MessageKey {
  if (reason === 'past_corner') return 'office.tools.opening.past_corner';
  if (reason === 'overlap') return 'office.tools.opening.overlap';
  return 'office.tools.opening.no_wall';
}

const defaultWidth = (kind: 'door' | 'window') =>
  kind === 'door' ? DEFAULT_DOOR_SIZE.width : DEFAULT_WINDOW_SIZE.width;

// The preview on `host` at `at` with the kind's default width (D:Hover).
function previewOn(
  state: OpeningToolState,
  host: WallObject | null,
  at: Point,
  ctx: OpeningContext,
): OpeningToolState {
  if (host === null) return { ...state, preview: null, previewFailure: null };
  const r = openingPreview({
    kind: state.kind,
    host,
    walls: ctx.walls,
    openings: ctx.openings,
    point: at,
    width: defaultWidth(state.kind),
    flipped: state.flipped,
  });
  return r.ok
    ? { ...state, preview: r.data, previewFailure: null }
    : { ...state, preview: null, previewFailure: r.reason };
}

const ownTol = (ctx: OpeningContext) => SNAP_CAPTURE_PX / ctx.pixelsPerInch;
const targetTol = (ctx: OpeningContext) => DOOR_TARGET_PX / ctx.pixelsPerInch;

// D:Release, at a pointer move with no press and at every down.
function released(
  state: OpeningToolState,
  owned: OpeningObject | null,
  input: PointerInput,
  ctx: OpeningContext,
): boolean {
  const o = state.owned;
  if (o === null || owned === null) return false;
  const ownedAt = () =>
    openingOwnedAt(owned, hostOf(owned, ctx), input.at, ownTol(ctx), targetTol(ctx));
  switch (o.mode) {
    case 'pointer':
      return !input.touch && !ownedAt();
    case 'typed':
      return o.at === null || screenDistance(input.screen, o.at) > PRESS_MOVE_PX;
    case 'touch':
      return (
        input.kind === 'down' && input.touch && wallById(ctx, input.wallId) !== null && !ownedAt()
      );
  }
}

// D:Place.
function place(
  state: OpeningToolState,
  data: OpeningData,
  mode: Owned['mode'],
  at: Point | null,
  ctx: OpeningContext,
): OpeningStep {
  const id = ctx.newId();
  const obj = numberNewObjects<OpeningObject>([{ id, type: 'opening', data }], ctx.highs)
    .objects[0]!;
  return step(
    {
      ...state,
      preview: null,
      previewFailure: null,
      flipped: false,
      owned: { id, mode, at: at === null ? null : { x: at.x, y: at.y } },
      press: null,
    },
    [obj],
    id,
  );
}

function pointer(
  state: OpeningToolState,
  owned: OpeningObject | null,
  input: PointerInput,
  ctx: OpeningContext,
): OpeningStep {
  const press = state.press;
  switch (input.kind) {
    case 'cancel':
      return step({ ...state, press: null, preview: null, previewFailure: null });
    case 'move': {
      if (press !== null) {
        const moved = press.moved || screenDistance(input.screen, press.screen) > PRESS_MOVE_PX;
        const next = { ...state, press: { ...press, moved } };
        if (press.host === null) return step(next);
        return step(previewOn(next, wallById(ctx, press.host), input.at, ctx));
      }
      if (input.touch) return step(state);
      if (released(state, owned, input, ctx)) {
        state = { ...state, owned: null };
        owned = null;
      }
      if (owned !== null) return step({ ...state, preview: null, previewFailure: null });
      return step(previewOn(state, wallById(ctx, input.wallId), input.at, ctx));
    }
    case 'down': {
      if (released(state, owned, input, ctx)) {
        state = { ...state, owned: null };
        owned = null;
      }
      const base = { screen: { x: input.screen.x, y: input.screen.y }, moved: false };
      if (owned !== null) {
        const host = hostOf(owned, ctx);
        const hit = doorTargetAt(owned, host, input.at, targetTol(ctx));
        if (hit !== null) return step({ ...state, press: { ...base, host: null, target: hit } });
        if (openingOwnedAt(owned, host, input.at, ownTol(ctx), targetTol(ctx)))
          return step({ ...state, press: { ...base, host: null, target: 'owned' } });
      }
      const wall = wallById(ctx, input.wallId);
      if (wall !== null) {
        const next = previewOn(state, wall, input.at, ctx);
        return step({ ...next, press: { ...base, host: wall.id, target: null } });
      }
      return step({
        ...state,
        preview: null,
        previewFailure: null,
        press: { ...base, host: null, target: null },
      });
    }
    case 'up': {
      if (press === null) return step(state);
      const cleared = { ...state, press: null };
      if (press.target === 'arc' || press.target === 'dot') {
        if (press.moved || owned === null) return step(cleared);
        const flipped = press.target === 'arc' ? flipSwing(owned) : flipHand(owned);
        return step(cleared, flipped === null ? [] : [flipped]);
      }
      if (press.target === 'owned' || press.host === null) return step(cleared);
      if (state.preview !== null)
        return place(cleared, state.preview, input.touch ? 'touch' : 'pointer', null, ctx);
      return step(cleared, [], null, failureMessage(state.previewFailure));
    }
  }
}

const valueOf = (values: TypedValues, key: string): number | null => values[key] ?? null;

// The bay (D:openingPreview rule) around the target center: its low and high corner positions.
function bayAround(
  host: WallObject,
  walls: readonly WallObject[],
  center: Point,
): { lo: number; hi: number } | null {
  const corners = hostCorners(host, walls);
  if (corners.length < 2) return null;
  const line = host.data.geometry;
  const L = wallLength(line);
  const d = { x: (line.end.x - line.start.x) / L, y: (line.end.y - line.start.y) / L };
  const along = (center.x - line.start.x) * d.x + (center.y - line.start.y) * d.y;
  const s = Math.min(L, Math.max(0, along));
  let k = 0;
  corners.forEach((c, j) => {
    if (c.at <= s) k = j;
  });
  k = Math.min(Math.max(k, 0), corners.length - 2);
  return { lo: corners[k]!.at, hi: corners[k + 1]!.at };
}

function typed(
  state: OpeningToolState,
  owned: OpeningObject | null,
  input: TypedInput,
  ctx: OpeningContext,
): OpeningStep {
  const s = { ...state, press: null };
  const target: OpeningData | null = owned !== null ? owned.data : s.preview;
  if (target === null) return step(s, [], null, 'office.tools.opening.no_wall');
  const host = wallById(ctx, target.geometry.hostWallId);
  if (host === null) return step(s, [], null, 'office.tools.opening.no_wall');

  const left = valueOf(input.values, 'offsetLeft');
  const right = valueOf(input.values, 'offsetRight');
  const width = valueOf(input.values, 'width');
  if (left === null && right === null && width === null) {
    if (owned !== null) return step(s);
    return place(s, target, 'typed', input.screen, ctx);
  }
  const w = width ?? target.attributes.width;
  const center = target.geometry.center;

  let side: 'left' | 'right';
  let offset: number;
  if (left !== null && right !== null) {
    const bay = bayAround(host, ctx.walls, center);
    if (bay === null || !coordsEqual(left + w + right, bay.hi - bay.lo))
      return step(s, [], null, 'office.tools.opening.offsets_mismatch');
    side = 'left';
    offset = left;
  } else if (left !== null) {
    side = 'left';
    offset = left;
  } else if (right !== null) {
    side = 'right';
    offset = right;
  } else {
    const wrapped: OpeningObject = owned ?? { id: 'preview', type: 'opening', data: target };
    const off = openingOffsets(wrapped, host, ctx.walls);
    if (off === null) return step(s, [], null, 'office.tools.opening.no_wall');
    side = 'left';
    offset = off.left;
  }

  const r = placeAtOffset({
    host,
    walls: ctx.walls,
    openings: ctx.openings,
    width: w,
    near: center,
    side,
    offset,
    ignoreId: owned === null ? null : owned.id,
  });
  if (!r.ok) return step(s, [], null, failureMessage(r.reason));
  const data = withOpeningSize(
    { ...target, geometry: { ...target.geometry, center: r.center } },
    { width: w, height: target.attributes.height },
  );
  if (owned === null) return place(s, data, 'typed', input.screen, ctx);
  return step(s, [{ id: owned.id, type: 'opening', data }]);
}

export function reduceOpeningTool(
  state: OpeningToolState,
  input: OpeningInput,
  ctx: OpeningContext,
): OpeningStep {
  const owned = state.owned === null ? null : openingById(ctx, state.owned.id);
  const s: OpeningToolState =
    owned === null && state.owned !== null ? { ...state, owned: null } : state;
  switch (input.type) {
    case 'pointer':
      return pointer(s, owned, input, ctx);
    case 'typed':
      return typed(s, owned, input, ctx);
    case 'space': {
      if (owned !== null && owned.data.attributes.kind === 'door') {
        const flipped = flipSwing(owned);
        return step(s, flipped === null ? [] : [flipped]);
      }
      const p = s.preview;
      if (s.kind === 'door' && p !== null && p.attributes.swing !== null) {
        const swing = p.attributes.swing === 'left' ? 'right' : 'left';
        return step({
          ...s,
          flipped: !s.flipped,
          preview: { ...p, attributes: { ...p.attributes, swing } },
        });
      }
      return step(s);
    }
    case 'escape':
      return step(initialOpeningToolState(s.kind), [], null, null, true);
  }
}
