// EZD-404 (S04 Layout "plan strip of the run against its wall; Elevation A of the same run with uppers, countertop,
// toe kick, chain dimensions (widths) and height dimensions"; S04 Data shown; AC-EZD-404-2; vault/build/assumptions.md
// EZD-404): where each member of a cabinet run stands in the plan strip and the elevation. Positions run along the
// run's axis from its start (x, inches); heights are from the floor (y up, inches). The chain is the base row's widths
// in order, walked from the same list as `cabinetRunTotal`, so it adds to the run total. Nothing is rounded (03g).
// EZD-733 (AC-EZD-733-1 "Changing the start point moves the cuts on the elevation"; vault/build/assumptions.md
// EZD-733): the tile layout on the face of the host wall the run stands against, drawn in the elevation's x and y.
import type { CabinetFaceLayout, CabinetRow, ModelObject, Point, TileWallSide } from '../schema';
import { tileLayoutRegion, tileSpecOf, wallTileLayout, type TileLayoutObject } from '../tile/hosts';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { tilePieces, type TilePiece, type TileSpec } from '../tile/layout';
import {
  cabinetRowMembers,
  cabinetRunTotal,
  objectLookup,
  type CabinetRun,
  type CabinetRunMember,
} from './run';
import { dot, sub } from '../vec';

// Board S04's height dimensions: 34 1/2" boxes (S04 Height) under a 36" countertop top, an 18" gap, 30" uppers.
// The 1 1/2" countertop and the 18" gap are the board's; the 4" toe kick when the run has no toe kick trim and the
// 6" drawer face are not in the spec (assumptions.md EZD-404).
export const CABINET_COUNTERTOP_THICKNESS = 1.5;
export const CABINET_BACKSPLASH_GAP = 18;
export const CABINET_DEFAULT_TOE_KICK = 4;
export const CABINET_DRAWER_FACE_HEIGHT = 6;

export type CabinetSlotKind = 'box' | 'filler' | 'panel' | 'corner' | 'shelf';
export type CabinetFaceKind = 'door' | 'drawer' | 'false_drawer' | 'panel';

// One face on the elevation, in the same x and y as its slot.
export type CabinetFace = {
  kind: CabinetFaceKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CabinetSlot = {
  id: string;
  row: CabinetRow;
  kind: CabinetSlotKind;
  code: string;
  // A box's type (S04 Data shown); null for fillers, panels, corners and shelves.
  boxType: string | null;
  x: number;
  width: number;
  depth: number;
  // Elevation: the box stands from `bottom` to `top`.
  bottom: number;
  top: number;
  faces: CabinetFace[];
};

export type CabinetChainLink = { id: string; x: number; width: number };
export type CabinetHeightDim = { kind: 'upper' | 'gap' | 'base'; from: number; to: number };
export type CabinetSpan = { x: number; width: number };
export type CabinetWindow = { id: string; x: number; width: number; bottom: number; top: number };

export type CabinetRunLayout = {
  base: CabinetSlot[];
  upper: CabinetSlot[];
  chain: CabinetChainLink[];
  total: number;
  toeKick: (CabinetSpan & { height: number }) | null;
  countertops: (CabinetSpan & { bottom: number; top: number })[];
  heights: CabinetHeightDim[];
  windows: CabinetWindow[];
  // The host wall's extent along the run axis, from the run start; null for a run off every wall.
  wall: { from: number; to: number } | null;
  // EZD-733: the face of the host wall the run stands against, and its tile layout; null for a run off every wall.
  face: CabinetWallFace | null;
  tile: CabinetTile | null;
};

// The host wall face in the elevation: x = offset + along * (distance along the wall from its start point).
export type CabinetWallFace = { wallId: string; side: TileWallSide; offset: number; along: 1 | -1 };

// A tile layout in the elevation's x and y: its pieces (cut ones marked) and its start point.
export type CabinetTile = {
  id: string;
  spec: TileSpec;
  pieces: TilePiece[];
  tooMany: boolean;
  start: Point;
  height: number;
};

const lower = (s: string) => s.toLowerCase();

function slotKind(m: CabinetRunMember): CabinetSlotKind {
  switch (m.type) {
    case 'cabinet_box':
      return 'box';
    case 'cabinet_filler':
      return 'filler';
    case 'cabinet_panel':
      return 'panel';
    case 'cabinet_corner':
      return 'corner';
    case 'cabinet_shelf':
      return 'shelf';
  }
}

// The door and drawer faces a layout draws inside the face area (S04 Face > Layout; "elevation redraws").
export function cabinetFaces(
  layout: CabinetFaceLayout,
  x: number,
  bottom: number,
  width: number,
  height: number,
): CabinetFace[] {
  const face = (
    kind: CabinetFaceKind,
    fx: number,
    y: number,
    w: number,
    h: number,
  ): CabinetFace => ({
    kind,
    x: fx,
    y,
    width: w,
    height: h,
  });
  const doors = (count: 1 | 2, h: number): CabinetFace[] =>
    count === 1
      ? [face('door', x, bottom, width, h)]
      : [face('door', x, bottom, width / 2, h), face('door', x + width / 2, bottom, width / 2, h)];
  const drawer = Math.min(CABINET_DRAWER_FACE_HEIGHT, height / 2);
  const topDrawer = (kind: CabinetFaceKind) =>
    face(kind, x, bottom + height - drawer, width, drawer);
  const stack = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      face('drawer', x, bottom + (height * i) / n, width, height / n),
    );
  switch (layout) {
    case 'door_1':
      return doors(1, height);
    case 'doors_2':
      return doors(2, height);
    case 'drawer_door_1':
      return [topDrawer('drawer'), ...doors(1, height - drawer)];
    case 'drawer_doors_2':
      return [topDrawer('drawer'), ...doors(2, height - drawer)];
    case 'false_drawer_door_1':
      return [topDrawer('false_drawer'), ...doors(1, height - drawer)];
    case 'false_drawer_doors_2':
      return [topDrawer('false_drawer'), ...doors(2, height - drawer)];
    case 'drawers_2':
      return stack(2);
    case 'drawers_3':
      return stack(3);
    case 'drawers_4':
      return stack(4);
    case 'open':
      return [];
    case 'panel':
      return [face('panel', x, bottom, width, height)];
  }
}

