// EZD-213b Build step 4 (vault/plans/EZD-213b.md section 1, Decided "D-Parse", "D-Refusal text",
// "D-commitInspectorEdits"; Q-0561; Q-0570; Q-0640 rows 5-4, 5-5; 04 Q-0630 row 20): typed inspector text becomes an
// InspectorEdit, a refusal becomes its message key, and one commit's edits become one applyEdit (one undo step).
import { parseLength, parseRoughOpening, type WallLayer } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { Change, Objects } from '../model/patches';
import { openFloorId } from '../plan/batches';
import {
  inspectorEditChanges,
  levelModelObjects,
  type InspectorEdit,
  type InspectorEditReason,
} from './inspector-edits';

export type ParsedEdit = { ok: true; edit: InspectorEdit } | { ok: false; messageKey: MessageKey };

export type TextField =
  | 'wallLength'
  | 'wallThickness'
  | 'wallHeight'
  | 'openingWidth'
  | 'openingHeight'
  | 'sillHeight'
  | 'offsetLeft';

export function lengthEdit(field: TextField, text: string): ParsedEdit {
  const r = parseLength(text, 'other');
  if (!r.ok) return { ok: false, messageKey: r.messageKey };
  return { ok: true, edit: { field, inches: r.inches } };
}

export function roughOpeningEdit(text: string): ParsedEdit {
  const r = parseRoughOpening(text);
  if (!r.ok) return { ok: false, messageKey: r.messageKey };
  return { ok: true, edit: { field: 'roughOpening', width: r.width, height: r.height } };
}

export function layerEdit(
  index: number,
  material: WallLayer['material'],
  text: string,
): ParsedEdit {
  const r = parseLength(text, 'other');
  if (!r.ok) return { ok: false, messageKey: r.messageKey };
  return {
    ok: true,
    edit: { field: 'wallLayer', index, layer: { material, thickness: r.inches } },
  };
}

export function layerMaterialEdit(
  objects: Objects,
  level: string,
  wallId: string,
  index: number,
  material: WallLayer['material'],
): InspectorEdit | null {
  const id = wallId.toLowerCase();
  const wall = levelModelObjects(objects, level).find(
    (o) => o.type === 'wall' && o.id.toLowerCase() === id,
  );
  if (wall === undefined || wall.type !== 'wall') return null;
  const row = wall.data.attributes.layers[index];
  if (row === undefined) return null;
  return { field: 'wallLayer', index, layer: { material, thickness: row.thickness } };
}

export function refusalMessage(
  field: InspectorEdit['field'],
  reason: InspectorEditReason,
): MessageKey {
  switch (reason) {
    case 'zero_length':
    case 'too_long':
    case 'join_lost':
      return `office.tools.gap.${reason}`;
    case 'stud_not_positive':
      return 'office.inspector.error.stud_zero';
    case 'no_stud':
      return 'office.inspector.error.no_stud';
    case 'only_stud':
      return 'office.inspector.error.only_stud';
    case 'not_positive':
      return field === 'wallLayer'
        ? 'office.inspector.error.layer_zero'
        : 'office.inspector.error.zero';
    case 'past_corner':
    case 'overlap':
    case 'not_on_wall':
      return `office.inspector.error.${reason}`;
    case 'invalid_input':
      return 'office.length.refused';
    case 'not_found':
    case 'not_applicable':
    case 'not_shared':
    case 'negative':
    case 'not_door':
    case 'not_window':
    case 'not_shutter':
      return 'error.invalid_input';
  }
}

export type CommitDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  ids: readonly string[];
  newId: () => string;
};

export function commitInspectorEdits(
  deps: CommitDeps,
  edits: readonly InspectorEdit[],
): { ok: true; changed: number } | { ok: false; messageKey: MessageKey } {
  const { store, ids, newId } = deps;
  const objects = store.getState().objects;
  const level = openFloorId(objects);
  if (level === null) return { ok: true, changed: 0 };
  const w = new Map(objects);
  const merged = new Map<string, Change>();
  for (const edit of edits) {
    const r = inspectorEditChanges({
      objects: w,
      level,
      ids,
      edit,
      newId,
      highs: store.getState().numberHighs,
    });
    if (!r.ok) return { ok: false, messageKey: refusalMessage(edit.field, r.reason) };
    for (const change of r.changes) {
      if (change.value === null) w.delete(change.id);
      else w.set(change.id, change.value);
      merged.set(change.id, change);
    }
  }
  if (merged.size === 0) return { ok: true, changed: 0 };
  store.applyEdit([...merged.values()]);
  return { ok: true, changed: merged.size };
}
