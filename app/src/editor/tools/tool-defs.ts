// Drawing tool definitions (EZD-210a; vault/plans/EZD-210a.md section 3 C1-C8; 04 Tool rail; Q-0570; Q-0588 (a)).
// Pure: no React, no DOM.
import type { ModelObject, Point, WallObject } from '@ezdraft/geometry';
import type { RailTool } from '../../components/shell/rail-types';
import type { MessageKey } from '../../server/messages/catalog';
import {
  TURN_ANGLE_FIELD,
  WALL_LENGTH_FIELD,
  type TypedLengthField,
  type TypedTool,
  type TypedValues,
} from '../typed-entry/typed-entry';

export type DrawingToolId = 'wall' | 'room-rect';

export const WIDTH_FIELD: TypedLengthField = {
  id: 'width',
  label: 'office.typed.field.width',
  kind: 'length',
  lengthKind: 'wall_room',
  optional: false,
};
export const DEPTH_FIELD: TypedLengthField = {
  id: 'depth',
  label: 'office.typed.field.depth',
  kind: 'length',
  lengthKind: 'wall_room',
  optional: false,
};

export const WALL_TOOL: TypedTool = {
  id: 'wall',
  icon: 'view_column_2',
  fields: [WALL_LENGTH_FIELD, TURN_ANGLE_FIELD],
};
export const ROOM_RECT_TOOL: TypedTool = {
  id: 'room-rect',
  icon: 'rectangle',
  fields: [WIDTH_FIELD, DEPTH_FIELD],
};

export const DRAWING_TOOLS: Readonly<Record<DrawingToolId, TypedTool>> = {
  wall: WALL_TOOL,
  'room-rect': ROOM_RECT_TOOL,
};

export const DRAWING_RAIL_TOOLS: readonly RailTool[] = [
  { kind: 'tool', id: 'wall', icon: 'view_column_2', label: 'office.tool.wall', shortcut: 'W' },
  {
    kind: 'tool',
    id: 'room-rect',
    icon: 'rectangle',
    label: 'office.tool.room_rect',
    shortcut: 'R',
  },
];

// `at` is the snapped model point; `enter` and `escape` arrive only when the typed layer did not handle them.
export type ToolInput =
  | { type: 'move'; at: Point }
  | { type: 'press'; at: Point }
  | { type: 'release'; at: Point }
  | { type: 'double' }
  | { type: 'typed'; values: TypedValues }
  | { type: 'enter' }
  | { type: 'escape' };

export type ToolContext = { level: string; newId: () => string; objects: readonly ModelObject[] };

// `walls` are the new or changed walls to pass to `wallEditChanges`.
export type ToolStep<S> = {
  state: S;
  walls: WallObject[];
  message: MessageKey | null;
  exit: boolean;
};
