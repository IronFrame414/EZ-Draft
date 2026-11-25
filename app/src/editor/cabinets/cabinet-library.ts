// EZD-403 (S04 Controls (left panel) "Search 'Code or size, e.g. B24' | Filters library rows by code or size | Matches
// code prefix and width", "Line label", "Library row B9–B24 ... TK / LR / CM", "Width set by typing in the dimension
// bar on drop, in 3" steps within the range"; board S04Cabinets; AC-EZD-403-1; vault/build/assumptions.md EZD-403):
// the cabinet library's rows and what each one places. Pure: no React, no DOM.
import {
  CABINET_BASE_DEPTH,
  CABINET_BASE_HEIGHT,
  CABINET_WIDTH_STEP,
  type CabinetBoxType,
  type CabinetFaceLayout,
  type CabinetHingeSide,
  type CabinetRow,
  type CabinetTrimKind,
  type ModelObject,
} from '@ezdraft/geometry';
import type { CatalogItem } from '../../lib/catalog/catalog';
import type { MessageKey } from '../../server/messages/catalog';

// What a member row places: a box of one type, a filler or an end panel.
export type LibraryMember =
  | { type: 'cabinet_box'; boxType: CabinetBoxType }
  | { type: 'cabinet_filler' }
  | { type: 'cabinet_panel' };

export type LibraryRow = {
  key: string;
  // The code text on the row (board S04: "B9–B24").
  label: string;
  name: MessageKey;
  // The code's letters; the code of a placed box is the letters, the width, then `suffix` (W1230: 12 wide, 30 tall).
  letters: string;
  suffix: string;
  // The widths the row places, in 3" steps from min to max (one width when min = max); `width` is the one placed on
  // a drop when the search names none.
  min: number;
  max: number;
  width: number;
  depth: number;
  height: number;
  row: CabinetRow;
  member: LibraryMember;
  // The catalog sub-category of the same box in a vendor line (R23 seed: base, drawer_base, sink_base, wall, filler).
  subcategory: string | null;
  section: 'boxes' | 'trim';
};

const BASE = { depth: CABINET_BASE_DEPTH, height: CABINET_BASE_HEIGHT, row: 'base' as const };

// Board S04 rows, in its order. Base 24" deep and 34 1/2" tall (S04 "Height ... (34 1/2" for base)"); uppers 12" deep
// and 30" tall (W1230 "Wall, 30" tall"); the tall pantry 84" (T1884); the end panel 3/4" (EP "End panel 3/4"").
export const LIBRARY_ROWS: readonly LibraryRow[] = [
  {
    key: 'b1',
    label: 'B9–B24',
    name: 'office.cabinets.library.row.base_1',
    letters: 'B',
    suffix: '',
    min: 9,
    max: 24,
    width: 24,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'base' },
    subcategory: 'base',
    section: 'boxes',
  },
  {
    key: 'b2',
    label: 'B27–B36',
    name: 'office.cabinets.library.row.base_2',
    letters: 'B',
    suffix: '',
    min: 27,
    max: 36,
    width: 36,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'base' },
    subcategory: 'base',
    section: 'boxes',
  },
  {
    key: 'db',
    label: 'DB12–36',
    name: 'office.cabinets.library.row.drawer_base',
    letters: 'DB',
    suffix: '',
    min: 12,
    max: 36,
    width: 36,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'drawer_base' },
    subcategory: 'drawer_base',
    section: 'boxes',
  },
  {
    key: 'sb',
    label: 'SB30–36',
    name: 'office.cabinets.library.row.sink_base',
    letters: 'SB',
    suffix: '',
    min: 30,
    max: 36,
    width: 36,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'sink_base' },
    subcategory: 'sink_base',
    section: 'boxes',
  },
  {
    key: 'bbc',
    label: 'BBC42',
    name: 'office.cabinets.library.row.blind_corner',
    letters: 'BBC',
    suffix: '',
    min: 42,
    max: 42,
    width: 42,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'corner_blind' },
    subcategory: null,
    section: 'boxes',
  },
  {
    key: 'w',
    label: 'W1230+',
    name: 'office.cabinets.library.row.wall',
    letters: 'W',
    suffix: '30',
    min: 12,
    max: 36,
    width: 12,
    depth: 12,
    height: 30,
    row: 'upper',
    member: { type: 'cabinet_box', boxType: 'wall' },
    subcategory: 'wall',
    section: 'boxes',
  },
  {
    key: 't',
    label: 'T1884',
    name: 'office.cabinets.library.row.tall',
    letters: 'T',
    suffix: '84',
    min: 18,
    max: 18,
    width: 18,
    depth: CABINET_BASE_DEPTH,
    height: 84,
    // A tall box stands in the base row and spans both rows (run.ts).
    row: 'base',
    member: { type: 'cabinet_box', boxType: 'tall' },
    subcategory: null,
    section: 'boxes',
  },
  {
    key: 'f',
    label: 'F3',
    name: 'office.cabinets.library.row.filler',
    letters: 'F',
    suffix: '',
    min: 3,
    max: 6,
    width: 3,
    ...BASE,
    member: { type: 'cabinet_filler' },
    subcategory: 'filler',
    section: 'trim',
  },
  {
    key: 'ep',
    label: 'EP',
    name: 'office.cabinets.library.row.end_panel',
    letters: 'EP',
    suffix: '',
    min: 0.75,
    max: 0.75,
    width: 0.75,
    ...BASE,
    member: { type: 'cabinet_panel' },
    subcategory: null,
    section: 'trim',
  },
  {
    key: 'dwp',
    label: 'DWP',
    name: 'office.cabinets.library.row.dishwasher_panel',
    letters: 'DWP',
    suffix: '',
    min: 18,
    max: 24,
    width: 24,
    ...BASE,
    member: { type: 'cabinet_box', boxType: 'appliance_panel' },
    subcategory: null,
    section: 'trim',
  },
];

