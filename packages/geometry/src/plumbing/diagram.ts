// EZD-730 Build (AC-EZD-730-1, -2; phase-07 "A plumbing diagram (riser or isometric) built from the plumbing
// locations"; Q-0179; Q-0763 "riser diagram from the fixtures with pipe sizes; DFU table when fixtures are added";
// code rules P-126, P-140, P-174; vault/build/assumptions.md EZD-730): the plumbing riser diagram and its d.f.u.
// table, worked out from the plan's fixtures every time, never stored, so a fixture deleted from the plan or marked
// Demo leaves both. Each listed fixture carries its d.f.u. (P-126) and its minimum trap size (P-174; a water closet
// 3 in. from P-140); the total counts New fixtures only, P-126's "added load". A floor's branch with New fixtures is
// sized from P-140's branch limits; existing branches, the stack and the building drain are not sized (P-140, P-141
// "Needs data"). Pure.
import { DRAWING_FONTS, measureTextPt } from '../drawing/text';
import type { DrawingItem, DrawingLayer } from '../drawing/types';
import type { FixtureObject } from '../fixtures/fixtures';
import type { TileShowerObject } from '../fixtures/tile-shower';
import type { FixtureKind } from '../schema/fixture';

export type PlumbingDiagramKind = FixtureKind | 'tile_shower';

type KindRow = { label: string; dfu: number | null; trap: number | null };

// d.f.u. from P-126 (FBC-R P3004.1): "lavatory 1, ... bathtub 2, shower 2, kitchen sink 2, dishwasher 2, ... washer
// standpipe 2, water closet (1.6 gpf) 3". Trap inches from P-174 (FBC-R P3201.7): "lavatory 1-1/4 in.; bathtub
// 1-1/2 in.; kitchen sink 1-1/2 in.; dishwasher on its own trap 1-1/2 in.; ... clothes washer standpipe 2 in.;
// ... shower by total flow: 5.7 gpm or less 1-1/2 in."; water closet 3 from P-140 "No water closets on pipes smaller
// than 3 in.". `null` where the rules give no value. Kinds not listed (cooktop, range, hood, refrigerator, dryer) are
// appliances, not plumbing fixtures, and stay off the diagram. Labels are the EZD-234 kind names.
const KINDS: Readonly<Partial<Record<PlumbingDiagramKind, KindRow>>> = {
  toilet: { label: 'Toilet', dfu: 3, trap: 3 },
  lavatory: { label: 'Lavatory', dfu: 1, trap: 1.25 },
  tub: { label: 'Tub', dfu: 2, trap: 1.5 },
  shower_prefab: { label: 'Shower (prefab)', dfu: 2, trap: 1.5 },
  tile_shower: { label: 'Tile shower', dfu: 2, trap: 1.5 },
  sink: { label: 'Sink', dfu: 2, trap: 1.5 },
  dishwasher: { label: 'Dishwasher', dfu: 2, trap: 1.5 },
  disposal: { label: 'Disposal', dfu: null, trap: null },
  washer: { label: 'Washer', dfu: 2, trap: 2 },
  water_heater: { label: 'Water heater', dfu: null, trap: null },
};

// P-140 (FBC-R P3005.4.1) "Maximum d.f.u.: 1-1/2 in. branch 3 ...; 2 in. branch 6 ...; 2-1/2 in. branch 12 ...;
// 3 in. branch 20 ...; 4 in. branch 160".
const BRANCH_LIMITS: readonly [number, number][] = [
  [1.5, 3],
  [2, 6],
  [2.5, 12],
  [3, 20],
  [4, 160],
];

export type PlumbingDiagramRow = {
  objectId: string;
  kind: PlumbingDiagramKind;
  status: 'existing' | 'new';
  level: string;
  dfu: number | null;
  trapIn: number | null;
};

// One horizontal branch per floor. `sizeIn` is set only when the floor has a New fixture, and is null past 4 in.
export type PlumbingBranch = { level: string; dfu: number; hasNew: boolean; sizeIn: number | null };

export type PlumbingDiagram = {
  rows: PlumbingDiagramRow[];
  newDfu: number;
  branches: PlumbingBranch[];
  items: DrawingItem[];
};

type ModelObject = { id: string; type: string; data?: unknown };

// Diagram units are paper inches, y up. The stack is x = 0; floor i's branch is at y = i × FLOOR_RISE_IN, running
// right; fixture k on it drops at x = (k + 1) × FIXTURE_SPACING_IN.
export const RISER_FLOOR_RISE_IN = 3;
export const RISER_FIXTURE_SPACING_IN = 1.5;
export const RISER_DROP_IN = 0.75;
// The stack runs this far below the lowest branch (to the building drain) and above the top one (the vent).
export const RISER_STACK_EXTEND_IN = 1;
// Labels are 1/8" on paper (Q-0664 "labels and dimension text 1/8""), 9 pt.
export const RISER_LABEL_PT = 9;
const LABEL_GAP_IN = 0.125;

export const riserBranchId = (level: string) => `riser-branch:${level}`;
export const RISER_STACK_ID = 'riser-stack';

