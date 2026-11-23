// EZD-603 (S06 Controls "Device height note toggle (not in mockup) | Inspector, on a selected device | Shows a height
// note (e.g. "MW +66"") on the plan for that device. | Off by default. Edit model."; S06 Decisions 2 "Device height
// notes are optional per device and off by default."; R24 #36; AC-EZD-603-1; vault/build/assumptions.md EZD-603): one
// device's height note, as the inspector shows and edits it and as the plan writes it. Pure: no React, no DOM.
import { formatLength, parseLength, parseStoredObject } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { MessageKey } from '../../server/messages/catalog';
import type { Change, Objects } from '../model/patches';

export type HeightNoteView = {
  id: string;
  kind: string;
  status: string;
  /** The toggle; absent reads as off. */
  on: boolean;
  /** The label as typed, or empty. */
  label: string;
  /** The height as shown in the field (e.g. 5'-6"), or empty while not set. */
  height: string;
};

export type HeightNoteEdit =
  | { field: 'heightNote'; value: boolean }
  | { field: 'heightLabel'; text: string }
  | { field: 'height'; text: string };

type NoteAttrs = { kind?: unknown; heightNote?: unknown; heightLabel?: unknown; height?: unknown };

function findDevice(objects: Objects, id: string): { id: string; value: ObjectValue } | null {
  const key = id.toLowerCase();
  for (const [k, v] of objects)
    if (k.toLowerCase() === key) return v.type === 'device' ? { id: k, value: v } : null;
  return null;
}

/**
 * The note text of a device's attributes, or null when no note is drawn: the toggle is off or the height is not set
 * (vault/build/assumptions.md EZD-603). "{label} +{height}"", the height in whole inches above the floor; with no
 * label just "+{height}"".
 */
export function heightNoteText(a: NoteAttrs): string | null {
  if (a.heightNote !== true || typeof a.height !== 'number' || !(a.height > 0)) return null;
  const h = `+${Math.round(a.height)}"`;
  return typeof a.heightLabel === 'string' && a.heightLabel.trim() !== ''
    ? `${a.heightLabel.trim()} ${h}`
    : h;
}

/** The height note of one device, as the inspector shows it, or null when the id names no device. */
export function heightNoteView(objects: Objects, id: string): HeightNoteView | null {
  const d = findDevice(objects, id);
  const data = d?.value.data as { status?: unknown; attributes?: NoteAttrs } | undefined;
  const a = data?.attributes;
  if (d === null || a === undefined || typeof a.kind !== 'string') return null;
  return {
    id: d.id,
    kind: a.kind,
    status: String(data?.status),
    on: a.heightNote === true,
    label: typeof a.heightLabel === 'string' ? a.heightLabel : '',
    height: typeof a.height === 'number' && a.height > 0 ? formatLength(a.height, 16) : '',
  };
}

/** One change to a device's height note: one change set, so one undo step. A cleared field is stored as null. */
export function heightNoteEdit(
  objects: Objects,
  id: string,
  edit: HeightNoteEdit,
): { ok: true; change: Change } | { ok: false; messageKey: MessageKey } {
  const failed = {
    ok: false as const,
    messageKey: 'office.device.height_note.edit_failed' as MessageKey,
  };
  const d = findDevice(objects, id);
  if (d === null) return failed;
  let value: boolean | string | number | null;
  if (edit.field === 'heightNote') value = edit.value;
  else {
    const t = edit.text.trim();
    if (t === '') value = null;
    else if (edit.field === 'height') {
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