function slotsOf(
  members: CabinetRunMember[],
  row: CabinetRow,
  bottomOf: (m: CabinetRunMember) => number,
): CabinetSlot[] {
  let x = 0;
  return members.map((m) => {
    const a = m.data.attributes;
    const bottom = bottomOf(m);
    const top = row === 'base' ? a.height : bottom + a.height;
    const faceH = Math.max(top - bottom, 0);
    const faces =
      m.type === 'cabinet_box'
        ? cabinetFaces(m.data.attributes.faceLayout, x, bottom, a.width, faceH)
        : m.type === 'cabinet_filler' || m.type === 'cabinet_panel' || m.type === 'cabinet_corner'
          ? [{ kind: 'panel' as const, x, y: bottom, width: a.width, height: faceH }]
          : [];
    const slot: CabinetSlot = {
      id: m.id,
      row,
      kind: slotKind(m),
      code: a.code,
      boxType: m.type === 'cabinet_box' ? m.data.attributes.boxType : null,
      x,
      width: a.width,
      depth: a.depth,
      bottom,
      top,
      faces,
    };
    x += a.width;
    return slot;
  });
}

const isTall = (s: CabinetSlot) => s.boxType === 'tall';

// The run's plan strip and elevation. `objects` is the model (or the open floor): members, trim, the host wall and
// its windows are read from it.
export function cabinetRunLayout(
  run: CabinetRun,
  objects: readonly ModelObject[],
): CabinetRunLayout {
  const lookup = objectLookup(objects);
  const runId = lower(run.id);
  const toeKickTrim = objects.find(
    (o) =>
      o.type === 'cabinet_trim' &&
      o.data.attributes.kind === 'toe_kick' &&
      o.data.geometry.row === 'base' &&
      lower(o.data.geometry.runId) === runId,
  );
  const toeKick =
    toeKickTrim !== undefined && toeKickTrim.type === 'cabinet_trim'
      ? toeKickTrim.data.attributes.height
      : CABINET_DEFAULT_TOE_KICK;

  const baseMembers = cabinetRowMembers(run, 'base', lookup);
  const base = slotsOf(baseMembers, 'base', () => toeKick);
  const counterBase = base.filter((s) => !isTall(s));
  const baseTop = counterBase.reduce((h, s) => Math.max(h, s.top), 0);
  const counterTop = counterBase.length > 0 ? baseTop + CABINET_COUNTERTOP_THICKNESS : 0;
  const upperBottom = (counterBase.length > 0 ? counterTop : 0) + CABINET_BACKSPLASH_GAP;
  const upper = slotsOf(cabinetRowMembers(run, 'upper', lookup), 'upper', () => upperBottom);

  // The countertop covers each stretch of base boxes between tall boxes.
  const countertops: CabinetRunLayout['countertops'] = [];
  for (const s of base) {
    if (isTall(s)) continue;
    const last = countertops[countertops.length - 1];
    if (last !== undefined && Math.abs(last.x + last.width - s.x) < 1e-9) last.width += s.width;
    else countertops.push({ x: s.x, width: s.width, bottom: baseTop, top: counterTop });
  }

  const total = cabinetRunTotal(run, lookup);
  const heights: CabinetHeightDim[] = [];
  if (counterBase.length > 0) heights.push({ kind: 'base', from: 0, to: counterTop });
  if (upper.length > 0) {
    const upperTop = upper.reduce((h, s) => Math.max(h, s.top), upperBottom);
    heights.push({ kind: 'gap', from: counterBase.length > 0 ? counterTop : 0, to: upperBottom });
    heights.push({ kind: 'upper', from: upperBottom, to: upperTop });
  }

  const { start, axis, hostWallId } = run.data.geometry;
  let wall: CabinetRunLayout['wall'] = null;
  let face: CabinetWallFace | null = null;
  let tile: CabinetTile | null = null;
  const windows: CabinetWindow[] = [];
  const host = hostWallId === null ? null : lookup(hostWallId);
  if (host !== null && host.type === 'wall') {
    const a = dot(sub(host.data.geometry.start, start), axis);
    const b = dot(sub(host.data.geometry.end, start), axis);
    wall = { from: Math.min(a, b), to: Math.max(a, b) };
    face = wallFace(
      host.id,
      host.data.geometry.start,
      host.data.geometry.end,
      host.data.attributes.thicknessSide,
      start,
      axis,
    );
    const layout = wallTileLayout(objects, host.id, face.side);
    if (layout !== null) tile = elevationTile(layout, objects, face);
    const hostKey = lower(host.id);
    for (const o of objects) {
      if (o.type !== 'opening' || o.data.attributes.kind !== 'window') continue;
      if (o.data.geometry.hostWallId === null || lower(o.data.geometry.hostWallId) !== hostKey)
        continue;
      const at = dot(sub(o.data.geometry.center, start), axis);
      const w = o.data.attributes.width;
      const bottom = o.data.attributes.sillHeight;
      windows.push({
        id: o.id,
        x: at - w / 2,
        width: w,
        bottom,
        top: bottom + o.data.attributes.height,
      });
    }
  }

  return {
    base,
    upper,
    chain: base.map((s) => ({ id: s.id, x: s.x, width: s.width })),
    total,
    toeKick: base.length > 0 ? { x: 0, width: total, height: toeKick } : null,
    countertops,
    heights,
    windows,
    wall,
    face,
    tile,
  };
}

