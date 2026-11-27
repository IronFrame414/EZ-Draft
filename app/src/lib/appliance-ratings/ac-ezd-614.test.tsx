// EZD-614 AC-EZD-614-1 "The calc uses the default when an item has no rating", in every place the load calc runs:
// the engine (panelLoadCalc), the electrical status bar, the Sheets issue checklist, the load calc stored at issue
// and Add to E2.0. Expected values: the 09a worked example (2,450 sq ft; dishwasher 1,200 VA; A/C 4,200 VA; total
// 35,868 VA; 149.5 A on the 200 A service). The two unrated items take the company rows of 09s: dishwasher
// 120 V x 10 A = 1,200 VA (09s row 7) and A/C 240 V x 17.5 A = 4,200 VA (09s row 13), VA = V x A (09s Rules).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ElectricalStatus } from '../../editor/electrical/ElectricalStatus';
import { panelLoadCalc } from '../../editor/electrical/existing-panel';
import { panelSheetFor } from '../../editor/electrical/panel-schedule';
import { electricalObjects, PANEL_A } from '../../editor/electrical/test-fixture';
import {
  liveElectricalCalc,
  liveLoadCalc,
  createSheetsScreen,
} from '../../lazy/sheets-screen/sheets-screen-store';
import type { ObjectValue } from '../outbox/model-api';
import { MessagesProvider } from '../messages';
import { catalogFor } from '../../server/messages/catalog';
import { issueChecklist, type IssueFacts } from '../sheets/issue-checklist';
import { createApplianceDefaults, APPLIANCE_RATINGS_URL } from './defaults-source';
import { defaultsVaMap, type ApplianceRating } from './ratings';

const ROWS: ApplianceRating[] = [
  { applianceType: 'dishwasher', name: 'Dishwasher', volts: 120, amps: 10 },
  { applianceType: 'ac', name: 'A/C or heat pump', volts: 240, amps: 17.5 },
];

// The 09a loads; the dishwasher has no rating (its type's default applies) and the A/C is the panel's existing
// appliance with no rating (EZD-606 `appliances`, type `ac`, a motor).
const LOADS = [
  { id: 'dw', name: 'Dishwasher', kind: 'fixed_appliance', va: null, applianceType: 'dishwasher' },
  { id: 'disp', name: 'Disposal', kind: 'fixed_appliance', va: 960, motor: true },
  { id: 'mw', name: 'Microwave', kind: 'fixed_appliance', va: 1500 },
  { id: 'wh', name: 'Water heater', kind: 'fixed_appliance', va: 4500 },
  { id: 'dry', name: 'Dryer', kind: 'dryer', va: 5000 },
  { id: 'rng', name: 'Range', kind: 'range', va: 12000 },
  { id: 'heat', name: 'Heat strips', kind: 'heating', va: 9600 },
];

function house(): Map<string, ObjectValue> {
  const objects = new Map<string, ObjectValue>(
    [...electricalObjects()].filter(([, v]) => v.type !== 'room'),
  );
  const panel = structuredClone(objects.get(PANEL_A)!);
  const attrs = (panel.data as { attributes: Record<string, unknown> }).attributes;
  attrs.appliances = [{ kind: 'ac', va: null }];
  attrs.loadCalc = {
    method: 'standard',
    floorAreaSqFt: 2450,
    smallApplianceCircuits: 2,
    laundryCircuits: 1,
    loads: LOADS,
    overrides: {},
  };
  objects.set(PANEL_A, panel);
  return objects;
}

const DEFAULTS = defaultsVaMap(ROWS);

describe('EZD-614 AC-EZD-614-1 the calc uses the default when an item has no rating', () => {
  it('the company rows give VA = V x A by type', () => {
    expect(DEFAULTS).toEqual({ dishwasher: 1200, ac: 4200 });
  });

  it('engine: the 09a total with both unrated items at their defaults; without them the calc error names them', () => {
    expect(panelLoadCalc(house(), PANEL_A, DEFAULTS)).toMatchObject({
      ok: true,
      totalVa: 35868,
      amps: 149.5,
      service: { amps: 200, pass: true },
    });
    expect(panelLoadCalc(house(), PANEL_A, {})).toEqual({
      ok: false,
      errors: [
        { code: 'missing_rating', loadId: 'panel:ac', name: 'ac' },
        { code: 'missing_rating', loadId: 'dw', name: 'Dishwasher' },
      ],
    });
  });

  it('status bar: the calculated amps use the defaults', () => {
    const status = (rows: ApplianceRating[] | null) => {
      const source = createApplianceDefaults(vi.fn());
      if (rows !== null) source.set(rows);
      const objects = house();
      return renderToStaticMarkup(
        createElement(
          MessagesProvider,
          { language: 'en', messages: catalogFor('office', 'en') },
          createElement(ElectricalStatus, {
            store: { getState: () => ({ objects }), subscribe: () => () => {} } as never,
            defaultsSource: source,
          }),
        ),
      );
    };
    expect(status(ROWS)).toContain('200A · 149.5A calc');
    expect(status(null)).toContain('>200A<');
  });

  it('Sheets issue checklist and the calc stored at issue use the defaults', () => {
    expect(liveLoadCalc(house(), 'fbc9_nec2023', DEFAULTS)).toEqual({
      state: 'done',
      edition: 'fbc9_nec2023',
      serviceAmps: 200,
      pass: true,
    });
    expect(liveLoadCalc(house(), 'fbc9_nec2023', {})).toEqual({ state: 'error' });
    expect(liveElectricalCalc(house(), 'fbc9_nec2023', DEFAULTS)?.results).toMatchObject({
      ok: true,
      totalVa: 35868,
    });
    expect(liveElectricalCalc(house(), 'fbc9_nec2023', {})).toBeNull();
  });

  it('Sheets screen: the checklist row passes once the company rows are read with the checklist', async () => {
    const facts: IssueFacts = {
      sheets: ['A0.0', 'E2.0'],
      titleBlockMissing: [],
      codeCheck: { state: 'run', at: '2026-11-26T15:41:00Z', open: 0, accepted: 0 },
      orphans: [],
      loadCalc: null,
      engineerLettersMissing: 0,
      rendersAwaiting: 0,
    };
    const answer = {
      facts: { ...facts, edition: 'fbc9_nec2023' },
      checklist: issueChecklist(facts),
    };
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/code-check?checklist=1')
        ? new Response(JSON.stringify(answer))
        : url === APPLIANCE_RATINGS_URL
          ? new Response(JSON.stringify({ rows: ROWS }))
          : new Response('{}', { status: 404 }),
    );
    const screen = createSheetsScreen('00000000-0000-4000-8000-000000000614', fetchFn);
    const objects = house();
    screen.setModel({ getState: () => ({ objects }), subscribe: () => () => {} });
    await screen.reloadChecklist();
    expect(fetchFn).toHaveBeenCalledWith(APPLIANCE_RATINGS_URL, expect.anything());
    expect(screen.get().checklist?.rows.find((r) => r.id === 'load_calc')).toMatchObject({
      status: 'pass',
      detail: { state: 'done', service: 200 },
    });
    screen.dispose();
  });

  it('Add to E2.0: the printed load calc uses the defaults', () => {
    const cells = panelSheetFor(house(), PANEL_A, DEFAULTS)!.loadCalc;
    expect(cells.flat()).toContain('149.5 A');
    expect(cells.flat()).toContain('35,868 VA');
    expect(panelSheetFor(house(), PANEL_A, {})!.loadCalc.flat()).not.toContain('149.5 A');
  });
});
