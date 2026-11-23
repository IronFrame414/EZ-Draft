// EZD-606 (S06 Controls "Existing panel (not in mockup) | Inspector, load calc header button; opens a dialog |
// Service size, main breaker, panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit
// list (typed or read from directory photo; user confirms), existing large appliances (range, dryer, AC, water
// heater). | Edit model. AI values shown for confirmation, never applied silently."; S06 Decisions "AI-read panel
// label and directory values must be confirmed before use"; phase-06 EZD-606; vault/build/assumptions.md EZD-606):
// the Existing panel dialog's values and the one change set its Save writes. The load calc reads the panel only
// through `existingPanelInputs`, which reads the model: a value the AI read is in the model, and so in the calc, only
// after the user confirms it. The existing circuit list is the panel's circuits of status existing. Pure: no React.
import {
  CURRENT_SCHEMA_VERSION,
  EXISTING_APPLIANCE_KINDS,
  parseStoredObject,
  type ExistingAppliance,
  type ObjectStatus,
} from '@ezdraft/geometry';
import type { DirectoryCircuit, PanelLabel } from '../../lib/electrical/panel-read';
import type { Change, Objects } from '../model/patches';
import { assignChanges } from './circuits';

const lower = (s: string) => s.toLowerCase();

export type ExistingCircuitRow = {
  /** The circuit's id; null for a row not saved yet. */
  id: string | null;
  space: number;
  name: string;
  breaker: number;
  poles: 1 | 2;
};

export type ExistingPanelForm = {
  serviceSize: number | null;
  mainBreaker: number | null;
  spaces: number | null;
  brand: string | null;
  labelPhoto: string | null;
  appliances: ExistingAppliance[];
  circuits: ExistingCircuitRow[];
};

export const EMPTY_EXISTING_PANEL: ExistingPanelForm = {
  serviceSize: null,
  mainBreaker: null,
  spaces: null,
  brand: null,
  labelPhoto: null,
  appliances: [],
  circuits: [],
};

type PanelAttrs = {
  serviceSize: number | null;
  mainBreaker: number | null;
  spaces: number | null;
  brand?: string | null;
  labelPhoto?: string | null;
  appliances?: ExistingAppliance[];
  [k: string]: unknown;
};

type CircuitAttrs = {
  panel: string;
  space: number;
  poles: 1 | 2;
  name: string;
  breaker: number;
  [k: string]: unknown;
};

function findPanel(objects: Objects, id: string | null): [string, PanelAttrs] | null {
  if (id === null) return null;
  for (const [k, v] of objects)
    if (lower(k) === lower(id))
      return v.type === 'panel' ? [k, (v.data as { attributes: PanelAttrs }).attributes] : null;
  return null;
}

/** The panel's circuits as [id, attributes, status], in stored order. */
function panelCircuits(objects: Objects, panelId: string): [string, CircuitAttrs, ObjectStatus][] {
  const out: [string, CircuitAttrs, ObjectStatus][] = [];
  for (const [k, v] of objects) {
    if (v.type !== 'circuit') continue;
    const d = v.data as { status: ObjectStatus; attributes: CircuitAttrs };
    if (typeof d.attributes?.panel === 'string' && lower(d.attributes.panel) === lower(panelId))
      out.push([k, d.attributes, d.status]);
  }
  return out;
}

/** The dialog's values from the model: the panel's fields and its circuits of status existing, by space. */
export function existingPanelForm(objects: Objects, panelId: string | null): ExistingPanelForm {
  const p = findPanel(objects, panelId);
  if (p === null) return { ...EMPTY_EXISTING_PANEL, appliances: [], circuits: [] };
  const [key, a] = p;
  return {
    serviceSize: a.serviceSize,
    mainBreaker: a.mainBreaker,
    spaces: a.spaces,
    brand: a.brand ?? null,
    labelPhoto: a.labelPhoto ?? null,
    appliances: (a.appliances ?? []).map((x) => ({ ...x })),
    circuits: panelCircuits(objects, key)
      .filter(([, , status]) => status === 'existing')
      .map(([id, c]) => ({ id, space: c.space, name: c.name, breaker: c.breaker, poles: c.poles }))
      .sort((x, y) => x.space - y.space),
  };
}

export type ExistingPanelInputs = Omit<ExistingPanelForm, 'labelPhoto' | 'circuits'> & {
  circuits: Omit<ExistingCircuitRow, 'id'>[];
};

