// EZD-701 (S13 Decision 1; 09h Sheet set rules; Q-0779; AC-EZD-701-1, -2): the permit set's default sheets. One
// fixed list in set order (Round 24, with the mockup order corrected); the reflected ceiling plan (A6.0) is kept
// only when the project's "Reflected ceiling plan" scope box is ticked. The Electrical, Plumbing and Mechanical
// boxes do not change the set (Q-0764: they feed the scope-match check). Titles are the S13 mockup's sheet list.
// The set is derived from the project for now; sheets become stored model objects (03b rule 3) when a later
// ticket makes them adjustable (vault/build/assumptions.md EZD-701). The fields follow the 03c `sheet` row.
import type { KeyPlacement, SheetSetData, SheetSetKind, SheetSize, Viewport } from '@ezdraft/geometry';
import type { ScopeTrade } from '../projects/new-project';
import { nextRevision, type IssuedRevision } from './revisions';

// The sheet list's groups (S13 Layout: Architectural / Electrical / Renderings).
export const SHEET_GROUPS = ['architectural', 'electrical', 'renderings'] as const;
export type SheetGroup = (typeof SHEET_GROUPS)[number];

export type Sheet = {
  number: string;
  title: string;
  group: SheetGroup;
  // Always empty: EZD-703 keeps a sheet's viewports on its set (SheetSetSummary.viewports, lib/sheets/viewport.ts).
  viewports: readonly string[];
};

type SheetDef = Omit<Sheet, 'viewports'> & { needs?: ScopeTrade };

// EZD-708b (Q-0763): the electrical layout sheet of the lowest floor and its title, and the panel sheet's title.
export const ELECTRICAL_PLAN_SHEET = 'E1.0';
export const ELECTRICAL_PLAN_TITLE = 'Electrical';
export const PANEL_SHEET_TITLE = 'Panel + load calc';

/** EZD-708b (Q-0763): the panel sheet's number, after the last electrical layout sheet (E2.0 with one floor). */
export function panelSheetNumber(floorCount: number): string {
  return `E${Math.max(1, floorCount) + 1}.0`;
}

/**
 * EZD-708b (Q-0763): the floor (0 for the lowest) an electrical layout sheet draws, or null when the number is not one
 * of the layout sheets of a model with this many floors (E1.0, then E2.0 ... one per further floor).
 */
export function electricalLayoutFloor(number: string, floorCount: number): number | null {
  const m = /^E([1-9]\d*)\.0$/.exec(number);
  if (m === null) return null;
  const k = Number(m[1]);
  return k <= Math.max(1, floorCount) ? k - 1 : null;
}

const DEFAULT_SET: readonly SheetDef[] = [
  { number: 'A0.0', title: 'Cover', group: 'architectural' },
  { number: 'A1.0', title: 'Existing', group: 'architectural' },
  { number: 'A2.0', title: 'Demo', group: 'architectural' },
  { number: 'A3.0', title: 'Proposed', group: 'architectural' },
  { number: 'A4.0', title: 'Elevations', group: 'architectural' },
  { number: 'A5.0', title: 'Details', group: 'architectural' },
  { number: 'A6.0', title: 'RCP', group: 'architectural', needs: 'rcp' },
  { number: 'E1.0', title: 'Electrical', group: 'electrical' },
  { number: 'E2.0', title: 'Panel + load calc', group: 'electrical' },
  { number: 'R1.0', title: 'Finish schedule + renders', group: 'renderings' },
];

// The default permit set for a project with these scope boxes ticked, in set order.
export function defaultSheetSet(scopeTrades: readonly ScopeTrade[]): Sheet[] {
  return DEFAULT_SET.filter((s) => s.needs === undefined || scopeTrades.includes(s.needs)).map(
    ({ number, title, group }) => ({ number, title, group, viewports: [] }),
  );
}

// EZD-703 (Q-0509 "the sheets phases (25 and 26) give each plan sheet its floor"; Q-0763 "architectural sheets keep
// decimals (A1.1 for a second floor)"; vault/build/assumptions/EZD-701.md row "Plan sheets on a project with more than
// one floor"): each floor after the lowest adds its own copy of the architectural plan sheets (A1.0, A2.0, A3.0 and
// A6.0 when in the set), numbered with the floor's place (A1.1 for the second floor), right after the sheet it copies
// and titled with the floor's name.
// EZD-708b (Q-0763 "Each trade numbers its sheets in whole steps: E1.0 is the layout with devices and symbols for the
// first floor or area; E2.0, E3.0 and on are added for each further floor ... the panel schedule and load calc go on
// the sheet after the last layout sheet. A one-floor project keeps the Round 24 default (E1.0 Electrical, E2.0 Panel +
// load calc)"): each floor after the lowest adds an electrical layout sheet after E1.0 (E2.0 for the second floor),
// titled "Electrical · <floor name>", and the panel sheet moves to the number after the last layout sheet. The panel
// sheet is known by its title, so applying this again (with the same or other floors) renumbers it from scratch.
export const FLOOR_PLAN_SHEETS: readonly string[] = ['A1.0', 'A2.0', 'A3.0', 'A6.0'];
export type SheetFloor = { id: string; name: string };

