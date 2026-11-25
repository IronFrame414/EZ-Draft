// EZD-702b (11 rule 3 "sheet SVG building ... run in Web Workers"; R7 one drawing list feeds the sheet): the sheet
// worker's job. The open sheet's floor, from the stored objects, as SVG in paper inches (`sheetSvg`).
import {
  buildDrawingList,
  parseStoredObject,
  sheetSvg,
  type ModelObject,
  type SheetArea,
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
  scale: number;
  area: SheetArea;
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function readInput(input: unknown): SheetJobInput {
  if (typeof input !== 'object' || input === null) throw new Error('sheet_input');
  const i = input as Partial<SheetJobInput>;
  const a = i.area as Partial<SheetArea> | undefined;
  if (
    !Array.isArray(i.objects) ||
    typeof i.level !== 'string' ||
    !finite(i.scale) ||
    i.scale <= 0 ||
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
  const { objects, level, scale, area } = readInput(input);
  const parsed: ModelObject[] = [];
  for (const stored of objects) {
    const r = parseStoredObject(stored);
    if (r.ok) parsed.push(r.object);
  }
  const list = buildDrawingList(
    { objects: parsed },
    { level, dimensionTextPt: SHEET_LABEL_PT, roomHatch: null, roomLabelPt: SHEET_LABEL_PT },
  );
  return sheetSvg(list, { scale, area });
}
