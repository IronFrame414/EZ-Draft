// EZD-601 AC-EZD-601-1: the electrical left panel's markup. Expected values from the spec and the board, never the
// code: board S06Electrical left panel (text tabs Circuits, Devices, Panel with Circuits selected; header "Panel A ·
// 200A main" with units "AMPS · VA"; circuit rows "12 Small appl. 1 · 20A · GFCI · 1500" and "1-3 Range · 50A ·
// 2-pole · 12000"; Show chips Receptacles, Switch legs, Lighting on and Home runs, Low voltage off; footer
// "8 circuits · 9 spaces" and "19,551 VA"); S06 Controls (Circuits "Default tab"; Devices "grouped by room: device
// type, circuit, GFCI/AFCI. Click selects the device on canvas"; Panel selector "Switch between main panel and
// subpanels"); S06 States Empty ("circuit list empty with "Place devices or add a circuit""). Rendered in the real
// office catalog, English.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../model/model-store';
import { baseObjects } from '../tools/test-utils/fixtures';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { ElectricalPanel, type ElectricalTab } from './ElectricalPanel';
import { electricalObjects, PANEL_A } from './test-fixture';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { panelSheetFor } from './panel-schedule';
import { panelSheetChange } from '../../lib/sheets/panel-sheet-table';

function render(objects: Map<string, ObjectValue>, tab?: ElectricalTab): string {
  const store = createModelStore({ objects });
  const ui = { ids: [] as string[], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, select: () => {} };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ElectricalPanel
        store={store}
        selection={selection}
        showObject={() => true}
        initialTab={tab}
      />
    </MessagesProvider>,
  );
}

const one = (html: string, testId: string) => {
  const els = elements(html, testId);
  expect(els, testId).toHaveLength(1);
  return els[0]!;
};
const texts = (html: string, testId: string) => elements(html, testId).map((e) => textOf(e.inner));

