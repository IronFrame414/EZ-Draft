// EZD-419 (S03 Controls — inspector "Title and subtitle | Object name and contents (e.g. "Island run · 2 boxes · 2 end
// panels")", "Client selection tiles (Countertop, Cabinet finish) | Opens catalog picker for that selection | Shows
// swatch and item name", "Run total line | Display: box list and total"; board S03Plan "Island run", "3 boxes · 2 end
// panels", "B24 + DB24 + B24 + 2 panels  73 1/2""; AC-EZD-419-1, -2; vault/build/assumptions.md EZD-419): what the
// inspector shows for a selected cabinet run, and its two client selections as model changes. Pure: no React, no DOM.
import {
  CABINET_BASE_DEPTH,
  CURRENT_SCHEMA_VERSION,
  cabinetRowMembers,
  objectLookup,
  type CabinetRunMember,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import type { CabinetView } from './cabinet-view';

// One value shared by every object, none of them set, or set to different values (S03 bulk edit "Mixed").
export type RunSelection = { kind: 'none' } | { kind: 'one'; value: string } | { kind: 'mixed' };

export type RunInspectorView = {
  id: string;
  name: string;
  // The base row's counts, as the cabinet run header (assumptions.md EZD-402).
  boxCount: number;
  fillerCount: number;
  endPanelCount: number;
  panelCount: number;
  // The base row's codes in order, panels left out (they are counted at the end of the line).
  codes: string[];
  panels: number;
  total: number;
  // Cabinet finish: the finish of every member of both rows.
  finish: RunSelection;
  // Countertop: the countertop pieces over the run and their material item.
  countertopIds: string[];
  countertop: RunSelection;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Whether the cabinet screen's selection is the run itself (a click on the run name), not a box in it.
export const isRunSelected = (view: CabinetView | null, ids: readonly string[]): boolean =>
  view !== null && ids.length === 1 && same(ids[0]!, view.run.id);

function shared(values: readonly (string | null)[]): RunSelection {
  const set = values.filter((v): v is string => v !== null && v !== '');
  if (set.length === 0) return { kind: 'none' };
  if (set.length < values.length || set.some((v) => v !== set[0])) return { kind: 'mixed' };
  return { kind: 'one', value: set[0]! };
}

function members(view: CabinetView, objects: readonly ModelObject[]): CabinetRunMember[] {
  const lookup = objectLookup(objects);
  return [
    ...cabinetRowMembers(view.run, 'base', lookup),
    ...cabinetRowMembers(view.run, 'upper', lookup),
  ];
}

function inside(p: Point, outline: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]!;
    const b = outline[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

// The countertop pieces over the run: pieces on the run's floor whose outline holds the middle of the run's base row,
// half a base depth off the run line on either side (a piece has no link to its run; assumptions.md EZD-419).
export function runCountertops(
  view: CabinetView,
  objects: readonly ModelObject[],
): Extract<ModelObject, { type: 'countertop_piece' }>[] {
  const { start, axis } = view.run.data.geometry;
  const mid = {
    x: start.x + axis.x * (view.summary.total / 2),
    y: start.y + axis.y * (view.summary.total / 2),
  };
  const off = CABINET_BASE_DEPTH / 2;
  const points = [
    { x: mid.x - axis.y * off, y: mid.y + axis.x * off },
    { x: mid.x + axis.y * off, y: mid.y - axis.x * off },
  ];
  const level = view.run.data.level;
  return objects.filter(
    (o): o is Extract<ModelObject, { type: 'countertop_piece' }> =>
      o.type === 'countertop_piece' &&
      same(o.data.level, level) &&
      points.some((p) => inside(p, o.data.geometry.outline)),
  );
}

export function runInspectorView(
  view: CabinetView,
  objects: readonly ModelObject[],
): RunInspectorView {
  const base = cabinetRowMembers(view.run, 'base', objectLookup(objects));
  const panels = base.filter((m) => m.type === 'cabinet_panel');
  const tops = runCountertops(view, objects);
  return {
    id: view.run.id,
    name: view.summary.name,
    boxCount: view.summary.boxCount,
    fillerCount: view.summary.fillerCount,
    endPanelCount: panels.filter((m) => m.data.attributes.kind === 'end').length,
    panelCount: panels.filter((m) => m.data.attributes.kind !== 'end').length,
    codes: base.filter((m) => m.type !== 'cabinet_panel').map((m) => m.data.attributes.code),
    panels: panels.length,
    total: view.summary.total,
    finish: shared(members(view, objects).map((m) => m.data.attributes.finish)),
    countertopIds: tops.map((o) => o.id),
    countertop: shared(tops.map((o) => o.data.attributes.materialItemId)),
  };
}

const change = (o: ModelObject): Change => ({
  id: o.id,
  value: {
    type: o.type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: o.data as unknown as Record<string, unknown>,
  },
});

// AC-EZD-419-2: picking a cabinet finish sets it on every member of the run (both rows); one edit, one undo step.
// Members that already carry it are left alone; [] when nothing changes.
export function runFinishChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  finish: string,
): Change[] {
  return members(view, objects)
    .filter((m) => m.data.attributes.finish !== finish)
    .map((m) =>
      change({
        ...m,
        data: { ...m.data, attributes: { ...m.data.attributes, finish } },
      } as ModelObject),
    );
}

// Picking a countertop links the catalog item to every countertop piece over the run; [] when there is none.
export function runCountertopChanges(
  view: CabinetView,
  objects: readonly ModelObject[],
  itemId: string,
): Change[] {
  return runCountertops(view, objects)
    .filter(
      (o) =>
        o.data.attributes.materialItemId === null ||
        !same(o.data.attributes.materialItemId, itemId),
    )
    .map((o) =>
      change({
        ...o,
        data: { ...o.data, attributes: { ...o.data.attributes, materialItemId: itemId } },
      }),
    );
}
