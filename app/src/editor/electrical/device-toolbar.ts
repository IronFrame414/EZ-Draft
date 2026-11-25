// EZD-602 (S06 Controls "Device toolbar: Receptacle ... Attributes: circuit, GFCI/AFCI, type (duplex, 240V)", "Switch",
// "Light (same objects as RCP)", "Low voltage", "Smoke/CO, Fan (same objects as RCP)", "Canvas right-click | Context
// menu: assign to circuit, set GFCI/AFCI, delete. | Edit model."; 03f:13 "receptacles (GFCI/AFCI, height, circuit),
// switches (3-way, dimmer), lights (type tag), fans, detectors, low voltage"; AC-EZD-602-1; vault/build/assumptions.md
// EZD-602): placing a device from the toolbar, and the right-click edits of placed devices. Each is one change set,
// so one undo step. Pure: no React, no DOM.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type ObjectStatus,
  type Point,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { Change, Objects } from '../model/patches';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { assignChanges } from './circuits';
import { chosenKind, TOOLBAR_KINDS, type DeviceToolbarItem } from './toolbar-items';
import type { ElectricalToolbarState, ToolbarProtection } from './toolbar-state';

/** The change one placement makes, or null when the item and kind do not make a valid device. */
export function placeToolbarDevice(
  item: DeviceToolbarItem,
  kind: string,
  at: Point,
  ctx: { level: string; newId: () => string; status: ObjectStatus; protection: ToolbarProtection },
): Change | null {
  if (!TOOLBAR_KINDS[item].includes(kind)) return null;
  const attributes: Record<string, unknown> = { kind };
  // Only a receptacle is placed with GFCI/AFCI (S06 Receptacle attributes); a device starts on no circuit.
  if (item === 'receptacle' && ctx.protection !== null) attributes.protection = ctx.protection;
  const id = ctx.newId();
  const data = {
    geometry: { point: { x: at.x, y: at.y } },
    status: ctx.status,
    level: ctx.level,
    attributes,
  };
  const parsed = parseStoredObject({
    id,
    type: 'device',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
  if (!parsed.ok) return null;
  return { id, value: { type: 'device', schemaVersion: CURRENT_SCHEMA_VERSION, data } };
}

export type ToolbarReceiverDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  toolbar: { get(): ElectricalToolbarState };
  chosenFloor: () => string | null;
  newStatus: () => ObjectStatus;
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
};

/** The armed toolbar item's receiver: each click places one device of its chosen kind and selects it. */
export function toolbarDeviceReceiver(deps: ToolbarReceiverDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const s = deps.toolbar.get();
    const item = s.armed as DeviceToolbarItem | null;
    if (item === null || !Object.hasOwn(TOOLBAR_KINDS, item)) return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const change = placeToolbarDevice(item, chosenKind(s.kinds, item), e.model, {
      level,
      newId: deps.newId,
      status: deps.newStatus(),
      protection: s.protection,
    });
    if (change === null) {
      deps.onMessage('office.ceiling.device.place_failed');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}

// ---- Right-click: assign to circuit, set GFCI/AFCI, delete ----

const lower = (s: string) => s.toLowerCase();

function findOf(objects: Objects, id: string, type: string): [string, ObjectValue] | null {
  for (const [k, v] of objects) if (lower(k) === lower(id)) return v.type === type ? [k, v] : null;
  return null;
}

/** The devices among the ids, by their stored ids. */
export function selectedDevices(objects: Objects, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const d = findOf(objects, id, 'device');
    if (d !== null) out.push(d[0]);
  }
  return out;
}

function setAttributes(
  objects: Objects,
  ids: readonly string[],
  patch: Record<string, unknown>,
): Change[] | null {
  const changes: Change[] = [];
  for (const id of ids) {
    const d = findOf(objects, id, 'device');
    if (d === null) return null;
    const [key, value] = d;
    const data = value.data as { attributes: Record<string, unknown> };
    const next = { ...value.data, attributes: { ...data.attributes, ...patch } };
    const parsed = parseStoredObject({
      id: key,
      type: 'device',
      schema_version: value.schemaVersion,
      data: next,
    });
    if (!parsed.ok) return null;
    changes.push({ id: key, value: { ...value, data: next } });
  }
  return changes.length === 0 ? null : changes;
}

/**
 * Puts the devices on the circuit (null: on no circuit), or null when an id is not a device or not a circuit.
 * EZD-604: through `assignChanges`, so the circuit's device order follows the right-click menu too.
 */
export function assignCircuitChanges(
  objects: Objects,
  deviceIds: readonly string[],
  circuitId: string | null,
): Change[] | null {
  if (selectedDevices(objects, deviceIds).length === 0) return null;
  return assignChanges(objects, deviceIds, circuitId);
}

/** Sets the devices' own GFCI/AFCI (null: none). */
export function protectionChanges(
  objects: Objects,
  deviceIds: readonly string[],
  protection: ToolbarProtection,
): Change[] | null {
  return setAttributes(objects, deviceIds, { protection });
}

/** Removes the devices. */
export function deleteDeviceChanges(
  objects: Objects,
  deviceIds: readonly string[],
): Change[] | null {
  const ids = selectedDevices(objects, deviceIds);
  return ids.length === 0 ? null : ids.map((id) => ({ id, value: null }));
}

/**
 * The device menu a right-click or long-press at `at` opens in electrical mode, or null when no device is under it.
 * The device is selected first unless it is already in the selection (EZD-233).
 */
export function deviceMenuAt(
  objects: Objects,
  selection: {
    pickAt(model: Point): string[];
    getUi(): { ids: readonly string[] };
    select(ids: readonly string[]): void;
  },
  model: Point,
  client: Point,
): { at: Point; ids: readonly string[] } | null {
  const hit = selection.pickAt(model)[0];
  if (hit === undefined || selectedDevices(objects, [hit]).length === 0) return null;
  if (!selection.getUi().ids.some((id) => lower(id) === lower(hit))) selection.select([hit]);
  return { at: client, ids: selection.getUi().ids };
}
