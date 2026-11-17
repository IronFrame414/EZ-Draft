// EZD-234 (AC-EZD-234-1, -3; S03:157; 09e:7; Q-0704 05-screens; 09q Utilities to move rows 1-4). Expected values
// worked by hand: a 30" × 26" range at (60, 13) facing down covers x 45 to 75, y 0 to 26; moved 24" east it covers
// x 69 to 99, so its electric point at (55, 2) is 69 − 55 = 14" from the new outline and its gas point at (66, 2)
// is 69 − 66 = 3".
import { describe, expect, it } from 'vitest';
import {
  fixtureOutline,
  moveSelection,
  type FixtureObject,
  type ModelObject,
  type UtilityPointObject,
} from '@ezdraft/geometry';
import {
  fixtureAt,
  linkedFixture,
  newFixtureData,
  newUtilityPointData,
  utilitiesToMove,
} from './fixture-geometry';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const RANGE = '00000000-0000-4000-8000-000000000001';
const FRIDGE = '00000000-0000-4000-8000-000000000002';
const ELEC = '00000000-0000-4000-8000-000000000011';
const GAS = '00000000-0000-4000-8000-000000000012';

const range: FixtureObject = {
  id: RANGE,
  type: 'fixture',
  data: newFixtureData({
    kind: 'range',
    center: { x: 60, y: 13 },
    facing: 'down',
    width: 30,
    depth: 26,
    status: 'new',
    level: F1,
  }),
};
const fridge: FixtureObject = {
  id: FRIDGE,
  type: 'fixture',
  data: newFixtureData({
    kind: 'refrigerator',
    center: { x: 120, y: 15 },
    facing: 'down',
    width: 36,
    depth: 30,
    status: 'new',
    level: F1,
  }),
};
const point = (id: string, kind: 'electric' | 'gas', x: number, serves: string | null) =>
  ({
    id,
    type: 'utility_point',
    data: newUtilityPointData({
      kind,
      point: { x, y: 2 },
      status: 'existing',
      level: F1,
      volts: kind === 'electric' ? 240 : null,
      amps: kind === 'electric' ? 50 : null,
      servesObjectId: serves,
    }),
  }) as UtilityPointObject;

const model: ModelObject[] = [
  range,
  fridge,
  point(ELEC, 'electric', 55, RANGE),
  point(GAS, 'gas', 66, RANGE),
];

const moved = (ids: string[], dx: number): ModelObject[] => {
  const r = moveSelection(model, ids, { x: dx, y: 0 });
  if (!r.ok) throw new Error(r.reason);
  const swap = new Map(r.changed.map((o) => [o.id, o]));
  return model.map((o) => swap.get(o.id) ?? o);
};

describe('EZD-234 utilities to move', () => {
  it('the range outline: 30" along the axis, 26" deep', () => {
    expect(fixtureOutline(range.data)).toEqual([
      { x: 45, y: 26 },
      { x: 75, y: 26 },
      { x: 75, y: 0 },
      { x: 45, y: 0 },
    ]);
  });

  it('09q row 1: a range with a gas and an electric point moved 24" lists both, each with its distance', () => {
    const after = moved([RANGE], 24);
    expect(after.find((o) => o.id === ELEC)).toEqual(model.find((o) => o.id === ELEC));
    expect(utilitiesToMove(model, after)).toEqual([
      {
        fixtureId: RANGE,
        utilities: [
          { pointId: ELEC, kind: 'electric', distance: 14 },
          { pointId: GAS, kind: 'gas', distance: 3 },
        ],
      },
    ]);
  });

  it('09q row 2: a refrigerator with no linked points moved gives no list', () => {
    expect(utilitiesToMove(model, moved([FRIDGE], 24))).toEqual([]);
  });

  it('09q row 3: an appliance clicked without dragging (0") gives no list', () => {
    expect(moveSelection(model, [RANGE], { x: 0, y: 0 })).toEqual({ ok: true, changed: [] });
    expect(utilitiesToMove(model, model)).toEqual([]);
  });

  it('a point moved with its appliance did not stay, so it is not listed; one inside the new outline reads 0"', () => {
    expect(utilitiesToMove(model, moved([RANGE, GAS], 24))).toEqual([
      { fixtureId: RANGE, utilities: [{ pointId: ELEC, kind: 'electric', distance: 14 }] },
    ]);
    expect(utilitiesToMove(model, moved([RANGE], 5))).toEqual([
      {
        fixtureId: RANGE,
        utilities: [
          { pointId: ELEC, kind: 'electric', distance: 0 },
          { pointId: GAS, kind: 'gas', distance: 0 },
        ],
      },
    ]);
  });

  it('09q row 4: a deleted appliance leaves its points in place and unlinked', () => {
    const elec = model.find((o) => o.id === ELEC) as UtilityPointObject;
    expect(linkedFixture(elec, model)?.id).toBe(RANGE);
    const deleted = model.filter((o) => o.id !== RANGE);
    expect(deleted.find((o) => o.id === ELEC)).toBe(elec);
    expect(linkedFixture(elec, deleted)).toBeNull();
    expect(utilitiesToMove(model, deleted)).toEqual([]);
  });

  it('a new point placed inside an appliance outline links to it; outside links to none', () => {
    expect(fixtureAt(model, { x: 60, y: 10 }, F1)?.id).toBe(RANGE);
    expect(fixtureAt(model, { x: 90, y: 10 }, F1)).toBeNull();
    expect(fixtureAt(model, { x: 60, y: 10 }, '34234c39-7f4e-4f09-8b77-000000000000')).toBeNull();
  });

  it('newUtilityPointData keeps volts and amps only for electric', () => {
    const gas = newUtilityPointData({
      kind: 'gas',
      point: { x: 0, y: 0 },
      status: 'existing',
      level: F1,
      volts: 240,
      amps: 50,
      servesObjectId: null,
    });
    expect(gas.attributes).toEqual({ kind: 'gas', volts: null, amps: null, servesObjectId: null });
  });
});
