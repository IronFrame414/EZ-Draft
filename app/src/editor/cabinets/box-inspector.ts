// EZD-406 (S04 Controls (inspector) "Status pill", "Width", "Depth", "Height", "Face > Layout select | Options depend
// on box type; elevation redraws", "Face > Hinges", "Face > Finished ends", "Catalog > Item", "Catalog > Finish",
// "Catalog > Cost | Hidden without See company costs", "Swap box | Lists compatible boxes (same width or same slot);
// pick to replace | Keeps position in run"; S04 Data shown "position ("Box 4 of 6")"; board S04Cabinets;
// AC-EZD-406-1, -2; vault/build/assumptions.md EZD-406): what the box inspector reads for the selected run member and
// its edits as model changes. Pure: no React, no DOM. Every edit changes the member object only, under its own id, so
// the run's row lists (its order) never change: a swapped box keeps its place in the run.
import {
  CURRENT_SCHEMA_VERSION,
  cabinetBoxPosition,
  cabinetCodeForWidth,
  cabinetRowOf,
  isCabinetRunMember,
  objectLookup,
  resizeCabinetMember,
  type CabinetBoxType,
  type CabinetFaceLayout,
  type CabinetFinishedEnds,
  type CabinetHingeSide,
  type CabinetRow,
  type CabinetRunMember,
  type ModelObject,
  type ObjectStatus,
} from '@ezdraft/geometry';
import type { CatalogItem } from '../../lib/catalog/catalog';
import type { Change } from '../model/patches';
import type { CabinetView } from './cabinet-view';

export type CabinetMemberKind = 'box' | 'filler' | 'panel' | 'corner' | 'shelf';

export type BoxInspectorView = {
  id: string;
  kind: CabinetMemberKind;
  code: string;
  // The box type (S04 Data shown "type"); null for a filler, panel, corner or shelf.
  boxType: CabinetBoxType | null;
  row: CabinetRow;
  // "Box 3 of 5": among the boxes of its row (cabinetBoxPosition); null for a filler, panel, corner or shelf.
  position: { n: number; of: number } | null;
  runName: string;
  status: ObjectStatus;
  width: number;
  depth: number;
  height: number;
  // The Face section; null for a member that is not a box.
  face: {
    layout: CabinetFaceLayout;
    layouts: readonly CabinetFaceLayout[];
    hinges: CabinetHingeSide;
    // False when the layout has no door, so hinge side has no meaning.
    hasDoors: boolean;
    finishedEnds: CabinetFinishedEnds;
  } | null;
  catalogItemId: string | null;
  finish: string | null;
};

const KIND: Record<CabinetRunMember['type'], CabinetMemberKind> = {
  cabinet_box: 'box',
  cabinet_filler: 'filler',
  cabinet_panel: 'panel',
  cabinet_corner: 'corner',
  cabinet_shelf: 'shelf',
};

// S04 Face > Layout "Options depend on box type": the spec's sink base list (False drawer + 2 doors; 2 doors;
// Drawer + 2 doors) and, for the other types, the layouts their library rows draw (assumptions.md EZD-406).
const LAYOUTS: Record<CabinetBoxType, readonly CabinetFaceLayout[]> = {
  base: [
    'door_1',
    'doors_2',
    'drawer_door_1',
    'drawer_doors_2',
    'false_drawer_door_1',
    'false_drawer_doors_2',
  ],
  vanity: [
    'door_1',
    'doors_2',
    'drawer_door_1',
    'drawer_doors_2',
    'false_drawer_door_1',
    'false_drawer_doors_2',
    'drawers_3',
  ],
  sink_base: ['false_drawer_doors_2', 'doors_2', 'drawer_doors_2'],
  drawer_base: ['drawers_2', 'drawers_3', 'drawers_4'],
  wall: ['door_1', 'doors_2', 'open'],
  tall: ['door_1', 'doors_2'],
  corner_blind: ['door_1', 'drawer_door_1'],
  appliance_panel: ['panel'],
};

// The layouts offered for a box type; the box's own layout is always offered, first when it is not in the list.
export function faceLayoutOptions(
  boxType: CabinetBoxType,
  current?: CabinetFaceLayout,
): readonly CabinetFaceLayout[] {
  const list = LAYOUTS[boxType];
  return current === undefined || list.includes(current) ? list : [current, ...list];
}

const doorCount = (layout: CabinetFaceLayout): 0 | 1 | 2 =>
  layout.endsWith('doors_2') ? 2 : layout.endsWith('door_1') ? 1 : 0;

// The hinge side a layout takes: two doors hinge as a pair; one door keeps a left or right side (left when it had
// none or a pair); no door has none.
export function hingesFor(layout: CabinetFaceLayout, current: CabinetHingeSide): CabinetHingeSide {
  const n = doorCount(layout);
  if (n === 2) return 'pair';
  if (n === 1) return current === 'left' || current === 'right' ? current : 'left';
  return 'none';
}

const memberById = (objects: readonly ModelObject[], id: string): CabinetRunMember | null => {
  const key = id.toLowerCase();
  const o = objects.find((x) => x.id.toLowerCase() === key);
  return o !== undefined && isCabinetRunMember(o) ? o : null;
};

