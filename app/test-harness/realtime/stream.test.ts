// EZD-291 J1–J8 (vault/plans/EZD-291.md section 4; AC-EZD-291-1). Pure unit tests of stepOutcome,
// eventsBetween and probeIndex on literal event lists. Expected values come from the plan's Decided rows.
import { describe, expect, it } from 'vitest';
import type { Sql } from '../rls/db';
import {
  eventsBetween,
  nonProbeEvents,
  probeIndex,
  probeTarget,
  sendTopicProbe,
  stepOutcome,
  windowBetween,
  type StepState,
} from './stream';

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

describe('EZD-297 stream helpers', () => {
  const u = '00000000-0000-4000-8000-000000000001';
  const X = { event: 'a.x', payload: {} };
  const Y = { event: 'a.y', payload: {} };
  it('S1 probeTarget: user and project topics parse, anything else is null', () => {
    expect(probeTarget(`user:${u}`)).toEqual({ kind: 'user', id: u });
    expect(probeTarget(`project:${u}`)).toEqual({ kind: 'project', id: u });
    for (const t of [
      `tenant:${u}`,
      'project:not-a-uuid',
      'user:',
      // u has no letters, so its upper-case is itself; a letter-bearing id makes the case check real.
      'project:0000000a-0000-4000-8000-00000000000a'.toUpperCase(),
      `project:${u}:x`,
    ]) {
      expect(probeTarget(t), t).toBeNull();
    }
  });
  it('S2 windowBetween: events strictly between the probes, else null', () => {
    expect(windowBetween([P('a'), X, Y, P('b')], 'a', 'b')).toEqual([X, Y]);
    expect(windowBetween([P('a'), X, Y], 'a', 'b')).toBeNull();
    expect(windowBetween([P('b'), P('a')], 'a', 'b')).toBeNull();
  });
  it('S3 sendTopicProbe: a topic that is not user or project rejects before any SQL', async () => {
    await expect(sendTopicProbe({} as Sql, 'tenant:x')).rejects.toThrow('realtime_probe_topic');
  });
  it('S4 nonProbeEvents: drops the probes', () => {
    expect(nonProbeEvents([P('a'), X])).toEqual([X]);
  });
});
