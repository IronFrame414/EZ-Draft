// EZD-604 New circuit, circuit edits and assignment. Expected values from the spec and the recorded decisions, never
// the code: S06 Controls "New circuit | Creates a new circuit in the next open space ... Disabled when no spaces
// left"; S06 Data shown "number (single or 2-pole e.g. "1-3")"; phase-06 EZD-604 "default "Panel A"", "breaker, wire,
// name editable"; vault/build/assumptions.md EZD-604 ("New circuit defaults | 20 A, 1 pole, 12 AWG copper ... name
// "Circuit {n}"", "New panel values ... Default name "Panel A", status from the phase toggle, the three values Not set",
// "2-pole numbering | ... A 2-pole circuit takes two spaces on one side, written "1-3"", home-run tag "A-14" on board
// S06Electrical). The fixture is board S06Electrical's panel: spaces 1-3 (Range), 12, 14, ..., 24 taken.
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Change, type Objects } from '../model/patches';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import {
  assignChanges,
  circuitDeviceIds,
  circuitEditChange,
  newCircuitChanges,
  nextOpenSpace,
  panelLetter,
} from './circuits';
import { circuitNumber, circuitRows } from './electrical';
import { circuitValue, deviceValue, electricalObjects, PANEL_A, panelValue } from './test-fixture';

type Attrs = Record<string, unknown>;
const applyChanges = (o: Objects, changes: Change[]) =>
  applyEditTo(o, makeEdit(o, changes), 'forward') as Map<string, ObjectValue>;
const attrs = (v: ObjectValue | null | undefined) => (v!.data as { attributes: Attrs }).attributes;

let n = 900;
const ctx = (panelId: string | null) => ({
  panelId,
  level: F1,
  newId: () => uid(n++),
  status: 'new' as const,
  name: (num: string) => `Circuit ${num}`,
  panelName: 'Panel A',
});

describe('EZD-604 New circuit', () => {
  it('takes the next open space: on the board panel (1, 3, 12-24 taken) that is 2', () => {
    expect(nextOpenSpace(electricalObjects(), PANEL_A)).toBe(2);
  });

  it('a new circuit has the defaults: 20A, 1-pole, 12 AWG, "Circuit {n}", no VA yet', () => {
    const made = newCircuitChanges(electricalObjects(), ctx(PANEL_A))!;
    expect(made.changes).toHaveLength(1);
    const c = made.changes[0]!;
    expect(c.id).toBe(made.circuitId);
    expect(c.value!.type).toBe('circuit');
    expect(attrs(c.value)).toEqual({
      panel: PANEL_A,
      space: 2,
      poles: 1,
      name: 'Circuit 2',
      breaker: 20,
      protection: null,
      dedicated: false,
      load: 0,
      wire: '12',
      order: [],
    });
  });

  it('with no panel in the model, Panel A is made first with its values Not set', () => {
    const made = newCircuitChanges(baseObjects(), ctx(null))!;
    expect(made.changes).toHaveLength(2);
    const [panel, circuit] = made.changes;
    expect(panel!.value!.type).toBe('panel');
    expect((panel!.value!.data as { level: string; status: string }).level).toBe(F1);
    expect((panel!.value!.data as { status: string }).status).toBe('new');
    expect(attrs(panel!.value)).toEqual({
      name: 'Panel A',
      parentPanel: null,
      serviceSize: null,
      mainBreaker: null,
      spaces: null,
    });
    expect(attrs(circuit!.value)).toMatchObject({ panel: panel!.id, space: 1, name: 'Circuit 1' });
  });

  it('no space left: next space is null and New circuit makes nothing', () => {
    const objects = new Map(baseObjects());
    const full = panelValue('Panel A', 100, null);
    (full.data as { attributes: Attrs }).attributes.spaces = 2;
    objects.set(PANEL_A, full);
    for (const [id, space] of [
      [uid(500), 1],
      [uid(501), 2],
    ] as const)
      objects.set(
        id,
        circuitValue({
          space,
          poles: 1,
          name: 'x',
          breaker: 20,
          protection: null,
          dedicated: false,
          load: 0,
        }),
      );
    expect(nextOpenSpace(objects, PANEL_A)).toBeNull();
    expect(newCircuitChanges(objects, ctx(PANEL_A))).toBeNull();
  });
});

