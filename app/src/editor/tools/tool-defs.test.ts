// EZD-210a D1 (vault/plans/EZD-210a.md sections 3 C2-C5, 4, 6). Sources: 04 Tool rail; Q-0568; Q-0570;
// Q-0588 (a).
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../components/icon/icon-names.generated';
import { catalogFor } from '../../server/messages/catalog';
import { TURN_ANGLE_FIELD, WALL_LENGTH_FIELD } from '../typed-entry/typed-entry';
import {
  DEPTH_FIELD,
  DISTANCE_FIELD,
  DRAWING_RAIL_TOOLS,
  DRAWING_TOOLS,
  MOVE_TOOL,
  ROOM_RECT_TOOL,
  WALL_TOOL,
  WIDTH_FIELD,
} from './index';
import {
  DOOR_TOOL,
  OFFSET_LEFT_FIELD,
  OFFSET_RIGHT_FIELD,
  OPENING_WIDTH_FIELD,
  WINDOW_TOOL,
} from './tool-defs';

// Section 6, in order.
const WORDING: [string, string][] = [
  ['office.tool.wall', 'Wall'],
  ['office.tool.room_rect', 'Room rectangle'],
  ['office.typed.field.width', 'Width'],
  ['office.typed.field.depth', 'Depth'],
  ['office.tools.too_long', `A wall can be at most 200' 0"`],
  ['office.tools.wall.click_start', 'Click where the wall starts'],
  ['office.tools.wall.no_direction', 'Point the cursor where the wall goes'],
  ['office.tools.room_rect.click_corner', 'Click a corner first'],
  ['office.tools.room_rect.flat', 'Give the room a width and a depth'],
  [
    'office.tools.gap.across',
    'That wall runs across the gap. Pick a wall that runs the same way as the gap.',
  ],
  ['office.tools.gap.not_in_room', 'Pick a wall of this room'],
  ['office.tools.gap.zero_length', 'That wall would end up 0" long'],
  ['office.tools.gap.too_long', `That wall would end up longer than 200' 0"`],
  ['office.tools.gap.join_lost', "That wall can't change without pulling a corner apart"],
  ['office.tools.gap.gone', 'This gap has changed. Check the walls again.'],
  ['office.tools.gap.keep_failed', "Couldn't keep the room out of square. Try again."],
  ['office.tools.gap.use_move', 'This gap runs both ways. Move a wall to close it.'],
  ['office.tool.move', 'Move'],
  ['office.typed.field.distance', 'Distance'],
  ['office.tools.move.click_base', 'Click a base point first'],
  ['office.tools.move.no_direction', 'Point the cursor where the selection goes'],
  ['office.tools.move.failed', "Couldn't move the selection. Try again."],
];

describe('EZD-210a tool definitions', () => {
  it('EZD-210a D1 tool definitions, rail entries, icons and wording', () => {
    expect(WIDTH_FIELD).toEqual({
      id: 'width',
      label: 'office.typed.field.width',
      kind: 'length',
      lengthKind: 'wall_room',
      optional: false,
    });
    expect(DEPTH_FIELD).toEqual({
      id: 'depth',
      label: 'office.typed.field.depth',
      kind: 'length',
      lengthKind: 'wall_room',
      optional: false,
    });
    expect(WALL_TOOL).toEqual({
      id: 'wall',
      icon: 'view_column_2',
      fields: [WALL_LENGTH_FIELD, TURN_ANGLE_FIELD],
    });
    expect(ROOM_RECT_TOOL).toEqual({
      id: 'room-rect',
      icon: 'rectangle',
      fields: [WIDTH_FIELD, DEPTH_FIELD],
    });
    expect(DRAWING_TOOLS).toEqual({
      wall: WALL_TOOL,
      'room-rect': ROOM_RECT_TOOL,
      door: DOOR_TOOL,
      window: WINDOW_TOOL,
      move: MOVE_TOOL,
    });
    // EZD-212b E1 (vault/plans/EZD-212b.md D1).
    expect(DISTANCE_FIELD).toEqual({
      id: 'distance',
      label: 'office.typed.field.distance',
      kind: 'length',
      lengthKind: 'other',
      optional: false,
    });
    expect(MOVE_TOOL).toEqual({ id: 'move', icon: 'open_with', fields: [DISTANCE_FIELD] });
    expect(DRAWING_RAIL_TOOLS).toEqual([
      {
        kind: 'tool',
        id: 'move',
        icon: 'open_with',
        label: 'office.tool.move',
        shortcut: 'M',
      },
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
    ]);
    const names: readonly string[] = ICON_NAMES;
    expect(names).toContain('view_column_2');
    expect(names).toContain('rectangle');
    expect(names).toContain('open_with');
    const catalog = catalogFor('office', 'en') as Readonly<Record<string, unknown>>;
    for (const [key, text] of WORDING) expect({ key, text: catalog[key] }).toEqual({ key, text });
  });
});

// EZD-211a D1 (vault/plans/EZD-211a.md sections 1 Decided "Fields and tools", 3, 4, 6). Sources: Q-0636 (order);
// Q-0630 09 row 14; board S03 rail; section 6 wording.
const OPENING_WORDING: [string, string][] = [
  ['office.tool.door', 'Door'],
  ['office.tool.window', 'Window'],
  ['office.typed.field.offset_left', 'Offset left'],
  ['office.typed.field.offset_right', 'Offset right'],
  ['office.tools.opening.door_tip_swing', 'Click to flip swing'],
  ['office.tools.opening.door_tip_hand', 'Click to flip hand'],
  ['office.tools.opening.past_corner', 'That runs past the corner. Try a smaller offset or width.'],
  ['office.tools.opening.overlap', 'That overlaps another door or window'],
  ['office.tools.opening.no_wall', 'Point at a wall first'],
  ['office.tools.opening.offsets_mismatch', "Those offsets and the width don't add up to the wall"],
];

describe('EZD-211a opening tool definitions', () => {
  it('EZD-211a D1 tool definitions and wording', () => {
    expect(OFFSET_LEFT_FIELD).toEqual({
      id: 'offsetLeft',
      label: 'office.typed.field.offset_left',
      kind: 'length',
      lengthKind: 'other',
      optional: true,
    });
    expect(OFFSET_RIGHT_FIELD).toEqual({
      id: 'offsetRight',
      label: 'office.typed.field.offset_right',
      kind: 'length',
      lengthKind: 'other',
      optional: true,
    });
    expect(OPENING_WIDTH_FIELD).toEqual({
      id: 'width',
      label: 'office.typed.field.width',
      kind: 'length',
      lengthKind: 'positive',
      optional: true,
    });
    expect(DOOR_TOOL).toEqual({
      id: 'door',
      icon: 'door_front',
      fields: [OFFSET_LEFT_FIELD, OFFSET_RIGHT_FIELD, OPENING_WIDTH_FIELD],
    });
    expect(WINDOW_TOOL).toEqual({
      id: 'window',
      icon: 'window',
      fields: [OFFSET_LEFT_FIELD, OFFSET_RIGHT_FIELD, OPENING_WIDTH_FIELD],
    });
    for (const tool of [DOOR_TOOL, WINDOW_TOOL])
      expect(tool.fields.map((f) => f.id)).toEqual(['offsetLeft', 'offsetRight', 'width']);
    const catalog = catalogFor('office', 'en') as Readonly<Record<string, unknown>>;
    for (const [key, text] of OPENING_WORDING)
      expect({ key, text: catalog[key] }).toEqual({ key, text });
  });
});
