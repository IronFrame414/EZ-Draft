// EZD-409 (AC-EZD-409-1 "Schedule counts match the plan", AC-EZD-409-2 "The CSV has one row per code"; S04
// "Cabinet schedule ... code, qty, finish, notes"; 08 Exports). Expected values are counted by hand from board S04's
// back wall run (test-utils/board-run.ts: F3, B15, DW24, SB36, B18, B21 in the base row, W1530 and W3030 above, all
// New, no finish) plus an "Island" run built here: two B15 (one Existing, finish "Shaker, Midnight"), one SB36
// (finish "Shaker, White"), one B24 marked Demo, and one F3 on another floor.
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { modelObjects } from './cabinet-view';
import { cabinetSchedule, cabinetScheduleCsv, scheduleNotesText } from './cabinet-schedule';
import { boardModel, CAB_FLOOR } from './test-utils/board-run';

const FLOOR_2 = '44444444-4444-4444-8444-444444444444';
const ISLAND = 'd0000000-0000-4000-8000-000000000001';
const UPSTAIRS = 'd0000000-0000-4000-8000-000000000002';
const isl = (n: number) => `d0000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;

const box = (
  code: string,
  width: number,
  status: string,
  finish: string | null,
  level = CAB_FLOOR,
): ObjectValue => ({
  type: 'cabinet_box',
  schemaVersion: 6,
  data: {
    status,
    level,
    attributes: {
      code,
      boxType: code.startsWith('SB') ? 'sink_base' : 'base',
      width,
      depth: 24,
      height: 34.5,
      faceLayout: code.startsWith('SB') ? 'false_drawer_doors_2' : 'drawer_door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish,
    },
  },
});

const run = (name: string, level: string, base: string[]): ObjectValue => ({
  type: 'cabinet_run',
  schemaVersion: 6,
  data: {
    geometry: { hostWallId: null, start: { x: 0, y: 60 }, axis: { x: 1, y: 0 } },
    level,
    attributes: { name, base, upper: [] },
  },
});

function kitchen() {
  const m = new Map(boardModel());
  m.set(isl(1), box('B15', 15, 'new', 'Shaker, Midnight'));
  m.set(isl(2), box('B15', 15, 'existing', 'Shaker, Midnight'));
  m.set(isl(3), box('SB36', 36, 'new', 'Shaker, White'));
  m.set(isl(4), box('B24', 24, 'demo', null));
  m.set(ISLAND, run('Island', CAB_FLOOR, [isl(1), isl(2), isl(3), isl(4)]));
  m.set(FLOOR_2, { type: 'floor', schemaVersion: 6, data: { name: 'Floor 2', order: 2 } });
  m.set(isl(5), {
    type: 'cabinet_filler',
    schemaVersion: 6,
    data: {
      status: 'new',
      level: FLOOR_2,
      attributes: {
        code: 'F3',
        width: 3,
        depth: 24,
        height: 34.5,
        scribe: 0,
        catalogItemId: null,
        finish: null,
      },
    },
  });
  m.set(UPSTAIRS, run('Upstairs bath', FLOOR_2, [isl(5)]));
  return modelObjects(m);
}

const TEXT = {
  headers: ['Code', 'Qty', 'Finish', 'Notes'] as const,
  existing: (n: number) => `${n} existing`,
};

describe('EZD-409 cabinet schedule', () => {
  it('AC-EZD-409-1: the board run alone: one of each code on the plan, sorted by code', () => {
    const rows = cabinetSchedule(modelObjects(boardModel()));
    expect(rows.map((r) => [r.code, r.qty])).toEqual([
      ['B15', 1],
      ['B18', 1],
      ['B21', 1],
      ['DW24', 1],
      ['F3', 1],
      ['SB36', 1],
      ['W1530', 1],
      ['W3030', 1],
    ]);
    expect(rows.every((r) => r.finishes.length === 0 && r.runs.join() === 'Back wall run')).toBe(
      true,
    );
  });

  it('AC-EZD-409-1: counts every run on every floor; Demo boxes are left out; Existing count and are noted', () => {
    const rows = cabinetSchedule(kitchen());
    const by = new Map(rows.map((r) => [r.code, r]));
    // B15: 1 back wall + 2 island (one Existing).
    expect(by.get('B15')).toEqual({
      code: 'B15',
      qty: 3,
      finishes: ['Shaker, Midnight'],
      runs: ['Back wall run', 'Island'],
      existing: 1,
    });
    // SB36: 1 back wall + 1 island.
    expect(by.get('SB36')?.qty).toBe(2);
    expect(by.get('SB36')?.finishes).toEqual(['Shaker, White']);
    // F3: back wall + upstairs.
    expect(by.get('F3')?.qty).toBe(2);
    expect(by.get('F3')?.runs).toEqual(['Back wall run', 'Upstairs bath']);
    // The Demo B24 is not on the schedule.
    expect(by.has('B24')).toBe(false);
    // 8 back wall + 3 island (the Demo B24 left out) + 1 upstairs.
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(12);
    expect(rows).toHaveLength(8);
  });

  it('codes group regardless of case and spaces; numbers in codes sort as numbers', () => {
    const m = new Map(boardModel());
    m.set(isl(1), box(' b15', 15, 'new', null));
    m.set(isl(2), box('B9', 9, 'new', null));
    m.set(ISLAND, run('Island', CAB_FLOOR, [isl(1), isl(2)]));
    const rows = cabinetSchedule(modelObjects(m));
    expect(rows.slice(0, 2).map((r) => [r.code, r.qty])).toEqual([
      ['B9', 1],
      ['B15', 2],
    ]);
  });

  it('a member left out of every run row is not counted; no runs means no rows', () => {
    const m = new Map(boardModel());
    m.set(isl(1), box('B30', 30, 'new', null));
    expect(cabinetSchedule(modelObjects(m)).some((r) => r.code === 'B30')).toBe(false);
    expect(cabinetSchedule([])).toEqual([]);
  });

  it('notes: run names, then the Existing count', () => {
    const b15 = cabinetSchedule(kitchen()).find((r) => r.code === 'B15')!;
    expect(scheduleNotesText(b15, TEXT.existing)).toBe('Back wall run, Island; 1 existing');
  });
});

describe('EZD-409 cabinet schedule CSV', () => {
  it('AC-EZD-409-2: a heading row, then exactly one row per code', () => {
    const csv = cabinetScheduleCsv(cabinetSchedule(kitchen()), TEXT);
    expect(csv).toBe(
      [
        'Code,Qty,Finish,Notes',
        'B15,3,"Shaker, Midnight","Back wall run, Island; 1 existing"',
        'B18,1,,Back wall run',
        'B21,1,,Back wall run',
        'DW24,1,,Back wall run',
        'F3,2,,"Back wall run, Upstairs bath"',
        'SB36,2,"Shaker, White","Back wall run, Island"',
        'W1530,1,,Back wall run',
        'W3030,1,,Back wall run',
        '',
      ].join('\r\n'),
    );
    const body = csv.trimEnd().split('\r\n').slice(1);
    const codes = body.map((l) => l.split(',')[0]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('two finishes on one code stay one row; quotes are doubled; a formula-like cell is kept as text', () => {
    const m = new Map(boardModel());
    m.set(isl(1), box('B15', 15, 'new', 'Maple "Natural"'));
    m.set(isl(2), box('=B15', 15, 'new', null));
    m.set(ISLAND, run('Island', CAB_FLOOR, [isl(1), isl(2)]));
    const csv = cabinetScheduleCsv(cabinetSchedule(modelObjects(m)), TEXT);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines.filter((l) => l.startsWith('B15,'))).toEqual([
      'B15,2,"Maple ""Natural""","Back wall run, Island"',
    ]);
    expect(lines).toContain("'=B15,1,,Island");
  });

  it('two different finishes on a code are joined in one cell', () => {
    const m = new Map(boardModel());
    m.set(isl(1), box('B21', 21, 'new', 'Shaker, White'));
    m.set(isl(2), box('B21', 21, 'new', 'Slab, Walnut'));
    m.set(ISLAND, run('Island', CAB_FLOOR, [isl(1), isl(2)]));
    const csv = cabinetScheduleCsv(cabinetSchedule(modelObjects(m)), TEXT);
    expect(csv.split('\r\n').filter((l) => l.startsWith('B21,'))).toEqual([
      'B21,3,"Shaker, White / Slab, Walnut","Back wall run, Island"',
    ]);
  });
});
