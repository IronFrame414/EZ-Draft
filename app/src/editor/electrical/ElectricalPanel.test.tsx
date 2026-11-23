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
import { electricalObjects } from './test-fixture';

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
    expect(texts(html, 'circuit-meta')).toEqual([
      '50A · 2-pole · dedicated',
      '20A · GFCI',
      '20A · GFCI',
      '20A · dedicated',
      '20A · GFCI · dedicated',
      '20A · GFCI · dedicated',
      '20A · dedicated',
      '15A · AFCI',
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
