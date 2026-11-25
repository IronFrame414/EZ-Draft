// EZD-605 (S06 Controls "Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures
// (dashed). | Same."; S05 Controls "Switching zones | ... | Edit model. Zones sync to switch legs on the electrical
// plan."; 03f:13 "switch legs"; AC-EZD-605-1 "Editing a zone on the RCP updates the switch leg, and the reverse.";
// vault/build/assumptions.md EZD-605): switch legs and their sync with switching zones. A switch stores the zone it
// controls (device `zone`); its leg runs to the lights and fans inside that zone's outline, worked out every time, so
// there is one copy of which lights a switch controls:
// - zone to leg: a zone's outline is the leg's lights; its Dimmer edit turns its single switches into dimmers and back.
// - leg to zone: a light added to a leg joins the zone holding it, widens the switch's zone to take it in, or starts a
//   new zone around it in its room.
// Each edit is one change set, so one undo step. Pure: no React, no DOM.
import {
  CURRENT_SCHEMA_VERSION,
  FIXTURE_TYPE_DEVICE_KINDS,
  outlineAreaSqIn,
  parseStoredObject,
  pointInRing,
  type DeviceData,
  type DrawingItem,
  type ModelObject,
  type ObjectStatus,
  type Point,
  type SwitchZoneData,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';
import { roomAt } from '../tools/beam-edits';
import { idKey, sameId } from '../shared/ids';

export const SWITCH_KINDS: readonly string[] = ['switch_single', 'switch_3way', 'switch_dimmer'];
/** The devices a switch leg runs to: lights and fans (the fixture kinds of the ceiling plan). */
export const LEG_FIXTURE_KINDS: readonly string[] = FIXTURE_TYPE_DEVICE_KINDS;
/** Half the side of the square a new zone draws around a light, and the room a widened zone leaves around it (in). */
export const LEG_ZONE_MARGIN_IN = 12;
/** The switch leg's dash and gap in model inches: the zone outline's "4 3" (board S05Ceiling), so the two match. */
export const LEG_DASH_IN: readonly number[] = [4, 3];

type Device = { id: string; data: DeviceData };
type Zone = { id: string; data: SwitchZoneData };

function parsed(objects: Objects, type: 'device' | 'switch_zone'): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    if (v.type !== type) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

function devices(objects: Objects): Device[] {
  return parsed(objects, 'device').flatMap((o) => (o.type === 'device' ? [o] : []));
}

function zones(objects: Objects): Zone[] {
  return parsed(objects, 'switch_zone').flatMap((o) => (o.type === 'switch_zone' ? [o] : []));
}

const isSwitch = (d: Device) => SWITCH_KINDS.includes(d.data.attributes.kind);
const isLegFixture = (d: Device) => LEG_FIXTURE_KINDS.includes(d.data.attributes.kind);

function find<T extends { id: string }>(list: readonly T[], id: string): T | undefined {
  const key = idKey(id);
  return list.find((o) => idKey(o.id) === key);
}

/** The lights and fans inside a zone's outline on its own floor, in stored order. */
export function zoneFixtureIds(objects: Objects, zone: Zone): string[] {
  const level = idKey(zone.data.level);
  return devices(objects)
    .filter(
      (d) =>
        isLegFixture(d) &&
        idKey(d.data.level) === level &&
        pointInRing(d.data.geometry.point, zone.data.geometry.boundary),
    )
    .map((d) => d.id);
}

export type SwitchLeg = { switchId: string; zoneId: string; level: string; fixtureIds: string[] };

/** Every switch leg: each switch whose zone is stored, with the lights inside that zone. */
export function switchLegs(objects: Objects): SwitchLeg[] {
  const all = zones(objects);
  const out: SwitchLeg[] = [];
  for (const d of devices(objects)) {
    const zoneId = d.data.attributes.zone;
    if (!isSwitch(d) || typeof zoneId !== 'string') continue;
    const zone = find(all, zoneId);
    if (zone === undefined) continue;
    out.push({
      switchId: d.id,
      zoneId: zone.id,
      level: d.data.level,
      fixtureIds: zoneFixtureIds(objects, zone),
    });
  }
  return out;
}

/** One switch's leg, or null when it has none. */
export function switchLegOf(objects: Objects, switchId: string): SwitchLeg | null {
  return switchLegs(objects).find((l) => sameId(l.switchId, switchId)) ?? null;
}

function store(type: 'device' | 'switch_zone', id: string, data: unknown): Change | null {
  const r = parseStoredObject({ id, type, schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!r.ok) return null;
  return {
    id,
    value: {
      type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

/** The kind a switch takes under a zone's dimmer: single and dimmer follow it; a 3-way stays a 3-way. */
export function switchKindFor(kind: string, dimmer: boolean): string {
  if (kind === 'switch_3way') return kind;
  return dimmer ? 'switch_dimmer' : 'switch_single';
}

/**
 * Zone to leg: the zone's Dimmer edit with its switches following it, as one change set. Null when the zone is gone,
 * already set so, or a change is refused.
 */
export function zoneDimmerChanges(
  objects: Objects,
  zoneId: string,
  dimmer: boolean,
): Change[] | null {
  const zone = find(zones(objects), zoneId);
  if (zone === undefined || zone.data.attributes.dimmer === dimmer) return null;
  const changes: (Change | null)[] = [
    store('switch_zone', zone.id, {
      ...zone.data,
      attributes: { ...zone.data.attributes, dimmer },
    }),
  ];
  for (const d of devices(objects)) {
    const z = d.data.attributes.zone;
    if (!isSwitch(d) || typeof z !== 'string' || !sameId(z, zone.id)) continue;
    const kind = switchKindFor(d.data.attributes.kind, dimmer);
    if (kind === d.data.attributes.kind) continue;
    changes.push(store('device', d.id, { ...d.data, attributes: { ...d.data.attributes, kind } }));
  }
  return changes.every((c): c is Change => c !== null) ? changes : null;
}

/** The convex hull of the points, counter-clockwise (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: readonly Point[]) => {
    const h: Point[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(ps), ...half([...ps].reverse())];
}

/** The square a new zone draws around a light, counter-clockwise. */
export function squareAround(at: Point, half: number = LEG_ZONE_MARGIN_IN): Point[] {
  return [
    { x: at.x - half, y: at.y - half },
    { x: at.x + half, y: at.y - half },
    { x: at.x + half, y: at.y + half },
    { x: at.x - half, y: at.y + half },
  ];
}

export type LegEditResult =
  | { ok: true; changes: Change[] }
  | { ok: false; reason: 'not_switch' | 'not_fixture' | 'no_room' | 'failed' };

/**
 * Leg to zone: adds a light (or fan) to a switch's leg. A light already on it changes nothing. A light inside a zone
 * puts the switch on that zone, the switch taking the zone's dimmer. A light in no zone widens the switch's zone, when
 * it is in the same room, to the hull of its outline and the square around the light; otherwise a new zone of that
 * square starts in the light's room, with the switch's dimmer, and the switch moves to it.
 */
export function addToLeg(
  objects: Objects,
  switchId: string,
  fixtureId: string,
  ctx: { status: ObjectStatus; newId: () => string },
): LegEditResult {
  const all = devices(objects);
  const sw = find(all, switchId);
  if (sw === undefined || !isSwitch(sw)) return { ok: false, reason: 'not_switch' };
  const fx = find(all, fixtureId);
  if (fx === undefined || !isLegFixture(fx)) return { ok: false, reason: 'not_fixture' };
  if (!sameId(fx.data.level, sw.data.level)) return { ok: false, reason: 'failed' };
  const leg = switchLegOf(objects, sw.id);
  if (leg !== null && leg.fixtureIds.some((id) => sameId(id, fx.id)))
    return { ok: true, changes: [] };
  const at = fx.data.geometry.point;
  const level = idKey(fx.data.level);
  const allZones = zones(objects);
  const done = (changes: (Change | null)[]): LegEditResult =>
    changes.every((c): c is Change => c !== null)
      ? { ok: true, changes }
      : { ok: false, reason: 'failed' };
  const linkSwitch = (zoneId: string, dimmer: boolean) =>
    store('device', sw.id, {
      ...sw.data,
      attributes: {
        ...sw.data.attributes,
        zone: zoneId,
        kind: switchKindFor(sw.data.attributes.kind, dimmer),
      },
    });

  // The smallest zone on the floor holding the light.
  let holder: Zone | null = null;
  let best = Infinity;
  for (const z of allZones) {
    if (idKey(z.data.level) !== level || !pointInRing(at, z.data.geometry.boundary)) continue;
    const area = outlineAreaSqIn(z.data.geometry.boundary);
    if (area < best) {
      holder = z;
      best = area;
    }
  }
  if (holder !== null) return done([linkSwitch(holder.id, holder.data.attributes.dimmer)]);

  const room = roomAt(objects, fx.data.level, at);
  if (room === null) return { ok: false, reason: 'no_room' };
  const own = leg === null ? undefined : find(allZones, leg.zoneId);
  if (own !== undefined && sameId(own.data.geometry.roomId, room.id)) {
    const boundary = convexHull([...own.data.geometry.boundary, ...squareAround(at)]);
    return done([
      store('switch_zone', own.id, { ...own.data, geometry: { ...own.data.geometry, boundary } }),
    ]);
  }
  const dimmer = sw.data.attributes.kind === 'switch_dimmer';
  const zoneId = ctx.newId();
  return done([
    store('switch_zone', zoneId, {
      geometry: { roomId: room.id, boundary: squareAround(at) },
      status: ctx.status,
      level: room.data.level,
      attributes: { dimmer },
    }),
    linkSwitch(zoneId, dimmer),
  ]);
}

/** Dash segments from `a` to `b` in LEG_DASH_IN's pattern; the last dash is cut at `b`. */
export function legDashes(a: Point, b: Point): [Point, Point][] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return [];
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const at = (d: number): Point => ({ x: a.x + ux * d, y: a.y + uy * d });
  const out: [Point, Point][] = [];
  let d = 0;
  for (let i = 0; d < length; i = (i + 1) % LEG_DASH_IN.length) {
    const step = LEG_DASH_IN[i]!;
    if (i % 2 === 0) out.push([at(d), at(Math.min(d + step, length))]);
    d += step;
  }
  return out;
}

/** The order the leg's line visits its lights: from the switch, each time to the nearest light not yet visited. */
export function legPath(from: Point, stops: readonly { id: string; at: Point }[]): string[] {
  const left = [...stops];
  const out: string[] = [];
  let here = from;
  while (left.length > 0) {
    let k = 0;
    let best = Infinity;
    left.forEach((s, i) => {
      const d = Math.hypot(s.at.x - here.x, s.at.y - here.y);
      if (d < best) {
        best = d;
        k = i;
      }
    });
    const next = left.splice(k, 1)[0]!;
    out.push(next.id);
    here = next.at;
  }
  return out;
}

/**
 * The switch legs on one floor's drawing: a dashed line from each switch through the lights of its leg, nearest
 * first, each piece trimmed to the symbols' edges. Every item carries the switch's id and layer, so the leg
 * highlights and hides with its switch.
 */
export function switchLegItems(
  onFloor: readonly ModelObject[],
  all: Objects,
  radiusOf: (kind: string) => number,
): DrawingItem[] {
  const legs = switchLegs(all);
  if (legs.length === 0) return [];
  const here = new Map<string, Device>();
  for (const o of onFloor) if (o.type === 'device') here.set(idKey(o.id), o);
  const out: DrawingItem[] = [];
  for (const leg of legs) {
    const sw = here.get(idKey(leg.switchId));
    if (sw === undefined) continue;
    const stops = leg.fixtureIds
      .map((id) => here.get(idKey(id)))
      .filter((d): d is Device => d !== undefined)
      .map((d) => ({ id: d.id, at: d.data.geometry.point }));
    const order = legPath(sw.data.geometry.point, stops);
    const chain = [sw, ...order.map((id) => here.get(idKey(id))!)];
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]!;
      const b = chain[i]!;
      const pa = a.data.geometry.point;
      const pb = b.data.geometry.point;
      const ra = radiusOf(a.data.attributes.kind);
      const rb = radiusOf(b.data.attributes.kind);
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (len <= ra + rb) continue;
      const u = { x: (pb.x - pa.x) / len, y: (pb.y - pa.y) / len };
      const from = { x: pa.x + u.x * ra, y: pa.y + u.y * ra };
      const to = { x: pb.x - u.x * rb, y: pb.y - u.y * rb };
      for (const [f, t] of legDashes(from, to))
        out.push({
          layer: sw.data.status,
          objectId: sw.id,
          kind: 'line',
          role: 'hidden',
          from: f,
          to: t,
        });
    }
  }
  return out;
}
