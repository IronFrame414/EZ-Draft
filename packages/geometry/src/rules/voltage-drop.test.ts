// EZD-610: expected values come from 09b "Voltage drop formula" (test value 3.67 V = 3.1%) and its K and CM lists.
import { describe, expect, it } from 'vitest';
import {
  CIRCULAR_MILS,
  generalCircuitAmps,
  suggestWireSize,
  voltageDrop,
  voltageDropWarns,
  type VoltageDropInput,
} from './voltage-drop';

const board: VoltageDropInput = {
  wire: '12',
  material: 'copper',
  amps: generalCircuitAmps(20),
  runFt: 58,
  volts: 120,
};

describe('EZD-610 voltage drop (09b)', () => {
  it('AC-EZD-610-1: a 20 A circuit on 12 AWG copper at 58 ft gives 3.67 V = 3.1% at 16 A, 120 V', () => {
    expect(generalCircuitAmps(20)).toBe(16);
    const d = voltageDrop(board);
    expect(d.volts).toBeCloseTo(3.67, 2);
    expect(d.percent.toFixed(1)).toBe('3.1');
  });

  it('AC-EZD-610-2: with a 3% threshold it warns', () => {
    expect(voltageDropWarns(voltageDrop(board).percent, 3)).toBe(true);
  });

  it('warns only strictly above the threshold, on the unrounded value, never while Not set', () => {
    expect(voltageDropWarns(3, 3)).toBe(false);
    expect(voltageDropWarns(3.04, 3)).toBe(true); // shown as 3.0, still above
    expect(voltageDropWarns(3.67, null)).toBe(false);
    expect(voltageDropWarns(2.9, 3)).toBe(false);
  });

  it('uses K 21.2 for aluminum and 240 V for a 2-pole circuit', () => {
    // 2 x 21.2 x 16 x 58 / 6,530 = 6.025 V; / 240 = 2.51%
    const d = voltageDrop({ ...board, material: 'aluminum', volts: 240 });
    expect(d.volts).toBeCloseTo(6.025, 2);
    expect(d.percent).toBeCloseTo(2.51, 2);
  });

  it('takes the 09b and code-rules circular mils', () => {
    expect(CIRCULAR_MILS['14']).toBe(4110);
    expect(CIRCULAR_MILS['10']).toBe(10380);
    expect(CIRCULAR_MILS['6']).toBe(26240);
    expect(CIRCULAR_MILS['4/0']).toBe(211600);
  });

  it('suggests the next 09b size that brings it under the threshold: 10 AWG gives 1.9%', () => {
    expect(suggestWireSize(board, 3)).toBe('10');
    // 2 x 12.9 x 16 x 58 / 10,380 = 2.31 V = 1.9%
    expect(voltageDrop({ ...board, wire: '10' }).percent.toFixed(1)).toBe('1.9');
  });

  it('suggests no size when even 6 AWG is over (the text is "Shorten the run.")', () => {
    // 6 AWG at 400 ft: 2 x 12.9 x 16 x 400 / 26,240 = 6.29 V = 5.2%
    expect(suggestWireSize({ ...board, runFt: 400 }, 3)).toBeNull();
    expect(suggestWireSize({ ...board, wire: '6' }, 1)).toBeNull();
  });
});
