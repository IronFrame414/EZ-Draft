// EZD-402 (S04 Data shown "Run: name, box count, filler count, run total, wall length, scribe"; AC-EZD-402-1;
// vault/build/assumptions.md EZD-402): what a cabinet run adds up to. The run total is the sum of the widths along
// the base row, in order: boxes, fillers, panels, corner treatments and open shelves (EZD-407 "Run total = boxes +
// fillers + panels"), so the elevation's chain widths add to it (AC-EZD-404-2). A tall box stands in the base row
// and counts once. The upper row has its own total. Scribe is not part of the total: it is the allowance of the
// row's fillers, set beside the wall gap by the fit chip (EZD-407).
import type { CabinetRow, ModelObject } from '../schema';

const MEMBER_TYPES = [
  'cabinet_box',
  'cabinet_filler',
  'cabinet_panel',
  'cabinet_corner',
  'cabinet_shelf',
] as const;
export type CabinetRunMemberType = (typeof MEMBER_TYPES)[number];
export type CabinetRunMember = Extract<ModelObject, { type: CabinetRunMemberType }>;
export type CabinetRun = Extract<ModelObject, { type: 'cabinet_run' }>;

export const isCabinetRunMember = (o: ModelObject): o is CabinetRunMember =>
  (MEMBER_TYPES as readonly string[]).includes(o.type);

// Looks an object up by id; null when it is not in the model.
export type ObjectLookup = (id: string) => ModelObject | null;

export type CabinetRowSummary = {
  total: number;
  boxCount: number;
  fillerCount: number;
  scribe: number;
  // Ids listed in the row that are not in the model or are not a run member; they add nothing.
  missing: string[];
};

export type CabinetRunSummary = {
  name: string;
  base: CabinetRowSummary;
  upper: CabinetRowSummary;
  // The base row's total: the run total S04 shows against the wall.
  total: number;
  boxCount: number;
  fillerCount: number;
  scribe: number;
};

export function cabinetRowMembers(
  run: CabinetRun,
  row: CabinetRow,
  lookup: ObjectLookup,
): CabinetRunMember[] {
  const members: CabinetRunMember[] = [];
  for (const id of run.data.attributes[row]) {
    const o = lookup(id);
    if (o !== null && isCabinetRunMember(o)) members.push(o);
  }
  return members;
}

export function cabinetRowSummary(
  run: CabinetRun,
  row: CabinetRow,
  lookup: ObjectLookup,
): CabinetRowSummary {
  const summary: CabinetRowSummary = {
    total: 0,
    boxCount: 0,
    fillerCount: 0,
    scribe: 0,
    missing: [],
  };
  for (const id of run.data.attributes[row]) {
    const o = lookup(id);
    if (o === null || !isCabinetRunMember(o)) {
      summary.missing.push(id);
      continue;
    }
    summary.total += o.data.attributes.width;
    if (o.type === 'cabinet_box') summary.boxCount += 1;
    if (o.type === 'cabinet_filler') {
      summary.fillerCount += 1;
      summary.scribe += o.data.attributes.scribe;
    }
  }
  return summary;
}

// The run header's counts, total and scribe are the base row's: board S04 reads "5 boxes · 2 fillers" and "Box 3 of
// 5" for the five base boxes with uppers drawn above (assumptions.md EZD-402). Each row's own figures stay in `base`
// and `upper`.
export function cabinetRunSummary(run: CabinetRun, lookup: ObjectLookup): CabinetRunSummary {
  const base = cabinetRowSummary(run, 'base', lookup);
  const upper = cabinetRowSummary(run, 'upper', lookup);
  return {
    name: run.data.attributes.name,
    base,
    upper,
    total: base.total,
    boxCount: base.boxCount,
    fillerCount: base.fillerCount,
    scribe: base.scribe,
  };
}

export const cabinetRunTotal = (run: CabinetRun, lookup: ObjectLookup): number =>
  cabinetRowSummary(run, 'base', lookup).total;

// "Box 3 of 5": the box's place among the boxes of its row (fillers, panels and the other row are not counted);
// null when the id is not a box in this run.
export function cabinetBoxPosition(
  run: CabinetRun,
  boxId: string,
  lookup: ObjectLookup,
): { row: CabinetRow; n: number; of: number } | null {
  const key = boxId.toLowerCase();
  for (const row of ['base', 'upper'] as const) {
    const boxes = cabinetRowMembers(run, row, lookup).filter((o) => o.type === 'cabinet_box');
    const i = boxes.findIndex((o) => o.id.toLowerCase() === key);
    if (i >= 0) return { row, n: i + 1, of: boxes.length };
  }
  return null;
}

// A lookup over a list of objects, ids compared without case (as parseModelDocument).
export function objectLookup(objects: readonly ModelObject[]): ObjectLookup {
  const byId = new Map(objects.map((o) => [o.id.toLowerCase(), o]));
  return (id) => byId.get(id.toLowerCase()) ?? null;
}