// The TK / LR / CM row: each trim is its own object along one row of the run (S04 "Each is its own object").
export type LibraryTrim = { kind: CabinetTrimKind; code: string; row: CabinetRow; height: number };
export const LIBRARY_TRIMS: readonly LibraryTrim[] = [
  { kind: 'toe_kick', code: 'TK', row: 'base', height: 4 },
  { kind: 'light_rail', code: 'LR', row: 'upper', height: 1.5 },
  { kind: 'crown', code: 'CM', row: 'upper', height: 3 },
];

export const libraryRow = (key: string): LibraryRow | null =>
  LIBRARY_ROWS.find((r) => r.key === key) ?? null;
export const libraryTrim = (kind: string): LibraryTrim | null =>
  LIBRARY_TRIMS.find((r) => r.kind === kind) ?? null;

const EPS = 1e-6;
const inchText = (n: number) => String(Math.round(n * 1000) / 1000);

// The widths a row places: min to max in 3" steps (S04 "in 3" steps within the range").
export function libraryWidths(row: LibraryRow): number[] {
  if (row.max - row.min < EPS) return [row.min];
  const out: number[] = [];
  for (let w = row.min; w <= row.max + EPS; w += CABINET_WIDTH_STEP) out.push(w);
  return out;
}

// A width the row places. `custom` (the "Custom boxes" line) takes any width above 0 (S04 Validation "custom boxes
// allowed outside increments").
export function libraryWidthOk(row: LibraryRow, width: number, custom: boolean): boolean {
  if (!(width > 0) || !Number.isFinite(width)) return false;
  if (custom) return true;
  return libraryWidths(row).some((w) => Math.abs(w - width) < EPS);
}

export const libraryCode = (row: LibraryRow, width: number): string =>
  row.member.type === 'cabinet_panel' ? row.letters : `${row.letters}${inchText(width)}${row.suffix}`;

// A row matched by a search, with the width the search names (null when it names none).
export type LibraryMatch = { row: LibraryRow; width: number | null };
export type LibraryTrimMatch = { trim: LibraryTrim };

// S04 "Matches code prefix and width": the query's letters start the row's code letters and its number is a width of
// the row ("B24" keeps B9–B24; "24" keeps every row with a 24" box; "W1230" reads 12" wide, 30" tall). Spaces and
// case do not count; an empty query keeps every row.
export function searchLibrary(query: string): { rows: LibraryMatch[]; trims: LibraryTrimMatch[] } {
  const q = query.replace(/\s+/g, '').toUpperCase();
  if (q === '') {
    return {
      rows: LIBRARY_ROWS.map((row) => ({ row, width: null })),
      trims: LIBRARY_TRIMS.map((trim) => ({ trim })),
    };
  }
  const m = /^([A-Z]*)(\d+(?:\.\d+)?)?$/.exec(q);
  if (m === null) return { rows: [], trims: [] };
  const letters = m[1] ?? '';
  const digits = m[2];
  const rows: LibraryMatch[] = [];
  for (const row of LIBRARY_ROWS) {
    if (!row.letters.startsWith(letters)) continue;
    if (digits === undefined) {
      rows.push({ row, width: null });
      continue;
    }
    const width = widthFromDigits(row, digits);
    if (width !== null) rows.push({ row, width });
  }
  const trims =
    digits === undefined && letters !== ''
      ? LIBRARY_TRIMS.filter((t) => t.code.startsWith(letters)).map((trim) => ({ trim }))
      : [];
  return { rows, trims };
}

function widthFromDigits(row: LibraryRow, digits: string): number | null {
  const has = (w: number) => libraryWidths(row).some((x) => Math.abs(x - w) < EPS);
  const n = Number(digits);
  if (has(n)) return n;
  if (row.suffix !== '' && digits.endsWith(row.suffix) && digits.length > row.suffix.length) {
    const w = Number(digits.slice(0, -row.suffix.length));
    if (has(w)) return w;
  }
  return null;
}