// 1.25 → 1-1/4", 1.5 → 1-1/2", 2 → 2", 2.5 → 2-1/2".
export function pipeSizeLabel(inches: number): string {
  const whole = Math.floor(inches);
  const frac = inches - whole;
  const f = frac === 0.25 ? '1/4' : frac === 0.5 ? '1/2' : frac === 0.75 ? '3/4' : '';
  if (f === '') return `${inches}"`;
  return whole === 0 ? `${f}"` : `${whole}-${f}"`;
}

function diagramKind(o: ModelObject): PlumbingDiagramKind | null {
  if (o.type === 'tile_shower') return 'tile_shower';
  if (o.type !== 'fixture') return null;
  const kind = (o as FixtureObject).data.attributes.kind;
  return kind in KINDS ? kind : null;
}

// The smallest P-140 branch that carries `dfu`, is 3 in. or more with a water closet on it and is no smaller than any
// trap entering it (P-174 "Trap not larger than the drain it enters").
function branchSize(dfu: number, floorRows: readonly PlumbingDiagramRow[]): number | null {
  const minIn = Math.max(0, ...floorRows.map((r) => r.trapIn ?? 0));
  for (const [size, limit] of BRANCH_LIMITS) if (dfu <= limit && size >= minIn) return size;
  return null;
}

function label(text: string, at: { x: number; y: number }, rotationDeg: number, layer: DrawingLayer, id: string) {
  return {
    kind: 'text' as const,
    layer,
    objectId: id,
    text,
    font: 'dm-mono-400' as const,
    sizePt: RISER_LABEL_PT,
    widthPt: measureTextPt(DRAWING_FONTS['dm-mono-400'], text, RISER_LABEL_PT),
    at,
    rotationDeg,
    align: 'center' as const,
  };
}

// Rows in model order. Floors bottom to top in `levelOrder` (the project's floors, lowest first); a floor not in it
// follows, in the order its first fixture appears. Demo fixtures are being taken out, so they are not part of the
// plumbing being permitted.
export function plumbingDiagram(
  objects: readonly ModelObject[],
  levelOrder: readonly string[] = [],
): PlumbingDiagram {
  const rows: PlumbingDiagramRow[] = [];
  for (const o of objects) {
    const kind = diagramKind(o);
    if (kind === null) continue;
    const { status, level } = (o as FixtureObject | TileShowerObject).data;
    if (status === 'demo') continue;
    const k = KINDS[kind]!;
    rows.push({ objectId: o.id, kind, status, level, dfu: k.dfu, trapIn: k.trap });
  }
  const newDfu = rows.reduce((t, r) => (r.status === 'new' && r.dfu !== null ? t + r.dfu : t), 0);

  const levels = [...levelOrder.filter((l) => rows.some((r) => r.level === l))];
  for (const r of rows) if (!levels.includes(r.level)) levels.push(r.level);

  const items: DrawingItem[] = [];
  const branches: PlumbingBranch[] = levels.map((level, i) => {
    const y = i * RISER_FLOOR_RISE_IN;
    const onFloor = rows.filter((r) => r.level === level);
    const dfu = onFloor.reduce((t, r) => t + (r.dfu ?? 0), 0);
    const hasNew = onFloor.some((r) => r.status === 'new');
    const sizeIn = hasNew ? branchSize(dfu, onFloor) : null;
    const layer: DrawingLayer = hasNew ? 'new' : 'existing';
    const id = riserBranchId(level);
    const end = onFloor.length * RISER_FIXTURE_SPACING_IN;
    items.push({ kind: 'line', layer, objectId: id, role: 'cut', from: { x: 0, y }, to: { x: end, y } });
    if (sizeIn !== null)
      items.push(label(`${pipeSizeLabel(sizeIn)} ${dfu} DFU`, { x: end / 2, y: y - 0.25 }, 0, layer, id));
    onFloor.forEach((r, k) => {
      const x = (k + 1) * RISER_FIXTURE_SPACING_IN;
      const top = y + RISER_DROP_IN;
      items.push({
        kind: 'line',
        layer: r.status,
        objectId: r.objectId,
        role: 'cut',
        from: { x, y },
        to: { x, y: top },
      });
      const k2 = KINDS[r.kind]!;
      const text = r.trapIn === null ? k2.label : `${k2.label} ${pipeSizeLabel(r.trapIn)}`;
      const l = label(text, { x, y: 0 }, 90, r.status, r.objectId);
      l.at = { x, y: top + LABEL_GAP_IN + l.widthPt / 72 / 2 };
      items.push(l);
    });
    return { level, dfu, hasNew, sizeIn };
  });
  if (levels.length > 0) {
    const topY = (levels.length - 1) * RISER_FLOOR_RISE_IN;
    items.unshift({
      kind: 'line',
      layer: 'existing',
      objectId: RISER_STACK_ID,
      role: 'cut',
      from: { x: 0, y: -RISER_STACK_EXTEND_IN },
      to: { x: 0, y: topY + RISER_STACK_EXTEND_IN },
    });
  }
  return { rows, newDfu, branches, items };
}
