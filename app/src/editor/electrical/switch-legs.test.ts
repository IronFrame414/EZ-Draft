// EZD-605 AC-EZD-605-1 "Editing a zone on the RCP updates the switch leg, and the reverse." (S06 Controls "Device
// toolbar: Switch leg | Draw a switch leg from switch to fixtures (dashed)."; S05 Controls "Switching zones ... Zones
// sync to switch legs on the electrical plan."; vault/build/assumptions.md EZD-605). Hand-placed plan: one room
// 240" x 180", zone Z on its left half (0..120 x 0..180), lights L1 (60, 90) and L2 (180, 90), switch S at (5, 90)
// on zone Z. Expected memberships and outlines are worked out by hand from those coordinates.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { applyChanges, baseObjects, F1, idSeq, roomValue, uid } from '../tools/test-utils/fixtures';
import {
  addToLeg,
  LEG_ZONE_MARGIN_IN,
  switchLegItems,
  switchLegOf,
  switchLegs,
  zoneDimmerChanges,
} from './switch-legs';
import { zoneDimmerChanges as rcpDimmerEdit } from '../tools/switch-zone';

const ROOM = uid(1);
const ROOM2 = uid(2);
const Z = uid(10);
const Z2 = uid(11);
const S = uid(20);
const S2 = uid(21);
const L1 = uid(30);
const L2 = uid(31);
const L3 = uid(32);
const LOOSE = uid(33);
const FAN = uid(34);

const pt = (x: number, y: number): Point => ({ x, y });
const rect = (x: number, y: number, w: number, h: number) => [
  pt(x, y),
  pt(x + w, y),
  pt(x + w, y + h),
  pt(x, y + h),
];
const v = (type: string, data: Record<string, unknown>): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});
const device = (at: Point, kind: string, zone?: string) =>
  v('device', {
    geometry: { point: at },
    status: 'new',
    level: F1,
    attributes: zone === undefined ? { kind } : { kind, zone },
  });
const zone = (roomId: string, boundary: Point[], dimmer: boolean) =>
  v('switch_zone', { geometry: { roomId, boundary }, status: 'new', level: F1, attributes: { dimmer } });

function plan(switchKind = 'switch_single') {
  const o = baseObjects();
  o.set(ROOM, roomValue(rect(0, 0, 240, 180), 'Kitchen', null));
  o.set(ROOM2, roomValue(rect(300, 0, 120, 120), 'Family', null));
  o.set(Z, zone(ROOM, rect(0, 0, 120, 180), false));
  o.set(S, device(pt(5, 90), switchKind, Z));
  o.set(S2, device(pt(305, 60), 'switch_single'));
  o.set(L1, device(pt(60, 90), 'recessed_light'));
  o.set(L2, device(pt(180, 90), 'recessed_light'));
  o.set(L3, device(pt(360, 60), 'recessed_light'));
  o.set(LOOSE, device(pt(600, 600), 'recessed_light'));
  return o;
}

const data = (o: ReadonlyMap<string, ObjectValue>, id: string) =>
  o.get(id)!.data as {
    geometry: { boundary: Point[]; roomId: string };
    attributes: { kind: string; zone?: string | null; dimmer: boolean };
  };
const sortPts = (ps: readonly Point[]) =>
  [...ps].map((p) => `${p.x},${p.y}`).sort();
const ctx = () => ({ status: 'new' as const, newId: idSeq(500) });

describe('EZD-605 switch legs follow their zones (zone to leg)', () => {
  it("a switch's leg is the lights inside its zone: S runs to L1 only", () => {
    expect(switchLegs(plan())).toEqual([
      { switchId: S, zoneId: Z, level: F1, fixtureIds: [L1] },
    ]);
    expect(switchLegOf(plan(), S2)).toBeNull();
  });

  it("AC-EZD-605-1 changing the zone's outline on the RCP changes the leg: the whole room takes L2 in", () => {
    const o = plan();
    o.set(Z, zone(ROOM, rect(0, 0, 240, 180), false));
    expect(switchLegOf(o, S)!.fixtureIds).toEqual([L1, L2]);
  });

  it('a fan inside the zone is on the leg too', () => {
    const o = plan();
    o.set(FAN, device(pt(90, 40), 'ceiling_fan'));
    expect(switchLegOf(o, S)!.fixtureIds).toEqual([L1, FAN]);
  });

  it('a deleted zone leaves the switch with no leg', () => {
    const o = plan();
    o.delete(Z);
    expect(switchLegOf(o, S)).toBeNull();
  });

  it("AC-EZD-605-1 the zone's Dimmer edit makes its switch a dimmer and back, in one change set", () => {
    const on = zoneDimmerChanges(plan(), Z, true)!;
    expect(on.map((c) => c.id).sort()).toEqual([Z, S].sort());
    const o = applyChanges(plan(), on);
    expect(data(o, Z).attributes.dimmer).toBe(true);
    expect(data(o, S).attributes.kind).toBe('switch_dimmer');
    const back = applyChanges(o, zoneDimmerChanges(o, Z, false)!);
    expect(data(back, Z).attributes.dimmer).toBe(false);
    expect(data(back, S).attributes.kind).toBe('switch_single');
  });

  it('the RCP inspector uses the same edit (switch-zone.ts)', () => {
    expect(rcpDimmerEdit).toBe(zoneDimmerChanges);
  });

  it('a 3-way switch stays a 3-way when its zone turns dimmer on', () => {
    const changes = zoneDimmerChanges(plan('switch_3way'), Z, true)!;
    expect(changes.map((c) => c.id)).toEqual([Z]);
  });

  it('no change when the zone is gone or already set so', () => {
    expect(zoneDimmerChanges(plan(), Z, false)).toBeNull();
    expect(zoneDimmerChanges(plan(), uid(99), true)).toBeNull();
  });

  it('is one undo step in the store', () => {
    const store = createModelStore({ objects: plan() });
    store.applyEdit(zoneDimmerChanges(store.getState().objects, Z, true)!);
    store.undo();
    const o = store.getState().objects;
    expect(data(o, Z).attributes.dimmer).toBe(false);
    expect(data(o, S).attributes.kind).toBe('switch_single');
  });
});

