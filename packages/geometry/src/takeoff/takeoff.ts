// EZD-1611a (09i Takeoff rules, formulas table; S19 Takeoff; S15d Decision 6; Q-0697 03; 13a P3; 13b R8;
// vault/build/assumptions/EZD-1611a.md): the room-finish takeoff from the working model, by room and trade: floor and
// wall tile SF and boxes (tile showers included), drywall SF and sheets, paint SF and gallons (walls and ceilings),
// base trim and casing LF. Only New objects are counted; existing walls and rooms are used to measure; demolished
// objects are never counted. Every number the formulas name comes in through `TakeoffSettings` (the effective
// Defaults); a waste factor the owner has not entered is null, and the lines it feeds keep their quantity with no total
// and no order count ("Set in Defaults"), never 0%. Lengths are model inches, areas are summed in square inches and
// turned into SF or LF once; SF and LF round up to 0.1, boxes, sheets and gallons up to whole units. Object types and
// kinds the takeoff does not read give no line and no error. Pure: no DOM, no Node API.
import { NICHE_DEPTH_IN, frameToWorld, showerFrame, showerSide } from '../fixtures/tile-shower';
import { outlineAreaSqIn, pointInRing } from '../rooms/area';
import type { ModelObject, Point } from '../schema';
import { DEFAULT_WALL_TILE_HEIGHT, type TilePattern } from '../schema/tile-layout';
import { wallFaceLines, wallLength } from '../walls/wall';

export type TakeoffWasteMaterial = 'tile' | 'drywall' | 'paint' | 'trim';

export type TakeoffSettings = {
  // Percent per material (Defaults "Waste factors"), null when the owner has not entered it.
  waste: Readonly<Record<TakeoffWasteMaterial, number | null>>;
  // Extra percent per tile pattern (Defaults "Pattern adjustment"), null when not entered.
  pattern: Readonly<Record<TilePattern, number | null>>;
  // Defaults "Tile box coverage": SF per box (formulas table: 10 SF when the item has none).
  tileBoxSqFt: number;
  // Defaults "Drywall sheet": SF of one sheet (4 x 8 = 32 SF).
  drywallSheetSqFt: number;
  // Defaults "Paint coats" and "Paint coverage" (2 coats; 350 SF per gallon).
  paintCoats: number;
  paintSqFtPerGallon: number;
};

export const TAKEOFF_ITEMS = [
  'floor_tile',
  'wall_tile',
  'drywall',
  'paint_walls',
  'paint_ceiling',
  'base_trim',
  'casing',
] as const;
export type TakeoffItem = (typeof TAKEOFF_ITEMS)[number];
export type TakeoffTrade = 'tile' | 'drywall' | 'paint' | 'trim';

export const TAKEOFF_TRADE: Readonly<Record<TakeoffItem, TakeoffTrade>> = {
  floor_tile: 'tile',
  wall_tile: 'tile',
  drywall: 'drywall',
  paint_walls: 'paint',
  paint_ceiling: 'paint',
  base_trim: 'trim',
  casing: 'trim',
};

export type TakeoffLine = {
  // The room the line is in; null for "Not in a room".
  roomId: string | null;
  roomName: string | null;
  trade: TakeoffTrade;
  item: TakeoffItem;
  unit: 'SF' | 'LF';
  // The measured quantity before waste, up to 0.1.
  qty: number;
  // The waste the formula uses: null when it uses none (casing); pct null when the owner has not entered it.
  waste: { material: TakeoffWasteMaterial; pct: number | null } | null;
  // The quantity with waste, up to 0.1; null when the waste is not entered.
  total: number | null;
  // The order count (boxes, sheets, gallons), whole; value null when its waste is not entered.
  count: { unit: 'boxes' | 'sheets' | 'gallons'; value: number | null } | null;
  // The objects the line is measured from (EZD-1613 highlights them).
  sourceIds: string[];
};