describe('EZD-604 circuit edits', () => {
  const SMALL_APPL_2 = uid(202); // space 14
  const KITCHEN_LIGHTING = uid(212); // space 24

  it('rename, breaker and wire', () => {
    const o = electricalObjects();
    expect(
      attrs(circuitEditChange(o, SMALL_APPL_2, { field: 'name', text: '  Island ' })!.value).name,
    ).toBe('Island');
    expect(circuitEditChange(o, SMALL_APPL_2, { field: 'name', text: '  ' })).toBeNull();
    expect(
      attrs(circuitEditChange(o, SMALL_APPL_2, { field: 'breaker', amps: 15 })!.value).breaker,
    ).toBe(15);
    expect(
      attrs(circuitEditChange(o, SMALL_APPL_2, { field: 'wire', size: '10' })!.value).wire,
    ).toBe('10');
  });

  it('2-pole takes the space two on: 14 cannot (16 is taken); 24 becomes "24-26"', () => {
    const o = electricalObjects();
    expect(circuitEditChange(o, SMALL_APPL_2, { field: 'poles', poles: 2 })).toBeNull();
    const c = circuitEditChange(o, KITCHEN_LIGHTING, { field: 'poles', poles: 2 })!;
    const a = attrs(c.value);
    expect(a.poles).toBe(2);
    expect(circuitNumber(a.space as number, a.poles as 1 | 2)).toBe('24-26');
    const rows = circuitRows(applyChanges(o, [c]), PANEL_A);
    expect(rows.find((r) => r.id === KITCHEN_LIGHTING)!.number).toBe('24-26');
  });
});

describe('EZD-604 assigning devices', () => {
  it('devices join the circuit in click order; moving one takes it out of its old circuit', () => {
    const o = new Map(electricalObjects());
    const c14 = uid(202);
    const c24 = uid(212);
    const d1 = uid(401);
    const d2 = uid(402);
    o.set(d1, deviceValue({ x: 10, y: 10 }, 'receptacle_duplex'));
    o.set(d2, deviceValue({ x: 60, y: 10 }, 'receptacle_duplex'));
    let s: Map<string, ObjectValue> = o;
    s = applyChanges(s, assignChanges(s, [d2], c14)!);
    s = applyChanges(s, assignChanges(s, [d1], c14)!);
    expect(attrs(s.get(d1)).circuit).toBe(c14);
    expect(attrs(s.get(c14)).order).toEqual([d2, d1]);
    // The fixture's smoke detector (uid 302) was on 14 before EZD-604 kept an order: it comes after the clicked ones.
    expect(circuitDeviceIds(s, c14)).toEqual([d2, d1, uid(302)]);
    s = applyChanges(s, assignChanges(s, [d2], c24)!);
    expect(attrs(s.get(c14)).order).toEqual([d1]);
    expect(attrs(s.get(c24)).order).toEqual([d2]);
    // Clicking a device already on the circuit changes nothing.
    expect(assignChanges(s, [d2], c24)).toEqual([]);
    // Unassigning takes it out of the order.
    s = applyChanges(s, assignChanges(s, [d2], null)!);
    expect(attrs(s.get(d2)).circuit).toBeNull();
    expect(attrs(s.get(c24)).order).toEqual([]);
  });

  it('refuses an id that is not a circuit or not a device', () => {
    const o = electricalObjects();
    expect(assignChanges(o, [uid(301)], uid(303))).toBeNull();
    expect(assignChanges(o, [uid(202)], uid(212))).toBeNull();
  });
});

describe('EZD-604 panel letter', () => {
  it('"Panel A" tags its circuits "A" (board "A-14"); a name without "Panel" is used whole', () => {
    expect(panelLetter('Panel A')).toBe('A');
    expect(panelLetter('panel B2')).toBe('B2');
    expect(panelLetter('Garage')).toBe('Garage');
  });
});
