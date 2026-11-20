// EZD-601 AC-EZD-601-1 (S06 Controls Devices tab, Circuit row, Circuit/space footer; S06 Data shown circuit number
// "single or 2-pole e.g. "1-3""; board S06Electrical footer "8 circuits · 9 spaces", "19,551 VA"). Expected values
// from the board and the spec, never the code: the board's eight circuits are 1500 + 1500 + 720 + 1200 + 960 + 1500
// + 12000 + 171 = 19,551 VA, and seven 1-pole circuits plus the 2-pole Range take 9 spaces.
import { describe, expect, it } from 'vitest';
import { F1, F2, uid } from '../tools/test-utils/fixtures';
import { circuitNumber, circuitRows, deviceGroups, panelRows, panelTotals } from './electrical';
import { electricalObjects, FAMILY, KITCHEN, PANEL_A, SUBPANEL_B } from './test-fixture';

describe('EZD-601 electrical left panel data', () => {
  it('numbers a 1-pole circuit by its space and a 2-pole one as "1-3"', () => {
    expect(circuitNumber(12, 1)).toBe('12');
    expect(circuitNumber(1, 2)).toBe('1-3');
  });

  it('AC-1 footer: the board panel shows 8 circuits, 9 spaces and 19,551 VA', () => {
    const rows = circuitRows(electricalObjects(), PANEL_A);
    expect(panelTotals(rows)).toEqual({ circuits: 8, spaces: 9, va: 19551 });
  });

  it('lists the panel circuits by space, the Range as 1-3', () => {
    const rows = circuitRows(electricalObjects(), PANEL_A);
    expect(rows.map((r) => r.number)).toEqual(['1-3', '12', '14', '16', '18', '20', '22', '24']);
    expect(rows[0]).toMatchObject({ name: 'Range', breaker: 50, poles: 2, load: 12000 });
  });

  it('panel selector: the main panel first, then its subpanel; each lists only its own circuits', () => {
    const objects = electricalObjects({ subpanel: true });
    expect(panelRows(objects).map((p) => [p.id, p.name, p.mainBreaker])).toEqual([
      [PANEL_A, 'Panel A', 200],
      [SUBPANEL_B, 'Panel B', 100],
    ]);
    expect(panelTotals(circuitRows(objects, PANEL_A))).toEqual({
      circuits: 8,
      spaces: 9,
      va: 19551,
    });
    expect(panelTotals(circuitRows(objects, SUBPANEL_B))).toEqual({
      circuits: 1,
      spaces: 1,
      va: 1500,
    });
  });

  it('AC-1 Devices: grouped by room, rooms in order, then the devices in no room; type, circuit, GFCI/AFCI', () => {
    const groups = deviceGroups(electricalObjects(), F1);
    expect(groups.map((g) => [g.roomId, g.name])).toEqual([
      [KITCHEN, 'Kitchen'],
      [FAMILY, 'Family room'],
      [null, null],
    ]);
    expect(groups[0]!.devices).toEqual([
      { id: uid(301), kind: 'smoke_co_detector', status: 'new', circuit: '24', protection: 'afci' },
      { id: uid(302), kind: 'smoke_detector', status: 'new', circuit: '14', protection: 'gfci' },
    ]);
    expect(groups[1]!.devices).toEqual([
      { id: uid(303), kind: 'co_detector', status: 'new', circuit: null, protection: null },
    ]);
    expect(groups[2]!.devices).toEqual([
      { id: uid(304), kind: 'smoke_detector', status: 'new', circuit: null, protection: null },
    ]);
  });

  it('lists only the chosen floor devices, and nothing without a panel', () => {
    expect(deviceGroups(electricalObjects(), F2)).toEqual([]);
    expect(circuitRows(electricalObjects(), null)).toEqual([]);
    expect(panelTotals([])).toEqual({ circuits: 0, spaces: 0, va: 0 });
  });
});
