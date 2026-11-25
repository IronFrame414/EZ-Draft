// EZD-505 Beams in the editor (AC-EZD-505-1 "A level beam above the ridge shows a warning"). Expected values: S05
// Room ceiling summary "walls 8' 0" · ridge 13' 0""; board S05Ceiling "Faux beams", "5 beams · family room", "Height
// AFF 9' 0"", "Size W x H 6" × 8"", "Spacing 4' 0" o.c.", "Across ridge", "Square to slope", ridge east-west, "FAMILY
// ROOM · 320 SF" (20' x 16'); S05 Controls (beams); S05 Validation; Q-0561 typed lengths and its refusal message;
// Q-0630 view-only inspector. Markup through renderToStaticMarkup in the real office catalog, English. No browser.
import { CURRENT_SCHEMA_VERSION, type BeamData, type Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createSurfaceSetting } from '../ceiling/surface';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import type { PlanPointerEvent } from '../plan/input';
import { createPickIndex } from '../selection/pick-index';
import { beamEdit, beamOf, beamPillAnchor, beamView, placeBeamSet } from './beam-edits';
import { BeamSpacingPill } from './BeamSpacingPill';
import { beamToolReceiver } from './beam-receiver';
import { ceilingAware, receiverRouter, wireBeamTool } from './beam-tool';
import { beamsOn, moveEditChanges, toModelObjects } from './model-changes';
import { clickOutcome } from './move-tool';
import { baseObjects, F1, roomValue, uid, withWalls } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const BEAM_ID = uid(70);
const FAMILY = [P(0, 0), P(240, 0), P(240, 192), P(0, 192)];

function family(): Map<string, ObjectValue> {
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
  return objects;
}

