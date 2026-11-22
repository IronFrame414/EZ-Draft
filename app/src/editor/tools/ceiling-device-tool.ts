// EZD-507 (S05 Controls "Recessed light: Click to place a can. Same object as on the electrical plan (06)", "Ceiling
// fan: Click to place a fan", "Smoke or CO detector: Places a detector, status existing or proposed. Same object as
// electrical plan", "Speaker or low voltage: Places in-ceiling speaker, camera or Wi-Fi access point", "Access panel:
// Places an access panel or attic hatch", all "Edit model"; AC-EZD-507-1, -2): the ceiling device tools. While one is
// on (Ceiling or Both, Edit model and the lock), a click places that tool's chosen kind at the click with the View's
// status and selects it. The object is the plan's own `device` or `access` object, so the floor plan, the electrical
// Devices tab and the RCP all show the one id. Pure wiring: no React, no DOM.
// One wire routes every ceiling tool's receiver (`wireCeilingTools`), so turning one tool off never clears another's.
import {
  DEFAULT_FAN_BLADE_SPAN_IN,
  formatLength,
  parseLength,
  parseStoredObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { CeilingToolId, SurfaceSetting } from '../ceiling/surface';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';
import type { PlanPointerReceiver } from '../plan/input';
// EZD-510 (11 Budgets): the tools' click receiver is in ceiling-device-receiver.ts, which loads with the Ceiling view's
// lazy module (lazy/rcp) rather than in the editor's first download.
export type CeilingDeviceKind = import('./fixture-tool').CeilingDeviceKind;

export type CeilingDeviceToolId = Extract<
  CeilingToolId,
  'recessed-light' | 'ceiling-fan' | 'detector' | 'low-voltage' | 'access-panel'
>;

/** Each device tool's kinds, the first its starting choice (vault/build/assumptions.md EZD-507). */
export const DEVICE_TOOL_KINDS: Readonly<
  Record<CeilingDeviceToolId, readonly CeilingDeviceKind[]>
> = {
  'recessed-light': ['recessed_light'],
  'ceiling-fan': ['ceiling_fan'],
  detector: ['smoke_detector', 'co_detector', 'smoke_co_detector'],
  'low-voltage': ['speaker', 'camera', 'wifi_ap'],
  'access-panel': ['access_panel', 'attic_hatch'],
};
export const CEILING_DEVICE_TOOL_IDS = Object.keys(DEVICE_TOOL_KINDS) as CeilingDeviceToolId[];

export const isDeviceTool = (tool: string | null): tool is CeilingDeviceToolId =>
  tool !== null && Object.hasOwn(DEVICE_TOOL_KINDS, tool);

/** The kind each device tool places next: the page's choice, kept while the page is open. */
export type DeviceChoice = {
  get(tool: CeilingDeviceToolId): CeilingDeviceKind;
  set(tool: CeilingDeviceToolId, kind: CeilingDeviceKind): void;
  subscribe(listener: () => void): () => void;
};

export function createDeviceChoice(): DeviceChoice {
  const chosen = new Map<CeilingDeviceToolId, CeilingDeviceKind>();
  const listeners = new Set<() => void>();
  return {
    get: (tool) => chosen.get(tool) ?? DEVICE_TOOL_KINDS[tool][0]!,
    set(tool, kind) {
      if (!DEVICE_TOOL_KINDS[tool].includes(kind) || chosen.get(tool) === kind) return;
      chosen.set(tool, kind);
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Routes the receiver of the ceiling tool that is on while the surface shows the ceiling and editing is allowed, and
 * none otherwise. Replaces one wire per tool, which would race on the shared route.
 */
export function wireCeilingTools(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  route: (r: PlanPointerReceiver | null) => void,
  receivers: Partial<Record<CeilingToolId, PlanPointerReceiver>>,
  mayEdit: boolean,
): () => void {
  const sync = () => {
    const s = surface.get();
    const r = s.tool === null ? undefined : receivers[s.tool];
    route(mayEdit && s.surface !== 'floor' && r !== undefined ? r : null);
  };
  sync();
  const off = surface.subscribe(sync);
  return () => {
    off();
    route(null);
  };
}

// ---- EZD-507 fixture type (S05 Controls "Fixture type tag edit | Inspector, on a light | Set type tag, lumens, color
// temperature, trim, catalog item. | Edit model."; vault/build/assumptions.md EZD-507) ----

export type FixtureTypeField = 'typeTag' | 'lumens' | 'colorTemp' | 'trim' | 'bladeSpan';
export type FixtureTypeView = {
  id: string;
  kind: string;
  status: string;
  typeTag: string;
  lumens: string;
  colorTemp: string;
  trim: string;
  catalogItemId: string | null;
  /** EZD-515: a fan's blade span as shown (its own, else 52"); empty for a light. */
  bladeSpan: string;
};

/** The device kinds whose inspector shows the fixture type. */
export const FIXTURE_TYPE_KINDS: ReadonlySet<string> = new Set(['recessed_light', 'ceiling_fan']);

type DeviceAttrs = {
  kind?: unknown;
  typeTag?: unknown;
  lumens?: unknown;
  colorTemp?: unknown;
  trim?: unknown;
  catalogItemId?: unknown;
  bladeSpan?: unknown;
};

function findDevice(objects: Objects, id: string): { id: string; value: ObjectValue } | null {
  const key = id.toLowerCase();
  for (const [k, v] of objects)
    if (k.toLowerCase() === key) return v.type === 'device' ? { id: k, value: v } : null;
  return null;
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** The fixture type of one light or fan, as the inspector shows it, or null when the id names neither. */
export function fixtureTypeView(objects: Objects, id: string): FixtureTypeView | null {
  const d = findDevice(objects, id);
  const a = (d?.value.data as { attributes?: DeviceAttrs } | undefined)?.attributes;
  if (
    d === null ||
    a === undefined ||
    typeof a.kind !== 'string' ||
    !FIXTURE_TYPE_KINDS.has(a.kind)
  )
    return null;
  return {
    id: d.id,
    kind: a.kind,
    status: String((d.value.data as { status?: unknown }).status),
    typeTag: text(a.typeTag),
    lumens: text(a.lumens),
    colorTemp: text(a.colorTemp),
    trim: text(a.trim),
    catalogItemId: typeof a.catalogItemId === 'string' ? a.catalogItemId : null,
    bladeSpan:
      a.kind !== 'ceiling_fan'
        ? ''
        : formatLength(
            typeof a.bladeSpan === 'number' && a.bladeSpan > 0
              ? a.bladeSpan
              : DEFAULT_FAN_BLADE_SPAN_IN,
            16,
          ),
  };
}

export type FixtureTypeEdit =
  { field: FixtureTypeField; text: string } | { field: 'catalogItemId'; value: string | null };

const WHOLE = /^\d+$/;

/**
 * The change one fixture type edit makes, or the message for a refused value. An empty box clears the field; lumens
 * and color temperature take a whole number above 0. EZD-515: a fan's blade span takes a length above 0 (Q-0561);
 * cleared, it reads as 52" again.
 */
export function fixtureTypeEdit(
  objects: Objects,
  id: string,
  edit: FixtureTypeEdit,
): { ok: true; change: Change } | { ok: false; messageKey: MessageKey } {
  const failed = { ok: false as const, messageKey: 'office.device.type.edit_failed' as MessageKey };
  const d = findDevice(objects, id);
  const view = d === null ? null : fixtureTypeView(objects, id);
  if (d === null || view === null) return failed;
  if (edit.field === 'bladeSpan' && view.kind !== 'ceiling_fan') return failed;
  let value: string | number | null;
  if (edit.field === 'catalogItemId') value = edit.value;
  else {
    const t = edit.text.trim();
    if (t === '') value = null;
    else if (edit.field === 'lumens' || edit.field === 'colorTemp') {
      if (!WHOLE.test(t) || Number(t) <= 0 || !Number.isSafeInteger(Number(t)))
        return { ok: false, messageKey: 'office.device.type.whole_number' };
      value = Number(t);
    } else if (edit.field === 'bladeSpan') {
      const r = parseLength(t, 'positive');
      if (!r.ok) return { ok: false, messageKey: 'office.length.refused' };
      value = r.inches;
    } else value = t;
  }
  const data = d.value.data as { attributes: Record<string, unknown> };
  const next = { ...d.value.data, attributes: { ...data.attributes, [edit.field]: value } };
  const parsed = parseStoredObject({
    id: d.id,
    type: 'device',
    schema_version: d.value.schemaVersion,
    data: next,
  });
  if (!parsed.ok) return failed;
  return {
    ok: true,
    change: {
      id: d.id,
      value: { type: 'device', schemaVersion: d.value.schemaVersion, data: next },
    },
  };
}

