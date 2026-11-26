// EZD-702b (11 rule 3 "sheet SVG building ... run in Web Workers"; R7 one drawing list feeds the sheet): the sheet
// worker's job. The open sheet's floor, from the stored objects, as SVG in paper inches (`sheetSvg`).
// EZD-703 (phase-07 EZD-703 "Existing, Demo and Proposed views driven by object status"; S13 Rail: Viewport; 09h
// "details true scale or NTS"; AC-EZD-703-1): one job is one viewport. `view` keeps only the objects of the statuses
// it shows (lib/sheets/viewport.ts; the Existing view takes Demo objects and draws them as existing, 09m row 4), before the drawing list is built, so rooms, dimensions and flagged items follow
// their own object's status; no view draws every status. A null scale is not to scale: the drawing is fitted to the
// area.
import { viewDrawsAs, viewShows } from '../lib/sheets/viewport';
import {
  SHEET_VIEWS,
  buildDrawingList,
  drawingListBounds,
  parseStoredObject,
  sheetSvg,
  type ModelObject,
  type SheetArea,
  type SheetView,
  type SheetSvg,
  type StoredObject,
} from '@ezdraft/geometry';

export const SHEET_JOB = 'sheet-svg';

// The dimension and room label text size on a sheet: 09h "minimum 3/32\" on 24x36; labels and dims one size up from
// notes", so notes at 3/32" and labels and dims at 1/8" = 9 pt (vault/build/assumptions.md EZD-702b).
export const SHEET_LABEL_PT = 9;

export type SheetJobInput = {
  objects: StoredObject[];
  level: string;
  // Paper inches per model inch; null fits the drawing to the area (NTS).
  scale: number | null;
  area: SheetArea;
  // The statuses shown; absent draws every status.
  view?: SheetView;
};

// An NTS drawing fills this share of its area, so it never touches the area's edge.
export const NTS_FILL = 0.9;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function readInput(input: unknown): SheetJobInput {
  if (typeof input !== 'object' || input === null) throw new Error('sheet_input');
  const i = input as Partial<SheetJobInput>;
  const a = i.area as Partial<SheetArea> | undefined;
  if (
    !Array.isArray(i.objects) ||
    typeof i.level !== 'string' ||
    !(i.scale === null || (finite(i.scale) && i.scale > 0)) ||
    (i.view !== undefined && !(SHEET_VIEWS as readonly unknown[]).includes(i.view)) ||
    a === undefined ||
    !finite(a.x) ||
    !finite(a.y) ||
    !finite(a.width) ||
    !finite(a.height)
  )
    throw new Error('sheet_input');
  return i as SheetJobInput;
}

export function sheetJob(input: unknown): SheetSvg {
  const { objects, level, scale, area, view } = readInput(input);
  const parsed: ModelObject[] = [];
  for (const stored of objects) {
    const r = parseStoredObject(stored);
    if (!r.ok) continue;
    const status = (r.object.data as { status?: unknown }).status;
    if (view !== undefined && !viewShows(view, status)) continue;
    // 09m row 4: the Existing view shows what is marked Demo as it stands today, drawn as existing.
    if (view === 'existing' && status === 'demo')
      parsed.push({ ...r.object, data: { ...r.object.data, status: viewDrawsAs(view, status) } } as ModelObject);
    else parsed.push(r.object);
  }
  const list = buildDrawingList(
    { objects: parsed },
    { level, dimensionTextPt: SHEET_LABEL_PT, roomHatch: null, roomLabelPt: SHEET_LABEL_PT },
  );
  if (scale !== null) return sheetSvg(list, { scale, area });
  const b = drawingListBounds(list);
  const w = b === null ? 0 : b.maxX - b.minX;
  const h = b === null ? 0 : b.maxY - b.minY;
  const fit = Math.min(w > 0 ? area.width / w : Infinity, h > 0 ? area.height / h : Infinity);
  return sheetSvg(list, { scale: Number.isFinite(fit) ? fit * NTS_FILL : 1, area });
}
