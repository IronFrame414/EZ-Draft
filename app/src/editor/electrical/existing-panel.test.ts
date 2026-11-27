// EZD-606 (AC-EZD-606-1 "With the stub AI provider returning brand, rating and spaces, the dialog shows them
// unconfirmed and the calc ignores them until Confirm is pressed"; S06 Controls "Existing panel ... Service size, main
// breaker, panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read
// from directory photo; user confirms), existing large appliances (range, dryer, AC, water heater)"; S06 Data shown
// 2-pole "1-3"; vault/build/assumptions.md EZD-606). The read values are the stub recording's (Square D, 200 A,
// 40 spaces); the board circuits are test-fixture.ts's (Range on 1-3, the rest on 12 to 24).
import { parseStoredObject, type Point } from '@ezdraft/geometry';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change } from '../model/patches';
import { baseObjects, F1, roomValue, uid } from '../tools/test-utils/fixtures';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ElectricalStatus } from './ElectricalStatus';
import {
  confirmDirectory,
  confirmLabel,
  existingPanelChanges,
  existingPanelForm,
  existingPanelInputs,
  panelLoadCalc,
  toggleAppliance,
  type ExistingPanelCtx,
} from './existing-panel';
import { circuitValue, deviceValue, electricalObjects, PANEL_A } from './test-fixture';

const PHOTO = uid(900);
const LABEL = { brand: 'Square D', rating: 200, spaces: 40 };

function ctx(): ExistingPanelCtx {
  let n = 500;
  return {
    newId: () => uid(n++),
    level: F1,
    panelName: 'Panel A',
    circuitName: (s) => `Circuit ${s}`,
  };
}

function apply(objects: Map<string, ObjectValue>, changes: readonly Change[]) {
  const next = new Map(objects);
  for (const c of changes) {
    if (c.value === null) next.delete(c.id);
    else next.set(c.id, c.value);
  }
  return next;
}

function bareModel() {
  const objects = baseObjects();
  objects.set(PANEL_A, {
    type: 'panel',
    schemaVersion: 7,
    data: {
      geometry: { point: { x: 0, y: 0 } },
      status: 'new',
      level: F1,
      attributes: {
        name: 'Panel A',
        parentPanel: null,
        serviceSize: null,
        mainBreaker: null,
        spaces: null,
      },
    },
  });
  return objects;
}

const saved = (
  objects: Map<string, ObjectValue>,
  form: Parameters<typeof existingPanelChanges>[2],
) => {
  const r = existingPanelChanges(objects, PANEL_A, form, ctx());
  if ('problem' in r) throw new Error(r.problem);
  return apply(objects, r.changes);
};

