// EZD-212c D20 (vault/plans/EZD-212c.md): the typed tool of a handle drag or chip entry. EZD-423 (11 Budgets editor
// download size): its own file, so the drawing layer in the editor entry reads it without the selection-edit engine
// code; selection-edit.ts re-exports it.
import { WALL_LENGTH_FIELD, type TypedTool } from '../typed-entry/typed-entry';
import type { SelectionEntry } from './selection-edit';
import {
  DISTANCE_FIELD,
  DOOR_TOOL,
  OFFSET_LEFT_FIELD,
  OFFSET_RIGHT_FIELD,
  OPENING_WIDTH_FIELD,
  WALL_TOOL,
  WINDOW_TOOL,
} from './tool-defs';

export function entryTool(entry: SelectionEntry): TypedTool {
  const icon =
    entry.objectKind === 'wall'
      ? WALL_TOOL.icon
      : entry.objectKind === 'door'
        ? DOOR_TOOL.icon
        : WINDOW_TOOL.icon;
  if (entry.kind === 'chip') {
    const field =
      entry.objectKind === 'wall'
        ? DISTANCE_FIELD
        : entry.side === 'left'
          ? OFFSET_LEFT_FIELD
          : OFFSET_RIGHT_FIELD;
    return { id: `chip-${entry.objectKind}-${entry.side}`, icon, fields: [field] };
  }
  const field = entry.objectKind === 'wall' ? WALL_LENGTH_FIELD : OPENING_WIDTH_FIELD;
  return { id: `handle-${entry.objectKind}`, icon, fields: [field] };
}