/**
 * What the load calc (EZD-607, EZD-615) takes from the existing panel: the model's values only. A value read from a
 * photo and not yet confirmed lives in the dialog, not the model, so it is never here.
 */
export function existingPanelInputs(objects: Objects, panelId: string | null): ExistingPanelInputs {
  const f = existingPanelForm(objects, panelId);
  return {
    serviceSize: f.serviceSize,
    mainBreaker: f.mainBreaker,
    spaces: f.spaces,
    brand: f.brand,
    appliances: f.appliances,
    circuits: f.circuits.map(({ space, name, breaker, poles }) => ({
      space,
      name,
      breaker,
      poles,
    })),
  };
}

/**
 * Confirm on a label read: each value the label gave replaces the form's (the rating fills Main breaker,
 * vault/build/assumptions.md EZD-606); a value the label did not give leaves the form's. The photo becomes the
 * panel's label photo.
 */
export function confirmLabel(
  form: ExistingPanelForm,
  label: PanelLabel,
  fileId: string,
): ExistingPanelForm {
  return {
    ...form,
    brand: label.brand ?? form.brand,
    mainBreaker: label.rating ?? form.mainBreaker,
    spaces: label.spaces ?? form.spaces,
    labelPhoto: fileId,
  };
}

/** Confirm on a directory read: each read line replaces the form's row at its space, or is added; by space. */
export function confirmDirectory(
  form: ExistingPanelForm,
  circuits: readonly DirectoryCircuit[],
): ExistingPanelForm {
  const rows = form.circuits.map((r) => ({ ...r }));
  for (const c of circuits) {
    const at = rows.findIndex((r) => r.space === c.space);
    const row = { space: c.space, name: c.name, breaker: c.breaker, poles: c.poles };
    if (at >= 0) rows[at] = { ...rows[at]!, ...row };
    else rows.push({ id: null, ...row });
  }
  rows.sort((x, y) => x.space - y.space);
  return { ...form, circuits: rows };
}

/** The appliance list with `kind` on (its VA kept, else not set) or off, in the S06 order. */
export function toggleAppliance(
  list: readonly ExistingAppliance[],
  kind: ExistingAppliance['kind'],
  on: boolean,
): ExistingAppliance[] {
  const rest = list.filter((a) => a.kind !== kind);
  const next = on ? [...rest, list.find((a) => a.kind === kind) ?? { kind, va: null }] : rest;
  return EXISTING_APPLIANCE_KINDS.flatMap((k) => next.filter((a) => a.kind === k));
}

export type ExistingPanelProblem = 'space_taken' | 'space_past_panel' | 'no_floor' | 'invalid';

export type ExistingPanelCtx = {
  newId: () => string;
  /** The open floor, the level of a panel made here. */
  level: string | null;
  /** "Panel A" in the user's language. */
  panelName: string;
  /** "Circuit {n}" in the user's language, the name of a row left blank. */
  circuitName: (number: string) => string;
};

const spacesOf = (space: number, poles: 1 | 2) => (poles === 2 ? [space, space + 2] : [space]);

/**
 * Save: one change set writing the form to the panel (made first, of status existing, when the model has none) and
 * its existing circuits: a row with an id updates that circuit, a row without one adds an existing circuit, and an
 * existing circuit no longer listed is removed (its devices are left on no circuit). New circuits on the panel stay.
 * Refused when two circuits take the same space, a circuit is past the panel's spaces, or a value is not valid.
 */