describe('EZD-606 existing panel values', () => {
  it('AC-1 a label read held in the dialog is not in the calc; after Confirm the calc has it', () => {
    const objects = bareModel();
    const form = existingPanelForm(objects, PANEL_A);
    // The read is shown in the dialog; until Confirm nothing is written, so the calc's inputs are unchanged.
    expect(existingPanelInputs(objects, PANEL_A)).toMatchObject({
      brand: null,
      mainBreaker: null,
      spaces: null,
    });
    const after = saved(objects, confirmLabel(form, LABEL, PHOTO));
    expect(existingPanelInputs(after, PANEL_A)).toMatchObject({
      brand: 'Square D',
      mainBreaker: 200,
      spaces: 40,
      serviceSize: null,
    });
    expect(existingPanelForm(after, PANEL_A).labelPhoto).toBe(PHOTO);
  });

  it('Confirm keeps a value the label did not give', () => {
    const form = { ...existingPanelForm(bareModel(), PANEL_A), mainBreaker: 150, brand: 'Eaton' };
    expect(confirmLabel(form, { brand: null, rating: null, spaces: 30 }, PHOTO)).toMatchObject({
      brand: 'Eaton',
      mainBreaker: 150,
      spaces: 30,
      labelPhoto: PHOTO,
    });
  });

  it('Save is one change set; with no panel it makes Panel A, of status existing, on the open floor', () => {
    const objects = baseObjects();
    const r = existingPanelChanges(
      objects,
      null,
      { ...existingPanelForm(objects, null), serviceSize: 200, mainBreaker: 200, spaces: 40 },
      ctx(),
    );
    if ('problem' in r) throw new Error(r.problem);
    expect(r.changes).toHaveLength(1);
    const panel = r.changes[0]!.value!;
    expect(panel.type).toBe('panel');
    expect(panel.data).toMatchObject({
      status: 'existing',
      level: F1,
      attributes: {
        name: 'Panel A',
        parentPanel: null,
        serviceSize: 200,
        mainBreaker: 200,
        spaces: 40,
      },
    });
    expect(
      existingPanelChanges(objects, null, existingPanelForm(objects, null), {
        ...ctx(),
        level: null,
      }),
    ).toEqual({
      problem: 'no_floor',
    });
  });

  it('typed existing circuits are circuits of status existing on the panel; a blank name is "Circuit n"', () => {
    const objects = electricalObjects();
    const form = existingPanelForm(objects, PANEL_A);
    // The board's circuits are new work, so the existing list starts empty.
    expect(form.circuits).toEqual([]);
    const after = saved(objects, {
      ...form,
      circuits: [
        { id: null, space: 2, name: 'Dryer', breaker: 30, poles: 2 },
        { id: null, space: 5, name: ' ', breaker: 15, poles: 1 },
      ],
    });
    const rows = existingPanelForm(after, PANEL_A).circuits;
    expect(
      rows.map(({ space, name, breaker, poles }) => ({ space, name, breaker, poles })),
    ).toEqual([
      { space: 2, name: 'Dryer', breaker: 30, poles: 2 },
      { space: 5, name: 'Circuit 5', breaker: 15, poles: 1 },
    ]);
    for (const r of rows) {
      const v = after.get(r.id!)!;
      expect(
        parseStoredObject({
          id: r.id!,
          type: v.type,
          schema_version: v.schemaVersion,
          data: v.data,
        }).ok,
      ).toBe(true);
      expect((v.data as { status: string }).status).toBe('existing');
    }
    // The new-work circuits stay as they were.
    expect([...after.values()].filter((v) => v.type === 'circuit')).toHaveLength(10);
  });

  it('an edited row updates its circuit; a row taken off removes it and leaves its devices on no circuit', () => {
    let objects = electricalObjects();
    objects = saved(objects, {
      ...existingPanelForm(objects, PANEL_A),
      circuits: [
        { id: null, space: 2, name: 'Dryer', breaker: 30, poles: 2 },
        { id: null, space: 5, name: 'Bath', breaker: 20, poles: 1 },
      ],
    });
    const [dryer, bath] = existingPanelForm(objects, PANEL_A).circuits;
    objects.set(uid(700), deviceValue({ x: 1, y: 1 }, 'receptacle_duplex', bath!.id));
    const after = saved(objects, {
      ...existingPanelForm(objects, PANEL_A),
      circuits: [{ ...dryer!, breaker: 40 }],
    });
    expect(existingPanelForm(after, PANEL_A).circuits).toEqual([{ ...dryer!, breaker: 40 }]);
    expect(after.has(bath!.id!)).toBe(false);
    expect(
      (after.get(uid(700))!.data as { attributes: { circuit: unknown } }).attributes.circuit,
    ).toBeNull();
  });

  it('a row on a space another circuit takes is refused, as a 2-pole row reaching one', () => {
    const objects = electricalObjects();
    const form = existingPanelForm(objects, PANEL_A);
    const row = (space: number, poles: 1 | 2) => ({
      id: null,
      space,
      name: 'X',
      breaker: 20,
      poles,
    });
    // Range is 1-3, so space 3 is taken; a 2-pole on 10 takes 10 and 12, and 12 is Small appl. 1.
    for (const circuits of [
      [row(3, 1)],
      [row(10, 2)],
      [row(5, 1), row(5, 1)],
      [row(5, 2), row(7, 1)],
    ])
      expect(existingPanelChanges(objects, PANEL_A, { ...form, circuits }, ctx())).toEqual({
        problem: 'space_taken',
      });
    expect(
      existingPanelChanges(objects, PANEL_A, { ...form, circuits: [row(5, 2)] }, ctx()),
    ).not.toHaveProperty('problem');
  });

  it('fewer spaces than the circuits take is refused', () => {
    const objects = electricalObjects();
    // Kitchen lighting is on space 24.
    expect(
      existingPanelChanges(
        objects,
        PANEL_A,
        { ...existingPanelForm(objects, PANEL_A), spaces: 20 },
        ctx(),
      ),
    ).toEqual({ problem: 'space_past_panel' });
  });

  it('a directory read confirmed replaces the row at its space and adds the rest, by space', () => {
    const form = {
      ...existingPanelForm(bareModel(), PANEL_A),
      circuits: [{ id: uid(800), space: 2, name: 'Kitchen', breaker: 20, poles: 1 as const }],
    };
    expect(
      confirmDirectory(form, [
        { space: 4, name: 'Bedrooms', breaker: 15, poles: 1 },
        { space: 2, name: 'Kitchen counter', breaker: 20, poles: 1 },
        { space: 1, name: 'Range', breaker: 40, poles: 2 },
      ]).circuits,
    ).toEqual([
      { id: null, space: 1, name: 'Range', breaker: 40, poles: 2 },
      { id: uid(800), space: 2, name: 'Kitchen counter', breaker: 20, poles: 1 },
      { id: null, space: 4, name: 'Bedrooms', breaker: 15, poles: 1 },
    ]);
  });

  it('the existing large appliances keep the S06 order and their VA, and save on the panel', () => {
    let list = toggleAppliance([], 'water_heater', true);
    list = toggleAppliance(list, 'range', true);
    expect(list).toEqual([
      { kind: 'range', va: null },
      { kind: 'water_heater', va: null },
    ]);
    list = list.map((a) => (a.kind === 'range' ? { ...a, va: 12000 } : a));
    expect(toggleAppliance(toggleAppliance(list, 'range', false), 'range', true)[0]).toEqual({
      kind: 'range',
      va: null,
    });
    const objects = bareModel();
    const after = saved(objects, { ...existingPanelForm(objects, PANEL_A), appliances: list });
    expect(existingPanelInputs(after, PANEL_A).appliances).toEqual([
      { kind: 'range', va: 12000 },
      { kind: 'water_heater', va: null },
    ]);
  });

  it('a circuit of another panel is not on the existing list', () => {
    const objects = electricalObjects({ subpanel: true });
    objects.set(uid(701), {
      ...circuitValue({
        panel: uid(101),
        space: 3,
        poles: 1,
        name: 'Shed',
        breaker: 20,
        protection: null,
        dedicated: false,
        load: 0,
      }),
      data: {
        status: 'existing',
        level: F1,
        attributes: {
          panel: uid(101),
          space: 3,
          poles: 1,
          name: 'Shed',
          breaker: 20,
          protection: null,
          dedicated: false,
          load: 0,
        },
      },
    });
    expect(existingPanelForm(objects, PANEL_A).circuits).toEqual([]);
    expect(existingPanelForm(objects, uid(101)).circuits.map((c) => c.name)).toEqual(['Shed']);
  });
});

