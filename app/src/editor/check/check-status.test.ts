// EZD-612 (phase-06 EZD-612 row: Warnings, Needs a value, Checklist; S06 Check status pill: green with no open
// warnings, amber with the count, grey "Check not run" after a change; AC-EZD-612-3 "accepting a warning with a note
// removes it from the open count"). Counts come from the fixtures' own results, not from running the engine.
import type { CheckResult } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import {
  checkTime,
  groupOf,
  groupResults,
  openCount,
  pillState,
  type CodeCheckRun,
} from './check-status';

const r = (ruleId: string, objectId: string, over: Partial<CheckResult> = {}): CheckResult => ({
  ruleId,
  code: 'company',
  edition: 'fbc9_nec2023',
  section: null,
  url: null,
  type: 'automatic',
  status: 'fail',
  severity: 'warning',
  objectId,
  objectType: 'device',
  unverified: true,
  ...over,
});

const AT = '2026-11-25T15:41:00.000Z';
const run = (accepted: CodeCheckRun['accepted'] = []): CodeCheckRun => ({
  runId: 'run-1',
  edition: 'fbc9_nec2023',
  createdAt: AT,
  results: [
    r('BC-001', 'toilet'),
    r('FC-001', 'fan'),
    r('BC-004', 'shower', { status: 'cannot_check', need: 'Minimum shower area' }),
    r('R3-001', 'room', { type: 'reminder', status: 'reminder' }),
    r('BC-003', 'old-lav', { severity: 'note' }),
  ],
  accepted,
});
const accepted = (ruleId: string, objectId: string) => ({
  ruleId,
  objectId,
  edition: 'fbc9_nec2023',
  note: 'Owner accepts.',
  by: 'u1',
  byName: 'Josh',
  at: AT,
  objectSeq: 1,
});

describe('EZD-612 check results', () => {
  it('groups: failing warnings, cannot-check, reminders, and notes on unaltered work', () => {
    expect(groupOf({ status: 'fail', severity: 'warning' })).toBe('warnings');
    expect(groupOf({ status: 'cannot_check', severity: 'warning' })).toBe('needs_value');
    expect(groupOf({ status: 'reminder', severity: 'warning' })).toBe('checklist');
    expect(groupOf({ status: 'fail', severity: 'note' })).toBe('notes');
    const g = groupResults(run());
    expect(g.warnings.map((i) => i.result.ruleId)).toEqual(['BC-001', 'FC-001']);
    expect(g.needs_value.map((i) => i.result.ruleId)).toEqual(['BC-004']);
    expect(g.checklist.map((i) => i.result.ruleId)).toEqual(['R3-001']);
    expect(g.notes.map((i) => i.result.ruleId)).toEqual(['BC-003']);
  });

  it('AC-EZD-612-3 an accepted warning keeps its note and leaves the open count', () => {
    expect(openCount(run())).toBe(2);
    const done = run([accepted('FC-001', 'fan')]);
    expect(openCount(done)).toBe(1);
    expect(
      groupResults(done).warnings.find((i) => i.result.ruleId === 'FC-001')?.accepted?.note,
    ).toBe('Owner accepts.');
  });

  it('the pill: not run, warnings with the count, pass, and grey again after a change', () => {
    expect(pillState(null, false)).toEqual({ kind: 'not_run' });
    expect(pillState(run(), false)).toEqual({ kind: 'warnings', at: AT, count: 2 });
    expect(
      pillState(run([accepted('FC-001', 'fan'), accepted('BC-001', 'toilet')]), false),
    ).toEqual({
      kind: 'pass',
      at: AT,
    });
    expect(pillState(run(), true)).toEqual({ kind: 'not_run' });
  });

  it('the time reads as the board does ("10:41 AM")', () => {
    expect(checkTime(AT, 'en-US', 'America/New_York')).toBe('10:41 AM');
  });
});
