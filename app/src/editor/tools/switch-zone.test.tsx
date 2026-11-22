// EZD-510 Switching zones (AC-EZD-510-1 "Zones draw and save with the room", AC-EZD-510-2 "A dimmer zone draws with its
// dimmer mark"). Expected values: S05 Controls "Switching zones | Left panel, Lighting | Draws switching zones and
// dimmers on the RCP (dashed accent lines). | Edit model."; board S05Ceiling left panel "Lighting", "Switching zones",
// the zone outline dashed "4 3" in the accent, the legend chip's "Switch zone" sample in --ez-cobalt;
// vault/build/assumptions.md EZD-510 (zone data, the S-with-subscript-D dimmer mark, wording). The fixture room is
// 144" x 120" (tools test-utils); the zone is the 72" x 48" rectangle from (24, 24) to (96, 72), centre (60, 48).
// Markup through renderToStaticMarkup in the real office catalog, English. No browser.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type DrawingItem,
  type Point,
} from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { rcpList, rcpView, ZONE_DRAFT_ID } from '../ceiling/rcp';
import { createSurfaceSetting } from '../ceiling/surface';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore } from '../model/model-store';
import { planDrawingList } from '../plan/batches';
import { tokenRgb } from '../plan/color';
import type { PlanPointerEvent } from '../plan/input';
import { createPickIndex } from '../selection/pick-index';
import { ceilingAware } from './beam-tool';
import { placeSwitchZone, roomAt, setZoneDimmer, switchZoneOf } from './switch-zone';
import {
  createZoneDrawing,
  switchZoneReceiver,
  wireZoneDrawing,
  zoneDrawingFor,
} from './switch-zone-tool';
import { LightingSection } from './SwitchZonePanel';
import { DOOR, F1, roomValue, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const ZONE_ID = uid(80);
const ZONE = [P(24, 24), P(96, 24), P(96, 72), P(24, 72)];

function room(): Map<string, ObjectValue> {
  const objects = new Map(DOOR);
  objects.set(ROOM_ID, roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Family room', null));
  return objects;
}

function withZone(dimmer: boolean): Map<string, ObjectValue> {
  const objects = room();
  objects.set(ZONE_ID, {
    type: 'switch_zone',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { roomId: ROOM_ID, boundary: ZONE },
      status: 'new',
      level: F1,
      attributes: { dimmer },
    },
  });
  return objects;
}

const click = (model: Point, screen: Point = model): PlanPointerEvent => ({
  kind: 'click',
  model,
  screen,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

function tool(objects: Map<string, ObjectValue>) {
  const store = createModelStore({ objects });
  const drawing = createZoneDrawing();
  const select = vi.fn();
  const onMessage = vi.fn();
  const receive = switchZoneReceiver({
    store,
    drawing,
    chosenFloor: () => null,
    newStatus: () => 'new',
    newId: () => ZONE_ID,
    select,
    onMessage,
    place: { roomAt, placeSwitchZone },
  });
  return { store, drawing, select, onMessage, receive };
}

const zoneItemsOf = (objects: Map<string, ObjectValue>): DrawingItem[] =>
  rcpList(planDrawingList(objects, {}, null, null), objects)!.items.filter(
    (i) => i.objectId.toLowerCase() === ZONE_ID,
  );

describe('EZD-510 Switching zones tool', () => {
  it('AC-EZD-510-1 corners by click, closed on the first corner, save one zone with the room and select it', () => {
    const { store, drawing, select, onMessage, receive } = tool(room());
    receive(click(P(500, 500)));
    expect(onMessage).toHaveBeenCalledWith('office.ceiling.zone.click_room');
    expect(drawing.get().points).toEqual([]);
    receive({ ...click(P(24, 24)), kind: 'down' });
    expect(drawing.get().points).toEqual([]);
    for (const p of ZONE) receive(click(p));
    expect(drawing.get().points).toEqual(ZONE);
    expect(store.getState().objects.has(ZONE_ID)).toBe(false);
    // Within 10 px of the first corner on screen: closes.
    receive(click(P(30, 30), P(30, 30)));
    expect(drawing.get().points).toEqual([]);
    expect(select).toHaveBeenCalledWith([ZONE_ID]);
    const saved = store.getState().objects.get(ZONE_ID)!;
    const parsed = parseStoredObject({
      id: ZONE_ID,
      type: saved.type,
      schema_version: saved.schemaVersion,
      data: saved.data,
    });
    expect(parsed.ok).toBe(true);
    const zone = switchZoneOf(store.getState().objects, ZONE_ID)!;
    expect(zone.data).toEqual({
      geometry: { roomId: ROOM_ID, boundary: ZONE },
      status: 'new',
      level: F1,
      attributes: { dimmer: false },
    });
    // One edit: undo takes it away.
    store.undo();
    expect(store.getState().objects.has(ZONE_ID)).toBe(false);
  });

  it('the first corner closes only once there are three corners', () => {
    const { store, drawing, receive } = tool(room());
    receive(click(P(24, 24)));
    receive(click(P(96, 24)));
    receive(click(P(25, 25), P(25, 25)));
    expect(drawing.get().points).toHaveLength(2);
    expect(store.getState().objects.has(ZONE_ID)).toBe(false);
  });

  it('AC-EZD-510-2 the Dimmer choice goes on the next zone', () => {
    const { store, drawing, receive } = tool(room());
    drawing.setDimmer(true);
    for (const p of ZONE.slice(0, 3)) receive(click(p));
    receive(click(P(24, 24)));
    expect(switchZoneOf(store.getState().objects, ZONE_ID)!.data.attributes.dimmer).toBe(true);
    expect(drawing.get().dimmer).toBe(true);
  });

  it('Esc, Select or a surface change drops a half-drawn zone', () => {
    const surface = createSurfaceSetting('ceiling');
    surface.setTool('switch-zone');
    const drawing = createZoneDrawing();
    const off = wireZoneDrawing(surface, drawing);
    drawing.start(P(24, 24), P(24, 24));
    drawing.add(P(96, 24));
    surface.setTool(null);
    expect(drawing.get().points).toEqual([]);
    surface.setTool('switch-zone');
    drawing.start(P(24, 24), P(24, 24));
    surface.setSurface('floor');
    expect(drawing.get().points).toEqual([]);
    off();
  });

  it('the page keeps one zone drawing, wired to drop a half-drawn zone', () => {
    const surface = createSurfaceSetting('ceiling');
    surface.setTool('switch-zone');
    const drawing = zoneDrawingFor(surface);
    expect(zoneDrawingFor(surface)).toBe(drawing);
    expect(zoneDrawingFor(createSurfaceSetting('ceiling'))).not.toBe(drawing);
    drawing.setDimmer(true);
    drawing.start(P(24, 24), P(24, 24));
    surface.setTool(null);
    expect(drawing.get()).toMatchObject({ points: [], dimmer: true });
  });
});

describe('EZD-510 zones on the RCP', () => {
  it('AC-EZD-510-1 a zone draws as a closed outline dashed 4" on, 3" off, in the accent', () => {
    const items = zoneItemsOf(withZone(false));
    const lines = items.filter((i) => i.kind === 'line');
    // 72" sides: dashes start at 0, 7, ... 70 (11, the last cut at 72); 48" sides: 0, 7, ... 42 (7).
    expect(lines).toHaveLength(2 * (11 + 7));
    expect(items.every((i) => i.layer === 'new')).toBe(true);
    const first = lines[0]!;
    expect(first).toMatchObject({ from: P(24, 24), to: P(28, 24), role: 'hidden' });
    // The closing side runs from the last corner (24, 72) back to the first: its last dash, 42" to 46" along it.
    expect(lines.at(-1)).toMatchObject({ from: P(24, 30), to: P(24, 26) });
    // The accent: the colour the legend chip's sample uses.
    const objects = withZone(false);
    const view = rcpView(planDrawingList(objects, {}, null, null), objects, 'ceiling');
    const zoneBatch = view.batches.find(
      (b) => b.layer === 'new' && b.kind === 'segments' && b.role === 'hidden',
    );
    expect(zoneBatch?.color).toEqual(tokenRgb('--ez-cobalt'));
  });

  it('a zone with no dimmer has no mark', () => {
    expect(zoneItemsOf(withZone(false)).some((i) => i.kind === 'text')).toBe(false);
  });

  it('AC-EZD-510-2 a dimmer zone draws with its dimmer mark: S with a subscript D at its centre', () => {
    const texts = zoneItemsOf(withZone(true)).filter(
      (i): i is Extract<DrawingItem, { kind: 'text' }> => i.kind === 'text',
    );
    expect(texts.map((t) => t.text)).toEqual(['S', 'D']);
    const [s, d] = texts as [(typeof texts)[0], (typeof texts)[0]];
    expect(s.at.y).toBe(48);
    expect(s.at.x).toBeLessThan(60);
    expect(d.at.x).toBeGreaterThan(60);
    expect(d.at.y).toBeLessThan(48);
    expect(d.sizePt).toBeLessThan(s.sizePt);
    expect(s.layer).toBe('new');
  });

  it('a zone whose room is gone does not draw', () => {
    const objects = withZone(true);
    objects.delete(ROOM_ID);
    expect(zoneItemsOf(objects)).toEqual([]);
  });

  it('the zone being drawn draws as an open dashed line through its corners', () => {
    const objects = room();
    const list = rcpList(planDrawingList(objects, {}, null, null), objects, undefined, [
      P(24, 24),
      P(96, 24),
    ])!;
    const draft = list.items.filter((i) => i.objectId === ZONE_DRAFT_ID);
    expect(draft).toHaveLength(11);
    expect(draft.every((i) => i.kind === 'line' && i.layer === 'new')).toBe(true);
  });
});

describe('EZD-510 a zone picks and its inspector sets the dimmer', () => {
  it('a click inside the zone picks it before the room; on the Floor surface it is hidden', () => {
    const index = createPickIndex();
    index.sync(withZone(false), F1, []);
    const at = index.pick(P(60, 48), 1);
    expect(at[0]).toBe(ZONE_ID);
    expect(at).toContain(ROOM_ID);
    const surface = createSurfaceSetting('floor');
    const base = { version: () => 1, shown: () => true, subscribe: () => () => {} };
    expect(ceilingAware(base, surface).shownObject!('switch_zone', 'new')).toBe(false);
    surface.setSurface('ceiling');
    expect(ceilingAware(base, surface).shownObject!('switch_zone', 'new')).toBe(true);
  });

  function render(objects: Map<string, ObjectValue>, canEdit = true): string {
    const store = createModelStore({ objects });
    const ui = { ids: [ZONE_ID], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <InspectorPanel store={store} selection={selection} canEdit={canEdit} drawing={null} />
      </MessagesProvider>,
    );
  }

  it('AC-EZD-510-2 one zone alone shows "Switching zone" with its Dimmer box', () => {
    const html = render(withZone(true));
    expect(textOf(elements(html, 'inspector-title')[0]!.inner)).toBe('Switching zone');
    const box = elements(html, 'switch-zone-dimmer')[0]!;
    expect(attr(box.attrs, 'checked')).not.toBeNull();
    expect(html).toContain('Dimmer');
    expect(attr(elements(render(withZone(false)), 'switch-zone-dimmer')[0]!.attrs, 'checked')).toBeNull();
    expect(attr(elements(render(withZone(true), false), 'switch-zone-dimmer')[0]!.attrs, 'disabled')).not.toBeNull();
  });

  it('the Dimmer edit is one change; setting it as it is changes nothing', () => {
    const objects = withZone(false);
    const change = setZoneDimmer(objects, ZONE_ID, true)!;
    expect(change.id).toBe(ZONE_ID);
    expect((change.value!.data as { attributes: { dimmer: boolean } }).attributes.dimmer).toBe(true);
    expect(setZoneDimmer(objects, ZONE_ID, false)).toBeNull();
    expect(setZoneDimmer(objects, uid(99), true)).toBeNull();
  });
});

describe('EZD-510 left panel Lighting section', () => {
  function render(tool: 'switch-zone' | null, canEdit: boolean): string {
    const surface = createSurfaceSetting('ceiling');
    surface.setTool(tool);
    const drawing = createZoneDrawing();
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <LightingSection surface={surface} drawing={drawing} canEdit={canEdit} />
      </MessagesProvider>,
    );
  }

  it('shows "Lighting" and the "Switching zones" button; on, it shows Dimmer and the hint', () => {
    const off = render(null, true);
    expect(off).toContain('Lighting');
    const button = elements(off, 'switching-zones')[0]!;
    expect(textOf(button.inner)).toBe('Switching zones');
    expect(attr(button.attrs, 'aria-pressed')).toBe('false');
    expect(elements(off, 'switching-zones-dimmer')).toHaveLength(0);
    const on = render('switch-zone', true);
    expect(attr(elements(on, 'switching-zones')[0]!.attrs, 'aria-pressed')).toBe('true');
    expect(elements(on, 'switching-zones-dimmer')).toHaveLength(1);
    expect(textOf(elements(on, 'switching-zones-hint')[0]!.inner)).toBe(
      'Click to draw a zone. Click the first point to close.',
    );
  });

  it('without Edit model and the lock the button is disabled', () => {
    const html = render('switch-zone', false);
    expect(attr(elements(html, 'switching-zones')[0]!.attrs, 'disabled')).not.toBeNull();
    expect(elements(html, 'switching-zones-dimmer')).toHaveLength(0);
  });
});
