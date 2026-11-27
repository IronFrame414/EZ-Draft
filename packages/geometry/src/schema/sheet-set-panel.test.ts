// EZD-708c (S06 Controls "Add to E2.0 | ... Places/updates panel schedule and load calc on sheet E2.0"): a set holds
// what Add to E2.0 placed, one entry per panel, as printed cells.
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from './index';

const SET = '22222222-2222-4222-8222-222222222222';
const PANEL = '55555555-5555-4555-8555-555555555555';

const permit = () => ({
  kind: 'permit',
  sheetIds: [] as string[],
  size: '24x36',
  keyPlacement: 'every_sheet',
  submittalProfileId: null as string | null,
  lastIssuedVersionId: null as string | null,
});
const entry = (over: Record<string, unknown> = {}) => ({
  panelId: PANEL,
  title: 'Panel A - 200A main',
  schedule: [['1', '1-3 Range', '50A', '2', '6 AWG', '', '12,000 VA']],
  spacesLeft: 11,
  loadCalc: [['General lighting', '220.41', '2,450 sf x 3', '7,350']],
  ...over,
});
const ok = (data: Record<string, unknown>) =>
  parseStoredObject({ id: SET, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data }).ok;

describe('EZD-708c sheet_set panel sheet entries', () => {
  it('a set without entries, with none and with one is valid', () => {
    expect(ok(permit())).toBe(true);
    expect(ok({ ...permit(), panelSheets: [] })).toBe(true);
    expect(ok({ ...permit(), panelSheets: [entry()] })).toBe(true);
    expect(ok({ ...permit(), panelSheets: [entry({ spacesLeft: null, loadCalc: [] })] })).toBe(true);
  });

  it('one entry per panel', () => {
    expect(ok({ ...permit(), panelSheets: [entry(), entry({ panelId: PANEL.toUpperCase() })] })).toBe(false);
  });

  it('refuses a bad entry', () => {
    expect(ok({ ...permit(), panelSheets: [entry({ panelId: 'Panel A' })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ title: '' })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ spacesLeft: -1 })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ spacesLeft: 1.5 })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ schedule: [[]] })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ schedule: [[1]] })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [entry({ loadCalc: [['x'.repeat(201)]] })] })).toBe(false);
    expect(ok({ ...permit(), panelSheets: [{ ...entry(), x: 1 }] })).toBe(false);
  });
});
