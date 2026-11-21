// EZD-507 (AC-EZD-507-1 "A light placed on the RCP is the same object id on the plan"; AC-EZD-507-2 "Each device type
// in the scope places and persists"; S05 Controls "Recessed light ... Same object as on the electrical plan (06)",
// "Ceiling fan", "Smoke or CO detector ... status existing or proposed. Same object as electrical plan", "Speaker or
// low voltage ... in-ceiling speaker, camera or Wi-Fi access point", "Access panel ... access panel or attic hatch",
// "Fixture type tag edit ... type tag, lumens, color temperature, trim, catalog item"; Q-0704 03-data-model row 2
// "Detectors ... use the electrical device type that EZD-507 and 03f:13 use", "EZD-507 adds access_panel").
// Fixture: the 144 x 120 ROOM walls (tools test-utils) with the room drawn; no browser.
import { parseStoredObject, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { planDetailItems } from '../../lazy/room-fields/details-drawing';
import { rcpList } from '../ceiling/rcp';
import { createSurfaceSetting } from '../ceiling/surface';
import { deviceGroups } from '../electrical/electrical';
import { createModelStore } from '../model/model-store';
import { planDrawingList } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import {
  CEILING_DEVICE_TOOL_IDS,
  DEVICE_TOOL_KINDS,
  createDeviceChoice,
  deviceToolReceiver,
  fixtureTypeEdit,
  fixtureTypeView,
  wireCeilingTools,
  type CeilingDeviceToolId,
} from './ceiling-device-tool';
import { placeCeilingDevice, type CeilingDeviceKind } from './fixture-tool';
import { F1, ROOM, idSeq, roomValue, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const at = P(72, 60);

function withRoom() {
  const objects = new Map(ROOM);
  objects.set(
    ROOM_ID,
    roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Family room', null),
  );
  return objects;
}

const click = (model: Point): PlanPointerEvent =>
  ({ kind: 'click', model }) as unknown as PlanPointerEvent;

function placeWith(tool: CeilingDeviceToolId, kind: CeilingDeviceKind, status: 'existing' | 'new') {
  const store = createModelStore({ objects: withRoom() });
  const choice = createDeviceChoice();
  choice.set(tool, kind);
  const selected: string[][] = [];
  const messages: string[] = [];
  const receiver = deviceToolReceiver({
    store,
    tool,
    choice,
    chosenFloor: () => F1,
    newStatus: () => status,
    newId: idSeq(700),
    select: (ids) => selected.push([...ids]),
    onMessage: (key) => messages.push(key),
    place: placeCeilingDevice,
  });
  const before = new Set(store.getState().objects.keys());
  receiver(click(at));
  const added = [...store.getState().objects.keys()].filter((id) => !before.has(id));
  return { store, added, selected, messages };
}

// Every kind in the S05 scope, with the model type it is (03f:13 electrical devices; Q-0704 access).
const SCOPE: Array<{
  tool: CeilingDeviceToolId;
  kind: CeilingDeviceKind;
  type: 'device' | 'access';
}> = [
  { tool: 'recessed-light', kind: 'recessed_light', type: 'device' },
  { tool: 'ceiling-fan', kind: 'ceiling_fan', type: 'device' },
  { tool: 'detector', kind: 'smoke_detector', type: 'device' },
  { tool: 'detector', kind: 'co_detector', type: 'device' },
  { tool: 'detector', kind: 'smoke_co_detector', type: 'device' },
  { tool: 'low-voltage', kind: 'speaker', type: 'device' },
  { tool: 'low-voltage', kind: 'camera', type: 'device' },
  { tool: 'low-voltage', kind: 'wifi_ap', type: 'device' },
  { tool: 'access-panel', kind: 'access_panel', type: 'access' },
  { tool: 'access-panel', kind: 'attic_hatch', type: 'access' },
];

describe('EZD-507 AC-2 each ceiling device places and persists', () => {
  it('the scope list covers every kind of every device tool', () => {
    const all = CEILING_DEVICE_TOOL_IDS.flatMap((t) =>
      DEVICE_TOOL_KINDS[t].map((k) => `${t}:${k}`),
    );
    expect(new Set(all)).toEqual(new Set(SCOPE.map((s) => `${s.tool}:${s.kind}`)));
  });

  for (const s of SCOPE) {
    it(`${s.kind} places at the click with the View's status, is selected, and reopens from storage`, () => {
      for (const status of ['existing', 'new'] as const) {
        const { store, added, selected, messages } = placeWith(s.tool, s.kind, status);
        expect(messages).toEqual([]);
        expect(added).toHaveLength(1);
        const id = added[0]!;
        expect(selected).toEqual([[id]]);
        const v = store.getState().objects.get(id)!;
        expect(v.type).toBe(s.type);
        const data = v.data as {
          status: string;
          level: string;
          attributes: { kind: string };
          geometry: { point?: Point; center?: Point };
        };
        expect(data.status).toBe(status);
        expect(data.level).toBe(F1);
        expect(data.attributes.kind).toBe(s.kind);
        expect(data.geometry.point ?? data.geometry.center).toEqual(at);

        // Persist: the stored value (as JSON, as the database keeps it) reopens in a new store and parses.
        const saved = JSON.parse(JSON.stringify(v)) as typeof v;
        const reopened = createModelStore({ objects: new Map([[id, saved]]) });
        const back = reopened.getState().objects.get(id)!;
        const parsed = parseStoredObject({
          id,
          type: back.type,
          schema_version: back.schemaVersion,
          data: back.data,
        });
        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.object.type).toBe(s.type);
        expect(
          parsed.ok && (parsed.object.data as { attributes: { kind: string } }).attributes.kind,
        ).toBe(s.kind);
      }
    });
  }

  it('a tool starts on its first kind and keeps the kind chosen for it', () => {
    const choice = createDeviceChoice();
    expect(choice.get('detector')).toBe('smoke_detector');
    expect(choice.get('low-voltage')).toBe('speaker');
    expect(choice.get('access-panel')).toBe('access_panel');
    choice.set('detector', 'co_detector');
    expect(choice.get('detector')).toBe('co_detector');
    // A kind of another tool is refused.
    choice.set('detector', 'speaker');
    expect(choice.get('detector')).toBe('co_detector');
  });
});

describe('EZD-507 AC-1 a light placed on the RCP is the same object id on the plan', () => {
  it('the one light shows on the floor plan, on the RCP and in the electrical Devices tab under one id', () => {
    const { store, added } = placeWith('recessed-light', 'recessed_light', 'new');
    expect(added).toHaveLength(1);
    const id = added[0]!.toLowerCase();
    const objects = store.getState().objects;
    expect([...objects.values()].filter((v) => v.type === 'device')).toHaveLength(1);

    const floor = planDrawingList(objects, { extraItems: planDetailItems }, null, null)!;
    const onPlan = floor.items.filter((i) => i.objectId.toLowerCase() === id);
    expect(onPlan.length).toBeGreaterThan(0);

    const rcp = rcpList(floor, objects)!;
    const onRcp = rcp.items.filter((i) => i.objectId.toLowerCase() === id);
    expect(onRcp.length).toBeGreaterThan(0);
    // The RCP keeps the plan's own items for it: one object, drawn at the same place.
    expect(onRcp).toEqual(onPlan);

    const devices = deviceGroups(objects, F1).flatMap((g) => g.devices);
    expect(devices.map((d) => d.id.toLowerCase())).toEqual([id]);
    expect(devices[0]!.kind).toBe('recessed_light');
  });

  it('every ceiling device draws on the RCP; an access panel too', () => {
    for (const s of SCOPE) {
      const { store, added } = placeWith(s.tool, s.kind, 'new');
      const objects = store.getState().objects;
      const floor = planDrawingList(objects, { extraItems: planDetailItems }, null, null)!;
      const rcp = rcpList(floor, objects)!;
      expect(rcp.items.some((i) => i.objectId.toLowerCase() === added[0]!.toLowerCase())).toBe(
        true,
      );
    }
  });
});

describe('EZD-507 the smoke detector is lettered as on board S05Ceiling', () => {
  it('draws "SD" inside its circle, the same mark on the floor plan and the RCP', () => {
    const { store, added } = placeWith('detector', 'smoke_detector', 'new');
    const id = added[0]!.toLowerCase();
    const objects = store.getState().objects;
    const floor = planDrawingList(objects, { extraItems: planDetailItems }, null, null)!;
    const texts = (items: typeof floor.items) =>
      items.flatMap((i) => (i.objectId.toLowerCase() === id && i.kind === 'text' ? [i.text] : []));
    expect(texts(floor.items)).toEqual(['SD']);
    expect(texts(rcpList(floor, objects)!.items)).toEqual(['SD']);
  });
});

describe('EZD-507 one wire routes every ceiling tool', () => {
  it('routes the tool that is on, only on Ceiling or Both and only with editing allowed', () => {
    const surface = createSurfaceSetting();
    const routed: Array<PlanPointerReceiver | null> = [];
    const beam: PlanPointerReceiver = () => {};
    const light: PlanPointerReceiver = () => {};
    const fan: PlanPointerReceiver = () => {};
    const off = wireCeilingTools(
      surface,
      (r) => routed.push(r),
      { beam, 'recessed-light': light, 'ceiling-fan': fan },
      true,
    );
    const last = () => routed[routed.length - 1];
    expect(last()).toBeNull();
    surface.setSurface('ceiling');
    surface.setTool('recessed-light');
    expect(last()).toBe(light);
    surface.setTool('beam');
    expect(last()).toBe(beam);
    surface.setTool('ceiling-fan');
    expect(last()).toBe(fan);
    surface.setTool('act-grid');
    expect(last()).toBeNull();
    surface.setTool('ceiling-fan');
    surface.setSurface('floor');
    expect(last()).toBeNull();
    off();
    expect(last()).toBeNull();

    const viewer: Array<PlanPointerReceiver | null> = [];
    const s2 = createSurfaceSetting('ceiling');
    s2.setTool('recessed-light');
    const off2 = wireCeilingTools(s2, (r) => viewer.push(r), { 'recessed-light': light }, false);
    expect(viewer.every((r) => r === null)).toBe(true);
    off2();
  });
});

describe('EZD-507 fixture type on a light', () => {
  it('sets type tag, lumens, color temperature, trim and catalog item, each one edit, and they persist', () => {
    const { store, added } = placeWith('recessed-light', 'recessed_light', 'new');
    const id = added[0]!;
    const apply = (e: Parameters<typeof fixtureTypeEdit>[2]) => {
      const r = fixtureTypeEdit(store.getState().objects, id, e);
      expect(r.ok).toBe(true);
      if (r.ok) store.applyEdit([r.change]);
    };
    expect(fixtureTypeView(store.getState().objects, id)).toMatchObject({
      typeTag: '',
      lumens: '',
      colorTemp: '',
      trim: '',
      catalogItemId: null,
    });
    const catalog = uid(900);
    apply({ field: 'typeTag', text: 'A' });
    apply({ field: 'lumens', text: '800' });
    apply({ field: 'colorTemp', text: '3000' });
    apply({ field: 'trim', text: 'White baffle' });
    apply({ field: 'catalogItemId', value: catalog });
    const v = store.getState().objects.get(id)!;
    expect((v.data as { attributes: Record<string, unknown> }).attributes).toMatchObject({
      kind: 'recessed_light',
      typeTag: 'A',
      lumens: 800,
      colorTemp: 3000,
      trim: 'White baffle',
      catalogItemId: catalog,
    });
    const parsed = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: JSON.parse(JSON.stringify(v.data)),
    });
    expect(parsed.ok).toBe(true);
    // An empty box clears the field.
    apply({ field: 'trim', text: '  ' });
    expect(fixtureTypeView(store.getState().objects, id)!.trim).toBe('');
  });

  it('refuses lumens or a color temperature that is not a whole number above 0, and leaves the light as it was', () => {
    const { store, added } = placeWith('recessed-light', 'recessed_light', 'new');
    const id = added[0]!;
    for (const text of ['0', '-5', '8.5', 'abc']) {
      for (const field of ['lumens', 'colorTemp'] as const) {
        const r = fixtureTypeEdit(store.getState().objects, id, { field, text });
        expect(r).toEqual({ ok: false, messageKey: 'office.device.type.whole_number' });
      }
    }
  });

  it('a fan has a fixture type; a detector, a speaker and an access panel do not', () => {
    expect(
      fixtureTypeView(
        placeWith('ceiling-fan', 'ceiling_fan', 'new').store.getState().objects,
        uid(700),
      ),
    ).not.toBeNull();
    for (const [tool, kind] of [
      ['detector', 'smoke_detector'],
      ['low-voltage', 'speaker'],
      ['access-panel', 'access_panel'],
    ] as const) {
      const { store, added } = placeWith(tool, kind, 'new');
      expect(fixtureTypeView(store.getState().objects, added[0]!)).toBeNull();
      expect(
        fixtureTypeEdit(store.getState().objects, added[0]!, { field: 'typeTag', text: 'A' }).ok,
      ).toBe(false);
    }
  });
});