describe('EZD-605 zones follow their switch legs (leg to zone)', () => {
  it('AC-EZD-605-1 adding L2 to the leg widens zone Z to take it in', () => {
    const r = addToLeg(plan(), S, L2, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changes.map((c) => c.id)).toEqual([Z]);
    const o = applyChanges(plan(), r.changes);
    // The hull of Z's corners and the 24" square around L2 (168..192 x 78..102); 168,78 and 168,102 fall inside.
    expect(LEG_ZONE_MARGIN_IN).toBe(12);
    expect(sortPts(data(o, Z).geometry.boundary)).toEqual(
      sortPts([pt(0, 0), pt(120, 0), pt(192, 78), pt(192, 102), pt(120, 180), pt(0, 180)]),
    );
    expect(switchLegOf(o, S)!.fixtureIds).toEqual([L1, L2]);
  });

  it('a light already on the leg changes nothing', () => {
    expect(addToLeg(plan(), S, L1, ctx())).toEqual({ ok: true, changes: [] });
  });

  it('a switch with no zone starts one around the light, in its room, with the switch on it', () => {
    const r = addToLeg(plan(), S2, L3, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = applyChanges(plan(), r.changes);
    const id = uid(500);
    expect(data(o, id).geometry.roomId).toBe(ROOM2);
    expect(data(o, id).geometry.boundary).toEqual([pt(348, 48), pt(372, 48), pt(372, 72), pt(348, 72)]);
    expect(data(o, id).attributes.dimmer).toBe(false);
    expect(data(o, S2).attributes.zone).toBe(id);
    expect(switchLegOf(o, S2)!.fixtureIds).toEqual([L3]);
  });

  it("a new zone from a dimmer switch is a dimmer zone", () => {
    const o = plan();
    o.set(S2, device(pt(305, 60), 'switch_dimmer'));
    const r = addToLeg(o, S2, L3, ctx());
    expect(r.ok && data(applyChanges(o, r.changes), uid(500)).attributes.dimmer).toBe(true);
  });

  it("a light inside another zone puts the switch on that zone, taking its dimmer", () => {
    const o = plan();
    o.set(Z2, zone(ROOM, rect(150, 60, 60, 60), true));
    const r = addToLeg(o, S, L2, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = applyChanges(o, r.changes);
    expect(data(after, S).attributes.zone).toBe(Z2);
    expect(data(after, S).attributes.kind).toBe('switch_dimmer');
    expect(switchLegOf(after, S)!.fixtureIds).toEqual([L2]);
  });

  it('a light in no room is refused; so are a non-switch source and a non-light target', () => {
    expect(addToLeg(plan(), S, LOOSE, ctx())).toEqual({ ok: false, reason: 'no_room' });
    expect(addToLeg(plan(), L1, L2, ctx())).toEqual({ ok: false, reason: 'not_switch' });
    expect(addToLeg(plan(), S, S2, ctx())).toEqual({ ok: false, reason: 'not_fixture' });
  });
});

describe('EZD-605 switch leg drawing (dashed)', () => {
  it('a dashed line from the switch to its light, trimmed to the symbols, carrying the switch', () => {
    const o = plan();
    const onFloor = [...o].flatMap(([id, val]) =>
      val.type === 'device' ? [{ id, type: 'device', data: val.data } as never] : [],
    );
    const items = switchLegItems(onFloor, o, () => 3);
    // S (5, 90) to L1 (60, 90), trimmed by 3 at each end: 8..57, 49" long; 4" dashes every 7": 7 dashes.
    expect(items).toHaveLength(7);
    expect(items.every((i) => i.kind === 'line' && i.role === 'hidden' && i.objectId === S)).toBe(true);
    expect(items[0]).toMatchObject({ from: pt(8, 90), to: pt(12, 90) });
    expect(items[6]).toMatchObject({ from: pt(50, 90), to: pt(54, 90) });
  });
});
