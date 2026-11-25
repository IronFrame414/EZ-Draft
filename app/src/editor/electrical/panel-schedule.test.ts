// EZD-609 AC-EZD-609-1 "Schedule rows match the circuits." Expected values are typed by hand from the fixture (board
// S06Electrical's Panel A: 40 spaces, Range 1-3 2-pole 50A, circuits 12 to 24) and the spec: S06 Controls Panel tab
// "two columns of spaces (odd/even) with circuit number, name, breaker; open spaces shown empty", Panel schedule
// "space, circuit, breaker size, poles, wire size, AFCI/GFCI type, load; flags spaces left"; S06 States "No spaces
// left: New circuit disabled; panel schedule flags it"; vault/build/assumptions.md EZD-604 "2-pole numbering" (a
// 2-pole circuit takes two spaces on one side, "1-3") and EZD-609 (spaces Not set).
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { uid } from '../tools/test-utils/fixtures';
import { circuitEditChange, nextOpenSpace } from './circuits';
import { panelSchedule, scheduleRows, type ScheduleSpace } from './panel-schedule';
import { circuitValue, electricalObjects, PANEL_A, panelValue, SUBPANEL_B } from './test-fixture';

const setSpaces = (objects: Map<string, ObjectValue>, id: string, spaces: number | null) => {
  (objects.get(id)!.data as { attributes: { spaces: number | null } }).attributes.spaces = spaces;
};

// What a space shows: its number and, when taken, the circuit number, name, breaker, poles, wire, type and load.
const view = (s: ScheduleSpace) =>
  s.circuit === null
    ? { space: s.space }
    : {
        space: s.space,
        first: s.first,
        number: s.circuit.number,
        name: s.circuit.name,
        breaker: s.circuit.breaker,
        poles: s.circuit.poles,
        protection: s.circuit.protection,
        load: s.circuit.load,
      };

