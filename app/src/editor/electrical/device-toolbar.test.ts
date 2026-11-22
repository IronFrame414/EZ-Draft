// EZD-602 AC-EZD-602-1 "Each device type places with its attributes." Expected kinds and attributes come from the
// spec, never the code: S06 Controls "Receptacle ... Attributes: circuit, GFCI/AFCI, type (duplex, 240V)", "Switch |
// Places single, 3-way, dimmer switches", "Light | Places lights (same objects as RCP)", "Low voltage | Places data,
// TV, doorbell, speakers", "Smoke/CO, Fan | Places detectors and fans | Same objects as RCP"; phase-06 EZD-602 "low
// voltage (data, TV, doorbell, speakers, cameras, Wi-Fi APs)"; "right-click (assign circuit, GFCI/AFCI, delete)".
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { F1, idSeq, uid } from '../tools/test-utils/fixtures';
import {
  assignCircuitChanges,
  deleteDeviceChanges,
  placeToolbarDevice,
  protectionChanges,
  toolbarDeviceReceiver,
} from './device-toolbar';
import { electricalObjects } from './test-fixture';
import { chosenKind, DEVICE_TOOLBAR_ITEMS, type DeviceToolbarItem } from './toolbar-items';
import { createElectricalToolbar } from './toolbar-state';

const AT = { x: 40, y: 60 };

// Every toolbar item and the kinds the spec names for it.
const SPEC_KINDS: readonly (readonly [DeviceToolbarItem, readonly string[]])[] = [
  ['receptacle', ['receptacle_duplex', 'receptacle_240v']],
  ['switch', ['switch_single', 'switch_3way', 'switch_dimmer']],
  ['light', ['recessed_light']],
  ['low-voltage', ['data', 'tv', 'doorbell', 'speaker', 'camera', 'wifi_ap']],
  ['detector', ['smoke_detector', 'co_detector', 'smoke_co_detector']],
  ['fan', ['ceiling_fan']],
];

const place = (
  item: DeviceToolbarItem,
  kind: string,
  protection: 'gfci' | 'afci' | 'dual' | null = null,
) =>
  placeToolbarDevice(item, kind, AT, {
    level: F1,
    newId: () => uid(900),
    status: 'new',
    protection,
  });

describe('EZD-602 device toolbar placement', () => {
  it('the toolbar has Receptacle, Switch, Light, Low voltage, Smoke/CO and Fan', () => {
    expect([...DEVICE_TOOLBAR_ITEMS]).toEqual(SPEC_KINDS.map(([i]) => i));
  });

  it('AC-1: each device type places as a device with its kind, at the click, on the floor, with the status', () => {
    for (const [item, kinds] of SPEC_KINDS)
      for (const kind of kinds) {
        const c = place(item, kind);
        expect(c, `${item} ${kind}`).not.toBeNull();
        expect(c!.id).toBe(uid(900));
        expect(c!.value).toEqual({
          type: 'device',
          schemaVersion: 7,
          data: { geometry: { point: AT }, status: 'new', level: F1, attributes: { kind } },
        });
      }
  });

  it('AC-1: a receptacle places with its GFCI/AFCI', () => {
    for (const p of ['gfci', 'afci', 'dual'] as const) {
      const c = place('receptacle', 'receptacle_duplex', p);
      expect(c!.value!.data.attributes).toEqual({ kind: 'receptacle_duplex', protection: p });
    }
    expect(place('receptacle', 'receptacle_240v', 'gfci')!.value!.data.attributes).toEqual({
      kind: 'receptacle_240v',
      protection: 'gfci',
    });
  });

  it('only a receptacle takes the toolbar GFCI/AFCI', () => {
    expect(place('switch', 'switch_single', 'gfci')!.value!.data.attributes).toEqual({
      kind: 'switch_single',
    });
  });

  it('a kind of another item is refused', () => {
    expect(place('switch', 'receptacle_duplex')).toBeNull();
    expect(place('light', 'ceiling_fan')).toBeNull();
  });

  it('a click with an item armed places that item’s chosen kind and selects it, one undo step', () => {
    const store = createModelStore({ objects: electricalObjects() });
    const toolbar = createElectricalToolbar();
    const selected: string[][] = [];
    const receive = toolbarDeviceReceiver({
      store,
      toolbar,
      chosenFloor: () => F1,
      newStatus: () => 'demo',
      newId: idSeq(950),
      select: (ids) => selected.push([...ids]),
      onMessage: () => {},
    });
    const click = { kind: 'click', model: AT, screen: AT } as never;
    receive(click);
    expect(store.getState().objects.has(uid(950))).toBe(false); // nothing armed: nothing placed
    toolbar.press('switch');
    toolbar.set({ kinds: { switch: 'switch_3way' } });
    receive(click);
    const placed = store.getState().objects.get(uid(950))!;
    expect(placed.data).toEqual({
      geometry: { point: AT },
      status: 'demo',
      level: F1,
      attributes: { kind: 'switch_3way' },
    });
    expect(selected).toEqual([[uid(950)]]);
    store.undo(); // one undo removes it
    expect(store.getState().objects.has(uid(950))).toBe(false);
  });

  it('pressing the armed item again disarms it; each item starts on its first kind', () => {
    const t = createElectricalToolbar();
    t.press('receptacle');
    expect(t.get().armed).toBe('receptacle');
    expect(chosenKind(t.get().kinds, 'receptacle')).toBe('receptacle_duplex');
    expect(chosenKind(t.get().kinds, 'switch')).toBe('switch_single');
    t.press('receptacle');
    expect(t.get().armed).toBeNull();
  });
});

describe('EZD-602 right-click edits', () => {
  // test-fixture: device uid(303) is a CO detector on no circuit; circuit uid(202) is 14 Small appl. 2.
  const objects = electricalObjects();
  const DEV = uid(303);

  it('assign to circuit sets the circuit, and No circuit clears it', () => {
    const on = assignCircuitChanges(objects, [DEV], uid(202))!;
    expect(on[0]!.value!.data.attributes).toEqual({ kind: 'co_detector', circuit: uid(202) });
    const off = assignCircuitChanges(objects, [uid(301)], null)!;
    expect(off[0]!.value!.data.attributes).toMatchObject({ circuit: null });
  });

  it('assign refuses an id that is not a circuit', () => {
    expect(assignCircuitChanges(objects, [DEV], uid(301))).toBeNull();
  });

  it('set GFCI/AFCI sets the device’s own protection', () => {
    const c = protectionChanges(objects, [DEV], 'afci')!;
    expect(c[0]!.value!.data.attributes).toEqual({ kind: 'co_detector', protection: 'afci' });
    expect(protectionChanges(objects, [DEV], null)![0]!.value!.data.attributes).toEqual({
      kind: 'co_detector',
      protection: null,
    });
  });

  it('delete removes the devices only', () => {
    expect(deleteDeviceChanges(objects, [DEV, uid(202)])).toEqual([{ id: DEV, value: null }]);
  });
});