const SQ_IN_PER_SQ_FT = 144;
const IN_PER_FT = 12;
// Openings larger than this come off the paint area (formulas table: "less openings over 20 SF").
export const PAINT_OPENING_MIN_SQ_IN = 20 * SQ_IN_PER_SQ_FT;
// How far off a wall face a room edge may sit and still be on it.
const ON_FACE_IN = 0.01;
// Float noise below this share of a value does not push it up to the next step.
const ROUND_MARGIN = 1e-9;

function roundUpTo(x: number, stepsPerUnit: number): number {
  const n = x * stepsPerUnit;
  const up = Math.ceil(n - ROUND_MARGIN * Math.max(1, Math.abs(n)));
  return up === 0 ? 0 : up / stepsPerUnit;
}
// Up to a whole unit (boxes, sheets, gallons), and up to 0.1 (SF, LF).
export const roundUpWhole = (x: number): number => roundUpTo(x, 1);
export const roundUpTenth = (x: number): number => roundUpTo(x, 10);

type Wall = Extract<ModelObject, { type: 'wall' }>;
type Opening = Extract<ModelObject, { type: 'opening' }>;
type Room = Extract<ModelObject, { type: 'room' }>;
type TileShower = Extract<ModelObject, { type: 'tile_shower' }>;
type TileLayout = Extract<ModelObject, { type: 'tile_layout' }>;
type Side = 'left' | 'right';

// One edge of a room outline and the wall face it lies on, if any, with the openings along it.
type RoomEdge = {
  a: Point;
  b: Point;
  length: number;
  face: { wall: Wall; side: Side } | null;
  openings: Opening[];
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isNew = (o: { data: { status: string } }) => o.data.status === 'new';
const notDemo = (o: { data: { status: string } }) => o.data.status !== 'demo';

function project(p: Point, a: Point, b: Point): { t: number; off: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  return {
    t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2,
    off: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(len2),
  };
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  const r = project(p, a, b);
  return r !== null && r.t >= 0 && r.t <= 1 && r.off <= ON_FACE_IN;
}

function roomEdges(room: Room, walls: readonly Wall[], openings: readonly Opening[]): RoomEdge[] {
  const ring = room.data.geometry.boundary;
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let face: RoomEdge['face'] = null;
    for (const wall of walls) {
      const lines = wallFaceLines(wall.data);
      const side = (['left', 'right'] as const).find((s) =>
        onSegment(mid, lines[s].start, lines[s].end),
      );
      if (side !== undefined) {
        face = { wall, side };
        break;
      }
    }
    const host = face?.wall.id ?? null;
    const on =
      host === null
        ? []
        : openings.filter((o) => {
            const h = o.data.geometry.hostWallId;
            const r = project(o.data.geometry.center, a, b);
            return h !== null && same(h, host) && r !== null && r.t > 0 && r.t < 1;
          });
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y), face, openings: on };
  });
}

// The opening's area inside the band from the floor to `height`.
function openingAreaBelow(o: Opening, height: number): number {
  const { width, height: h, sillHeight } = o.data.attributes;
  return width * Math.max(0, Math.min(sillHeight + h, height) - Math.max(sillHeight, 0));
}

type Placed = { id: string; at: Point; areaSqIn: number; isNew: boolean };