// The face of the wall the run stands against (walking the wall start to end, left is the left normal), and how a
// distance along the wall maps to the run's x. A run started off the wall's line stands on the face on that side; one
// started on the line (the drawn finished face, Q-0559) stands on the side away from the wall's thickness.
function wallFace(
  wallId: string,
  wallStart: Point,
  wallEnd: Point,
  thicknessSide: 'left' | 'right' | 'center',
  runStart: Point,
  axis: Point,
): CabinetWallFace {
  const len = Math.hypot(wallEnd.x - wallStart.x, wallEnd.y - wallStart.y);
  const d =
    len > 0 ? { x: (wallEnd.x - wallStart.x) / len, y: (wallEnd.y - wallStart.y) / len } : axis;
  const left = { x: -d.y, y: d.x };
  const across = dot(sub(runStart, wallStart), left);
  const side: TileWallSide =
    across > COMPARISON_TOLERANCE_IN
      ? 'left'
      : across < -COMPARISON_TOLERANCE_IN
        ? 'right'
        : thicknessSide === 'left'
          ? 'right'
          : 'left';
  return {
    wallId,
    side,
    offset: dot(sub(wallStart, runStart), axis),
    along: dot(d, axis) >= 0 ? 1 : -1,
  };
}

const toElevation = (face: CabinetWallFace, p: Point): Point => ({
  x: face.offset + face.along * p.x,
  y: p.y,
});

function elevationTile(
  t: TileLayoutObject,
  objects: readonly ModelObject[],
  face: CabinetWallFace,
): CabinetTile | null {
  const region = tileLayoutRegion(t, objects);
  if (region === null || t.data.geometry.host.kind !== 'wall') return null;
  // Laid out in the elevation's own x and y, so the start point is the lower-left corner of a whole tile as the
  // elevation shows it, whichever way the wall was drawn (a mirrored layout would start one joint off).
  const start = toElevation(face, t.data.geometry.start);
  const r = tilePieces(
    region.map((q) => toElevation(face, q)),
    tileSpecOf(t),
    start,
  );
  return {
    id: t.id,
    spec: { ...t.data.attributes },
    pieces: r.pieces,
    tooMany: r.tooMany,
    start,
    height: t.data.geometry.host.height,
  };
}

// The wall-frame start point for a start point typed or dragged in the elevation's x and y.
export const wallStartFromElevation = (face: CabinetWallFace, p: Point): Point => ({
  x: (p.x - face.offset) * face.along,
  y: p.y,
});

// R24: an interior elevation for every wall that hosts a cabinet run. Letters go A, B, C ... in the order the walls'
// first runs appear in the model; a run off every wall has an elevation of its own (assumptions.md EZD-404).
export function cabinetElevationLetter(run: CabinetRun, objects: readonly ModelObject[]): string {
  const keyOf = (r: CabinetRun) => lower(r.data.geometry.hostWallId ?? r.id);
  const keys: string[] = [];
  for (const o of objects) {
    if (o.type !== 'cabinet_run') continue;
    const k = keyOf(o);
    if (!keys.includes(k)) keys.push(k);
  }
  let i = keys.indexOf(keyOf(run));
  if (i < 0) i = keys.length;
  let letter = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}
