// EZD-707 (phase-07 EZD-707 "the cabinet schedule PDF page"; 08 Exports "Cabinet schedule / order | CSV and on sheets |
// Code, qty, finish, notes"; vault/build/assumptions/EZD-707.md Settled "Where the cabinet schedule prints": on A4.0
// below the elevations, A4.1 when it does not fit). Expected values are worked by hand for a 24x36 sheet: the border
// is 24/48 = 1/2" in, so the drawing area starts at (0.5, 0.5) and is 23" high. Rows are 0.2" and a table has a title
// row and a heading row, so 3 codes make a 5-row, 1" table whose top is at 0.5 + 23 - 1 = 22.5", and the elevations
// keep 23 - 1 - 0.25 (gap) = 21.75". A4.0 gives the table a third of the area: floor(23 / 3 / 0.2) = 38 rows, 36 of
// them codes. A continuation sheet holds floor(23 / 0.2) - 2 = 113 codes. The columns are 1.25 + 0.6 + 2.75 + 3.4 = 8".
import { CURRENT_SCHEMA_VERSION, type StoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { CabinetScheduleRow } from '../cabinets/cabinet-schedule';
import { sheetJobInputs, sheetTableJobInput } from '../../lazy/sheets/renderer';
import type { ObjectValue } from '../outbox/model-api';
import { sheetJob } from '../../workers/sheet-job';
import {
  fitCellText,
  schedulePage,
  schedulePlan,
  scheduleRowsOf,
  scheduleTableFor,
  scheduleTableList,
  withScheduleSheets,
} from './cabinet-schedule-table';
import { defaultSheetSet } from './sheet-set';

const F1 = '11111111-1111-4111-8111-111111111111';
const RUN = '71111111-1111-4111-8111-111111111111';
const BOX_A = '72222222-2222-4222-8222-222222222222';
const BOX_B = '73333333-3333-4333-8333-333333333333';
const BOX_C = '74444444-4444-4444-8444-444444444444';

const row = (code: string, over: Partial<CabinetScheduleRow> = {}): CabinetScheduleRow => ({
  code,
  qty: 1,
  finishes: [],
  runs: ['Back wall run'],
  existing: 0,
  ...over,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(`B${i + 1}`));

const boxData = (code: string, status: string, finish: string | null) => ({
  status,
  level: F1,
  attributes: {
    code,
    boxType: 'base',
    width: 15,
    depth: 24,
    height: 34.5,
    faceLayout: 'door_1',
    hingeSide: 'left',
    finishedEnds: 'none',
    catalogItemId: null,
    finish,
  },
});
const runData = {
  geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
  level: F1,
  attributes: { name: 'Back wall run', base: [BOX_A, BOX_B, BOX_C], upper: [] },
};
const MODEL: [string, string, unknown][] = [
  [F1, 'floor', { name: 'Floor 1', order: 1 }],
  [RUN, 'cabinet_run', runData],
  [BOX_A, 'cabinet_box', boxData('B15', 'new', 'Shaker')],
  [BOX_B, 'cabinet_box', boxData('B15', 'existing', 'Shaker')],
  [BOX_C, 'cabinet_box', boxData('SB36', 'new', null)],
];
const stored = (): StoredObject[] =>
  MODEL.map(([id, type, data]) => ({ id, type, schema_version: CURRENT_SCHEMA_VERSION, data }));
const objects = () =>
  new Map<string, ObjectValue>(
    MODEL.map(([id, type, data]) => [id, { type, schemaVersion: CURRENT_SCHEMA_VERSION, data } as ObjectValue]),
  );

describe('EZD-707 cabinet schedule on the elevations sheet', () => {
  it("the rows are the project's cabinet schedule: one per code with qty, finish and notes", () => {
    expect(scheduleRowsOf(stored())).toEqual([
      { code: 'B15', qty: 2, finishes: ['Shaker'], runs: ['Back wall run'], existing: 1 },
      { code: 'SB36', qty: 1, finishes: [], runs: ['Back wall run'], existing: 0 },
    ]);
  });

  it('the table sits at the bottom of A4.0 and the elevations keep the area above it', () => {
    const none = schedulePlan('24x36', 0);
    expect(none.pages).toEqual([]);
    expect(none.elevations).toMatchObject({ x: 0.5, y: 0.5, height: 23 });
    const plan = schedulePlan('24x36', 3);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]).toMatchObject({ from: 0, to: 3 });
    expect(plan.pages[0]!.area.x).toBeCloseTo(0.5, 9);
    expect(plan.pages[0]!.area.y).toBeCloseTo(22.5, 9);
    expect(plan.pages[0]!.area.width).toBeCloseTo(8, 9);
    expect(plan.pages[0]!.area.height).toBeCloseTo(1, 9);
    expect(plan.elevations.y).toBe(0.5);
    expect(plan.elevations.height).toBeCloseTo(21.75, 9);
  });

  it('rows that do not fit continue on A4.1, then A4.2', () => {
    expect(schedulePlan('24x36', 36).pages.map((p) => [p.from, p.to])).toEqual([[0, 36]]);
    const two = schedulePlan('24x36', 40);
    expect(two.pages.map((p) => [p.from, p.to])).toEqual([
      [0, 36],
      [36, 40],
    ]);
    // The continuation table starts at the top of the drawing area: 4 codes + 2 = 6 rows, 1.2".
    expect(two.pages[1]!.area.y).toBe(0.5);
    expect(two.pages[1]!.area.height).toBeCloseTo(1.2, 9);
    expect(schedulePlan('24x36', 149).pages.map((p) => [p.from, p.to])).toEqual([
      [0, 36],
      [36, 149],
    ]);
    expect(schedulePlan('24x36', 150).pages).toHaveLength(3);
  });

  it('the set gains A4.1 right after A4.0 only when the schedule overflows; applying it again changes nothing', () => {
    const base = defaultSheetSet([]);
    expect(withScheduleSheets(base, '24x36', 36)).toEqual(base);
    const more = withScheduleSheets(base, '24x36', 40);
    expect(more.map((s) => s.number)).toEqual(['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A4.1', 'A5.0', 'E1.0', 'E2.0', 'R1.0']);
    expect(more[5]).toEqual({ number: 'A4.1', title: 'Cabinet schedule', group: 'architectural', viewports: [] });
    expect(withScheduleSheets(more, '24x36', 40)).toEqual(more);
    expect(withScheduleSheets(more, '24x36', 3)).toEqual(base);
    expect([schedulePage('A4.0'), schedulePage('A4.1'), schedulePage('A4.12'), schedulePage('A1.1'), schedulePage('A5.0')]).toEqual([
      0, 1, 12, null, null,
    ]);
  });

  it('the table is the title, the headings and one row per code, left-aligned in 8" of columns', () => {
    const list = scheduleTableList(
      [row('B15', { qty: 2, finishes: ['Shaker'], existing: 1 })],
      { width: 8, continued: false },
    );
    const texts = list.items.filter((i) => i.kind === 'text');
    expect(texts.map((t) => t.text)).toEqual([
      'CABINET SCHEDULE',
      'CODE',
      'QTY',
      'FINISH',
      'NOTES',
      'B15',
      '2',
      'Shaker',
      'Back wall run; 1 existing',
    ]);
    // 3 rows of 0.2": the frame (4), a line under the title and the headings (2), three column lines.
    const lines = list.items.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(9);
    expect(lines.slice(0, 4).map((l) => [l.from.x, l.from.y, l.to.x, l.to.y].map((n) => Math.round(n * 1e9) / 1e9))).toEqual([
      [0, 0, 8, 0],
      [8, 0, 8, -0.6],
      [8, -0.6, 0, -0.6],
      [0, -0.6, 0, 0],
    ]);
    // The code cell's text starts 0.06" in, in the third row (centre 0.5" down); the qty cell starts at 1.25".
    const left = (t: (typeof texts)[number]) => t.at.x - t.widthPt / 72 / 2;
    expect(left(texts[5]!)).toBeCloseTo(0.06, 9);
    expect(texts[5]!.at.y).toBeCloseTo(-0.5, 9);
    expect(left(texts[6]!)).toBeCloseTo(1.31, 9);
    expect(left(texts[7]!)).toBeCloseTo(1.91, 9);
    expect(left(texts[8]!)).toBeCloseTo(4.66, 9);
    expect(scheduleTableList([], { width: 8, continued: true }).items.find((i) => i.kind === 'text')).toMatchObject({
      text: 'CABINET SCHEDULE (CONTINUED)',
    });
  });

  it('text too long for its cell is cut and ends in "..."', () => {
    expect(fitCellText('B15', 1, 6.75)).toBe('B15');
    const cut = fitCellText('W'.repeat(200), 1, 6.75);
    expect(cut.endsWith('...')).toBe(true);
    expect(cut.length).toBeLessThan(200);
  });

  it('each schedule sheet gets its slice; a sheet past the last page, or another sheet, gets none', () => {
    const all = rows(40);
    expect(scheduleTableFor('A4.0', '24x36', all)!.list.items.filter((i) => i.kind === 'text')).toHaveLength(5 + 36 * 3);
    const next = scheduleTableFor('A4.1', '24x36', all)!;
    expect(next.list.items.filter((i) => i.kind === 'text').map((t) => t.text).slice(0, 6)).toEqual([
      'CABINET SCHEDULE (CONTINUED)',
      'CODE',
      'QTY',
      'FINISH',
      'NOTES',
      'B37',
    ]);
    expect(scheduleTableFor('A4.2', '24x36', all)).toBeNull();
    expect(scheduleTableFor('A3.0', '24x36', all)).toBeNull();
    expect(scheduleTableFor('A4.0', '24x36', [])).toBeNull();
  });

  it('the sheet job draws the table in place: its frame top is 8" long at 22.5" down for 3 codes', () => {
    const svg = sheetJob({ table: { sheet: 'A4.0', size: '24x36', rows: rows(3) } });
    expect(svg.shown).toEqual([]);
    expect(svg.markup).toContain('>CABINET SCHEDULE<');
    expect(svg.markup).toContain('>B3<');
    const first = /<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)"/.exec(svg.markup)!;
    expect(first.slice(1, 5).map(Number)).toEqual([0.5, 22.5, 8.5, 22.5]);
    expect(svg.markup).not.toContain('data-print-mark');
    expect(() => sheetJob({ table: { sheet: 'A4.0', size: '24x36' } })).toThrow('sheet_input');
  });

  it('the renderer adds the table job on A4.0 and stands the elevation viewport above it', () => {
    const request = {
      objects: objects(),
      size: '24x36' as const,
      viewports: [{ kind: 'elevation' as const, level: null, view: 'proposed' as const, scale: '1/2' as const }],
    };
    // Two codes: a 4-row, 0.8" table, so the viewport keeps 23 - 0.8 - 0.25 = 21.95".
    const table = sheetTableJobInput({ ...request, sheet: 'A4.0' });
    expect(table?.table.rows.map((r) => [r.code, r.qty])).toEqual([
      ['B15', 2],
      ['SB36', 1],
    ]);
    expect(sheetJobInputs({ ...request, sheet: 'A4.0' })[0]!.area.height).toBeCloseTo(21.95, 9);
    // Any other sheet, or no sheet number, has no table and the whole area.
    expect(sheetTableJobInput({ ...request, sheet: 'A3.0' })).toBeNull();
    expect(sheetTableJobInput(request)).toBeNull();
    expect(sheetJobInputs({ ...request, sheet: 'A3.0' })[0]!.area.height).toBe(23);
    // A4.1 has a table only when the schedule overflows A4.0.
    expect(sheetTableJobInput({ ...request, sheet: 'A4.1' })).toBeNull();
  });
});