const FLOOR_COPY = /^(A[1-9])\.([1-9]\d*)$/;

// The plan sheet a floor copy repeats and the floor's place (0 for the lowest), or null for any other sheet.
export function floorCopyOf(number: string): { base: string; floor: number } | null {
  if (FLOOR_PLAN_SHEETS.includes(number)) return { base: number, floor: 0 };
  const m = FLOOR_COPY.exec(number);
  if (m === null || !FLOOR_PLAN_SHEETS.includes(`${m[1]}.0`)) return null;
  return { base: `${m[1]}.0`, floor: Number(m[2]) };
}

// The set's sheets with one copy of each floor-plan sheet per further floor, floors lowest first. Copies already in
// `sheets` are dropped first, so the result is the same however often it is applied.
export function withFloorSheets(sheets: readonly Sheet[], floors: readonly SheetFloor[]): Sheet[] {
  const out: Sheet[] = [];
  for (const s of sheets) {
    // EZD-708b: the electrical layouts per floor and the panel sheet after them.
    if (s.group === 'electrical') {
      if (s.number === ELECTRICAL_PLAN_SHEET) {
        out.push(s);
        floors.slice(1).forEach((f, i) =>
          out.push({ ...s, number: `E${i + 2}.0`, title: `${s.title} · ${f.name}` }),
        );
      } else if (s.title === PANEL_SHEET_TITLE) out.push({ ...s, number: panelSheetNumber(floors.length) });
      else if (!s.title.startsWith(`${ELECTRICAL_PLAN_TITLE} · `)) out.push(s);
      continue;
    }
    const copy = floorCopyOf(s.number);
    if (copy !== null && copy.floor > 0) continue;
    out.push(s);
    if (copy === null) continue;
    floors.slice(1).forEach((f, i) =>
      out.push({ ...s, number: `${s.number.slice(0, -2)}.${i + 1}`, title: `${s.title} · ${f.name}` }),
    );
  }
  return out;
}

// EZD-726 (03b rule 3; 03d sheet_set; S13 Set selector, Decision 10; AC-EZD-726-1): each project has one permit
// set and one client set. A set is a sheet_set model object (packages/geometry schema/sheet-set.ts); a set that has
// never been changed is not stored and reads as the default below. The client set holds the renders and finish
// schedule (R1.0) and, with EZD-720, the countertop plan and top schedule; it has no stamp areas. Sheets are not
// objects yet, so a set's sheets are still worked out from the project (EZD-701).

// One row of the set selector: the set and its sheets (the selector shows the count, size and revision).
export type SheetSetSummary = {
  // The stored object's id; null while the set is the unchanged default.
  id: string | null;
  kind: SheetSetKind;
  size: SheetSize;
  keyPlacement: KeyPlacement;
  // Null until the set is first issued (EZD-717).
  lastIssuedVersionId: string | null;
  // EZD-717: the set's issued revisions (permit_revision rows), oldest first; null (or absent from an older answer)
  // when the answer does not carry them. The client set is never issued, so it has none.
  revisions?: IssuedRevision[] | null;
  sheets: Sheet[];
  // EZD-703: the stored set's viewports; null (or absent from an older answer) while the set shows the defaults.
  viewports?: Viewport[] | null;
  // EZD-703: the sheets whose viewports were changed; null (or absent) when none were.
  viewportSheets?: string[] | null;
};

// The set of a kind before anyone changes it: permit 24x36, client 11x17 (S13 size toggle: "11x17 is for client and
// field copies"), the key on every sheet (S13 Decision 8), no profile of its own, never issued.
export function defaultSheetSetData(kind: SheetSetKind): SheetSetData {
  return {
    kind,
    sheetIds: [],
    size: kind === 'permit' ? '24x36' : '11x17',
    keyPlacement: 'every_sheet',
    submittalProfileId: null,
    lastIssuedVersionId: null,
  };
}

const CLIENT_SET: readonly string[] = ['R1.0'];

// The sheets of one set for a project with these scope boxes ticked, in set order.
export function sheetsForSet(kind: SheetSetKind, scopeTrades: readonly ScopeTrade[]): Sheet[] {
  const all = defaultSheetSet(scopeTrades);
  return kind === 'permit' ? all : all.filter((s) => CLIENT_SET.includes(s.number));
}

// EZD-702a (S13 Layout, Controls; phase-07 EZD-702a; AC-EZD-702a-1): what the Sheets screen reads from a set.

// S13 Controls "Add sheet": the type picker's types, in the spec's order.
export const ADD_SHEET_TYPES = ['plan', 'elevation', 'details', 'schedule', 'renders', 'blank'] as const;
export type AddSheetType = (typeof ADD_SHEET_TYPES)[number];