// The catalog item of the active vendor line for a row at a width: same line, sub-category and width; null when the
// line has none (or the row has no sub-category).
export function libraryCatalogItem(
  items: readonly CatalogItem[],
  line: string | null,
  row: LibraryRow,
  width: number,
): CatalogItem | null {
  if (line === null || row.subcategory === null) return null;
  return (
    items.find(
      (i) =>
        i.category === 'cabinets' &&
        i.line === line &&
        i.subcategory === row.subcategory &&
        i.width !== null &&
        Math.abs(i.width - width) < EPS,
    ) ?? null
  );
}

// The vendor lines of the tenant catalog's cabinets, by name (S04 "Lines come from the tenant catalog").
export function libraryLines(items: readonly CatalogItem[]): string[] {
  const names = new Set<string>();
  for (const i of items) if (i.category === 'cabinets' && i.line !== null) names.add(i.line);
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Board S04 and Auto-fill (EZD-408): one door with a drawer to 24", two doors with a drawer above.
function face(row: LibraryRow, width: number): { faceLayout: CabinetFaceLayout; hingeSide: CabinetHingeSide } {
  if (row.member.type !== 'cabinet_box') return { faceLayout: 'door_1', hingeSide: 'left' };
  const two = width > 24;
  switch (row.member.boxType) {
    case 'drawer_base':
      return { faceLayout: 'drawers_3', hingeSide: 'none' };
    case 'sink_base':
      return { faceLayout: two ? 'false_drawer_doors_2' : 'false_drawer_door_1', hingeSide: two ? 'pair' : 'left' };
    case 'appliance_panel':
      return { faceLayout: 'panel', hingeSide: 'none' };
    case 'wall':
    case 'tall':
      return { faceLayout: two ? 'doors_2' : 'door_1', hingeSide: two ? 'pair' : 'left' };
    case 'corner_blind':
      return { faceLayout: 'drawer_door_1', hingeSide: 'left' };
    default:
      return { faceLayout: two ? 'drawer_doors_2' : 'drawer_door_1', hingeSide: two ? 'pair' : 'left' };
  }
}

// A filler from the library carries a 1/2" scribe allowance (board S04 "1/2" scribe"), never more than its width.
export const LIBRARY_FILLER_SCRIBE = 0.5;

// The model object a library row places at a width, on `level`, status New.
export function libraryObject(
  row: LibraryRow,
  width: number,
  id: string,
  level: string,
  catalogItemId: string | null,
): ModelObject {
  const common = {
    code: libraryCode(row, width),
    width,
    depth: row.depth,
    height: row.height,
    catalogItemId,
    finish: null,
  };
  switch (row.member.type) {
    case 'cabinet_filler':
      return {
        id,
        type: 'cabinet_filler',
        data: {
          status: 'new',
          level,
          attributes: { ...common, scribe: Math.min(LIBRARY_FILLER_SCRIBE, width) },
        },
      };
    case 'cabinet_panel':
      return {
        id,
        type: 'cabinet_panel',
        data: { status: 'new', level, attributes: { kind: 'end', ...common } },
      };
    case 'cabinet_box':
      return {
        id,
        type: 'cabinet_box',
        data: {
          status: 'new',
          level,
          attributes: {
            ...common,
            boxType: row.member.boxType,
            ...face(row, width),
            finishedEnds: 'none',
          },
        },
      };
  }
}

// What a library drag carries (HTML drag and drop: the panel and the drawing are apart in the page): the row, the
// width placed, whether the line is "Custom boxes", and the active line's catalog item id for each width of the row
// (so a width typed after the drop takes that width's item).
export const LIBRARY_DRAG_TYPE = 'application/x-ezdraft-cabinet';
export type LibraryDrag =
  | { kind: 'row'; key: string; width: number; custom: boolean; items: Record<string, string> }
  | { kind: 'trim'; trim: CabinetTrimKind };

// The active line's items for a row, by width ("24": its id).
export function libraryLineItems(
  items: readonly CatalogItem[],
  line: string | null,
  row: LibraryRow,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of libraryWidths(row)) {
    const item = libraryCatalogItem(items, line, row, w);
    if (item !== null) out[inchText(w)] = item.id;
  }
  return out;
}

export const libraryItemFor = (items: Record<string, string>, width: number): string | null =>
  items[inchText(width)] ?? null;

export function readLibraryDrag(text: string): LibraryDrag | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === 'trim' && typeof o.trim === 'string' && libraryTrim(o.trim) !== null) {
    return { kind: 'trim', trim: o.trim as CabinetTrimKind };
  }
  if (
    o.kind === 'row' &&
    typeof o.key === 'string' &&
    typeof o.width === 'number' &&
    typeof o.custom === 'boolean' &&
    typeof o.items === 'object' &&
    o.items !== null
  ) {
    const row = libraryRow(o.key);
    if (row === null || !libraryWidthOk(row, o.width, o.custom)) return null;
    const items: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.items as Record<string, unknown>)) {
      if (typeof v === 'string') items[k] = v;
    }
    return { kind: 'row', key: o.key, width: o.width, custom: o.custom, items };
  }
  return null;
}
