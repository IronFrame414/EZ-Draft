// EZD-507 fixture type, moved here by EZD-513 (11 Budgets "editor before its lazy parts 500 KB"): the fixture type
// view and edit of one light or fan. Only the inspector (a lazy part) reads them, so they stay out of the editor's first
// download. Pure: no React, no DOM.
import {
  DEFAULT_FAN_BLADE_SPAN_IN,
  formatLength,
  parseLength,
  parseStoredObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';

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