describe('EZD-601 electrical left panel', () => {
  it('tabs Circuits, Devices, Panel with Circuits the default; the panel header and units', () => {
    const html = render(electricalObjects());
    expect(attr(one(html, 'electrical-panel').attrs, 'data-tab')).toBe('circuits');
    expect(textOf(one(html, 'electrical-tab-circuits').inner)).toBe('Circuits');
    expect(textOf(one(html, 'electrical-tab-devices').inner)).toBe('Devices');
    expect(textOf(one(html, 'electrical-tab-panel').inner)).toBe('Panel');
    expect(attr(one(html, 'electrical-tab-circuits').attrs, 'aria-selected')).toBe('true');
    expect(textOf(one(html, 'electrical-panel-name').inner)).toBe('Panel A · 200A main');
    expect(textOf(one(html, 'electrical-panel-header').inner)).toContain('AMPS · VA');
    expect(elements(html, 'electrical-panel-select')).toHaveLength(0);
  });

  it('AC-1 footer: 8 circuits · 9 spaces and 19,551 VA', () => {
    for (const tab of ['circuits', 'devices', 'panel'] as const) {
      const html = render(electricalObjects(), tab);
      expect(textOf(one(html, 'electrical-footer-counts').inner)).toBe('8 circuits · 9 spaces');
      expect(textOf(one(html, 'electrical-footer-va').inner)).toBe('19,551 VA');
    }
  });

  it('circuit rows: number, name, breaker and type, VA', () => {
    const html = render(electricalObjects());
    expect(texts(html, 'circuit-number')).toEqual([
      '1-3',
      '12',
      '14',
      '16',
      '18',
      '20',
      '22',
      '24',
    ]);
    // EZD-604: the row's device count (S06 Circuit row "breaker/type/count"); a detector is neither a receptacle
    // nor a fixture, so it counts as "dev." (vault/build/assumptions.md EZD-604).
    expect(texts(html, 'circuit-meta')).toEqual([
      '50A · 2-pole · dedicated',
      '20A · GFCI',
      '20A · GFCI · 1 dev.',
      '20A · dedicated',
      '20A · GFCI · dedicated',
      '20A · GFCI · dedicated',
      '20A · dedicated',
      '15A · AFCI · 1 dev.',
    ]);
    expect(texts(html, 'circuit-va')).toEqual([
      '12000',
      '1500',
      '1500',
      '720',
      '1200',
      '960',
      '1500',
      '171',
    ]);
  });

  it('AC-1 Devices: grouped by room, each with its type, circuit and GFCI/AFCI', () => {
    const html = render(electricalObjects(), 'devices');
    expect(texts(html, 'device-group-name')).toEqual(['Kitchen', 'Family room', 'Not in a room']);
    expect(texts(html, 'device-meta')).toEqual([
      'Circuit 24 · AFCI',
      'Circuit 14 · GFCI',
      'No circuit',
      'No circuit',
    ]);
    const rows = elements(html, 'device-row').map((e) => textOf(e.inner));
    expect(rows[0]).toContain('Smoke/CO detector');
    expect(rows[1]).toContain('Smoke detector');
    expect(rows[2]).toContain('CO detector');
  });

  it('Show chips: Receptacles, Switch legs and Lighting on; Home runs and Low voltage off', () => {
    const html = render(electricalObjects());
    const pressed = (c: string) => attr(one(html, `electrical-chip-${c}`).attrs, 'aria-pressed');
    expect(textOf(one(html, 'electrical-chip-receptacles').inner)).toBe('Receptacles');
    expect(textOf(one(html, 'electrical-chip-switch_legs').inner)).toBe('Switch legs');
    expect(textOf(one(html, 'electrical-chip-lighting').inner)).toBe('Lighting');
    expect(textOf(one(html, 'electrical-chip-home_runs').inner)).toBe('Home runs');
    expect(textOf(one(html, 'electrical-chip-low_voltage').inner)).toBe('Low voltage');
    expect(
      ['receptacles', 'switch_legs', 'lighting', 'home_runs', 'low_voltage'].map(pressed),
    ).toEqual(['true', 'true', 'true', 'false', 'false']);
  });

  it('panel selector: with a subpanel the header is a select of both panels', () => {
    const html = render(electricalObjects({ subpanel: true }));
    expect(elements(html, 'electrical-panel-name')).toHaveLength(0);
    const select = one(html, 'electrical-panel-select');
    expect(textOf(select.inner)).toContain('Panel A · 200A main');
    expect(textOf(select.inner)).toContain('Panel B · 100A main');
  });

  it('empty: no panel and no devices shows "Place devices or add a circuit" and zero totals', () => {
    const html = render(baseObjects());
    expect(textOf(one(html, 'electrical-no-panel').inner)).toBe('Place devices or add a circuit');
    expect(textOf(one(html, 'electrical-footer-counts').inner)).toBe('0 circuits · 0 spaces');
    expect(textOf(one(html, 'electrical-footer-va').inner)).toBe('0 VA');
  });
});

// EZD-603 (board S06Electrical left panel "Height notes  Off | On" with On chosen; vault/build/assumptions.md EZD-603):
// the switch that shows or hides every device height note that is on.
describe('EZD-603 Height notes switch', () => {
  it('Height notes Off and On under the Show chips, On by default; Off hides the notes', async () => {
    const { heightNotesShown } = await import('./height-notes-shown');
    const html = render(electricalObjects());
    expect(textOf(one(html, 'electrical-height-notes').inner)).toContain('Height notes');
    expect(textOf(one(html, 'electrical-height-notes-off').inner)).toBe('Off');
    expect(textOf(one(html, 'electrical-height-notes-on').inner)).toBe('On');
    expect(attr(one(html, 'electrical-height-notes-on').attrs, 'aria-pressed')).toBe('true');
    expect(attr(one(html, 'electrical-height-notes-off').attrs, 'aria-pressed')).toBe('false');
    heightNotesShown.set(false);
    try {
      const off = render(electricalObjects());
      expect(attr(one(off, 'electrical-height-notes-off').attrs, 'aria-pressed')).toBe('true');
      expect(attr(one(off, 'electrical-height-notes-on').attrs, 'aria-pressed')).toBe('false');
    } finally {
      heightNotesShown.set(true);
    }
  });
});

