// EZD-1611b (09i Takeoff rules: "Countertops | SF per piece and exposed edge LF, as on screen 04b", "Cabinets,
// fixtures, devices | Counts by code or size, by type and by device type", "Wire | Per circuit: the path along walls
// from the panel to the first device and on to each next device, plus the rise from each device height to the ceiling
// and back down, x (1 + slack) | Slack 15%"; vault/build/assumptions/EZD-1611b.md): the takeoff's countertop, cabinet,
// fixture, device and wire lines, by room and trade, from the working model. New objects only, as the room finishes
// (EZD-1611a); Existing walls and rooms are used to measure; Demo is never counted. Count lines carry a key (piece
// label, cabinet code, fixture kind, device kind, circuit id), never display text; the Takeoff screen (EZD-1613)
// names them. Pure: no DOM, no Node API.
import { countertopScheduleRows } from '../countertops/schedule';
import { pointInRing } from '../rooms/area';
import type { DeviceKind, ModelObject, Point } from '../schema';
import type { FixtureKind } from '../schema';
import { ceilingHeightAt, ceilingSurface } from '../scene3d/ceiling-mesh';
import { dist } from '../vec';
import { DEFAULT_WALL_HEIGHT_IN } from '../walls/wall';
import {
  roomFinishTakeoff,
  roundUpTenth,
  roundUpWhole,
  type TakeoffLine,
  type TakeoffSettings,
} from './takeoff';

export type TakeoffCountSettings = {
  // Defaults "Waste factors > Countertop" (percent), null when the owner has not entered it.
  countertopWaste: number | null;
  // Defaults "Wire slack" (percent; formulas table 15%).
  wireSlack: number | null;
};

export const TAKEOFF_COUNT_ITEMS = [
  'countertop',
  'countertop_edge',
  'cabinet',
  'fixture',
  'device',
  'wire',
] as const;
export type TakeoffCountItem = (typeof TAKEOFF_COUNT_ITEMS)[number];
export type TakeoffCountTrade = 'countertops' | 'cabinets' | 'fixtures' | 'electrical';

export const TAKEOFF_COUNT_TRADE: Readonly<Record<TakeoffCountItem, TakeoffCountTrade>> = {
  countertop: 'countertops',
  countertop_edge: 'countertops',
  cabinet: 'cabinets',
  fixture: 'fixtures',
  device: 'electrical',
  wire: 'electrical',
};

export type TakeoffCountLine = {
  roomId: string | null;
  roomName: string | null;
  trade: TakeoffCountTrade;
  item: TakeoffCountItem;
  // What the line counts: the piece label, the cabinet code (as first met in run order), the fixture or device kind,
  // or the circuit id.
  key: string;
  unit: 'SF' | 'LF' | 'EA';
  // The measured quantity before waste or slack: SF and LF up to 0.1, counts whole.
  qty: number;
  // Countertop SF carry the countertop waste and wire its slack; null when the line has none. pct null: not entered.
  waste: { material: 'countertop' | 'wire'; pct: number | null } | null;
  // With waste or slack: SF up to 0.1, wire up to whole feet; null when the percent is not entered.
  total: number | null;
  // No order unit for these lines (no slab size in the spec or Defaults).
  count: null;
  sourceIds: string[];
};

// The fixture and device kinds the takeoff counts, in line order (assumptions EZD-1611a "Object types takeoff does not
// know", EZD-1611b "Cabinets, fixtures, devices"): a kind not listed gives no line; the ticket that adds a kind adds it
// here.
export const TAKEOFF_FIXTURE_KINDS = [
  'toilet',
  'lavatory',
  'tub',
  'shower_prefab',
  'sink',
  'cooktop',
  'range',
  'hood',
  'refrigerator',
  'dishwasher',
  'disposal',
  'washer',
  'dryer',
  'water_heater',
] as const satisfies readonly FixtureKind[];
export const TAKEOFF_DEVICE_KINDS = [
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'recessed_light',
  'ceiling_fan',
  'speaker',
  'camera',
  'wifi_ap',
  'receptacle_duplex',
  'receptacle_240v',
  'switch_single',
  'switch_3way',
  'switch_dimmer',
  'data',
  'tv',
  'doorbell',
] as const satisfies readonly DeviceKind[];

