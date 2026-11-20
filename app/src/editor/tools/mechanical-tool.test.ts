// EZD-731 AC-EZD-731-1: equipment and registers are placed from the Fixtures panel's Mechanical section. Expected
// values from vault/build/assumptions.md EZD-731 (air handler 22" × 22", condenser 30" × 30", registers at the EZD-229
// sizes, supply 10" × 4" and return 20" × 20"; the View's status, not forced Existing) and EZD-214 (the View's status
// through ctx.status).
import { parseStoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { MECHANICAL_KINDS, mechanicalChoice, placeFixture } from './fixture-tool';
import { F1, idSeq, uid } from './test-utils/fixtures';

describe('EZD-731 placing mechanical equipment and registers', () => {
  it('the panel lists the air handler, condenser, supply and return registers', () => {
    expect([...MECHANICAL_KINDS]).toEqual(['air_handler', 'condenser', 'supply', 'return']);
  });

  it.each([
    ['air_handler', 22, 22],
    ['condenser', 30, 30],
    ['supply', 10, 4],
    ['return', 20, 20],
  ] as const)('a %s is an hvac object at its starting size, centred on the click', (kind, w, d) => {
    const change = placeFixture(mechanicalChoice(kind), { x: 48, y: 96 }, {
      level: F1,
      objects: [],
      newId: idSeq(1),
      status: 'new',
    });
    expect(change).not.toBeNull();
    expect(change!.id).toBe(uid(1));
    expect(change!.value!.type).toBe('hvac');
    const parsed = parseStoredObject({
      id: change!.id,
      type: 'hvac',
      schema_version: change!.value!.schemaVersion,
      data: change!.value!.data,
    });
    expect(parsed.ok).toBe(true);
    expect(change!.value!.data).toEqual({
      geometry: { center: { x: 48, y: 96 }, axis: { x: 1, y: 0 } },
      status: 'new',
      level: F1,
      attributes: { kind, width: w, depth: d },
    });
  });

  it('takes the View status: Existing in the Existing view, Demo when given', () => {
    const at = { x: 0, y: 0 };
    const base = { level: F1, objects: [], newId: idSeq(1) };
    const statusOf = (status?: 'existing' | 'demo') =>
      (placeFixture(mechanicalChoice('condenser'), at, status ? { ...base, status } : base)!.value!
        .data as { status: string }).status;
    expect(statusOf('existing')).toBe('existing');
    expect(statusOf('demo')).toBe('demo');
    expect(statusOf()).toBe('existing');
  });
});