// The base-row cabinet boxes, each at the middle of its footprint (its depth runs off the run line to the side that
// is inside a room). Every base-row member takes its width along the run.
function baseBoxFootprints(objects: readonly ModelObject[], rooms: readonly Room[]): Placed[] {
  const byId = new Map(objects.map((o) => [o.id.toLowerCase(), o]));
  const inRoom = (p: Point) => rooms.some((r) => pointInRing(p, r.data.geometry.boundary));
  const out: Placed[] = [];
  for (const run of objects) {
    if (run.type !== 'cabinet_run') continue;
    const { start, axis } = run.data.geometry;
    let at = 0;
    for (const id of run.data.attributes.base) {
      const m = byId.get(id.toLowerCase());
      if (
        m === undefined ||
        (m.type !== 'cabinet_box' &&
          m.type !== 'cabinet_filler' &&
          m.type !== 'cabinet_panel' &&
          m.type !== 'cabinet_corner' &&
          m.type !== 'cabinet_shelf')
      )
        continue;
      const { width, depth } = m.data.attributes;
      const s = at + width / 2;
      at += width;
      if (m.type !== 'cabinet_box' || !notDemo(m)) continue;
      const mid = { x: start.x + axis.x * s, y: start.y + axis.y * s };
      const left = { x: mid.x - (axis.y * depth) / 2, y: mid.y + (axis.x * depth) / 2 };
      const right = { x: mid.x + (axis.y * depth) / 2, y: mid.y - (axis.x * depth) / 2 };
      out.push({
        id: m.id,
        at: inRoom(left) ? left : right,
        areaSqIn: width * depth,
        isNew: isNew(m),
      });
    }
  }
  return out;
}

function tubFootprints(objects: readonly ModelObject[]): Placed[] {
  return objects.flatMap((o) =>
    o.type === 'fixture' && o.data.attributes.kind === 'tub' && notDemo(o)
      ? [
          {
            id: o.id,
            at: o.data.geometry.center,
            areaSqIn: o.data.attributes.width * o.data.attributes.depth,
            isNew: isNew(o),
          },
        ]
      : [],
  );
}

function showerCentre(s: TileShower): Point {
  const f = showerFrame(s.data.geometry.footprint);
  return frameToWorld(f, { x: f.width / 2, y: f.depth / 2 });
}

// A tile shower's tiled faces in square inches (09i Wall tile "A tile shower adds its walls, niche faces, bench and
// curb"). Side 0 is the front (curb, glass or open entry) and has no wall; sides 1-3 are tiled to the wall tile height
// less any glass on them. A niche adds its four returns (its back replaces the opening); a bench adds its top, front
// and open end and covers the walls behind it; a curb adds its top and both faces.
export function tileShowerFacesSqIn(s: TileShower, tileHeight = DEFAULT_WALL_TILE_HEIGHT): number {
  const a = s.data.attributes;
  const fp = s.data.geometry.footprint;
  const glass = [0, 0, 0, 0];
  for (const g of a.glass) glass[g.side] = (glass[g.side] ?? 0) + g.length;
  let area = 0;
  for (let side = 1; side < 4; side++) {
    area += Math.max(0, showerSide(fp, side).length - (glass[side] ?? 0)) * tileHeight;
  }
  for (const n of a.niches) area += 2 * (n.width + n.height) * NICHE_DEPTH_IN;
  if (a.bench !== null) {
    const { width, depth, height } = a.bench;
    area += width * depth + width * height + depth * height;
    area -= Math.min(height, tileHeight) * (width + depth);
  }
  if (a.curb !== null) area += showerSide(fp, 0).length * (a.curb.width + 2 * a.curb.height);
  return area;
}

type LineRoom = { id: string; name: string } | null;
type Waste = { material: TakeoffWasteMaterial; pct: number | null } | null;
type Count = { unit: 'boxes' | 'sheets' | 'gallons'; per: number } | null;

// One line from its measured amount (SF or LF); the total and the count carry the waste.
function line(
  room: LineRoom,
  item: TakeoffItem,
  amount: number,
  waste: Waste,
  count: Count,
  sourceIds: Iterable<string>,
): TakeoffLine {
  const pct = waste === null ? 0 : waste.pct;
  const withWaste = pct === null ? null : (amount * (100 + pct)) / 100;
  return {
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    trade: TAKEOFF_TRADE[item],
    item,
    unit: item === 'base_trim' || item === 'casing' ? 'LF' : 'SF',
    qty: roundUpTenth(amount),
    waste,
    total: withWaste === null ? null : roundUpTenth(withWaste),
    count:
      count === null
        ? null
        : {
            unit: count.unit,
            value: withWaste === null ? null : roundUpWhole(withWaste / count.per),
          },
    sourceIds: [...sourceIds],
  };
}