// EZD-607 (09a Inputs; worked example; board S06Electrical status "Service 200A · 149.5A calc"; assumptions EZD-607):
// the panel's load calc read from the model. The loads and the 2,450 sq ft are the 09a worked example's.
describe('EZD-607 panel load calc', () => {
  const LOADS = [
    { id: 'dw', name: 'Dishwasher', kind: 'fixed_appliance' as const, va: 1200 },
    { id: 'disp', name: 'Disposal', kind: 'fixed_appliance' as const, va: 960, motor: true },
    { id: 'mw', name: 'Microwave', kind: 'fixed_appliance' as const, va: 1500 },
    { id: 'wh', name: 'Water heater', kind: 'fixed_appliance' as const, va: 4500 },
    { id: 'dry', name: 'Dryer', kind: 'dryer' as const, va: null, applianceType: 'dryer' },
    {
      id: 'rng',
      name: 'Range',
      kind: 'range' as const,
      va: 12000,
      existing: true,
      confirmed: true,
    },
    { id: 'heat', name: 'Heat strips', kind: 'heating' as const, va: 9600 },
    { id: 'ac', name: 'A/C', kind: 'cooling' as const, va: 4200, motor: true },
  ];
  const calc = (over: Record<string, unknown> = {}) => ({
    method: 'standard',
    floorAreaSqFt: 2450,
    smallApplianceCircuits: 2,
    laundryCircuits: 1,
    loads: LOADS,
    overrides: {},
    ...over,
  });
  const withCalc = (c: Record<string, unknown> | undefined, rooms: Point[][] = []) => {
    const objects = new Map<string, ObjectValue>(
      [...electricalObjects()].filter(([, v]) => v.type !== 'room'),
    );
    const panel = structuredClone(objects.get(PANEL_A)!);
    if (c !== undefined)
      (panel.data as { attributes: Record<string, unknown> }).attributes.loadCalc = c;
    objects.set(PANEL_A, panel);
    rooms.forEach((b, i) => objects.set(uid(950 + i), roomValue(b, `Room ${i}`, null)));
    return objects;
  };
  const rect = (x: number, w: number, h: number): Point[] => [
    { x, y: 0 },
    { x: x + w, y: 0 },
    { x: x + w, y: h },
    { x, y: h },
  ];
  const DEFAULTS = { dryer: 5000 };

  it('the stored inputs parse on the panel', () => {
    const p = withCalc(calc()).get(PANEL_A)!;
    expect(
      parseStoredObject({
        id: PANEL_A,
        type: p.type,
        schema_version: p.schemaVersion,
        data: p.data,
      }).ok,
    ).toBe(true);
  });

  it('no load calc on the panel gives null', () => {
    expect(panelLoadCalc(withCalc(undefined), PANEL_A, {})).toBeNull();
  });

  it('reproduces 35,868 VA and 149.5 A on the 200 A service, the dryer at the default rating', () => {
    const r = panelLoadCalc(withCalc(calc()), PANEL_A, DEFAULTS);
    expect(r).toMatchObject({
      ok: true,
      totalVa: 35868,
      amps: 149.5,
      service: { amps: 200, pass: true },
    });
  });

  it('a load with no rating and no default is the calc error naming it', () => {
    expect(panelLoadCalc(withCalc(calc()), PANEL_A, {})).toEqual({
      ok: false,
      errors: [{ code: 'missing_rating', loadId: 'dry', name: 'Dryer' }],
    });
  });

  it('square footage comes from the rooms when none is typed; the typed value wins', () => {
    // 2,450 sq ft as two rooms: 30 x 45 ft (1,350) and 22 x 50 ft (1,100), in inches.
    const rooms = [rect(0, 360, 540), rect(400, 264, 600)];
    const fromRooms = panelLoadCalc(
      withCalc(calc({ floorAreaSqFt: null }), rooms),
      PANEL_A,
      DEFAULTS,
    );
    expect(fromRooms).toMatchObject({ ok: true, totalVa: 35868 });
    const typed = panelLoadCalc(
      withCalc(calc({ floorAreaSqFt: 2450 }), [rect(0, 120, 120)]),
      PANEL_A,
      DEFAULTS,
    );
    expect(typed).toMatchObject({ ok: true, totalVa: 35868 });
    expect(panelLoadCalc(withCalc(calc({ floorAreaSqFt: null })), PANEL_A, DEFAULTS)).toEqual({
      ok: false,
      errors: [{ code: 'missing_floor_area' }],
    });
  });

  it('a load the AI read counts only once confirmed (EZD-606)', () => {
    const ev = {
      id: 'ev',
      name: 'EV charger',
      kind: 'ev_charger',
      va: 9600,
      existing: true,
      confirmed: false,
    };
    const unconfirmed = panelLoadCalc(withCalc(calc({ loads: [...LOADS, ev] })), PANEL_A, DEFAULTS);
    expect(unconfirmed).toMatchObject({ ok: true, totalVa: 35868 });
    const confirmed = panelLoadCalc(
      withCalc(calc({ loads: [...LOADS, { ...ev, confirmed: true }] })),
      PANEL_A,
      DEFAULTS,
    );
    expect(confirmed).toMatchObject({ ok: true, totalVa: 35868 + 9600 });
  });

  const status = (objects: Map<string, ObjectValue>) =>
    renderToStaticMarkup(
      createElement(
        MessagesProvider,
        { language: 'en', messages: catalogFor('office', 'en') },
        createElement(ElectricalStatus, {
          store: { getState: () => ({ objects }), subscribe: () => () => {} } as never,
        }),
      ),
    );

  it('the status bar shows the service and the calculated amps', () => {
    const dryerRated = calc({ loads: LOADS.map((l) => (l.id === 'dry' ? { ...l, va: 5000 } : l)) });
    expect(status(withCalc(dryerRated))).toContain('200A · 149.5A calc');
  });

  it('with no load calc, or a calc error, the status bar shows the service alone', () => {
    expect(status(withCalc(undefined))).toContain('>200A<');
    expect(status(withCalc(calc()))).toContain('>200A<');
  });

  // EZD-607 (assumptions EZD-607 "Which fixtures make which lines", "Rating order"): the 09a appliances drawn as
  // fixtures, rated by the default, plus a refrigerator and a washer that make no line; microwave, heat strips and the
  // A/C have no fixture kind and are typed loads.
  const fixture = (kind: string, status = 'new'): ObjectValue => ({
    type: 'fixture',
    schemaVersion: 7,
    data: {
      geometry: { center: { x: 10, y: 10 }, axis: { x: 1, y: 0 } },
      status,
      level: F1,
      attributes: { kind, width: 24, depth: 24 },
    },
  });
  const FIXTURE_DEFAULTS = {
    dishwasher: 1200,
    disposal: 960,
    water_heater: 4500,
    dryer: 5000,
    range: 12000,
  };
  const TYPED = LOADS.filter((l) => ['mw', 'heat', 'ac'].includes(l.id));
  const drawnHouse = (extra: [string, ObjectValue][] = [], over: Record<string, unknown> = {}) => {
    const objects = withCalc(calc({ loads: TYPED, ...over }));
    const kinds = [
      'dishwasher',
      'disposal',
      'water_heater',
      'dryer',
      'range',
      'refrigerator',
      'washer',
    ];
    kinds.forEach((k, i) => objects.set(uid(960 + i), fixture(k)));
    for (const [id, v] of extra) objects.set(id, v);
    return objects;
  };

  it('drawn fixtures make the 09a lines; refrigerator and washer make none', () => {
    const r = panelLoadCalc(drawnHouse(), PANEL_A, FIXTURE_DEFAULTS);
    expect(r).toMatchObject({ ok: true, totalVa: 35868, amps: 149.5 });
    if (r === null || !r.ok) throw new Error('no calc');
    expect(r.lines.find((l) => l.key === 'fixed_appliances')).toMatchObject({
      va: 6120,
      detail: { sum: 8160, count: 4, percent: 75 },
    });
  });

  it('a demolished fixture makes no line; a typed load with its sourceObjectId replaces the fixture', () => {
    const demo = panelLoadCalc(
      drawnHouse([[uid(970), fixture('dishwasher', 'demo')]]),
      PANEL_A,
      FIXTURE_DEFAULTS,
    );
    expect(demo).toMatchObject({ ok: true, totalVa: 35868 });
    const typedDw = {
      id: 'dw2',
      name: 'Dishwasher',
      kind: 'fixed_appliance',
      va: 2000,
      sourceObjectId: uid(960),
    };
    const replaced = panelLoadCalc(
      drawnHouse([], { loads: [...TYPED, typedDw] }),
      PANEL_A,
      FIXTURE_DEFAULTS,
    );
    // 2,000 + 960 + 1,500 + 4,500 = 8,960 x 75% = 6,720, 600 more than 6,120.
    expect(replaced).toMatchObject({ ok: true, totalVa: 35868 + 600 });
  });

  it("the panel's existing appliances count when no fixture of their kind is drawn", () => {
    const objects = withCalc(calc({ loads: LOADS.filter((l) => !['dry', 'ac'].includes(l.id)) }));
    const panel = structuredClone(objects.get(PANEL_A)!);
    (panel.data as { attributes: Record<string, unknown> }).attributes.appliances = [
      { kind: 'dryer', va: null },
      { kind: 'ac', va: 4200 },
    ];
    objects.set(PANEL_A, panel);
    expect(panelLoadCalc(objects, PANEL_A, DEFAULTS)).toMatchObject({ ok: true, totalVa: 35868 });
    // A drawn dryer stands for the panel's dryer: counted once.
    objects.set(uid(980), fixture('dryer'));
    expect(panelLoadCalc(objects, PANEL_A, DEFAULTS)).toMatchObject({ ok: true, totalVa: 35868 });
  });

  it('the largest-motor line can be left out (09a: read two ways)', () => {
    const r = panelLoadCalc(withCalc(calc({ largestMotorId: null })), PANEL_A, DEFAULTS);
    expect(r).toMatchObject({ ok: true, totalVa: 35868 - 1050 });
  });
});
