// EZD-409 (S04 Controls "Cabinet schedule | Inspector footer | Opens the schedule: code, qty, finish, notes | Used by
// sheets, takeoff and supplier order"; 08 Exports "Cabinet schedule / order | CSV and on sheets | Code, qty, finish,
// notes | Export"; AC-EZD-409-1 "Schedule counts match the plan", AC-EZD-409-2 "The CSV has one row per code";
// vault/build/assumptions.md EZD-409): the project's cabinet schedule, read from the model, and its CSV. Pure: no
// React, no DOM (in lib/ since EZD-707, so the sheet job, the server and the PDF export can read it; the editor
// imports it through editor/cabinets/cabinet-schedule.ts). EZD-707 (sheet table), EZD-721 (Export menu) and EZD-419 (plan inspector) read the same rows.
//
// One row per code across every run of the project (every floor): each box, filler, panel, corner and open shelf
// listed in a run's base or upper row counts once. Demo members are left out (they come out of the room); Existing
// members count and are named in the notes. Trim has no code and is measured by length (takeoff), so it is not here.
import {
  isCabinetRunMember,
  type CabinetRun,
  type CabinetRunMember,
  type ModelObject,
} from '@ezdraft/geometry';

// Ids are compared without case (as editor/shared/ids.ts idKey).
const idKey = (id: string): string => id.toLowerCase();

export type CabinetScheduleRow = {
  // The code as first met in run order (B15, SB36, F3).
  code: string;
  qty: number;
  // The distinct finishes of the code's members, in run order; empty when none has a finish.
  finishes: string[];
  // Notes: the runs the code stands in (run order) and how many of the qty are Existing.
  runs: string[];
  existing: number;
};

const codeKey = (code: string) => code.trim().toUpperCase();

// The schedule rows, sorted by code (B9 before B15: numbers inside a code compare as numbers).
export function cabinetSchedule(objects: readonly ModelObject[]): CabinetScheduleRow[] {
  const members = new Map<string, CabinetRunMember>();
  for (const o of objects) if (isCabinetRunMember(o)) members.set(idKey(o.id), o);
  const rows = new Map<string, CabinetScheduleRow>();
  const runs = objects.filter((o): o is CabinetRun => o.type === 'cabinet_run');
  for (const run of runs) {
    const { name, base, upper } = run.data.attributes;
    for (const id of [...base, ...upper]) {
      const m = members.get(idKey(id));
      if (m === undefined || m.data.status === 'demo') continue;
      const a = m.data.attributes;
      const key = codeKey(a.code);
      let row = rows.get(key);
      if (row === undefined) {
        row = { code: a.code.trim(), qty: 0, finishes: [], runs: [], existing: 0 };
        rows.set(key, row);
      }
      row.qty += 1;
      if (m.data.status === 'existing') row.existing += 1;
      const finish = a.finish?.trim() ?? '';
      if (finish !== '' && !row.finishes.includes(finish)) row.finishes.push(finish);
      if (!row.runs.includes(name)) row.runs.push(name);
    }
  }
  return [...rows.values()].sort(
    (p, q) =>
      codeKey(p.code).localeCompare(codeKey(q.code), 'en', { numeric: true }) ||
      p.code.localeCompare(q.code),
  );
}

// The finish cell: the distinct finishes joined with " / " (a finish may itself hold a comma, "Shaker, Midnight").
export const scheduleFinishText = (row: CabinetScheduleRow): string => row.finishes.join(' / ');

// The notes cell: the run names, then the Existing count in the caller's words ("1 existing").
export function scheduleNotesText(
  row: CabinetScheduleRow,
  existingText: (count: number) => string,
): string {
  const parts = [row.runs.join(', ')];
  if (row.existing > 0) parts.push(existingText(row.existing));
  return parts.filter((p) => p !== '').join('; ');
}

// A spreadsheet reads a cell that starts with = + - @ (or a tab or return) as a formula; a leading ' keeps it text.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CabinetScheduleCsvText = {
  // Column headings, in order: code, qty, finish, notes.
  headers: readonly [string, string, string, string];
  existing: (count: number) => string;
};

// The CSV (RFC 4180, CRLF line ends): the heading row, then one row per code.
export function cabinetScheduleCsv(
  rows: readonly CabinetScheduleRow[],
  text: CabinetScheduleCsvText,
): string {
  const lines = [
    text.headers.map(csvCell).join(','),
    ...rows.map((r) =>
      [r.code, r.qty, scheduleFinishText(r), scheduleNotesText(r, text.existing)]
        .map(csvCell)
        .join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}