function beamData(attrs: Partial<BeamData['attributes']> = {}): BeamData {
  return {
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
}

function withBeam(attrs: Partial<BeamData['attributes']> = {}): Map<string, ObjectValue> {
  const objects = family();
  objects.set(BEAM_ID, {
    type: 'beam',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: beamData(attrs) as unknown as Record<string, unknown>,
  });
  return objects;
}

function edited(objects: Objects, edit: Parameters<typeof beamEdit>[2]): Map<string, ObjectValue> {
  const r = beamEdit(objects, BEAM_ID, edit);
  if (!r.ok) throw new Error(r.messageKey);
  const next = new Map(objects);
  next.set(r.change.id, r.change.value!);
  return next;
}

function render(objects: Map<string, ObjectValue>, canEdit = true): string {
  const store = createModelStore({ objects });
  const ui = { ids: [BEAM_ID], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel store={store} selection={selection} canEdit={canEdit} drawing={null} />
    </MessagesProvider>,
  ).replace(/&#x27;/g, "'");
}

const valueOf = (html: string, testId: string, name = 'value') =>
  attr(one(html, testId).attrs, name)?.replace(/&quot;/g, '"') ?? null;

const one = (html: string, testId: string) => {
  const found = elements(html, testId);
  expect(found, testId).toHaveLength(1);
  return found[0]!;
};

describe('EZD-505 beam inspector', () => {
  it('AC-EZD-505-1: a level beam above the ridge shows a warning', () => {
    // Height AFF 13' 6" over a 13' 0" ridge.
    const html = render(withBeam({ heightAff: 162 }));
    expect(textOf(one(html, 'beam-warning-above_ridge').inner)).toContain('Beams above the ridge');
    expect(elements(html, 'beam-warning-below_plate')).toHaveLength(0);
  });

  it('AC-EZD-505-1: typing a Height AFF above the ridge turns the warning on', () => {
    const before = withBeam();
    expect(beamView(before, BEAM_ID)!.warnings).toEqual([]);
    const after = edited(before, { field: 'heightAff', text: "13' 6\"" });
    expect(beamView(after, BEAM_ID)!.warnings).toEqual(['above_ridge']);
    expect(elements(render(after), 'beam-warning-above_ridge')).toHaveLength(1);
  });

  it('the board example: 5 beams in the family room, 9\' 0", 6" × 8", 4\' 0", no warning', () => {
    const html = render(withBeam());
    expect(textOf(one(html, 'inspector-title').inner)).toBe('Faux beams');
    expect(textOf(one(html, 'inspector-subtitle').inner)).toBe('5 beams · Family room');
    expect(valueOf(html, 'beam-heightAff')).toBe('9\' 0"');
    expect(valueOf(html, 'beam-size')).toBe('6" × 8"');
    expect(valueOf(html, 'beam-spacing')).toBe('4\' 0"');
    expect(valueOf(html, 'beam-count')).toBe('5');
    expect(valueOf(html, 'beam-length')).toBe('');
    expect(valueOf(html, 'beam-length', 'placeholder')).toBe('Wall to wall');
    expect(one(html, 'beam-placement').inner).toContain('Level beams in vault');
    expect(one(html, 'beam-direction').inner).toContain('Across ridge');
    expect(one(html, 'beam-end-detail').inner).toContain('Square to slope');
    expect(html).not.toContain('beam-warning');
  });

  it('a beam set below the wall plate warns too', () => {
    const html = render(withBeam({ heightAff: 90 }));
    expect(textOf(one(html, 'beam-warning-below_plate').inner)).toContain(
      'Beams below the wall plate',
    );
  });

  it('Height AFF and Match show for level beams only; no warning for other placements', () => {
    const html = render(withBeam({ placement: 'follow_slope', heightAff: 162 }));
    expect(elements(html, 'beam-heightAff')).toHaveLength(0);
    expect(elements(html, 'beam-match')).toHaveLength(0);
    expect(html).not.toContain('beam-warning');
  });

  it('Height AFF is disabled when Match is Adjoining room', () => {
    const html = render(withBeam({ match: 'adjoining', matchRoomId: uid(61) }));
    expect(one(html, 'beam-heightAff').attrs).toContain('disabled');
  });

  it('without Edit model every field is read only', () => {
    const html = render(withBeam(), false);
    for (const id of ['beam-placement', 'beam-size', 'beam-spacing', 'beam-direction'])
      expect(one(html, id).attrs, id).toContain('disabled');
    expect(elements(html, 'inspector-view-only')).toHaveLength(1);
  });
});

describe('EZD-505 beam edits', () => {
  it('a refused typed height shows the length message and changes nothing (Q-0561)', () => {
    const r = beamEdit(withBeam(), BEAM_ID, { field: 'heightAff', text: '12 6' });
    expect(r).toEqual({ ok: false, messageKey: 'office.length.refused' });
  });

  it('Count replaces Spacing: 4 beams in 20\' at 5\' 0"', () => {
    const v = beamView(edited(withBeam(), { field: 'count', text: '4' }), BEAM_ID)!;
    expect(v.layoutBy).toBe('count');
    expect(v.count).toBe(4);
    expect(v.spacing).toBe('5\' 0"');
    const back = beamView(
      edited(edited(withBeam(), { field: 'count', text: '4' }), { field: 'spacing', text: "4'" }),
      BEAM_ID,
    )!;
    expect(back.layoutBy).toBe('spacing');
    expect(back.count).toBe(5);
  });

  it('a count that is not a whole number from 1 is refused', () => {
    for (const text of ['0', '2.5', 'five', ''])
      expect(beamEdit(withBeam(), BEAM_ID, { field: 'count', text }).ok, text).toBe(false);
  });

  it('size W × H takes two typed lengths; length blank is wall to wall', () => {
    const sized = edited(withBeam(), { field: 'size', text: '8 x 10' });
    expect(beamOf(sized, BEAM_ID)!.data.attributes).toMatchObject({ width: 8, height: 10 });
    const long = edited(withBeam(), { field: 'length', text: "12'" });
    expect(beamOf(long, BEAM_ID)!.data.attributes.length).toBe(144);
    const wall = edited(long, { field: 'length', text: '' });
    expect(beamOf(wall, BEAM_ID)!.data.attributes.length).toBeNull();
  });

  it('Match Adjoining room copies the adjoining room\'s ceiling height; none is refused', () => {
    expect(beamEdit(withBeam(), BEAM_ID, { field: 'match', value: 'adjoining' })).toEqual({
      ok: false,
      messageKey: 'office.beam.no_adjoining',
    });
    // A laundry across a 4 1/2" wall, its walls 8' 0".
    const LAUNDRY = [P(244.5, 0), P(360, 0), P(360, 96), P(244.5, 96)];
    const objects = withWalls(withBeam(), 10, LAUNDRY, true);
    objects.set(uid(61), roomValue(LAUNDRY, 'Laundry', null));
    const matched = edited(objects, { field: 'match', value: 'adjoining' });
    expect(beamOf(matched, BEAM_ID)!.data.attributes).toMatchObject({
      match: 'adjoining',
      matchRoomId: uid(61),
      heightAff: 96,
    });
    expect(beamEdit(matched, BEAM_ID, { field: 'heightAff', text: "10'" }).ok).toBe(false);
  });
});

const click = (model: Point): PlanPointerEvent => ({
  kind: 'click',
  model,
  screen: model,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

describe('EZD-505 Beam tool', () => {
  it('a click in a room places a set on its ceiling and selects it; outside a room nothing', () => {
    const store = createModelStore({ objects: family() });
    const select = vi.fn();
    const onMessage = vi.fn();
    const receive = beamToolReceiver({
      store,
      chosenFloor: () => null,
      newStatus: () => 'new',
      newId: () => BEAM_ID,
      select,
      onMessage,
      place: placeBeamSet,
    });
    receive(click(P(500, 500)));
    expect(onMessage).toHaveBeenCalledWith('office.beam.click_room');
    expect(store.getState().objects.has(BEAM_ID)).toBe(false);
    receive({ ...click(P(100, 50)), kind: 'down' });
    expect(store.getState().objects.has(BEAM_ID)).toBe(false);
    receive(click(P(100, 50)));
    expect(select).toHaveBeenCalledWith([BEAM_ID]);
    const placed = beamOf(store.getState().objects, BEAM_ID)!;
    expect(placed.data.geometry.roomId).toBe(ROOM_ID);
    expect(placed.data.attributes.placement).toBe('level_in_vault');
    expect(placed.data.attributes.heightAff).toBe(96);
    expect(placed.data.status).toBe('new');
    // One edit: undo takes it away.
    store.undo();
    expect(store.getState().objects.has(BEAM_ID)).toBe(false);
  });

  it('placeBeamSet takes the smallest room under the point', () => {
    const objects = family();
    const inner = [P(10, 10), P(50, 10), P(50, 50), P(10, 50)];
    objects.set(uid(62), roomValue(inner, 'Closet', null));
    const c = placeBeamSet(objects, F1, P(20, 20), 'new', () => BEAM_ID)!;
    expect((c.value!.data as { geometry: { roomId: string } }).geometry.roomId).toBe(uid(62));
  });

  it('takes the pointer only on Ceiling or Both with the Beam tool and editing allowed', () => {
    const set = vi.fn();
    const router = receiverRouter(set);
    const base = vi.fn();
    router.base(base);
    expect(set).toHaveBeenLastCalledWith(base);
    const surface = createSurfaceSetting();
    const tool = vi.fn();
    const off = wireBeamTool(surface, router.tool, tool, true);
    expect(set).toHaveBeenLastCalledWith(base);
    surface.setSurface('ceiling');
    surface.setTool('beam');
    expect(set).toHaveBeenLastCalledWith(tool);
    surface.setTool(null);
    expect(set).toHaveBeenLastCalledWith(base);
    off();
    const offViewer = wireBeamTool(surface, router.tool, tool, false);
    surface.setTool('beam');
    expect(set).toHaveBeenLastCalledWith(base);
    offViewer();
  });

  it('beams pick only on Ceiling and Both', () => {
    const surface = createSurfaceSetting();
    const base = { version: () => 3, shown: () => true, subscribe: () => () => {} };
    const filter = ceilingAware(base, surface);
    expect(filter.shownObject!('beam', 'new')).toBe(false);
    expect(filter.shownObject!('wall', 'new')).toBe(true);
    const floorVersion = filter.version();
    surface.setSurface('both');
    expect(filter.shownObject!('beam', 'new')).toBe(true);
    expect(filter.version()).not.toBe(floorVersion);
  });
});

describe('EZD-505 a beam set picks and moves as a set', () => {
  it('a click between beams picks the set, before the room', () => {
    const index = createPickIndex();
    const objects = withBeam();
    index.sync(objects, F1, []);
    const at = index.pick(P(100, 50), 1);
    expect(at[0]).toBe(BEAM_ID);
    expect(at).toContain(ROOM_ID);
  });

  it('a room change re-places the set', () => {
    const index = createPickIndex();
    const objects = withBeam();
    index.sync(objects, F1, []);
    // Halve the room: the set now spans 0 to 120 only.
    const half = [P(0, 0), P(120, 0), P(120, 192), P(0, 192)];
    const next = new Map(objects);
    const room = structuredClone(objects.get(ROOM_ID)!);
    (room.data as { geometry: { boundary: Point[] } }).geometry.boundary = half;
    next.set(ROOM_ID, room);
    index.sync(next, F1, [ROOM_ID]);
    expect(index.pick(P(200, 50), 1)).not.toContain(BEAM_ID);
    expect(index.pick(P(60, 50), 1)[0]).toBe(BEAM_ID);
  });

  it('a move shifts the whole set, written in one edit', () => {
    const objects = withBeam();
    const models = [...toModelObjects(objects, F1), ...beamsOn(objects, F1)];
    const out = clickOutcome(models, [BEAM_ID], P(12, 0));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.changed).toHaveLength(1);
    const changes = moveEditChanges(objects, F1, out.changed, () => uid(999), { wall: 0, door: 0, window: 0 });
    expect(changes).toHaveLength(1);
    const next = new Map(objects);
    next.set(changes[0]!.id, changes[0]!.value!);
    expect(beamOf(next, BEAM_ID)!.data.geometry.shift).toEqual(P(12, 0));
  });
});

describe('EZD-505 spacing pill', () => {
  function pill(objects: Map<string, ObjectValue>, canEdit: boolean): string {
    const store = createModelStore({ objects });
    const ui = { ids: [BEAM_ID], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {} } as never;
    const handle = { modelToScreen: (p: Point) => p, onCameraChange: () => () => {} };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <BeamSpacingPill store={store} selection={selection} handle={handle} canEdit={canEdit} />
      </MessagesProvider>,
    ).replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  }

  it('shows the set\'s spacing above it (board "4\' 0" o.c.")', () => {
    expect(textOf(one(pill(withBeam(), true), 'beam-spacing-pill').inner)).toBe('4\' 0" o.c.');
    // Above the set: the middle of its far (top) edge.
    expect(beamPillAnchor(withBeam(), BEAM_ID)).toEqual(P(120, 192));
  });

  it('a count shows its computed spacing; a viewer cannot open the entry', () => {
    const counted = edited(withBeam(), { field: 'count', text: '4' });
    expect(textOf(one(pill(counted, true), 'beam-spacing-pill').inner)).toBe('5\' 0" o.c.');
    expect(one(pill(withBeam(), false), 'beam-spacing-pill').attrs).toContain('disabled');
  });

  it('typing a spacing in the pill is the Spacing edit', () => {
    const next = edited(withBeam(), { field: 'spacing', text: "3' 6\"" });
    expect(beamView(next, BEAM_ID)!.spacing).toBe('3\' 6"');
    expect(beamView(next, BEAM_ID)!.count).toBe(5);
  });
});
