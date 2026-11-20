// Drawing tool definitions (EZD-210a; vault/plans/EZD-210a.md section 3 C1-C8; 04 Tool rail; Q-0570; Q-0588 (a)).
// Pure: no React, no DOM.
// EZD-212b (vault/plans/EZD-212b.md D1).
// EZD-234 Build (S03 Fixtures; phase-02.md EZD-234; AC-EZD-234-2): the Fixtures tool (F), placed from its panel with no
// typed bar.
// EZD-223 (S03 Sketch; S15d Reset to default map "S Sketch"; board S03Plan rail `draw` "Sketch"): the Sketch tool (S),
// with no typed bar.
import type { ModelObject, ObjectStatus, Point, WallObject } from '@ezdraft/geometry';
import type { RailTool } from '../../components/shell/rail-types';
import type { MessageKey } from '../../server/messages/catalog';
import {
  TURN_ANGLE_FIELD,
  WALL_LENGTH_FIELD,
  type TypedLengthField,
  type TypedTool,
  type TypedValues,
} from '../typed-entry/typed-entry';

export type DrawingToolId =
  | 'wall'
  | 'room-rect'
  | 'door'
  | 'window'
  | 'move'
  | 'fixtures'
  | 'sketch'
  | 'measure'
  | 'cabinets'
  | 'countertops'
  | 'electrical';
export type TypedDrawingToolId = Exclude<
  DrawingToolId,
  'fixtures' | 'sketch' | 'measure' | 'cabinets' | 'countertops' | 'electrical'
>;

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

// EZD-211a Build step 7 (vault/plans/EZD-211a.md section 1 Decided "Fields and tools"; Q-0636; Q-0630 09 row 14).
export const OFFSET_LEFT_FIELD: TypedLengthField = {
  id: 'offsetLeft',
  label: 'office.typed.field.offset_left',
  kind: 'length',
  lengthKind: 'other',
  optional: true,
};
export const OFFSET_RIGHT_FIELD: TypedLengthField = {
  id: 'offsetRight',
  label: 'office.typed.field.offset_right',
  kind: 'length',
  lengthKind: 'other',
  optional: true,
};
export const OPENING_WIDTH_FIELD: TypedLengthField = {
  id: 'width',
  label: 'office.typed.field.width',
  kind: 'length',
  lengthKind: 'positive',
  optional: true,
};

export const DOOR_TOOL: TypedTool = {
  id: 'door',
  icon: 'door_front',
  fields: [OFFSET_LEFT_FIELD, OFFSET_RIGHT_FIELD, OPENING_WIDTH_FIELD],
};
export const WINDOW_TOOL: TypedTool = {
  id: 'window',
  icon: 'window',
  fields: [OFFSET_LEFT_FIELD, OFFSET_RIGHT_FIELD, OPENING_WIDTH_FIELD],
};

export const DISTANCE_FIELD: TypedLengthField = {
  id: 'distance',
  label: 'office.typed.field.distance',
  kind: 'length',
  lengthKind: 'other',
  optional: false,
};

export const MOVE_TOOL: TypedTool = { id: 'move', icon: 'open_with', fields: [DISTANCE_FIELD] };

export const MOVE_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'move',
  icon: 'open_with',
  label: 'office.tool.move',
  shortcut: 'M',
};

export const DRAWING_TOOLS: Readonly<Record<TypedDrawingToolId, TypedTool>> = {
  wall: WALL_TOOL,
  'room-rect': ROOM_RECT_TOOL,
  door: DOOR_TOOL,
  window: WINDOW_TOOL,
  move: MOVE_TOOL,
};

export const DRAWING_RAIL_TOOLS: readonly RailTool[] = [
  MOVE_RAIL_TOOL,
  { kind: 'tool', id: 'wall', icon: 'view_column_2', label: 'office.tool.wall', shortcut: 'W' },
  {
    kind: 'tool',
    id: 'room-rect',
    icon: 'rectangle',
    label: 'office.tool.room_rect',
    shortcut: 'R',
  },
  { kind: 'tool', id: 'door', icon: 'door_front', label: 'office.tool.door', shortcut: 'D' },
  { kind: 'tool', id: 'window', icon: 'window', label: 'office.tool.window', shortcut: 'N' },
  { kind: 'tool', id: 'fixtures', icon: 'wash', label: 'office.tool.fixtures', shortcut: 'F' },
  { kind: 'tool', id: 'sketch', icon: 'draw', label: 'office.tool.sketch', shortcut: 'S' },
];

// EZD-231 (04 Tool rail Measure; S06 Measure "Allowed in view only"): on every viewer's rail, after the drawing tools.
export const MEASURE_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'measure',
  icon: 'straighten',
  label: 'office.tool.measure',
  shortcut: 'Shift+L',
};

// EZD-404 (S04 Entry points "Cabinets (C) tool on the rail"; S04 Permissions "View projects: view runs, plan strip,
// elevation"; board S04 rail, after Window): opens the cabinet run screen. Like Measure it is on every viewer's rail
// and never paused, so it is not one of the drawing tools.
export const CABINETS_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'cabinets',
  icon: 'kitchen',
  label: 'office.tool.cabinets',
  shortcut: 'C',
};

// EZD-412 (S04b Entry points "Countertops (K) tool on the rail"; S04b Permissions "View projects: view pieces"; S15d
// Reset to default map "K Countertops"; board S04bCountertops rail, after Cabinets): opens the countertop screen. Like
// Cabinets it is on every viewer's rail and never paused, so it is not one of the drawing tools.
export const COUNTERTOPS_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'countertops',
  icon: 'dashboard',
  label: 'office.tool.countertops',
  shortcut: 'K',
};

// EZD-601 (S06 Controls "Electrical tool (E) | Standard rail | Enters electrical mode. | Pressed state. Shortcut E";
// S06 Permissions "View plan, circuits, load calc, panel schedule ...: View projects"; board S06Electrical rail, the
// bolt after Cabinets): electrical mode. Like Cabinets it is on every viewer's rail and never paused, so it is not
// one of the drawing tools.
export const ELECTRICAL_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'electrical',
  icon: 'bolt',
  label: 'office.tool.electrical',
  shortcut: 'E',
};

/** The tools that need no Edit model and stay on in view only (S06 States "selecting, panning, zooming, measuring"). */
export const VIEW_TOOL_IDS: readonly DrawingToolId[] = [
  'measure',
  'cabinets',
  'countertops',
  'electrical',
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

// EZD-214: `status` is the phase view's status for new walls (S03 Status bar "View"); Existing when not given.
export type ToolContext = {
  level: string;
  newId: () => string;
  objects: readonly ModelObject[];
  status?: ObjectStatus;
};

// `walls` are the new or changed walls to pass to `wallEditChanges`.
export type ToolStep<S> = {
  state: S;
  walls: WallObject[];
  message: MessageKey | null;
  exit: boolean;
};