// No height on the panel object: the wire starts 60" above the floor (assumptions EZD-1611b; the settled example).
export const WIRE_PANEL_HEIGHT_IN = 60;
// A device with no height typed: wall devices at their usual height, ceiling devices at the ceiling (no rise).
export const DEVICE_USUAL_HEIGHT_IN: Readonly<Record<DeviceKind, number | 'ceiling'>> = {
  smoke_detector: 'ceiling',
  co_detector: 'ceiling',
  smoke_co_detector: 'ceiling',
  recessed_light: 'ceiling',
  ceiling_fan: 'ceiling',
  speaker: 'ceiling',
  camera: 'ceiling',
  wifi_ap: 'ceiling',
  receptacle_duplex: 16,
  receptacle_240v: 16,
  switch_single: 48,
  switch_3way: 48,
  switch_dimmer: 48,
  data: 16,
  tv: 16,
  doorbell: 48,
};

type Wall = Extract<ModelObject, { type: 'wall' }>;
type Room = Extract<ModelObject, { type: 'room' }>;
type Device = Extract<ModelObject, { type: 'device' }>;
type Panel = Extract<ModelObject, { type: 'panel' }>;
type Circuit = Extract<ModelObject, { type: 'circuit' }>;
type Piece = Extract<ModelObject, { type: 'countertop_piece' }>;

const SQ_IN_PER_SQ_FT = 144;
const IN_PER_FT = 12;
// Two points this close are one node of the wall path.
const JOIN_IN = 0.01;

const key = (id: string) => id.toLowerCase();
const isNew = (o: { data: { status: string } }) => o.data.status === 'new';
const notDemo = (o: { data: { status: string } }) => o.data.status !== 'demo';

