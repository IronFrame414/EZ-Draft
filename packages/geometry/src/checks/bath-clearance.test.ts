// EZD-228 bath clearance check (AC-EZD-228-1 "the clearance rule returns a warning for a toilet closer to a side
// wall than the Defaults value"). Expected values come from the spec, never from running the code: 09d B-07 to B-09
// (toilet and lavatory centerline 15" from a side wall, 30" center to center, 21" clear in front; shower 900 sq in
// with 30" in every direction, a 22" access opening, 24" clear in front of it), 09d:34 (the Defaults values start at
// these code minimums) and vault/build/assumptions.md EZD-228 ("15" default with the toilet at 14 1/2" warns; at 15"
// it passes"; the tub has no default, so the tub check is cannot-check). Gaps are worked by hand from the fixture
// sizes below: a room whose walls' inner faces are its outline, and a fixture whose depth runs to the back wall.
import { describe, expect, it } from 'vitest';
import { createRuleRegistry, runCodeCheck, type CheckResult } from '../code-check/engine';
import { chain, roomObj, uid, wallObj, F1 } from '../rooms/test-utils/fixtures';
import type { ModelObject, ObjectStatus, Point } from '../schema';
import {
  BATH_CLEARANCE_CODE_MINIMUMS,
  BATH_CLEARANCE_RULE_IDS as ID,
  BATH_CLEARANCES_PROJECT_KEY,
  bathClearanceRuleSets,
  type BathClearances,
} from './bath-clearance';

const FBC9 = 'fbc9_nec2023';
const FBC8 = 'fbc8_nec2020';
const ROOM = uid(900);
const TOILET = uid(901);
const LAV = uid(902);
const TUB = uid(903);
const SHOWER = uid(904);

// A 60" x 96" bath, walked counter-clockwise with the thickness on the right, so each wall's left face is on the
// outline (the room's inside finished face, Q-0559).
const box = (w: number, d: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];

function fixture(
  id: string,
  kind: 'toilet' | 'lavatory' | 'tub' | 'shower_prefab',
  center: Point,
  width: number,
  depth: number,
  status: ObjectStatus = 'new',
  axis: Point = { x: 1, y: 0 },
): ModelObject {
  // Axis (1, 0): the depth runs to +y, so the back is toward +y and the front faces -y.
  return {
    id,
    type: 'fixture',
    data: { geometry: { center, axis }, status, level: F1, attributes: { kind, width, depth } },
  } as ModelObject;
}

// A toilet 20" wide and 28" deep against the back wall of a room `d` deep, its centerline `x` from the left wall.
const toilet = (x: number, d = 96, status: ObjectStatus = 'new') =>
  fixture(TOILET, 'toilet', { x, y: d - 14 }, 20, 28, status);

function tileShower(
  footprint: Point[],
  opts: { bench?: { width: number; depth: number; height: number }; glass?: unknown[] } = {},
): ModelObject {
  return {
    id: SHOWER,
    type: 'tile_shower',
    data: {
      geometry: { footprint },
      status: 'new',
      level: F1,
      attributes: {
        curb: null,
        niches: [],
        bench: opts.bench ?? null,
        glass: opts.glass ?? [],
        panSlope: 0.25,
        drain: { type: 'center', at: { x: 10, y: 10 } },
      },
    },
  } as ModelObject;
}

const MINIMUMS: Partial<BathClearances> = { ...BATH_CLEARANCE_CODE_MINIMUMS };

function check(
  objects: ModelObject[],
  values: Partial<BathClearances> | null = MINIMUMS,
  edition = FBC9,
): CheckResult[] {
  return runCodeCheck({
    model: { objects },
    edition,
    registry: createRuleRegistry(bathClearanceRuleSets([FBC9, FBC8])),
    verifiedRuleIds: new Set(),
    project: values === null ? {} : { [BATH_CLEARANCES_PROJECT_KEY]: values },
  });
}

const bath = (w = 60, d = 96, extra: ModelObject[] = []): ModelObject[] => [
  ...chain(1, box(w, d), 'right'),
  roomObj(ROOM, box(w, d), 'Bath 2'),
  ...extra,
];

const of = (results: CheckResult[], ruleId: string, objectId?: string) =>
  results.filter((r) => r.ruleId === ruleId && (objectId === undefined || r.objectId === objectId));

describe('EZD-228 Defaults values start at the code minimums (09d:34; B-07 to B-09)', () => {
  it('toilet and lavatory 15" side, 30" apart, 21" in front; shower 900 sq in, 30" least, 22" opening, 24" in front', () => {
    expect(BATH_CLEARANCE_CODE_MINIMUMS).toEqual({
      side: 15,
      centerToCenter: 30,
      front: 21,
      showerFront: 24,
      showerAccess: 22,
      showerArea: 900,
      showerLeast: 30,
    });
    expect('tubFront' in BATH_CLEARANCE_CODE_MINIMUMS).toBe(false);
  });
});