// EZD-604 (S06 Controls "New circuit | Left panel, under list | ... | Edit model; hidden without it. Disabled in view
// only (mockup shows disabled). Disabled when no spaces left."; "Circuit row | Click selects the circuit"; board
// S06Electrical "New circuit" under the list, "Panel A · 200A main"; vault/build/assumptions.md EZD-604 New panel
// values Not set).
describe('EZD-604 New circuit and the chosen circuit', () => {
  const editable = async (paused: boolean, objects = electricalObjects()) => {
    const { createReceiverSlot } = await import('./receiver-slot');
    const store = createModelStore({ objects });
    const slot = createReceiverSlot<import('./DeviceTools').ToolBase>();
    slot.setState({
      base: {
        store,
        chosenFloor: () => null,
        newStatus: () => 'new',
        newId: () => '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f77',
        select: () => {},
        onMessage: () => {},
      },
    });
    const ui = { ids: [] as string[], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {}, select: () => {} };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <ElectricalPanel
          store={store}
          selection={selection}
          showObject={() => true}
          edit={{ slot, paused }}
        />
      </MessagesProvider>,
    );
  };

  it('hidden without Edit model', () => {
    expect(elements(render(electricalObjects()), 'electrical-new-circuit')).toHaveLength(0);
  });

  it('shown with Edit model, enabled; disabled in view only', async () => {
    const html = await editable(false);
    expect(textOf(one(html, 'electrical-new-circuit').inner)).toBe('New circuit');
    expect(attr(one(html, 'electrical-new-circuit').attrs, 'disabled')).toBeNull();
    const paused = await editable(true);
    expect(attr(one(paused, 'electrical-new-circuit').attrs, 'disabled')).not.toBeNull();
  });

  it('with no panel the empty text shows and New circuit is still there to make Panel A', async () => {
    const html = await editable(false, baseObjects());
    expect(textOf(one(html, 'electrical-no-panel').inner)).toBe('Place devices or add a circuit');
    expect(attr(one(html, 'electrical-new-circuit').attrs, 'disabled')).toBeNull();
  });

  it('a panel whose main breaker is Not set is headed by its name alone', () => {
    const objects = electricalObjects();
    const p = objects.get(PANEL_A)!;
    (p.data as { attributes: Record<string, unknown> }).attributes.mainBreaker = null;
    expect(textOf(one(render(objects), 'electrical-panel-name').inner)).toBe('Panel A');
  });

  it('the chosen circuit row is pressed and, with Edit model, shows Breaker, Poles and Wire', async () => {
    const { circuitView } = await import('./circuit-view');
    const objects = electricalObjects();
    const id = [...objects.keys()].find(
      (k) =>
        objects.get(k)!.type === 'circuit' &&
        (objects.get(k)!.data as { attributes: { space: number } }).attributes.space === 14,
    )!;
    circuitView.set({ circuit: id });
    try {
      const html = await editable(false, objects);
      const pressed = elements(html, 'circuit-row').filter(
        (e) => attr(e.attrs, 'aria-pressed') === 'true',
      );
      expect(pressed.map((e) => attr(e.attrs, 'data-circuit-id'))).toEqual([id]);
      expect(elements(html, 'circuit-fields')).toHaveLength(1);
      expect(textOf(one(html, 'circuit-fields').inner)).toContain('Breaker');
      expect(textOf(one(html, 'circuit-fields').inner)).toContain('Poles');
      expect(textOf(one(html, 'circuit-fields').inner)).toContain('Wire');
      expect(elements(render(objects), 'circuit-fields')).toHaveLength(0);
    } finally {
      circuitView.set({ circuit: null });
    }
  });

  it('the Home runs chip is off by default (board) and follows the shared setting', async () => {
    const { circuitView } = await import('./circuit-view');
    expect(attr(one(render(electricalObjects()), 'electrical-chip-home_runs').attrs, 'aria-pressed')).toBe(
      'false',
    );
    circuitView.set({ homeRuns: true });
    try {
      expect(
        attr(one(render(electricalObjects()), 'electrical-chip-home_runs').attrs, 'aria-pressed'),
      ).toBe('true');
    } finally {
      circuitView.set({ homeRuns: false });
    }
  });

  // EZD-605: the Switch legs chip (on by default, board) is shared with the plan, which draws the legs while it is on.
  it('the Switch legs chip is on by default (board) and follows the shared setting', async () => {
    const { circuitView } = await import('./circuit-view');
    const chip = () => one(render(electricalObjects()), 'electrical-chip-switch_legs');
    expect(attr(chip().attrs, 'aria-pressed')).toBe('true');
    circuitView.set({ switchLegs: false });
    try {
      expect(attr(chip().attrs, 'aria-pressed')).toBe('false');
    } finally {
      circuitView.set({ switchLegs: true });
    }
  });
});