// The area centroid of an outline (its vertex average when it has no area).
function centroid(ring: readonly Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  });
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length);
    return {
      x: ring.reduce((s, p) => s + p.x, 0) / n,
      y: ring.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

// The point on segment a-b nearest p, and how far along (0..1).
function nearestOn(p: Point, a: Point, b: Point): { at: Point; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { at: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

type Snap = { wall: Wall; at: Point };

// The point taken to its nearest wall line (centre line) among `walls`; null with no walls.
function snapToWall(p: Point, walls: readonly Wall[]): Snap | null {
  let best: Snap | null = null;
  let bestD = Infinity;
  for (const w of walls) {
    const { at } = nearestOn(p, w.data.geometry.start, w.data.geometry.end);
    const d = dist(p, at);
    if (d < bestD - 1e-9) {
      best = { wall: w, at };
      bestD = d;
    }
  }
  return best;
}

// The shortest path along wall lines from one snapped point to another. Walls join where an end of one meets the other
// (a shared end, or an end on the other's line: a T). Null when no joined path reaches.
function wallPathIn(from: Snap, to: Snap, walls: readonly Wall[]): number | null {
  const nodeKey = (p: Point) => `${Math.round(p.x / JOIN_IN)},${Math.round(p.y / JOIN_IN)}`;
  const adj = new Map<string, Map<string, number>>();
  const link = (a: Point, b: Point) => {
    const ka = nodeKey(a);
    const kb = nodeKey(b);
    if (ka === kb) return;
    const d = dist(a, b);
    for (const [x, y] of [
      [ka, kb],
      [kb, ka],
    ] as const) {
      const m = adj.get(x) ?? new Map<string, number>();
      m.set(y, Math.min(m.get(y) ?? Infinity, d));
      adj.set(x, m);
    }
  };
  const ends = walls.flatMap((w) => [w.data.geometry.start, w.data.geometry.end]);
  for (const w of walls) {
    const { start, end } = w.data.geometry;
    const on: { p: Point; t: number }[] = [
      { p: start, t: 0 },
      { p: end, t: 1 },
    ];
    for (const e of ends) {
      const n = nearestOn(e, start, end);
      if (dist(n.at, e) <= JOIN_IN) on.push({ p: e, t: n.t });
    }
    for (const s of [from, to]) {
      if (s.wall === w) on.push({ p: s.at, t: nearestOn(s.at, start, end).t });
    }
    on.sort((x, y) => x.t - y.t);
    for (let i = 1; i < on.length; i++) link(on[i - 1]!.p, on[i]!.p);
  }
  const src = nodeKey(from.at);
  const dst = nodeKey(to.at);
  if (src === dst) return 0;
  // Dijkstra over the few nodes a plan has.
  const best = new Map<string, number>([[src, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let curD = Infinity;
    for (const [k, d] of best) {
      if (!done.has(k) && d < curD) {
        cur = k;
        curD = d;
      }
    }
    if (cur === null) return null;
    if (cur === dst) return curD;
    done.add(cur);
    for (const [next, d] of adj.get(cur) ?? []) {
      if (curD + d < (best.get(next) ?? Infinity)) best.set(next, curD + d);
    }
  }
}

type Stop = { point: Point; level: string; height: number | 'ceiling' };

export function countTakeoff(
  objects: readonly ModelObject[],
  settings: TakeoffCountSettings,
): TakeoffCountLine[] {
  const rooms = objects.filter((o): o is Room => o.type === 'room' && notDemo(o));
  const walls = objects.filter((o): o is Wall => o.type === 'wall' && notDemo(o));
  const byId = new Map(objects.map((o) => [key(o.id), o]));
  // The room on the object's own level that holds the point (rooms on other floors are never matched).
  const roomAt = (p: Point, level: string) =>
    rooms.find(
      (r) => key(r.data.level) === key(level) && pointInRing(p, r.data.geometry.boundary),
    ) ?? null;

  type Acc = {
    room: Room | null;
    item: TakeoffCountItem;
    key: string;
    order: number;
    line: TakeoffCountLine;
  };
  const accs = new Map<string, Acc>();
  const lineRoom = (r: Room | null) => ({
    roomId: r?.id ?? null,
    roomName: r?.data.attributes.name ?? null,
  });
  const countOne = (
    room: Room | null,
    item: 'cabinet' | 'fixture' | 'device',
    k: string,
    groupKey: string,
    order: number,
    id: string,
  ) => {
    const ak = `${room?.id ?? ''}|${item}|${groupKey}`;
    let acc = accs.get(ak);
    if (acc === undefined) {
      acc = {
        room,
        item,
        key: k,
        order,
        line: {
          ...lineRoom(room),
          trade: TAKEOFF_COUNT_TRADE[item],
          item,
          key: k,
          unit: 'EA',
          qty: 0,
          waste: null,
          total: 0,
          count: null,
          sourceIds: [],
        },
      };
      accs.set(ak, acc);
    }
    acc.line.qty += 1;
    acc.line.total = acc.line.qty;
    acc.line.sourceIds.push(id);
  };
  const place = (
    room: Room | null,
    item: TakeoffCountItem,
    k: string,
    order: number,
    line: TakeoffCountLine,
  ) => accs.set(`${room?.id ?? ''}|${item}|${accs.size}`, { room, item, key: k, order, line });

  // Countertops: SF per New piece (x (1 + countertop waste)) and its exposed edge LF, in the room holding its centroid.
  const pieces = objects
    .filter((o): o is Piece => o.type === 'countertop_piece' && isNew(o))
    .sort((a, b) => {
      const p = a.data.attributes.label;
      const q = b.data.attributes.label;
      return p.length - q.length || (p < q ? -1 : p > q ? 1 : 0);
    });
  const ctWaste = settings.countertopWaste;
  pieces.forEach((p, i) => {
    const row = countertopScheduleRows([p.data])[0]!;
    const room = roomAt(centroid(p.data.geometry.outline), p.data.level);
    const sf = row.areaSqIn / SQ_IN_PER_SQ_FT;
    place(room, 'countertop', row.label, i, {
      ...lineRoom(room),
      trade: 'countertops',
      item: 'countertop',
      key: row.label,
      unit: 'SF',
      qty: roundUpTenth(sf),
      waste: { material: 'countertop', pct: ctWaste },
      total: ctWaste === null ? null : roundUpTenth((sf * (100 + ctWaste)) / 100),
      count: null,
      sourceIds: [p.id],
    });
    const lf = roundUpTenth(row.edgeIn / IN_PER_FT);
    place(room, 'countertop_edge', row.label, i, {
      ...lineRoom(room),
      trade: 'countertops',
      item: 'countertop_edge',
      key: row.label,
      unit: 'LF',
      qty: lf,
      waste: null,
      total: lf,
      count: null,
      sourceIds: [p.id],
    });
  });

  // Cabinets: New boxes and fillers by code (EZD-409's grouping: trimmed, case ignored), in the room holding the
  // middle of the member's footprint (its depth off the run line, to the side that is inside a room).
  for (const run of objects) {
    if (run.type !== 'cabinet_run') continue;
    const { start, axis } = run.data.geometry;
    for (const row of [run.data.attributes.base, run.data.attributes.upper]) {
      let at = 0;
      for (const id of row) {
        const m = byId.get(key(id));
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
        if ((m.type !== 'cabinet_box' && m.type !== 'cabinet_filler') || !isNew(m)) continue;
        const mid = { x: start.x + axis.x * s, y: start.y + axis.y * s };
        const left = { x: mid.x - (axis.y * depth) / 2, y: mid.y + (axis.x * depth) / 2 };
        const right = { x: mid.x + (axis.y * depth) / 2, y: mid.y - (axis.x * depth) / 2 };
        const code = m.data.attributes.code.trim();
        const lvl = run.data.level;
        countOne(
          roomAt(left, lvl) ?? roomAt(right, lvl),
          'cabinet',
          code,
          code.toUpperCase(),
          0,
          m.id,
        );
      }
    }
  }

  // Fixtures by kind and devices by device type, New only, in the room holding the fixture's centre or the device.
  for (const o of objects) {
    if (o.type === 'fixture' && isNew(o)) {
      const kind = o.data.attributes.kind;
      const at = (TAKEOFF_FIXTURE_KINDS as readonly string[]).indexOf(kind);
      if (at < 0) continue;
      countOne(roomAt(o.data.geometry.center, o.data.level), 'fixture', kind, kind, at, o.id);
    } else if (o.type === 'device' && isNew(o)) {
      const kind = o.data.attributes.kind;
      const at = (TAKEOFF_DEVICE_KINDS as readonly string[]).indexOf(kind);
      if (at < 0) continue;
      countOne(roomAt(o.data.geometry.point, o.data.level), 'device', kind, kind, at, o.id);
    }
  }

  // Wire: per New circuit, from its panel through its devices in the circuit's stored order (devices on it with no
  // place in the order follow in model order), along the walls, plus the rises, x (1 + slack); in the room of its
  // first device.
  const panels = objects.filter((o): o is Panel => o.type === 'panel' && notDemo(o));
  const devices = objects.filter((o): o is Device => o.type === 'device' && notDemo(o));
  const circuits = objects
    .filter((o): o is Circuit => o.type === 'circuit' && isNew(o))
    .map((c, i) => {
      const panel = panels.find((p) => key(p.id) === key(c.data.attributes.panel)) ?? null;
      return { c, i, panel, p: panel === null ? Infinity : panels.indexOf(panel) };
    })
    .sort(
      (x, y) => x.p - y.p || x.c.data.attributes.space - y.c.data.attributes.space || x.i - y.i,
    );
  const ceilingAt = (s: Stop, snap: Snap | null) => {
    const room = roomAt(s.point, s.level);
    if (room !== null)
      return ceilingHeightAt(
        ceilingSurface(
          room,
          walls.filter((w) => key(w.data.level) === key(s.level)),
        ),
        s.point,
      );
    return snap?.wall.data.attributes.height ?? DEFAULT_WALL_HEIGHT_IN;
  };
  const slack = settings.wireSlack;
  circuits.forEach(({ c, panel }, i) => {
    const on = devices.filter((d) => {
      const ck = d.data.attributes.circuit;
      return ck !== undefined && ck !== null && key(ck) === key(c.id);
    });
    const ordered: Device[] = [];
    for (const id of c.data.attributes.order ?? []) {
      const d = on.find((x) => key(x.id) === key(id));
      if (d !== undefined && !ordered.includes(d)) ordered.push(d);
    }
    for (const d of on) if (!ordered.includes(d)) ordered.push(d);
    if (ordered.length === 0) return;
    const stops: Stop[] = [
      ...(panel === null
        ? []
        : [
            {
              point: panel.data.geometry.point,
              level: panel.data.level,
              height: WIRE_PANEL_HEIGHT_IN,
            },
          ]),
      ...ordered.map((d) => ({
        point: d.data.geometry.point,
        level: d.data.level,
        height: d.data.attributes.height ?? DEVICE_USUAL_HEIGHT_IN[d.data.attributes.kind],
      })),
    ];
    const snaps = stops.map((s) =>
      snapToWall(
        s.point,
        walls.filter((w) => key(w.data.level) === key(s.level)),
      ),
    );
    let inches = 0;
    for (let k = 1; k < stops.length; k++) {
      const a = stops[k - 1]!;
      const b = stops[k]!;
      const sa = snaps[k - 1]!;
      const sb = snaps[k]!;
      const along =
        sa !== null && sb !== null && key(a.level) === key(b.level)
          ? wallPathIn(
              sa,
              sb,
              walls.filter((w) => key(w.data.level) === key(a.level)),
            )
          : null;
      inches += along ?? dist(a.point, b.point);
    }
    stops.forEach((s, k) => {
      if (s.height === 'ceiling') return;
      const rise = Math.max(0, ceilingAt(s, snaps[k]!) - s.height);
      // The panel's wire goes up once; each device's comes down to it and goes back up.
      inches += panel !== null && k === 0 ? rise : 2 * rise;
    });
    const lf = inches / IN_PER_FT;
    const room = roomAt(ordered[0]!.data.geometry.point, ordered[0]!.data.level);
    place(room, 'wire', c.id, i, {
      ...lineRoom(room),
      trade: 'electrical',
      item: 'wire',
      key: c.id,
      unit: 'LF',
      qty: roundUpTenth(lf),
      waste: { material: 'wire', pct: slack },
      total: slack === null ? null : roundUpWhole((lf * (100 + slack)) / 100),
      count: null,
      sourceIds: [c.id, ...(panel === null ? [] : [panel.id]), ...ordered.map((d) => d.id)],
    });
  });

  // Rooms in model order, then "Not in a room"; in each, the formulas table's order; in each item, label order
  // (countertops), EZD-409's code order (cabinets), the kind lists' order, or panel then space (wire).
  const codeOrder = (p: string, q: string) =>
    p.toUpperCase().localeCompare(q.toUpperCase(), 'en', { numeric: true }) || p.localeCompare(q);
  const all = [...accs.values()];
  const out: TakeoffCountLine[] = [];
  for (const r of [...rooms, null]) {
    out.push(
      ...all
        .filter((a) => a.room === r)
        .sort(
          (x, y) =>
            TAKEOFF_COUNT_ITEMS.indexOf(x.item) - TAKEOFF_COUNT_ITEMS.indexOf(y.item) ||
            (x.item === 'cabinet' ? codeOrder(x.key, y.key) : x.order - y.order),
        )
        .map((a) => a.line),
    );
  }
  return out;
}

export type TakeoffAllSettings = TakeoffSettings & TakeoffCountSettings;
export type TakeoffAnyLine = TakeoffLine | TakeoffCountLine;

// The whole takeoff: per room (model order, then "Not in a room"), the room-finish lines (EZD-1611a) and then these,
// so every room keeps the formulas table's order.
export function takeoff(
  objects: readonly ModelObject[],
  settings: TakeoffAllSettings,
): TakeoffAnyLine[] {
  const finishes = roomFinishTakeoff(objects, settings);
  const counts = countTakeoff(objects, settings);
  const roomIds: (string | null)[] = [];
  for (const l of [...finishes, ...counts]) if (!roomIds.includes(l.roomId)) roomIds.push(l.roomId);
  const order = (id: string | null) =>
    id === null ? Infinity : objects.findIndex((o) => o.id === id);
  roomIds.sort((a, b) => order(a) - order(b));
  return roomIds.flatMap((id) => [
    ...finishes.filter((l) => l.roomId === id),
    ...counts.filter((l) => l.roomId === id),
  ]);
}