// The inspector for one run member; null when `id` is not a member of the view's run.
export function boxInspectorView(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
): BoxInspectorView | null {
  const row = cabinetRowOf(view.run, id);
  const m = row === null ? null : memberById(objects, id);
  if (row === null || m === null) return null;
  const a = m.data.attributes;
  const pos = cabinetBoxPosition(view.run, m.id, objectLookup(objects));
  const face =
    m.type === 'cabinet_box'
      ? {
          layout: m.data.attributes.faceLayout,
          layouts: faceLayoutOptions(m.data.attributes.boxType, m.data.attributes.faceLayout),
          hinges: m.data.attributes.hingeSide,
          hasDoors: doorCount(m.data.attributes.faceLayout) > 0,
          finishedEnds: m.data.attributes.finishedEnds,
        }
      : null;
  return {
    id: m.id,
    kind: KIND[m.type],
    code: a.code,
    boxType: m.type === 'cabinet_box' ? m.data.attributes.boxType : null,
    row,
    position: pos === null ? null : { n: pos.n, of: pos.of },
    runName: view.run.data.attributes.name,
    status: m.data.status,
    width: a.width,
    depth: a.depth,
    height: a.height,
    face,
    catalogItemId: a.catalogItemId,
    finish: a.finish,
  };
}

const change = (m: CabinetRunMember): Change => ({
  id: m.id,
  value: {
    type: m.type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: m.data as unknown as Record<string, unknown>,
  },
});

const EPS = 1e-6;

export type BoxEdit =
  | { field: 'status'; value: ObjectStatus }
  | { field: 'width' | 'depth' | 'height'; value: number }
  | { field: 'faceLayout'; value: CabinetFaceLayout }
  | { field: 'hingeSide'; value: CabinetHingeSide }
  | { field: 'finishedEnds'; value: CabinetFinishedEnds }
  | { field: 'catalogItemId'; value: string | null }
  | { field: 'finish'; value: string | null };

// One inspector edit as model changes (one undo step); [] when nothing changes or the edit does not apply. Width
// goes through the canvas resize, so the code follows the width (B15 to B18). A new face layout redraws the
// elevation and sets the hinge side it needs (hingesFor).
export function boxEditChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
  edit: BoxEdit,
): Change[] {
  const m = cabinetRowOf(view.run, id) === null ? null : memberById(objects, id);
  if (m === null) return [];
  const a = m.data.attributes;
  const withAttrs = (next: Record<string, unknown>): Change[] => {
    const same = Object.entries(next).every(
      ([k, v]) => (a as unknown as Record<string, unknown>)[k] === v,
    );
    if (same) return [];
    return [
      change({ ...m, data: { ...m.data, attributes: { ...a, ...next } } } as CabinetRunMember),
    ];
  };
  switch (edit.field) {
    case 'status':
      if (m.data.status === edit.value) return [];
      return [change({ ...m, data: { ...m.data, status: edit.value } } as CabinetRunMember)];
    case 'width': {
      const next = resizeCabinetMember(m, edit.value);
      return next === null ? [] : [change(next)];
    }
    case 'depth':
    case 'height':
      if (!(edit.value > 0) || !Number.isFinite(edit.value)) return [];
      if (Math.abs(a[edit.field] - edit.value) < EPS) return [];
      return withAttrs({ [edit.field]: edit.value });
    case 'catalogItemId':
      return withAttrs({ catalogItemId: edit.value });
    case 'finish':
      return withAttrs({ finish: edit.value });
    case 'faceLayout':
      if (m.type !== 'cabinet_box') return [];
      if (!faceLayoutOptions(m.data.attributes.boxType).includes(edit.value)) return [];
      return withAttrs({
        faceLayout: edit.value,
        hingeSide: hingesFor(edit.value, m.data.attributes.hingeSide),
      });
    case 'hingeSide':
      if (m.type !== 'cabinet_box' || edit.value === 'none') return [];
      if (doorCount(m.data.attributes.faceLayout) === 0) return [];
      return withAttrs({ hingeSide: edit.value });
    case 'finishedEnds':
      if (m.type !== 'cabinet_box') return [];
      return withAttrs({ finishedEnds: edit.value });
  }
}

// --- Swap box ---------------------------------------------------------------------------------------------------

// Where a catalog cabinet item (or a run member) can stand: the upper row (wall cabinets), the fillers, or the base
// row (every other cabinet).
type Slot = 'upper' | 'filler' | 'base';

const itemSlot = (item: CatalogItem): Slot =>
  item.subcategory === 'wall' ? 'upper' : item.subcategory === 'filler' ? 'filler' : 'base';

const memberSlot = (m: CabinetRunMember, row: CabinetRow): Slot =>
  m.type === 'cabinet_filler' ? 'filler' : row === 'upper' ? 'upper' : 'base';

// The box types a catalog sub-category stands for (R23 seed rows B, DB, SB, W).
const SUB_TO_TYPE: Readonly<Record<string, CabinetBoxType>> = {
  base: 'base',
  drawer_base: 'drawer_base',
  sink_base: 'sink_base',
  wall: 'wall',
  vanity: 'vanity',
  tall: 'tall',
  corner_blind: 'corner_blind',
  appliance_panel: 'appliance_panel',
};