type Acc = { amount: number; ids: string[] };
const addTo = <K>(map: Map<K, Acc>, key: K, amount: number, ids: readonly string[]) => {
  const acc = map.get(key) ?? { amount: 0, ids: [] };
  acc.amount += amount;
  for (const id of ids) if (!acc.ids.includes(id)) acc.ids.push(id);
  map.set(key, acc);
};

export function roomFinishTakeoff(
  objects: readonly ModelObject[],
  settings: TakeoffSettings,
): TakeoffLine[] {
  const walls = objects.filter((o): o is Wall => o.type === 'wall' && notDemo(o));
  // Doors and windows only: any other opening kind is not read at all (a later ticket adds its kind).
  const openings = objects.filter(
    (o): o is Opening =>
      o.type === 'opening' &&
      notDemo(o) &&
      (o.data.attributes.kind === 'door' || o.data.attributes.kind === 'window'),
  );
  const rooms = objects.filter((o): o is Room => o.type === 'room' && notDemo(o));
  const layouts = objects.filter((o): o is TileLayout => o.type === 'tile_layout' && isNew(o));
  const showers = objects.filter((o): o is TileShower => o.type === 'tile_shower' && isNew(o));
  const footprints = [...baseBoxFootprints(objects, rooms), ...tubFootprints(objects)];
  const edgesOf = new Map(rooms.map((r) => [r, roomEdges(r, walls, openings)]));
  const ring = (r: Room) => r.data.geometry.boundary;
  const edges = (r: Room) => edgesOf.get(r)!;
  const lineRoom = (r: Room | null): LineRoom =>
    r === null ? null : { id: r.id, name: r.data.attributes.name };
  const roomAt = (p: Point) => rooms.find((r) => pointInRing(p, ring(r))) ?? null;
  const onFace = (r: Room, wallId: string, side?: Side) =>
    edges(r).some(
      (e) =>
        e.face !== null &&
        same(e.face.wall.id, wallId) &&
        (side === undefined || e.face.side === side),
    );
  // A wall or an opening goes to the first room (model order) whose outline runs along it.
  const wallRoom = (w: Wall) => rooms.find((r) => onFace(r, w.id)) ?? null;
  const openingRooms = (o: Opening) =>
    rooms.filter((r) => edges(r).some((e) => e.openings.includes(o)));

  // A room has new work when it is New, it holds a New object, or its outline runs along a New wall or a wall with a
  // New opening.
  const wallsWithNewOpening = new Set(
    openings
      .filter(isNew)
      .flatMap((o) =>
        o.data.geometry.hostWallId === null ? [] : [o.data.geometry.hostWallId.toLowerCase()],
      ),
  );
  const workIn = new Set<Room>();
  for (const r of rooms) {
    const inside = (p: Point) => pointInRing(p, ring(r));
    const holds =
      objects.some((o) => o.type === 'fixture' && isNew(o) && inside(o.data.geometry.center)) ||
      showers.some((s) => inside(showerCentre(s))) ||
      layouts.some((t) => {
        const h = t.data.geometry.host;
        return h.kind === 'floor' ? same(h.roomId, r.id) : onFace(r, h.wallId, h.side);
      }) ||
      footprints.some((f) => f.isNew && inside(f.at));
    const alongNew = edges(r).some(
      (e) =>
        e.face !== null &&
        (isNew(e.face.wall) || wallsWithNewOpening.has(e.face.wall.id.toLowerCase())),
    );
    if (isNew(r) || holds || alongNew) workIn.add(r);
  }

  const perRoom = new Map<Room | null, TakeoffLine[]>();
  const push = (r: Room | null, l: TakeoffLine) => perRoom.set(r, [...(perRoom.get(r) ?? []), l]);
  const tileWaste = (pattern: TilePattern): Waste => {
    const base = settings.waste.tile;
    const extra = settings.pattern[pattern];
    return { material: 'tile', pct: base === null || extra === null ? null : base + extra };
  };
  const boxes: Count = { unit: 'boxes', per: settings.tileBoxSqFt };

  // Floor tile: the room floor less the footprint of base-row cabinet boxes and tubs, x (1 + tile waste + pattern).
  for (const t of layouts) {
    const h = t.data.geometry.host;
    if (h.kind !== 'floor') continue;
    const room = rooms.find((r) => same(r.id, h.roomId));
    if (room === undefined) continue;
    const ids = [t.id, room.id];
    let sqIn = outlineAreaSqIn(ring(room));
    for (const f of footprints) {
      if (!pointInRing(f.at, ring(room))) continue;
      sqIn -= f.areaSqIn;
      ids.push(f.id);
    }
    const sf = Math.max(0, sqIn) / SQ_IN_PER_SQ_FT;
    push(
      room,
      line(lineRoom(room), 'floor_tile', sf, tileWaste(t.data.attributes.pattern), boxes, ids),
    );
  }

  // Wall tile: each face marked for tile, from the floor to its set height, less openings, x (1 + waste + pattern).
  for (const t of layouts) {
    const h = t.data.geometry.host;
    if (h.kind !== 'wall') continue;
    const wall = walls.find((w) => same(w.id, h.wallId));
    if (wall === undefined) continue;
    const height = Math.min(h.height, wall.data.attributes.height);
    const byRoom = new Map<Room | null, Acc>();
    for (const r of rooms) {
      for (const e of edges(r)) {
        if (e.face === null || e.face.wall !== wall || e.face.side !== h.side) continue;
        const cut = e.openings.filter((o) => openingAreaBelow(o, height) > 0);
        const sqIn = e.length * height - cut.reduce((s, o) => s + openingAreaBelow(o, height), 0);
        addTo(byRoom, r, sqIn, [t.id, wall.id, ...cut.map((o) => o.id)]);
      }
    }
    if (byRoom.size === 0) {
      // A face in no room: the wall's whole line, less its openings.
      const cut = openings.filter(
        (o) =>
          o.data.geometry.hostWallId !== null &&
          same(o.data.geometry.hostWallId, wall.id) &&
          openingAreaBelow(o, height) > 0,
      );
      const sqIn =
        wallLength(wall.data.geometry) * height -
        cut.reduce((s, o) => s + openingAreaBelow(o, height), 0);
      addTo(byRoom, null, sqIn, [t.id, wall.id, ...cut.map((o) => o.id)]);
    }
    for (const [r, acc] of byRoom) {
      const sf = Math.max(0, acc.amount) / SQ_IN_PER_SQ_FT;
      push(
        r,
        line(lineRoom(r), 'wall_tile', sf, tileWaste(t.data.attributes.pattern), boxes, acc.ids),
      );
    }
  }

  // Tile showers: their walls, niche faces, bench and curb (a straight lay).
  for (const s of showers) {
    const r = roomAt(showerCentre(s));
    const sf = tileShowerFacesSqIn(s) / SQ_IN_PER_SQ_FT;
    push(r, line(lineRoom(r), 'wall_tile', sf, tileWaste('straight'), boxes, [s.id]));
  }

  // Drywall: each drywall face of a New wall, its full length x height, in the wall's room; plus the ceiling of each
  // New room; x (1 + drywall waste) / sheet area.
  const dry = new Map<Room | null, Acc>();
  for (const w of walls) {
    if (!isNew(w)) continue;
    const layers = w.data.attributes.layers;
    const faces = [layers[0], layers[layers.length - 1]].filter(
      (l) => l?.material === 'drywall',
    ).length;
    if (faces > 0)
      addTo(dry, wallRoom(w), faces * wallLength(w.data.geometry) * w.data.attributes.height, [
        w.id,
      ]);
  }
  for (const r of rooms) if (isNew(r)) addTo(dry, r, outlineAreaSqIn(ring(r)), [r.id]);
  const drywallWaste: Waste = { material: 'drywall', pct: settings.waste.drywall };
  const sheets: Count = { unit: 'sheets', per: settings.drywallSheetSqFt };
  for (const [r, acc] of dry) {
    push(
      r,
      line(lineRoom(r), 'drywall', acc.amount / SQ_IN_PER_SQ_FT, drywallWaste, sheets, acc.ids),
    );
  }

  // Casing: New doors and windows, 2 x height + width per trimmed side, in the opening's room. A door has two sides
  // when rooms lie on both its faces, else one; a window one. Other opening kinds get none.
  const casing = new Map<Room, Acc>();
  for (const o of openings) {
    const { kind, height, width } = o.data.attributes;
    if (!isNew(o)) continue;
    const on = openingRooms(o);
    if (on.length === 0) continue;
    const sides = kind === 'door' && on.length > 1 ? 2 : 1;
    addTo(casing, on[0]!, sides * (2 * height + width), [o.id]);
  }

  // Paint: gallons = SF x coats x (1 + paint waste) / coverage.
  const paintWaste: Waste = { material: 'paint', pct: settings.waste.paint };
  const gallons: Count = {
    unit: 'gallons',
    per: settings.paintSqFtPerGallon / settings.paintCoats,
  };
  const trimWaste: Waste = { material: 'trim', pct: settings.waste.trim };
  for (const r of rooms) {
    const room = lineRoom(r);
    if (workIn.has(r)) {
      // Walls: each face around the room, to the room's ceiling height at that wall (or the wall's, when lower), less
      // openings over 20 SF.
      const paint = new Map<null, Acc>();
      addTo(paint, null, 0, [r.id]);
      for (const e of edges(r)) {
        if (e.face === null) continue;
        const wall = e.face.wall;
        const ceiling = r.data.attributes.ceiling?.wallHeights.find((x) =>
          same(x.wall, wall.id),
        )?.height;
        addTo(paint, null, e.length * Math.min(ceiling ?? Infinity, wall.data.attributes.height), [
          wall.id,
        ]);
        for (const o of e.openings) {
          const a = o.data.attributes.width * o.data.attributes.height;
          if (a > PAINT_OPENING_MIN_SQ_IN) addTo(paint, null, -a, [o.id]);
        }
      }
      const p = paint.get(null)!;
      push(
        r,
        line(
          room,
          'paint_walls',
          Math.max(0, p.amount) / SQ_IN_PER_SQ_FT,
          paintWaste,
          gallons,
          p.ids,
        ),
      );
      // Ceiling: the room's ceiling.
      push(
        r,
        line(
          room,
          'paint_ceiling',
          outlineAreaSqIn(ring(r)) / SQ_IN_PER_SQ_FT,
          paintWaste,
          gallons,
          [r.id],
        ),
      );
      // Base trim: the room perimeter less the widths of doors on it, x (1 + trim waste).
      const base = new Map<null, Acc>();
      addTo(base, null, 0, [r.id]);
      for (const e of edges(r)) {
        addTo(base, null, e.length, []);
        for (const o of e.openings) {
          if (o.data.attributes.kind === 'door')
            addTo(base, null, -o.data.attributes.width, [o.id]);
        }
      }
      const b = base.get(null)!;
      push(r, line(room, 'base_trim', Math.max(0, b.amount) / IN_PER_FT, trimWaste, null, b.ids));
    }
    const c = casing.get(r);
    if (c !== undefined) push(r, line(room, 'casing', c.amount / IN_PER_FT, null, null, c.ids));
  }

  // Rooms in model order, then "Not in a room"; in each, lines in the formulas table's order.
  const out: TakeoffLine[] = [];
  for (const key of [...rooms, null]) {
    const list = perRoom.get(key) ?? [];
    out.push(
      ...list
        .map((l, i) => ({ l, i }))
        .sort(
          (x, y) => TAKEOFF_ITEMS.indexOf(x.l.item) - TAKEOFF_ITEMS.indexOf(y.l.item) || x.i - y.i,
        )
        .map((x) => x.l),
    );
  }
  return out;
}
