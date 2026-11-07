// EZD-210a D1 (vault/plans/EZD-210a.md sections 3 C2-C5, 4, 6). Sources: 04 Tool rail; Q-0568; Q-0570;
// Q-0588 (a).
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../components/icon/icon-names.generated';
import { catalogFor } from '../../server/messages/catalog';
import { TURN_ANGLE_FIELD, WALL_LENGTH_FIELD } from '../typed-entry/typed-entry';
import {
  DEPTH_FIELD,
  DRAWING_RAIL_TOOLS,
  DRAWING_TOOLS,
  ROOM_RECT_TOOL,
  WALL_TOOL,
  WIDTH_FIELD,
} from './index';

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
  ['office.tools.gap.fix_later', 'This gap runs both ways. Fix the walls once Move is available.'],
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
    expect(DRAWING_TOOLS).toEqual({ wall: WALL_TOOL, 'room-rect': ROOM_RECT_TOOL });
    expect(DRAWING_RAIL_TOOLS).toEqual([
      { kind: 'tool', id: 'wall', icon: 'view_column_2', label: 'office.tool.wall', shortcut: 'W' },
      {
        kind: 'tool',
        id: 'room-rect',
        icon: 'rectangle',
        label: 'office.tool.room_rect',
        shortcut: 'R',
      },
    ]);
    const names: readonly string[] = ICON_NAMES;
    expect(names).toContain('view_column_2');
    expect(names).toContain('rectangle');
    const catalog = catalogFor('office', 'en') as Readonly<Record<string, unknown>>;
    for (const [key, text] of WORDING) expect({ key, text: catalog[key] }).toEqual({ key, text });
  });
});