// EZD-708c (S06 Controls "Add to E2.0 | Inspector, bottom | Places/updates panel schedule and load calc on sheet E2.0.
// | Edit model. If already placed, label reads "Update E2.0""; Q-0763 the panel sheet follows the last layout sheet;
// assumptions EZD-708c: beside Panel schedule in the Panel tab until the inspector exists, as EZD-609).
describe('EZD-708c Add to E2.0', () => {
  const PERMIT_SET = '6c1e3b7a-2f4d-4a8e-9b1c-7d3e5f2a4b6c';
  const renderPanel = async (paused: boolean | null, objects = electricalObjects()) => {
    const { createReceiverSlot } = await import('./receiver-slot');
    const store = createModelStore({ objects });
    const slot = createReceiverSlot<import('./DeviceTools').ToolBase>();
    slot.setState({
      base: {
        store,
        chosenFloor: () => null,
        newStatus: () => 'new',
        newId: () => PERMIT_SET,
        select: () => {},
        onMessage: () => {},
      },
    });
    const ui = { ids: [] as string[], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {}, select: () => {} };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <ElectricalPanel
          store={store}
          selection={selection}
          showObject={() => true}
          initialTab="panel"
          edit={paused === null ? undefined : { slot, paused }}
        />
      </MessagesProvider>,
    );
  };

  it('reads "Add to E2.0" beside Panel schedule with Edit model; disabled in view only; hidden without', async () => {
    const on = one(await renderPanel(false), 'electrical-panel-sheet');
    expect(textOf(on.inner)).toBe('Add to E2.0');
    expect(attr(on.attrs, 'disabled')).toBeNull();
    expect(attr(on.attrs, 'data-placed')).toBe('false');
    expect(attr(one(await renderPanel(true), 'electrical-panel-sheet').attrs, 'disabled')).not.toBeNull();
    expect(elements(await renderPanel(null), 'electrical-panel-sheet')).toHaveLength(0);
    expect(elements(render(electricalObjects(), 'circuits'), 'electrical-panel-sheet')).toHaveLength(0);
  });

  it('reads "Update E2.0" once the panel is placed', async () => {
    const objects = electricalObjects();
    const entry = panelSheetFor(objects, PANEL_A)!;
    const c = panelSheetChange(objects, entry, () => PERMIT_SET);
    objects.set(c.id, c.value!);
    const placed = one(await renderPanel(false, objects), 'electrical-panel-sheet');
    expect(textOf(placed.inner)).toBe('Update E2.0');
    expect(attr(placed.attrs, 'data-placed')).toBe('true');
  });

  it('names E3.0 on a two-floor project (Q-0763: the panel sheet after the last layout sheet)', async () => {
    const objects = electricalObjects();
    objects.set('9d4c2b1a-3e5f-4a6b-8c7d-0e1f2a3b4c5d', {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name: 'Second floor', order: 99 },
    });
    expect(textOf(one(await renderPanel(false, objects), 'electrical-panel-sheet').inner)).toBe('Add to E3.0');
  });
});
