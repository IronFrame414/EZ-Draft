// EZD-606 (AC-EZD-606-1 "With the stub AI provider returning brand, rating and spaces, the dialog shows them
// unconfirmed and the calc ignores them until Confirm is pressed"; S06 Controls "Existing panel ... Service size, main
// breaker, panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read
// from directory photo; user confirms), existing large appliances (range, dryer, AC, water heater)"; S06 Data shown
// 2-pole "1-3"; vault/build/assumptions.md EZD-606). The read values are the stub recording's (Square D, 200 A,
// 40 spaces); the board circuits are test-fixture.ts's (Range on 1-3, the rest on 12 to 24).
import { parseStoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change } from '../model/patches';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import {
  confirmDirectory,
  confirmLabel,
  existingPanelChanges,
  existingPanelForm,
  existingPanelInputs,
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
