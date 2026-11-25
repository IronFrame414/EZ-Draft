// EZD-503 the left panel's room ceiling section (S05 Controls "Room ceiling summary | Left panel | Shows type and ridge
// direction, wall heights, ridge height, pitch (e.g. "walls 8' 0" · ridge 13' 0" · 9.4/12"). | Read only. Updates when
// the active room changes.", "Change ceiling | ... | Edit model.", "Read heights from scan ... Only when a GLB mesh
// exists for the project."; board S05Ceiling left panel "Family room ceiling", "Vaulted, ridge east-west", "Change
// ceiling"). Static markup, as the fixture schedule's test; the editor's clicks are in e2e/ceiling-rcp.spec.ts.
import { CURRENT_SCHEMA_VERSION, newRoomAttributes, type Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import { F1, ROOM, uid } from '../tools/test-utils/fixtures';
import { RoomCeiling } from './RoomCeiling';

const P = (x: number, y: number): Point => ({ x, y });

function room(name: string, boundary: Point[], vaulted: boolean): ObjectValue {
  return {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary },
      status: 'existing',
      level: F1,
      attributes: {
        ...newRoomAttributes(name),
        ...(vaulted
          ? {
              ceilingType: 'vaulted',
              ceiling: {
                heightsBy: 'point',
                wallHeights: [],
                pointHeights: boundary.map((at) => ({ at, height: 96 })),
                pitch: 9.4,
                ridge: { start: P(0, 96), end: P(240, 96), height: 156 },
              },
            }
          : {}),
      },
      closureOverride: null,
    },
  };
}

function render(opts: { selected?: string[]; canEdit?: boolean; scan?: boolean } = {}): string {
  const objects = new Map(ROOM);
  objects.set(uid(60), room('Family room', [P(0, 0), P(240, 0), P(240, 192), P(0, 192)], true));
  objects.set(uid(61), room('Laundry', [P(300, 0), P(400, 0), P(400, 100), P(300, 100)], false));
  const store = createModelStore({ objects });
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <RoomCeiling
        store={store}
        selection={{
          getUi: () => ({ ids: opts.selected ?? [], selectMore: false }),
          subscribe: () => () => {},
        }}
        canEdit={opts.canEdit ?? true}
        {...(opts.scan ? { readScan: async () => ({ mesh: null, reading: null }) } : {})}
      />
    </MessagesProvider>,
  );
}

// Static markup escapes the foot and inch marks.
const text = (html: string, id: string) =>
  textOf(elements(html, id)[0]!.inner)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

describe('EZD-503 room ceiling summary in the left panel', () => {
  it('board S05Ceiling: "Family room ceiling", "Vaulted, ridge east-west", walls 8\' 0" · ridge 13\' 0" · 9.4/12', () => {
    const html = render();
    expect(text(html, 'room-ceiling-heading')).toBe('Family room ceiling');
    expect(text(html, 'room-ceiling-type')).toBe('Vaulted, ridge east-west');
    expect(text(html, 'room-ceiling-heights')).toBe(`walls 8' 0" · ridge 13' 0" · 9.4/12`);
    expect(text(html, 'room-ceiling-change')).toBe('Change ceiling');
  });

  it("follows the active room: a selected flat room with no ceiling reads Flat at its walls' height", () => {
    const html = render({ selected: [uid(61)] });
    expect(text(html, 'room-ceiling-heading')).toBe('Laundry ceiling');
    expect(text(html, 'room-ceiling-type')).toBe('Flat');
    expect(text(html, 'room-ceiling-heights')).toBe(`walls 8' 0"`);
  });

  it('without Edit model the summary shows and Change ceiling does not', () => {
    const html = render({ canEdit: false });
    expect(elements(html, 'room-ceiling-heading')).toHaveLength(1);
    expect(elements(html, 'room-ceiling-change')).toHaveLength(0);
  });

  it('the editor is closed until Change ceiling is pressed', () => {
    expect(elements(render({ scan: true }), 'ceiling-editor')).toHaveLength(0);
  });
});
