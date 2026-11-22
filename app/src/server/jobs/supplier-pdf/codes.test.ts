// EZD-915 (08 Imports "cabinet labels (W3030, B24…) set size and type"): the box each label names. Expected sizes:
// the seed line (vault/build/assumptions.md EZD-401: base-row boxes 24" deep x 34 1/2" high, wall boxes 12" deep x
// 30" high; codes B, DB, SB, W without a leading zero) and the code's own width and height (W1530 is width 15 then
// height 30, packages/geometry/src/cabinets/edit.ts).
import { describe, expect, it } from 'vitest';
import { parseCabinetCode } from './codes';

describe('EZD-915 cabinet codes', () => {
  it('B24 is a base box 24 wide, 24 deep, 34 1/2 high', () => {
    expect(parseCabinetCode('B24')).toEqual({
      code: 'B24',
      boxType: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
    });
  });

  it('W3030 is a wall box 30 wide, 12 deep, 30 high', () => {
    expect(parseCabinetCode('W3030')).toEqual({
      code: 'W3030',
      boxType: 'wall',
      width: 30,
      depth: 12,
      height: 30,
    });
  });

  it('a wall code gives its own height, or 30 without one', () => {
    expect(parseCabinetCode('W1542')).toMatchObject({ width: 15, height: 42, depth: 12 });
    expect(parseCabinetCode('W930')).toMatchObject({ width: 9, height: 30 });
    expect(parseCabinetCode('W36')).toMatchObject({ width: 36, height: 30 });
  });

  it('SB and DB are read before B', () => {
    expect(parseCabinetCode('SB36')).toMatchObject({ boxType: 'sink_base', width: 36, depth: 24, height: 34.5 });
    expect(parseCabinetCode('DB18')).toMatchObject({ boxType: 'drawer_base', width: 18 });
    expect(parseCabinetCode('B9')).toMatchObject({ boxType: 'base', width: 9 });
  });

  it('case and surrounding spaces are ignored', () => {
    expect(parseCabinetCode(' b24 ')).toMatchObject({ code: 'B24', boxType: 'base' });
  });

  it('anything else is not a cabinet label', () => {
    for (const text of ['F3', 'PLAN', 'ELEVATION A', 'B', 'B024', 'B240', 'W', 'W30300', '24', 'B24L', 'X24']) {
      expect(parseCabinetCode(text), text).toBeNull();
    }
  });
});
