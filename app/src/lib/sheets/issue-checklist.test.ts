// EZD-716 (AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"; S13 Validation "Issue gates (Round 12): code
// check reviewed (warnings fixed or noted), no red/orphan flags (e.g. "not on a wall"), title block complete";
// phase-07 EZD-716 "Load calc complete only when the set contains E2.0"; Q-0205): the pure checklist. Expected values
// are the spec's: a red gate holds Issue, an amber warning never does.
import { describe, expect, it } from 'vitest';
import { createOpeningData, createWallData, type ModelObject, type WallObject } from '@ezdraft/geometry';
import { engineerLettersMissing, issueChecklist, orphanFlags, type IssueFacts } from './issue-checklist';

const W1 = '00000000-0000-4000-8000-0000000000a1';
const D1 = '00000000-0000-4000-8000-0000000000d1';
const N1 = '00000000-0000-4000-8000-0000000000e1';
const LEVEL = '00000000-0000-4000-8000-0000000000f1';

function wall(): WallObject {
  const r = createWallData({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, level: LEVEL });
  if (!r.ok) throw new Error(r.reason);
  return { id: W1, type: 'wall', data: r.data };
}

function door(host: WallObject, hosted: boolean): ModelObject {
  const data = createOpeningData({ kind: 'door', host, center: { x: 72, y: 0 } });
  return {
    id: D1,
    type: 'opening',
    data: hosted ? data : { ...data, geometry: { ...data.geometry, hostWallId: null, axis: { x: 1, y: 0 } } },
  };
}

const SHEETS = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0'];

const clear: IssueFacts = {
  sheets: SHEETS,
  titleBlockMissing: [],
  codeCheck: { state: 'run', at: '2026-11-26T15:41:00Z', open: 0, accepted: 1 },
  orphans: [],
  loadCalc: { state: 'none' },
  engineerLettersMissing: 0,
  rendersAwaiting: 0,
};

describe('EZD-716 orphanFlags', () => {
  it('flags a door with no host wall as Not on a wall', () => {
    const w = wall();
    expect(orphanFlags([w, door(w, false)])).toEqual([{ objectId: D1, kind: 'not_on_wall' }]);
  });

  it('flags a door whose host wall is gone', () => {
    expect(orphanFlags([door(wall(), true)])).toEqual([{ objectId: D1, kind: 'not_on_wall' }]);
  });

  it('a door standing on its host wall is not flagged', () => {
    const w = wall();
    expect(orphanFlags([w, door(w, true)])).toEqual([]);
  });
});

describe('EZD-716 issueChecklist', () => {
  it('AC-EZD-716-1: an orphan Not on a wall flag blocks Issue', () => {
    const w = wall();
    const orphans = orphanFlags([w, door(w, false)]);
    const out = issueChecklist({ ...clear, orphans });
    expect(out.blocked).toBe(true);
    expect(out.gates).toEqual(['orphan_flags']);
    const row = out.rows.find((r) => r.id === 'orphan_flags');
    expect(row).toEqual({ id: 'orphan_flags', status: 'gate', detail: { open: 1, sheets: 7 }, link: 'open' });
  });

  it('with every gate passing Issue is not blocked; rows in board order', () => {
    const w = wall();
    const out = issueChecklist({ ...clear, orphans: orphanFlags([w, door(w, true)]) });
    expect(out.blocked).toBe(false);
    expect(out.gates).toEqual([]);
    expect(out.rows.map((r) => r.id)).toEqual(['title_block', 'code_check', 'orphan_flags']);
    expect(out.rows.every((r) => r.status === 'pass')).toBe(true);
  });

  it('a missing title block field is a gate (S13 "title block complete")', () => {
    const out = issueChecklist({ ...clear, titleBlockMissing: ['parcel_number', 'owner'] });
    expect(out.gates).toEqual(['title_block']);
    expect(out.rows[0]).toMatchObject({ status: 'gate', detail: { missing: ['parcel_number', 'owner'] } });
  });

  it('an open code warning is a gate; accepted with a note it is not (S13 "fixed or noted")', () => {
    const open = issueChecklist({ ...clear, codeCheck: { state: 'run', at: 'x', open: 2, accepted: 0 } });
    expect(open.gates).toEqual(['code_check']);
    const noted = issueChecklist({ ...clear, codeCheck: { state: 'run', at: 'x', open: 0, accepted: 2 } });
    expect(noted.blocked).toBe(false);
  });

  it('a check not run is a warning, since Issue runs the check (S13 "Issuing runs the code check")', () => {
    const out = issueChecklist({ ...clear, codeCheck: { state: 'not_run' } });
    expect(out.blocked).toBe(false);
    expect(out.rows[1]).toMatchObject({ id: 'code_check', status: 'warning' });
  });

  it('Load calc complete shows only when the set contains E2.0', () => {
    expect(issueChecklist(clear).rows.some((r) => r.id === 'load_calc')).toBe(false);
    const withE2 = { ...clear, sheets: [...SHEETS, 'E1.0', 'E2.0'] };
    expect(issueChecklist(withE2).gates).toEqual(['load_calc']);
    const done = issueChecklist({
      ...withE2,
      loadCalc: { state: 'done', edition: 'NEC 2023', serviceAmps: 200, pass: true },
    });
    expect(done.blocked).toBe(false);
    expect(done.rows.find((r) => r.id === 'load_calc')?.status).toBe('pass');
  });

  it('warnings never block: renders awaiting approval and an engineer letter not on file (Q-0205)', () => {
    const out = issueChecklist({ ...clear, rendersAwaiting: 2, engineerLettersMissing: 1 });
    expect(out.blocked).toBe(false);
    expect(out.rows.slice(-2).map((r) => [r.id, r.status])).toEqual([
      ['engineer_letter', 'warning'],
      ['renders', 'warning'],
    ]);
  });
});

describe('EZD-716 engineerLettersMissing', () => {
  it('counts engineer notes whose letter is not on file', () => {
    const note = (letterOnFile: boolean): ModelObject => ({
      id: N1,
      type: 'engineer_note',
      data: {
        geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
        status: 'existing',
        level: LEVEL,
        attributes: {
          wallId: W1,
          action: 'delete',
          engineerName: letterOnFile ? 'A. Engineer' : '',
          approvedText: letterOnFile ? 'Approved' : '',
          fileId: null,
          letterOnFile,
        },
      },
    });
    expect(engineerLettersMissing([note(false)])).toBe(1);
    expect(engineerLettersMissing([note(true)])).toBe(0);
  });
});
