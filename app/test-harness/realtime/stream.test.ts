// EZD-291 J1–J8 (vault/plans/EZD-291.md section 4; AC-EZD-291-1). Pure unit tests of stepOutcome,
// eventsBetween and probeIndex on literal event lists. Expected values come from the plan's Decided rows.
import { describe, expect, it } from 'vitest';
import { eventsBetween, probeIndex, stepOutcome, type StepState } from './stream';

const U = 'user_permission.updated';
const P = (n: string) => ({ event: 'test.probe', payload: { probe: n } });
const base: StepState = {
  fenceSeen: true,
  pidBefore: 7,
  pidAfter: 7,
  statusesBefore: 1,
  statusesAfter: 1,
};

describe('EZD-291 stream helpers', () => {
  it('J1 stepOutcome: fence seen, same walsender, no rejoin is complete', () => {
    expect(stepOutcome(base)).toBe('complete');
  });
  it('J2 stepOutcome: no fence is interrupted', () => {
    expect(stepOutcome({ ...base, fenceSeen: false })).toBe('interrupted');
  });
  it('J3 stepOutcome: a new walsender is interrupted', () => {
    expect(stepOutcome({ ...base, pidAfter: 8 })).toBe('interrupted');
  });
  it('J4 stepOutcome: no stream pid at all is interrupted', () => {
    expect(stepOutcome({ ...base, pidBefore: null, pidAfter: null })).toBe('interrupted');
  });
  it('J5 stepOutcome: a rejoin (more statuses) is interrupted', () => {
    expect(stepOutcome({ ...base, statusesAfter: 3 })).toBe('interrupted');
  });

  const events = [
    { event: U, payload: { a: 1 } },
    P('s'),
    { event: U, payload: {} },
    { event: 'other.x', payload: {} },
    P('e'),
    { event: U, payload: { b: 2 } },
  ];
  it('J6 eventsBetween: only the named events between the two probes', () => {
    expect(eventsBetween(events, 's', 'e', U)).toEqual([{ event: U, payload: {} }]);
  });
  it('J7 eventsBetween: null when a probe is missing or the order is reversed', () => {
    expect(eventsBetween(events, 's', 'zz', U)).toBeNull();
    expect(eventsBetween(events, 'e', 's', U)).toBeNull();
  });
  it('J8 probeIndex: first probe event with that nonce, else -1', () => {
    const list = [
      { event: 'test.probe', payload: null },
      { event: 'other.x', payload: { probe: 'n' } },
      P('n'),
    ];
    expect(probeIndex(list, 'n')).toBe(2);
    expect(probeIndex(list, 'm')).toBe(-1);
  });
});