describe('EZD-228 side clearance (AC-EZD-228-1)', () => {
  it('a new toilet 14 1/2" from the side wall warns under the 15" Defaults value', () => {
    const results = of(check(bath(60, 96, [toilet(14.5)])), ID.side, TOILET);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: 'fail',
      severity: 'warning',
      code: 'company',
      objectType: 'fixture',
      unverified: true,
      values: { fixture: 'toilet', measure: 'side', measured: 14.5, required: 15 },
    });
  });

  it('exactly 15" passes', () => {
    expect(of(check(bath(60, 96, [toilet(15)])), ID.side)).toEqual([]);
  });

  it('a value raised above the code minimum warns in the band between them', () => {
    const results = of(check(bath(60, 96, [toilet(16)]), { ...MINIMUMS, side: 18 }), ID.side, TOILET);
    expect(results).toHaveLength(1);
    expect(results[0]?.values).toMatchObject({ measured: 16, required: 18 });
  });

  it('the side wall on the right counts as well (toilet 14" from it in a 60" room)', () => {
    expect(of(check(bath(60, 96, [toilet(46)])), ID.side, TOILET)[0]?.values).toMatchObject({ measured: 14 });
  });

  it('the wall behind the toilet is not a side', () => {
    // Centered in a 60" room: 30" to each side; the back wall touches the toilet's back.
    expect(of(check(bath(60, 96, [toilet(30)])), ID.side)).toEqual([]);
  });

  it('a tub beside the toilet is a side obstruction (tub edge 12" from the centerline)', () => {
    // Tub 30" deep x 60" long against the left wall, running front to back: axis (0, 1) puts its back at x = 0.
    const tub = fixture(TUB, 'tub', { x: 15, y: 50 }, 60, 30, 'new', { x: 0, y: 1 });
    // Toilet at x = 42: tub's right edge at x = 30, so 12".
    expect(of(check(bath(60, 96, [tub, toilet(42)])), ID.side, TOILET)[0]?.values).toMatchObject({
      measured: 12,
    });
  });

  it('a Demo wall takes no part', () => {
    const objects = bath(60, 96, [toilet(14.5)]).map((o) =>
      o.type === 'wall' && o.id === uid(4) ? ({ ...o, data: { ...o.data, status: 'demo' } } as ModelObject) : o,
    );
    // uid(4) is the left wall (0, 96) to (0, 0); with it gone nothing is beside the toilet on that side.
    expect(of(check(objects), ID.side)).toEqual([]);
  });

  it('with the value not set it is cannot-check, never a pass', () => {
    const results = of(check(bath(60, 96, [toilet(14.5)]), null), ID.side, TOILET);
    expect(results).toEqual([expect.objectContaining({ status: 'cannot_check', need: 'Side clearance' })]);
  });

  it('an existing toilet in an unaltered bath gives a note, not a warning', () => {
    const results = of(check(bath(60, 96, [toilet(14.5, 96, 'existing')])), ID.side, TOILET);
    expect(results).toEqual([expect.objectContaining({ status: 'fail', severity: 'note' })]);
  });

  it('runs on an 8th Edition project too', () => {
    expect(of(check(bath(60, 96, [toilet(14.5)]), MINIMUMS, FBC8), ID.side, TOILET)).toHaveLength(1);
  });
});

describe('EZD-228 center to center and front clearance (B-07, B-08)', () => {
  // Lavatory 20" wide, 18" deep, its center in line with the toilet's (y = 82), so center to center is the x gap.
  const lav = (x: number) => fixture(LAV, 'lavatory', { x, y: 82 }, 20, 18);

  it('a toilet and a lavatory 25" apart warn under 30"; 30" apart pass', () => {
    const near = of(check(bath(80, 96, [toilet(20), lav(45)])), ID.centerToCenter);
    expect(near.map((r) => r.objectId).sort()).toEqual([TOILET, LAV].sort());
    expect(near[0]?.values).toMatchObject({ measured: 25, required: 30 });
    expect(of(check(bath(80, 96, [toilet(20), lav(50)])), ID.centerToCenter)).toEqual([]);
  });

  it('two lavatories back to back across a shared wall are not next to each other: no warning', () => {
    // Two baths share a 4 1/2" wall centered on y = 50. Each lavatory is 18" deep against its face of that wall, so
    // the centers are 9" + 4 1/2" + 9" = 22 1/2" apart, under 30", but in different rooms.
    const shared = wallObj(uid(50), { x: 0, y: 50 }, { x: 60, y: 50 }, 'center');
    const below = fixture(LAV, 'lavatory', { x: 30, y: 38.75 }, 20, 18);
    const above = fixture(TOILET, 'lavatory', { x: 30, y: 61.25 }, 20, 18, 'new', { x: -1, y: 0 });
    expect(of(check([shared, below, above]), ID.centerToCenter)).toEqual([]);
  });

  it('a partition wall between two fixtures side by side means they are not center to center', () => {
    // 25" apart, with a partition running front to back at x = 32 between them.
    const partition = wallObj(uid(51), { x: 32, y: 60 }, { x: 32, y: 96 }, 'center');
    expect(of(check(bath(80, 96, [partition, toilet(20), lav(45)])), ID.centerToCenter)).toEqual([]);
  });

  it('a lavatory across the room in front of the toilet is not beside it', () => {
    // Lavatory centered 10" off the toilet's centerline but 60" in front of it, facing it.
    const opposite = fixture(LAV, 'lavatory', { x: 30, y: 9 }, 20, 18, 'new', { x: -1, y: 0 });
    expect(of(check(bath(80, 96, [toilet(20), opposite])), ID.centerToCenter)).toEqual([]);
  });

  it('20" clear in front of a toilet warns under 21"; 21" passes', () => {
    // Room 48" deep: toilet front at 48 - 28 = 20".
    expect(of(check(bath(60, 48, [toilet(30, 48)])), ID.front, TOILET)[0]?.values).toMatchObject({
      fixture: 'toilet',
      measured: 20,
      required: 21,
    });
    expect(of(check(bath(60, 49, [toilet(30, 49)])), ID.front)).toEqual([]);
  });

  it('a tub front clearance has no code value, so it is cannot-check until it is set', () => {
    // Tub 60" x 30" across the back of a 60" x 54" room: 24" clear in front.
    const tub = fixture(TUB, 'tub', { x: 30, y: 39 }, 60, 30);
    expect(of(check(bath(60, 54, [tub])), ID.front, TUB)).toEqual([
      expect.objectContaining({ status: 'cannot_check', need: 'Tub front clearance' }),
    ]);
    const set = of(check(bath(60, 54, [tub]), { ...MINIMUMS, tubFront: 30 }), ID.front, TUB);
    expect(set[0]?.values).toMatchObject({ fixture: 'tub', measured: 24, required: 30 });
    expect(of(check(bath(60, 54, [tub]), { ...MINIMUMS, tubFront: 24 }), ID.front)).toEqual([]);
  });
});