export function existingPanelChanges(
  objects: Objects,
  panelId: string | null,
  form: ExistingPanelForm,
  ctx: ExistingPanelCtx,
): { changes: Change[]; panelId: string } | { problem: ExistingPanelProblem } {
  const changes: Change[] = [];
  const brand = form.brand?.trim() ?? '';
  const values = {
    serviceSize: form.serviceSize,
    mainBreaker: form.mainBreaker,
    spaces: form.spaces,
    brand: brand === '' ? null : brand,
    labelPhoto: form.labelPhoto,
    appliances: form.appliances,
  };

  let key: string;
  let level: string;
  const found = findPanel(objects, panelId);
  if (found === null) {
    if (panelId !== null) return { problem: 'invalid' };
    if (ctx.level === null) return { problem: 'no_floor' };
    key = ctx.newId();
    level = ctx.level;
    const data = {
      // The panel has no plan position yet (EZD-630 places it); the origin stands in, as New circuit's Panel A.
      geometry: { point: { x: 0, y: 0 } },
      status: 'existing' as const,
      level,
      attributes: { name: ctx.panelName, parentPanel: null, ...values },
    };
    if (
      !parseStoredObject({ id: key, type: 'panel', schema_version: CURRENT_SCHEMA_VERSION, data })
        .ok
    )
      return { problem: 'invalid' };
    changes.push({
      id: key,
      value: { type: 'panel', schemaVersion: CURRENT_SCHEMA_VERSION, data },
    });
  } else {
    key = found[0];
    const value = objects.get(key)!;
    level = String((value.data as { level?: unknown }).level);
    const data = { ...value.data, attributes: { ...found[1], ...values } };
    if (
      !parseStoredObject({ id: key, type: 'panel', schema_version: value.schemaVersion, data }).ok
    )
      return { problem: 'invalid' };
    changes.push({ id: key, value: { ...value, data } });
  }

  const onPanel = found === null ? [] : panelCircuits(objects, key);
  const listed = new Set(form.circuits.flatMap((r) => (r.id === null ? [] : [lower(r.id)])));
  for (const r of form.circuits) {
    if (r.id === null) continue;
    const hit = onPanel.find(
      ([id, , status]) => lower(id) === lower(r.id!) && status === 'existing',
    );
    if (hit === undefined) return { problem: 'invalid' };
  }

  // Every space the panel's circuits take after the save: the rows, and the circuits the dialog does not list.
  const taken = new Map<number, number>();
  const take = (space: number, poles: 1 | 2) => {
    for (const s of spacesOf(space, poles)) taken.set(s, (taken.get(s) ?? 0) + 1);
  };
  for (const r of form.circuits) take(r.space, r.poles);
  for (const [, c, status] of onPanel) if (status !== 'existing') take(c.space, c.poles);
  for (const n of taken.values()) if (n > 1) return { problem: 'space_taken' };
  if (form.spaces !== null)
    for (const s of taken.keys()) if (s > form.spaces) return { problem: 'space_past_panel' };

  for (const r of form.circuits) {
    const name = r.name.trim() === '' ? ctx.circuitName(String(r.space)) : r.name.trim();
    const own = { space: r.space, name, breaker: r.breaker, poles: r.poles };
    if (r.id === null) {
      const id = ctx.newId();
      const data = {
        status: 'existing' as const,
        level,
        attributes: { panel: key, ...own, protection: null, dedicated: false, load: 0, order: [] },
      };
      if (
        !parseStoredObject({ id, type: 'circuit', schema_version: CURRENT_SCHEMA_VERSION, data }).ok
      )
        return { problem: 'invalid' };
      changes.push({ id, value: { type: 'circuit', schemaVersion: CURRENT_SCHEMA_VERSION, data } });
    } else {
      const [id, a] = onPanel.find(([cid]) => lower(cid) === lower(r.id!))!;
      const value = objects.get(id)!;
      const data = { ...value.data, attributes: { ...a, ...own } };
      if (!parseStoredObject({ id, type: 'circuit', schema_version: value.schemaVersion, data }).ok)
        return { problem: 'invalid' };
      if (
        a.space !== own.space ||
        a.name !== own.name ||
        a.breaker !== own.breaker ||
        a.poles !== own.poles
      )
        changes.push({ id, value: { ...value, data } });
    }
  }

  const removed = onPanel
    .filter(([id, , status]) => status === 'existing' && !listed.has(lower(id)))
    .map(([id]) => id);
  if (removed.length > 0) {
    const gone = new Set(removed.map(lower));
    const devices: string[] = [];
    for (const [k, v] of objects) {
      if (v.type !== 'device') continue;
      const c = (v.data as { attributes?: { circuit?: unknown } }).attributes?.circuit;
      if (typeof c === 'string' && gone.has(lower(c))) devices.push(k);
    }
    const unassigned = assignChanges(objects, devices, null);
    if (unassigned === null) return { problem: 'invalid' };
    changes.push(...unassigned.filter((c) => !gone.has(lower(c.id))));
    for (const id of removed) changes.push({ id, value: null });
  }
  return { changes, panelId: key };
}
