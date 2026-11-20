// EZD-506 Section A-A in the beam inspector (AC-EZD-506-1 "The preview updates when Height AFF changes"). Expected
// values: S05 Room ceiling summary "walls 8' 0" · ridge 13' 0""; board S05Ceiling section labels "beams 9' 0"",
// "ridge 13' 0"", "adj. 9' 0"", heading "Section A-A"; S05 Controls "Section A-A preview ... Read only". The family
// room is 20' x 16' with its ridge east-west in the middle; the cut runs north-south (192"). Markup through
// renderToStaticMarkup in the real office catalog, English. No browser.
import { CURRENT_SCHEMA_VERSION, type BeamData, type Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore, type ModelStore } from '../model/model-store';
import { beamEdit } from '../tools/beam-edits';
import { baseObjects, F1, roomValue, uid, withWalls } from '../tools/test-utils/fixtures';
import { InspectorPanel } from './InspectorPanel';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const NEXT_ID = uid(61);
const BEAM_ID = uid(70);
const FAMILY = [P(0, 0), P(240, 0), P(240, 192), P(0, 192)];
// South of the family room across a 4" wall, with a flat ceiling at its 9' 0" walls.
const LAUNDRY = [P(0, 196), P(96, 196), P(96, 292), P(0, 292)];

function family(withLaundry = false): Map<string, ObjectValue> {
  const objects = withWalls(baseObjects(), 1, FAMILY, true);
  const room = roomValue(FAMILY, 'Family room', null);
  const data = room.data as { attributes: Record<string, unknown> };
  data.attributes = {
    ...data.attributes,
    ceilingType: 'vaulted',
    ceiling: {
      heightsBy: 'pitch',
      wallHeights: [],
      pointHeights: [],
      pitch: 9.4,
      ridge: { start: P(0, 96), end: P(240, 96), height: 156 },
    },
  };
  objects.set(ROOM_ID, room);
  if (withLaundry) {
    const next = roomValue(LAUNDRY, 'Laundry', null);
    const nd = next.data as { attributes: Record<string, unknown> };
    nd.attributes = {
      ...nd.attributes,
      ceiling: {
        heightsBy: 'wall',
        wallHeights: [{ wall: uid(300), height: 108 }],
        pointHeights: [],
        pitch: null,
        ridge: null,
      },
    };
    objects.set(NEXT_ID, next);
  }
  return objects;
}

function withBeam(
  attrs: Partial<BeamData['attributes']> = {},
  withLaundry = false,
): Map<string, ObjectValue> {
  const objects = family(withLaundry);
  const data: BeamData = {
    geometry: { roomId: ROOM_ID, shift: P(0, 0) },
    status: 'new',
    level: F1,
    attributes: {
      placement: 'level_in_vault',
      heightAff: 108,
      match: 'custom',
      matchRoomId: null,
      width: 6,
      height: 8,
      layout: { by: 'spacing', spacing: 48 },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
      ...attrs,
    },
  };
  objects.set(BEAM_ID, {
    type: 'beam',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as unknown as Record<string, unknown>,
  });
  return objects;
}

function render(store: ModelStore, canEdit = true): string {
  const ui = { ids: [BEAM_ID], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel store={store} selection={selection} canEdit={canEdit} drawing={null} />
    </MessagesProvider>,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

const one = (html: string, testId: string) => {
  const found = elements(html, testId);
  expect(found, testId).toHaveLength(1);
  return found[0]!;
};

describe('EZD-506 Section A-A preview', () => {
  it('shows under the beam fields with the board labels', () => {
    const html = render(createModelStore({ objects: withBeam() }));
    const section = one(html, 'beam-section');
    expect(textOf(section.inner)).toContain('Section A-A');
    expect(textOf(one(html, 'beam-section-beams-label').inner)).toBe('beams 9\' 0"');
    expect(textOf(one(html, 'beam-section-ridge-label').inner)).toBe('ridge 13\' 0"');
    expect(elements(html, 'beam-section-beam')).toHaveLength(1);
    // No adjoining room: no adjoining line or label.
    expect(elements(html, 'beam-section-adjoining-label')).toHaveLength(0);
  });

  it('AC-EZD-506-1: the preview updates when Height AFF changes', () => {
    const store = createModelStore({ objects: withBeam() });
    const before = render(store);
    const beamBefore = attr(one(before, 'beam-section-beam').attrs, 'points');
    expect(textOf(one(before, 'beam-section-beams-label').inner)).toBe('beams 9\' 0"');

    const r = beamEdit(store.getState().objects, BEAM_ID, { field: 'heightAff', text: "10'" });
    if (!r.ok) throw new Error(r.messageKey);
    store.applyEdit([r.change]);

    const after = render(store);
    expect(textOf(one(after, 'beam-section-beams-label').inner)).toBe('beams 10\' 0"');
    const beamAfter = attr(one(after, 'beam-section-beam').attrs, 'points');
    expect(beamAfter).not.toBe(beamBefore);
    // The ridge does not move.
    expect(textOf(one(after, 'beam-section-ridge-label').inner)).toBe('ridge 13\' 0"');
  });

  it('shows the adjoining ceiling, dashed, with its height', () => {
    const html = render(createModelStore({ objects: withBeam({}, true) }));
    expect(textOf(one(html, 'beam-section-adjoining-label').inner)).toBe('adj. 9\' 0"');
    expect(elements(html, 'beam-section-adjoining')).toHaveLength(1);
  });

  it('follow slope has no beams label; the section still shows', () => {
    const html = render(createModelStore({ objects: withBeam({ placement: 'follow_slope' }) }));
    expect(elements(html, 'beam-section-beams-label')).toHaveLength(0);
    expect(elements(html, 'beam-section-beam')).toHaveLength(1);
  });

  it('is shown read only to a user without Edit model', () => {
    const html = render(createModelStore({ objects: withBeam() }), false);
    expect(elements(html, 'beam-section')).toHaveLength(1);
    expect(one(html, 'beam-section').inner).not.toMatch(/<input|<select|<button/);
  });
});