describe('EZD-228 shower size, opening and front clearance (B-09)', () => {
  // A tile shower in the back left corner: side 0 (the opening) faces the room at y = 60.
  const fp = (w: number, d: number): Point[] => [
    { x: 0, y: 96 - d },
    { x: w, y: 96 - d },
    { x: w, y: 96 },
    { x: 0, y: 96 },
  ];

  it('36" x 24" is 864 sq in with a 24" least side: warns; 36" x 30" (1,080 sq in) passes', () => {
    const small = of(check(bath(60, 96, [tileShower(fp(36, 24))])), ID.showerSize, SHOWER);
    expect(small[0]?.values).toMatchObject({ area: 864, least: 24, requiredArea: 900, requiredLeast: 30 });
    expect(of(check(bath(60, 96, [tileShower(fp(36, 30))])), ID.showerSize)).toEqual([]);
  });

  it('a fixed bench comes out of the area: 36" x 36" less a 36" x 12" bench is 864 sq in', () => {
    const benched = tileShower(fp(36, 36), { bench: { width: 36, depth: 12, height: 18 } });
    expect(of(check(bath(60, 96, [benched])), ID.showerSize)[0]?.values).toMatchObject({ area: 864 });
  });

  it('a prefab shower 32" x 32" (1,024 sq in) passes; 30" x 28" warns', () => {
    const ok = fixture(SHOWER, 'shower_prefab', { x: 16, y: 80 }, 32, 32);
    expect(of(check(bath(60, 96, [ok])), ID.showerSize)).toEqual([]);
    const small = fixture(SHOWER, 'shower_prefab', { x: 15, y: 82 }, 30, 28);
    expect(of(check(bath(60, 96, [small])), ID.showerSize)[0]?.values).toMatchObject({ area: 840, least: 28 });
  });

  it('a 36" opening with 16" of fixed glass leaves 20": warns under 22"; a door counts as open', () => {
    const fixed = tileShower(fp(36, 36), { glass: [{ type: 'fixed', length: 16, side: 0 }] });
    expect(of(check(bath(60, 96, [fixed])), ID.showerAccess)[0]?.values).toMatchObject({
      measured: 20,
      required: 22,
    });
    const door = tileShower(fp(36, 36), {
      glass: [
        { type: 'fixed', length: 12, side: 0 },
        { type: 'door', length: 24, side: 0, swing: 'out' },
      ],
    });
    expect(of(check(bath(60, 96, [door])), ID.showerAccess)).toEqual([]);
  });

  it('20" clear in front of the opening warns under 24"; 24" passes', () => {
    // Shower 36" deep in a 56" deep room: the front wall is 20" from the opening.
    const tight = tileShower(fp(36, 36).map((p) => ({ x: p.x, y: p.y - 40 })));
    expect(of(check(bath(60, 56, [tight])), ID.showerFront, SHOWER)[0]?.values).toMatchObject({
      fixture: 'shower',
      measured: 20,
      required: 24,
    });
    const roomy = tileShower(fp(36, 36).map((p) => ({ x: p.x, y: p.y - 36 })));
    expect(of(check(bath(60, 60, [roomy])), ID.showerFront)).toEqual([]);
  });
});
