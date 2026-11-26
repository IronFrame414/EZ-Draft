// EZD-703 (Q-0509 "the sheets phases give each plan sheet its floor"; Q-0763 "architectural sheets keep decimals (A1.1
// for a second floor)"; vault/build/assumptions/EZD-701.md "Plan sheets on a project with more than one floor"): each
// floor after the lowest adds its copy of the floor-plan sheets, numbered with the next decimal, after the sheet it
// copies and titled with the floor's name.
import { describe, expect, it } from 'vitest';
import { defaultSheetSet, floorCopyOf, withFloorSheets } from './sheet-set';

const F = (id: string, name: string) => ({ id, name });

describe('EZD-703 floor-plan sheets', () => {
  it('one floor keeps the default set', () => {
    const set = defaultSheetSet([]);
    expect(withFloorSheets(set, [F('a', 'Floor 1')])).toEqual(set);
    expect(withFloorSheets(set, [])).toEqual(set);
  });

  it('two floors add A1.1, A2.1, A3.1 (and A6.1 with the RCP) after the sheets they copy', () => {
    const floors = [F('a', 'Floor 1'), F('b', 'Second floor')];
    const numbers = withFloorSheets(defaultSheetSet(['rcp']), floors).map((s) => s.number);
    expect(numbers).toEqual([
      'A0.0', 'A1.0', 'A1.1', 'A2.0', 'A2.1', 'A3.0', 'A3.1', 'A4.0', 'A5.0', 'A6.0', 'A6.1', 'E1.0', 'E2.0', 'R1.0',
    ]);
    const a11 = withFloorSheets(defaultSheetSet([]), floors).find((s) => s.number === 'A1.1');
    expect(a11).toMatchObject({ title: 'Existing · Second floor', group: 'architectural' });
  });

  it('three floors number .1 and .2; applying it again changes nothing; a floor removed drops its copies', () => {
    const three = [F('a', 'F1'), F('b', 'F2'), F('c', 'F3')];
    const once = withFloorSheets(defaultSheetSet([]), three);
    expect(once.filter((s) => s.number.startsWith('A1.')).map((s) => s.number)).toEqual(['A1.0', 'A1.1', 'A1.2']);
    expect(withFloorSheets(once, three)).toEqual(once);
    expect(withFloorSheets(once, three.slice(0, 1))).toEqual(defaultSheetSet([]));
    expect(floorCopyOf('A3.2')).toEqual({ base: 'A3.0', floor: 2 });
    expect(floorCopyOf('A4.1')).toBeNull();
    expect(floorCopyOf('E1.1')).toBeNull();
  });
});