describe('EZD-609 panel schedule', () => {
  it('AC-1 every space of Panel A in order, each circuit in its space with its own values', () => {
    const schedule = panelSchedule(electricalObjects(), PANEL_A)!;
    expect(schedule.spaces.map((s) => s.space)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    const taken = schedule.spaces.filter((s) => s.circuit !== null).map(view);
    expect(taken).toEqual([
      {
        space: 1,
        first: true,
        number: '1-3',
        name: 'Range',
        breaker: 50,
        poles: 2,
        protection: null,
        load: 12000,
      },
      {
        space: 3,
        first: false,
        number: '1-3',
        name: 'Range',
        breaker: 50,
        poles: 2,
        protection: null,
        load: 12000,
      },
      {
        space: 12,
        first: true,
        number: '12',
        name: 'Small appl. 1',
        breaker: 20,
        poles: 1,
        protection: 'gfci',
        load: 1500,
      },
      {
        space: 14,
        first: true,
        number: '14',
        name: 'Small appl. 2',
        breaker: 20,
        poles: 1,
        protection: 'gfci',
        load: 1500,
      },
      {
        space: 16,
        first: true,
        number: '16',
        name: 'Refrigerator',
        breaker: 20,
        poles: 1,
        protection: null,
        load: 720,
      },
      {
        space: 18,
        first: true,
        number: '18',
        name: 'Dishwasher',
        breaker: 20,
        poles: 1,
        protection: 'gfci',
        load: 1200,
      },
      {
        space: 20,
        first: true,
        number: '20',
        name: 'Disposal',
        breaker: 20,
        poles: 1,
        protection: 'gfci',
        load: 960,
      },
      {
        space: 22,
        first: true,
        number: '22',
        name: 'Microwave, OTR',
        breaker: 20,
        poles: 1,
        protection: null,
        load: 1500,
      },
      {
        space: 24,
        first: true,
        number: '24',
        name: 'Kitchen lighting',
        breaker: 15,
        poles: 1,
        protection: 'afci',
        load: 171,
      },
    ]);
    // Each of the panel's eight circuits starts exactly one space; the subpanel's circuit is not on Panel A.
    const starts = schedule.spaces.filter((s) => s.circuit !== null && s.first);
    expect(starts).toHaveLength(8);
    expect(new Set(starts.map((s) => s.circuit!.id)).size).toBe(8);
  });

  it('AC-1 flags spaces left: 40 spaces less the 9 the circuits take (1-3 takes two) is 31', () => {
    expect(panelSchedule(electricalObjects(), PANEL_A)!.spacesLeft).toBe(31);
  });

  it('compact rows pair the odd space on the left with the even one on the right; open spaces are empty', () => {
    const rows = scheduleRows(panelSchedule(electricalObjects(), PANEL_A)!);
    expect(rows).toHaveLength(20);
    expect(rows.every((r) => r.left.space % 2 === 1 && r.right.space === r.left.space + 1)).toBe(
      true,
    );
    expect([view(rows[0]!.left), view(rows[0]!.right)]).toEqual([
      {
        space: 1,
        first: true,
        number: '1-3',
        name: 'Range',
        breaker: 50,
        poles: 2,
        protection: null,
        load: 12000,
      },
      { space: 2 },
    ]);
    expect(rows[1]!.left.circuit?.name).toBe('Range');
    expect(rows[1]!.left.first).toBe(false);
    expect([rows[5]!.left.circuit, rows[5]!.right.circuit?.number]).toEqual([null, '12']);
    expect([rows[11]!.left.circuit, rows[11]!.right.circuit?.name]).toEqual([
      null,
      'Kitchen lighting',
    ]);
    expect(rows.slice(12).every((r) => r.left.circuit === null && r.right.circuit === null)).toBe(
      true,
    );
  });

  it('AC-1 follows an edit on the circuit (edits happen on circuits; nothing is stored in the schedule)', () => {
    const objects = electricalObjects();
    // Small appl. 2 is uid(202), space 14.
    for (const e of [
      { field: 'breaker', amps: 15 },
      { field: 'name', text: 'Island' },
    ] as const) {
      const change = circuitEditChange(objects, uid(202), e)!;
      objects.set(change.id, change.value as ObjectValue);
    }
    const s14 = panelSchedule(objects, PANEL_A)!.spaces[13]!;
    expect([s14.space, s14.circuit?.name, s14.circuit?.breaker]).toEqual([14, 'Island', 15]);
    // Kitchen lighting (uid(212), space 24) made 2-pole takes 24 and 26: "24-26", one space fewer left.
    const twoPole = circuitEditChange(objects, uid(212), { field: 'poles', poles: 2 })!;
    objects.set(twoPole.id, twoPole.value as ObjectValue);
    const after = panelSchedule(objects, PANEL_A)!;
    expect(after.spaces[23]!.circuit?.number).toBe('24-26');
    expect([after.spaces[25]!.circuit?.name, after.spaces[25]!.first]).toEqual([
      'Kitchen lighting',
      false,
    ]);
    expect(after.spacesLeft).toBe(30);
  });

  it('no spaces left: the schedule flags 0 exactly when New circuit has no space', () => {
    const objects = electricalObjects();
    setSpaces(objects, PANEL_A, 4);
    // Space 1-3 is the Range; 2 and 4 are new 1-pole circuits; 12 to 24 sit past the panel's spaces.
    for (const [n, space] of [
      [230, 2],
      [231, 4],
    ] as const)
      objects.set(
        uid(n),
        circuitValue({
          space,
          poles: 1,
          name: `C${space}`,
          breaker: 20,
          protection: null,
          dedicated: false,
          load: 0,
        }),
      );
    const schedule = panelSchedule(objects, PANEL_A)!;
    expect(schedule.spacesLeft).toBe(0);
    expect(nextOpenSpace(objects, PANEL_A)).toBeNull();
    // Circuits past the panel's spaces are still listed: the spaces run on to 24.
    expect(schedule.spaces).toHaveLength(24);
    expect(schedule.spaces[23]!.circuit?.name).toBe('Kitchen lighting');
  });

  it('spaces Not set: no flag, and the spaces run to the last taken, rounded up to even', () => {
    const objects = electricalObjects();
    setSpaces(objects, PANEL_A, null);
    const schedule = panelSchedule(objects, PANEL_A)!;
    expect(schedule.spacesLeft).toBeNull();
    expect(schedule.spaces).toHaveLength(24);
    // Only the Range on 1-3: four spaces, two rows.
    const only = new Map([...objects].filter(([k, v]) => v.type !== 'circuit' || k === uid(207)));
    expect(panelSchedule(only, PANEL_A)!.spaces.map((s) => s.space)).toEqual([1, 2, 3, 4]);
  });

  it('a subpanel lists only its own circuits; no panel gives no schedule', () => {
    const objects = electricalObjects({ subpanel: true });
    const b = panelSchedule(objects, SUBPANEL_B)!;
    expect(
      b.spaces.filter((s) => s.circuit !== null).map((s) => [s.space, s.circuit!.name]),
    ).toEqual([[1, 'Garage']]);
    expect(b.spacesLeft).toBe(39);
    expect(panelSchedule(objects, null)).toBeNull();
    const other = new Map(objects);
    other.set(uid(240), panelValue('Panel C', 100, PANEL_A));
    expect(panelSchedule(other, uid(240))!.spaces.every((s) => s.circuit === null)).toBe(true);
  });
});
