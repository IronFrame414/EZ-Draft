// EZD-130 (AC-EZD-130-3, -6; 09o Value checks rows 1-3; Q-0561; Q-0203). Expected values: 09o (percent -1 and
// 100.5 refused, 0 and 100 saved; length "12 6" refused with the formats message; 12.5' saved as 150"); the New
// project rules (name and address required); Q-0697 10 (type and defaults only with the lock; the client only with
// Company settings or Create projects); a holder's save carries the lock epoch (09o Copy at creation row 3).
import { describe, expect, it } from 'vitest';
import {
  draftOf,
  editableFor,
  saveFailure,
  toPatchBody,
  type ProjectSettings,
} from './project-settings';

const base: ProjectSettings = {
  project: { id: 'p1', name: 'Lee kitchen', address: '1 Oak St', type: 'kitchen', scopeOfWork: '' },
  client: { id: 'c1', name: 'Ann Lee' },
  defaults: {
    waste_tile: 10,
    waste_lvp: null,
    overhang_standard: 1.5,
    countertop_increment: 0.5,
  },
  codeEdition: { own: null, effective: 'fbc9_nec2023' },
  can: { details: true, client: false, typeAndDefaults: true },
};

const holder = editableFor(base, true);
const editor = editableFor(base, false);

describe('EZD-130 Project settings draft and body', () => {
  it('who may change what (AC-3)', () => {
    expect(holder).toEqual({ details: true, client: false, locked: true });
    expect(editor).toEqual({ details: true, client: false, locked: false });
    const none = editableFor({ ...base, can: { details: false, client: false, typeAndDefaults: false } }, true);
    expect(none).toEqual({ details: false, client: false, locked: false });
  });

  it('sends only what changed and what this tab may change', () => {
    const d = draftOf(base);
    expect(toPatchBody(base, d, editor, null)).toEqual({ ok: true, body: {} });
    const changed = { ...d, name: ' Lee bath ', type: 'bath' as const, defaults: { ...d.defaults, waste_tile: '15' } };
    // without the lock: the name only
    expect(toPatchBody(base, changed, editor, null)).toEqual({ ok: true, body: { name: 'Lee bath' } });
    // the holder: type and defaults with the epoch
    expect(toPatchBody(base, changed, holder, 4)).toEqual({
      ok: true,
      body: { name: 'Lee bath', type: 'bath', defaults: { waste_tile: 15 }, lockEpoch: 4 },
    });
    // the client only with Company settings or Create projects
    const other = { ...d, client: { ...d.client!, id: 'c2' } };
    expect(toPatchBody(base, other, editor, null)).toEqual({ ok: true, body: {} });
    expect(toPatchBody(base, other, { ...editor, client: true }, null)).toEqual({
      ok: true,
      body: { customerId: 'c2' },
    });
    expect(toPatchBody(base, { ...d, client: null }, { ...editor, client: true }, null)).toEqual({
      ok: true,
      body: { customerId: null },
    });
  });

  it('name and address are required, as in the New project dialog (AC-6)', () => {
    const d = { ...draftOf(base), name: '  ', address: '' };
    expect(toPatchBody(base, d, editor, null)).toEqual({
      ok: false,
      fields: {
        name: 'office.project_settings.name_required',
        address: 'office.project_settings.address_required',
      },
    });
  });

  it('percents and lengths follow the Defaults checks (09o Value checks rows 1-3)', () => {
    const d = draftOf(base);
    const withDefault = (key: string, text: string) =>
      toPatchBody(base, { ...d, defaults: { ...d.defaults, [key]: text } }, holder, 1);
    for (const bad of ['-1', '100.5']) {
      expect(withDefault('waste_tile', bad)).toEqual({
        ok: false,
        fields: { waste_tile: 'office.defaults.error.percent' },
      });
    }
    expect(withDefault('waste_tile', '0')).toEqual({ ok: true, body: { defaults: { waste_tile: 0 }, lockEpoch: 1 } });
    expect(withDefault('waste_tile', '100')).toEqual({
      ok: true,
      body: { defaults: { waste_tile: 100 }, lockEpoch: 1 },
    });
    expect(withDefault('overhang_standard', '12 6')).toEqual({
      ok: false,
      fields: { overhang_standard: 'office.length.refused' },
    });
    expect(withDefault('overhang_standard', "12.5'")).toEqual({
      ok: true,
      body: { defaults: { overhang_standard: 150 }, lockEpoch: 1 },
    });
    // a value cleared is refused; a Not set value left empty is no change
    expect(withDefault('waste_tile', '')).toEqual({
      ok: false,
      fields: { waste_tile: 'office.project_settings.default_required' },
    });
    expect(withDefault('waste_lvp', '')).toEqual({ ok: true, body: { lockEpoch: 1 } });
  });

  it('EZD-613 (AC-EZD-613-1): the code edition is sent only when it differs from the edition the project runs', () => {
    const d = draftOf(base);
    expect(d.codeEdition).toBe('fbc9_nec2023');
    // Opening and saving never fixes the project to the company default.
    expect(toPatchBody(base, d, editor, null)).toEqual({ ok: true, body: {} });
    const own = { ...base, codeEdition: { own: 'fbc9_nec2023' as const, effective: 'fbc9_nec2023' as const } };
    expect(draftOf(own).codeEdition).toBe('fbc9_nec2023');
    expect(toPatchBody(own, draftOf(own), editor, null)).toEqual({ ok: true, body: {} });
  });

  it('a failed save names its message; field errors go on their rows (AC-6)', () => {
    expect(saveFailure(500, null)).toEqual({ kind: 'message', message: 'office.project_settings.save_failed' });
    expect(saveFailure(409, { error: { code: 'stale_lock_epoch' } })).toEqual({
      kind: 'message',
      message: 'error.stale_lock_epoch',
    });
    expect(saveFailure(400, { error: { code: 'customer_unavailable' } })).toEqual({
      kind: 'message',
      message: 'error.project_customer_unavailable',
    });
    expect(saveFailure(400, { error: { code: 'invalid_input', fields: { name: 'x' } } })).toEqual({
      kind: 'fields',
      fields: { name: 'x' },
    });
  });
});
