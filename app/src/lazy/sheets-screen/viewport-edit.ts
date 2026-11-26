// EZD-703 (S13 Rail: Viewport "Add or edit a viewport; set scale per viewport"; 03b rule 3; S13 Permissions "Edit
// sheets (viewports ...): Edit model, plus edit lock"): the open set's viewports as the model holds them, and the
// model change one viewport edit makes. The set is the live sheet_set object of its kind (lowest id, as the server's
// set selector query reads it, app/src/server/sheets/sheets.ts); a set the model does not hold yet is the server's
// summary, and the first edit stores it as a new sheet_set object with the summary's fields.
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type SheetSetData, type SheetSetKind } from '@ezdraft/geometry';
import type { Change, Objects } from '../../editor/model/patches';
import { defaultSheetSetData, type SheetFloor, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { changeViewports, sheetViewports, type SheetViewport, type ViewportChange } from '../../lib/sheets/viewport';

export function liveSheetSet(objects: Objects, kind: SheetSetKind): { id: string; data: SheetSetData } | null {
  let hit: { id: string; data: SheetSetData } | null = null;
  for (const [id, v] of objects) {
    if (v.type !== 'sheet_set') continue;
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (!r.ok || r.object.type !== 'sheet_set' || r.object.data.kind !== kind) continue;
    if (hit === null || id < hit.id) hit = { id, data: r.object.data };
  }
  return hit;
}

// The set's data: the live object's, else the summary's fields on the default set of its kind.
function setData(objects: Objects | null, set: SheetSetSummary): { id: string | null; data: SheetSetData } {
  const live = objects === null ? null : liveSheetSet(objects, set.kind);
  if (live !== null) return live;
  const data: SheetSetData = {
    ...defaultSheetSetData(set.kind),
    size: set.size,
    keyPlacement: set.keyPlacement,
    lastIssuedVersionId: set.lastIssuedVersionId,
  };
  if (set.viewports !== undefined && set.viewports !== null) data.viewports = set.viewports;
  if (set.viewportSheets !== undefined && set.viewportSheets !== null) data.viewportSheets = set.viewportSheets;
  return { id: set.id, data };
}

export function openSheetViewports(
  objects: Objects | null,
  set: SheetSetSummary,
  sheet: string,
  floors: readonly SheetFloor[] = [],
): SheetViewport[] {
  return sheetViewports(setData(objects, set).data, sheet, floors);
}

// The one-object change that makes `change` on `sheet`, or null when it names no viewport of the sheet.
export function viewportEditChange(
  objects: Objects,
  set: SheetSetSummary,
  sheet: string,
  change: ViewportChange,
  newId: () => string,
  floors: readonly SheetFloor[] = [],
): Change | null {
  const { id, data } = setData(objects, set);
  const changed = changeViewports(data, sheet, change, newId, floors);
  if (changed === null) return null;
  return {
    id: id ?? newId(),
    value: { type: 'sheet_set', schemaVersion: CURRENT_SCHEMA_VERSION, data: { ...data, ...changed } },
  };
}
