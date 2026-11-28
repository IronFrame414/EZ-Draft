// EZD-610 (S06 Selected circuit block; 09b "Voltage drop formula"; AC-EZD-610-1, -2; vault/build/assumptions/
// EZD-610.md): the Selected circuit block's voltage drop, worked from the circuit in the model. Expected values come
// from 09b: 2 x 12.9 x 16 x 58 / 6,530 = 3.67 V = 3.1% at 120 V; with 10 AWG 2.31 V = 1.9%.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Objects } from '../model/patches';
import { F1, uid } from '../tools/test-utils/fixtures';
import { circuitEditChange } from './circuits';
import { circuitRows } from './electrical';
import { deviceValue, electricalObjects, PANEL_A } from './test-fixture';
import { circuitVoltageDrop, servedUtility, voltageDropThreshold } from './voltage-drop';

const SMALL_APPL_2 = uid(202); // space 14, 20 A, general
const REFRIGERATOR = uid(203); // space 16, 20 A, dedicated
const FRIDGE = uid(400);

const v = (type: string, data: Record<string, unknown>): ObjectValue => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

const row = (o: Objects, id: string) => circuitRows(o, PANEL_A).find((r) => r.id === id)!;

function withRun(o: Objects, id: string, feet: number | null): Objects {
  const c = circuitEditChange(o, id, { field: 'run', feet })!;
  return applyEditTo(o, makeEdit(o, [c]), 'forward');
}

// The board circuit: 12 AWG (board "12/2 NM-B"; the fixture's circuits are stored before EZD-604, without a wire).
function board(o: Objects, id: string): Objects {
  const c = circuitEditChange(o, id, { field: 'wire', size: '12' })!;
  return withRun(applyEditTo(o, makeEdit(o, [c]), 'forward'), id, 58);
}

describe('EZD-610 Selected circuit voltage drop', () => {
  it('AC-EZD-610-1: 20 A, 12 AWG copper, 58 ft gives 3.1% at 16 A, 120 V', () => {
    const o = board(electricalObjects(), SMALL_APPL_2);
    const d = circuitVoltageDrop(o, row(o, SMALL_APPL_2), 3);
    expect(d.amps).toBe(16);
    expect(d.volts).toBe(120);
    expect(d.shown).toBe('3.1');
  });

  it('AC-EZD-610-2: with a 3% threshold it warns and names 10 AWG', () => {
    const o = board(electricalObjects(), SMALL_APPL_2);
    const d = circuitVoltageDrop(o, row(o, SMALL_APPL_2), 3);
    expect(d.warns).toBe(true);
    expect(d.suggestion).toBe('10');
  });

  it('no warning while the threshold is Not set, nor at or under it', () => {
    const o = board(electricalObjects(), SMALL_APPL_2);
    expect(circuitVoltageDrop(o, row(o, SMALL_APPL_2), null)).toMatchObject({
      shown: '3.1',
      warns: false,
      threshold: null,
    });
    expect(circuitVoltageDrop(o, row(o, SMALL_APPL_2), 5).warns).toBe(false);
  });

  it('a blank run, or a wire Not set, shows no drop and no warning', () => {
    expect(
      circuitVoltageDrop(
        withRun(electricalObjects(), SMALL_APPL_2, 58),
        row(withRun(electricalObjects(), SMALL_APPL_2, 58), SMALL_APPL_2),
        3,
      ).shown,
    ).toBeNull();
    const o = electricalObjects();
    expect(row(o, SMALL_APPL_2).run).toBeNull();
    expect(row(o, SMALL_APPL_2).material).toBe('copper');
    const d = circuitVoltageDrop(o, row(o, SMALL_APPL_2), 3);
    expect(d).toMatchObject({ percent: null, shown: null, warns: false });
  });

  it('10 AWG on the same run gives 1.9% and no warning', () => {
    let o = board(electricalObjects(), SMALL_APPL_2);
    const c = circuitEditChange(o, SMALL_APPL_2, { field: 'wire', size: '10' })!;
    o = applyEditTo(o, makeEdit(o, [c]), 'forward');
    const d = circuitVoltageDrop(o, row(o, SMALL_APPL_2), 3);
    expect(d.shown).toBe('1.9');
    expect(d.warns).toBe(false);
  });

  it('aluminum takes K 21.2: 2 x 21.2 x 16 x 58 / 6,530 = 6.03 V = 5.0%', () => {
    let o = board(electricalObjects(), SMALL_APPL_2);
    const c = circuitEditChange(o, SMALL_APPL_2, { field: 'material', material: 'aluminum' })!;
    o = applyEditTo(o, makeEdit(o, [c]), 'forward');
    expect(row(o, SMALL_APPL_2).material).toBe('aluminum');
    expect(circuitVoltageDrop(o, row(o, SMALL_APPL_2), 3).shown).toBe('5.0');
  });

  it('a dedicated circuit takes its appliance utility point amps; without one, 80% of the breaker', () => {
    let o: Objects = board(electricalObjects(), REFRIGERATOR);
    expect(circuitVoltageDrop(o, row(o, REFRIGERATOR), 3).amps).toBe(16);
    const m = new Map(o);
    // A refrigerator 36 x 30 centred at (300, 300); a receptacle on circuit 16 inside it; its electric point 120 V 6 A.
    m.set(
      FRIDGE,
      v('fixture', {
        geometry: { center: { x: 300, y: 300 }, axis: { x: 0, y: 1 } },
        status: 'new',
        level: F1,
        attributes: { kind: 'refrigerator', width: 36, depth: 30 },
      }),
    );
    m.set(uid(401), deviceValue({ x: 300, y: 300 }, 'receptacle_duplex', REFRIGERATOR));
    m.set(
      uid(402),
      v('utility_point', {
        geometry: { point: { x: 300, y: 300 } },
        status: 'new',
        level: F1,
        attributes: { kind: 'electric', volts: 120, amps: 6, servesObjectId: FRIDGE },
      }),
    );
    o = m;
    expect(servedUtility(o, REFRIGERATOR)).toEqual({ amps: 6, volts: 120 });
    // 2 x 12.9 x 6 x 58 / 6,530 = 1.375 V = 1.1%
    const d = circuitVoltageDrop(o, row(o, REFRIGERATOR), 3);
    expect(d.amps).toBe(6);
    expect(d.shown).toBe('1.1');
    expect(d.warns).toBe(false);
  });

  it('a run must be above 0; null clears it', () => {
    const o = electricalObjects();
    expect(circuitEditChange(o, SMALL_APPL_2, { field: 'run', feet: 0 })).toBeNull();
    expect(circuitEditChange(o, SMALL_APPL_2, { field: 'run', feet: Number.NaN })).toBeNull();
    const set = withRun(o, SMALL_APPL_2, 58);
    expect(row(set, SMALL_APPL_2).run).toBe(58);
    expect(row(withRun(set, SMALL_APPL_2, null), SMALL_APPL_2).run).toBeNull();
  });

  it('reads the "Voltage-drop warning" Default; null while Not set', () => {
    expect(voltageDropThreshold({ voltage_drop_warning: 3 })).toBe(3);
    expect(voltageDropThreshold({ voltage_drop_warning: null })).toBeNull();
    expect(voltageDropThreshold({})).toBeNull();
  });
});