// A sheet row's status dot (S13 Controls "Sheet row": ready to issue / needs approval). Open items come with the
// issue checklist (EZD-716) and the Δ tag with revision clouds (EZD-718); until then a sheet has neither.
export type SheetMarks = { openItems: number; delta: number | null };
export type SheetDot = 'ready' | 'needs_approval';

export function sheetDot(marks: SheetMarks): SheetDot {
  return marks.openItems > 0 ? 'needs_approval' : 'ready';
}

// The open sheet's place in its set, 1-based ("4 of 10"); null when the number is not in the set.
export function sheetPosition(
  sheets: readonly Sheet[],
  number: string,
): { index: number; of: number } | null {
  const i = sheets.findIndex((s) => s.number === number);
  return i < 0 ? null : { index: i + 1, of: sheets.length };
}

// Previous / Next sheet (S13 Controls): the neighbour in set order, or null at either end.
export function neighbourSheet(
  sheets: readonly Sheet[],
  number: string,
  step: -1 | 1,
): Sheet | null {
  const i = sheets.findIndex((s) => s.number === number);
  if (i < 0) return null;
  return sheets[i + step] ?? null;
}

// The revision the set is drafting (S13 Validation "Numbering": Rev 0 at permit issue, then Rev 1, 2...). A set never
// issued drafts Rev 0. EZD-717: with its issued revisions known, the set drafts the next one (Rev 1 after Rev 0);
// an issued set whose revisions are not known reads null.
export function draftRevision(
  set: Pick<SheetSetSummary, 'lastIssuedVersionId' | 'revisions'>,
): number | null {
  if (set.revisions !== undefined && set.revisions !== null) return nextRevision(set.revisions);
  return set.lastIssuedVersionId === null ? 0 : null;
}

// S13 Controls "Sheet canvas": the draft watermark. English only (S13 Decision 7: permit sheets are English only), so
// it is not a catalog message.
export function draftWatermark(rev: number | null): string {
  return rev === null ? 'DRAFT · NOT FOR CONSTRUCTION' : `REV ${rev} DRAFT · NOT FOR CONSTRUCTION`;
}

// The paper of a set size in inches, landscape (24x36 ARCH D, 11x17 tabloid).
export function paperInches(size: SheetSize): { width: number; height: number } {
  return size === '24x36' ? { width: 36, height: 24 } : { width: 17, height: 11 };
}

// EZD-702b (09h "Scales per viewport: 1/4\" = 1'-0\" plans"; vault/build/assumptions.md EZD-702b): until viewports
// come (EZD-703), the plan sheets of the default set draw the lowest floor at 1/4" = 1'-0"; the other sheets show
// their frame and title block only.
export const PLAN_SHEETS: readonly string[] = ['A1.0', 'A2.0', 'A3.0', 'A6.0', 'E1.0'];

export function sheetShowsPlan(sheet: Pick<Sheet, 'number'>): boolean {
  return PLAN_SHEETS.includes(sheet.number);
}

// Board S13Sheets: the border sits h/48 in from the paper edge and the title block column is w/8 wide on the right.
export function sheetFrame(size: SheetSize): { margin: number; titleBlock: number } {
  const { width, height } = paperInches(size);
  return { margin: height / 48, titleBlock: width / 8 };
}

// EZD-706 (board S13Sheets: SYMBOL KEY, GENERAL NOTES and KEYNOTES stack in a column left of the title block, about
// 0.3 of the paper's width): the notes column, inside the border, one margin left of the title block column.
export const NOTES_COLUMN_SHARE = 0.3;
export function sheetNotesColumn(size: SheetSize): { x: number; y: number; width: number; height: number } {
  const { width, height } = paperInches(size);
  const { margin, titleBlock } = sheetFrame(size);
  const w = width * NOTES_COLUMN_SHARE;
  return { x: width - margin - titleBlock - margin - w, y: 2 * margin, width: w, height: height - 4 * margin };
}

// The paper inside the border, left of the notes column, where a plan is centred (paper inches, y down).
// EZD-706: the notes column is kept clear, so the plan never runs under the key.
export function sheetDrawingArea(size: SheetSize): { x: number; y: number; width: number; height: number } {
  const { height } = paperInches(size);
  const { margin } = sheetFrame(size);
  const notes = sheetNotesColumn(size);
  return { x: margin, y: margin, width: notes.x - margin - margin, height: height - 2 * margin };
}

// EZD-714, EZD-728: the notes a set prints on its cover (GET /api/projects/[id]/notes): the company's general notes
// for the project's type and the submittal profile's required notes. Shared by the server query and the cover sheet.
export type SetNoteGroup = 'general' | 'code';
export type SetNote = { id: string; text: string; group: SetNoteGroup };
export type SetNotes = { general: SetNote[]; required: SetNote[] };
