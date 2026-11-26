// EZD-726 the `sheet_set` type (03b Architecture rule 3: a sheet set is a model object; 03d sheet_set: kind permit /
// client, sheet_ids, size "permit 24x36; client 11x17 or 24x36", key_placement "every sheet / cover only",
// submittal_profile_id, last_issued_version_id; 03b rule 5).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseModelDocument, parseStoredObject } from './index';

const FLOOR = '11111111-1111-4111-8111-111111111111';
const SET = '22222222-2222-4222-8222-222222222222';
const SHEET_A = '33333333-3333-4333-8333-333333333333';
const SHEET_B = '44444444-4444-4444-8444-444444444444';

const permit = () => ({
  kind: 'permit',
  sheetIds: [] as string[],
  size: '24x36',
  keyPlacement: 'every_sheet',
  submittalProfileId: null as string | null,
  lastIssuedVersionId: null as string | null,
});
const ok = (data: Record<string, unknown>) =>
  parseStoredObject({ id: SET, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data }).ok;

describe('EZD-726 sheet_set schema', () => {
  it('is a model object type', () => {
    expect(OBJECT_TYPES).toContain('sheet_set');
    expect(ok(permit())).toBe(true);
  });

  it('the permit set is 24x36 only; the client set is 11x17 or 24x36', () => {
    expect(ok({ ...permit(), size: '11x17' })).toBe(false);
    expect(ok({ ...permit(), kind: 'client', size: '11x17' })).toBe(true);
    expect(ok({ ...permit(), kind: 'client', size: '24x36' })).toBe(true);
    expect(ok({ ...permit(), kind: 'client', size: '8.5x11' })).toBe(false);
    expect(ok({ ...permit(), kind: 'field' })).toBe(false);
  });

  it('the key goes on every sheet or on the cover only', () => {
    expect(ok({ ...permit(), keyPlacement: 'cover_only' })).toBe(true);
    expect(ok({ ...permit(), keyPlacement: 'none' })).toBe(false);
  });

  it('holds its sheet ids once each, a profile link and the last issued version', () => {
    expect(ok({ ...permit(), sheetIds: [SHEET_A, SHEET_B] })).toBe(true);
    expect(ok({ ...permit(), sheetIds: [SHEET_A, SHEET_A.toUpperCase()] })).toBe(false);
    expect(ok({ ...permit(), sheetIds: ['A1.0'] })).toBe(false);
    expect(ok({ ...permit(), submittalProfileId: SHEET_A, lastIssuedVersionId: SHEET_B })).toBe(true);
    expect(ok({ ...permit(), submittalProfileId: 'x' })).toBe(false);
    expect(ok({ ...permit(), level: FLOOR })).toBe(false);
  });

  it('a set names no floor, so a document with a floor and a set is whole', () => {
    const doc = {
      objects: [
        { id: FLOOR, type: 'floor', schema_version: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } },
        { id: SET, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data: permit() },
      ],
    };
    expect(parseModelDocument(doc).ok).toBe(true);
  });
});

// EZD-703 (03b rule 3 "viewports ... are model objects"; 03c sheet "viewports, scale"; S13 Rail: Viewport; 09h
// "Scales per viewport"): a set holds its viewports, each on a sheet number with its kind, floor, view and scale.
describe('EZD-703 sheet_set viewports', () => {
  const VP = '55555555-5555-4555-8555-555555555555';
  const VP2 = '66666666-6666-4666-8666-666666666666';
  const vp = (over: Record<string, unknown> = {}) => ({
    id: VP,
    sheet: 'A1.0',
    kind: 'plan',
    level: FLOOR,
    view: 'existing',
    scale: '1/4',
    ...over,
  });

  it('a set without viewports is still valid', () => {
    expect(ok(permit())).toBe(true);
  });

  it('holds plan and elevation viewports in the Existing, Demo and Proposed views', () => {
    expect(ok({ ...permit(), viewports: [] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp(), vp({ id: VP2, sheet: 'A4.0', kind: 'elevation', scale: '1/2' })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ view: 'demo' })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ view: 'proposed', level: null })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ view: 'new' })] })).toBe(false);
    expect(ok({ ...permit(), viewports: [vp({ kind: 'section' })] })).toBe(false);
  });

  it('takes the architectural scales and NTS only', () => {
    for (const scale of ['1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1', '1-1/2', '3', 'nts'])
      expect(ok({ ...permit(), viewports: [vp({ scale })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ scale: '1/5' })] })).toBe(false);
    expect(ok({ ...permit(), viewports: [vp({ scale: 0.25 })] })).toBe(false);
  });

  it('refuses a repeated viewport id, a bad floor id, an empty sheet and extra fields', () => {
    expect(ok({ ...permit(), viewports: [vp(), vp({ id: VP.toUpperCase(), sheet: 'A2.0' })] })).toBe(false);
    expect(ok({ ...permit(), viewports: [vp({ level: 'Floor 1' })] })).toBe(false);
    expect(ok({ ...permit(), viewports: [vp({ sheet: '' })] })).toBe(false);
    expect(ok({ ...permit(), viewports: [{ ...vp(), x: 1 }] })).toBe(false);
  });
});

describe('EZD-703 sheet_set changed-viewport sheets', () => {
  it('lists each changed sheet once', () => {
    expect(ok({ ...permit(), viewports: [], viewportSheets: ['A1.0', 'A2.0'] })).toBe(true);
    expect(ok({ ...permit(), viewportSheets: ['A1.0', 'A1.0'] })).toBe(false);
    expect(ok({ ...permit(), viewportSheets: [''] })).toBe(false);
  });
});

// EZD-707 (R24 "any other wall is added with Add elevation"; AC-EZD-707-3): an elevation viewport holds the walls
// added to it, by id.
describe('EZD-707 sheet_set elevation walls', () => {
  const WALL = '77777777-7777-4777-8777-777777777777';
  const vp = (over: Record<string, unknown> = {}) => ({
    id: '55555555-5555-4555-8555-555555555555',
    sheet: 'A4.0',
    kind: 'elevation',
    level: null,
    view: 'proposed',
    scale: '1/2',
    ...over,
  });

  it('holds added wall ids; a viewport without them is still valid; a bad id is refused', () => {
    expect(ok({ ...permit(), viewports: [vp()] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ walls: [] })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ walls: [WALL] })] })).toBe(true);
    expect(ok({ ...permit(), viewports: [vp({ walls: ['Wall 4'] })] })).toBe(false);
  });
});