const memberSub = (m: CabinetRunMember): string | null =>
  m.type === 'cabinet_box' ? m.data.attributes.boxType : m.type === 'cabinet_filler' ? 'filler' : null;

// S04 "Swap box | Lists compatible boxes (same width or same slot)": the company's cabinet catalog items that stand
// where this member stands (base row, upper row or filler) and are either the same width or the same kind of box
// (same sub-category, any width). The member's own catalog item is left out. Same width first, then by width and
// code. Panels, corners and shelves have no swap list.
export function compatibleBoxes(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
  items: readonly CatalogItem[],
): CatalogItem[] {
  const row = cabinetRowOf(view.run, id);
  const m = row === null ? null : memberById(objects, id);
  if (row === null || m === null) return [];
  if (m.type !== 'cabinet_box' && m.type !== 'cabinet_filler') return [];
  const slot = memberSlot(m, row);
  const sub = memberSub(m);
  const width = m.data.attributes.width;
  const own = m.data.attributes.catalogItemId?.toLowerCase() ?? null;
  const sameWidth = (i: CatalogItem) => i.width !== null && Math.abs(i.width - width) < EPS;
  return items
    .filter(
      (i) =>
        i.category === 'cabinets' &&
        i.width !== null &&
        i.width > 0 &&
        i.id.toLowerCase() !== own &&
        itemSlot(i) === slot &&
        (sameWidth(i) || (sub !== null && i.subcategory === sub)),
    )
    .sort(
      (p, q) =>
        Number(sameWidth(q)) - Number(sameWidth(p)) ||
        (p.width ?? 0) - (q.width ?? 0) ||
        (p.model ?? p.name).localeCompare(q.model ?? q.name) ||
        p.id.localeCompare(q.id),
    );
}

// The face layout a swapped-in box gets: its old layout when the new type offers it, else the type's first.
const layoutFor = (type: CabinetBoxType, current: CabinetFaceLayout): CabinetFaceLayout => {
  const list = LAYOUTS[type];
  return list.includes(current) ? current : list[0]!;
};

// The member replaced by a catalog item, in the same place: same id, so the run's rows (its order) are unchanged.
// It takes the item's code (model), type, size, catalog item and finish (its own finish when the item has none);
// status, level, finished ends and (when the new type offers it) the face layout are kept. [] when the item is not
// compatible with the member.
export function swapBoxChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  id: string,
  item: CatalogItem,
): Change[] {
  if (!compatibleBoxes(view, objects, id, [item]).some((i) => i.id === item.id)) return [];
  const m = memberById(objects, id)!;
  const a = m.data.attributes;
  const width = item.width ?? a.width;
  const size = {
    width,
    depth: item.depth !== null && item.depth > 0 ? item.depth : a.depth,
    height: item.height !== null && item.height > 0 ? item.height : a.height,
  };
  const code = item.model?.trim() ? item.model.trim() : cabinetCodeForWidth(a.code, a.width, width);
  const common = { ...size, code, catalogItemId: item.id, finish: item.finish ?? a.finish };
  if (m.type === 'cabinet_box') {
    const b = m.data.attributes;
    const boxType = (item.subcategory !== null ? SUB_TO_TYPE[item.subcategory] : undefined) ?? b.boxType;
    const faceLayout = layoutFor(boxType, b.faceLayout);
    const attributes = {
      ...b,
      ...common,
      boxType,
      faceLayout,
      hingeSide: hingesFor(faceLayout, b.hingeSide),
    };
    return [change({ ...m, data: { ...m.data, attributes } })];
  }
  if (m.type === 'cabinet_filler') {
    const f = m.data.attributes;
    const attributes = { ...f, ...common, scribe: Math.min(f.scribe, width) };
    return [change({ ...m, data: { ...m.data, attributes } })];
  }
  return [];
}

// --- Catalog section -------------------------------------------------------------------------------------------

// The Catalog > Item text: "[Supplier] SB36-SH" on the board, so the item's brand (else its line) in brackets, then
// its code (else its name). Null when the member has no catalog item or the item is not in the list.
export function catalogItemText(item: CatalogItem | null): string | null {
  if (item === null) return null;
  const source = item.brand ?? item.line;
  const code = item.model ?? item.name;
  return source === null ? code : `[${source}] ${code}`;
}

// The Cost row (S04 "Display "$… · internal" | Hidden without See company costs"): the server sends `unitCost`
// only to a member with See company costs, so an absent key means the row is not shown (`hidden`); null means
// permitted with no cost on record.
export function catalogCost(
  item: CatalogItem | null,
): { kind: 'hidden' } | { kind: 'none' } | { kind: 'amount'; text: string } {
  if (item === null || !('unitCost' in item) || item.unitCost === undefined) {
    return { kind: 'hidden' };
  }
  if (item.unitCost === null) return { kind: 'none' };
  const text = item.unitCost.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return { kind: 'amount', text };
}
