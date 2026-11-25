// EZD-609 AC-EZD-609-1 "Schedule rows match the circuits." The Panel tab's compact schedule and the full schedule's
// table, rendered in the real office catalog, English. Expected values typed by hand from the fixture (board
// S06Electrical's Panel A: 40 spaces; Range 1-3 50A 2-pole 12000; 12 Small appl. 1 20A GFCI 1500; ... 24 Kitchen
// lighting 15A AFCI 171) and the spec: S06 Controls Panel tab "two columns of spaces (odd/even) with circuit number,
// name, breaker; open spaces shown empty"; Panel schedule "space, circuit, breaker size, poles, wire size, AFCI/GFCI
// type, load; flags spaces left. | Read only in schedule"; vault/build/assumptions.md EZD-609 wording.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import { uid } from '../tools/test-utils/fixtures';
import { circuitView } from './circuit-view';
import { ElectricalPanel } from './ElectricalPanel';
import { panelSchedule } from './panel-schedule';
import { ScheduleTable } from './PanelSchedule';
import { electricalObjects, PANEL_A } from './test-fixture';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

const panelTab = (objects: Map<string, ObjectValue> = electricalObjects()) => {
  const ui = { ids: [] as string[], selectMore: false };
  return wrap(
    <ElectricalPanel
      store={createModelStore({ objects })}
      selection={{ getUi: () => ui, subscribe: () => () => {}, select: () => {} }}
      showObject={() => true}
      initialTab="panel"
    />,
  );
};

const spaceOf = (html: string, n: number) =>
  elements(html, 'schedule-space').find((e) => attr(e.attrs, 'data-space') === String(n))!;

describe('EZD-609 Panel tab compact schedule', () => {
  it('AC-1 two columns: spaces 1 to 40 in odd/even pairs; each circuit shows its number, name and breaker', () => {
    const html = panelTab();
    const cells = elements(html, 'schedule-space');
    // Grid order is row by row: 1 2, 3 4, ... so odd spaces fill the left column and even the right.
    expect(cells.map((e) => attr(e.attrs, 'data-space'))).toEqual(
      Array.from({ length: 40 }, (_, i) => String(i + 1)),
    );
    const shown = (n: number) => {
      const inner = spaceOf(html, n).inner;
      return [
        elements(inner, 'schedule-space-name').map((e) => textOf(e.inner))[0] ?? null,
        elements(inner, 'schedule-space-meta').map((e) => textOf(e.inner))[0] ?? null,
      ];
    };
    expect(shown(1)).toEqual(['Range', '1-3 · 50A']);
    expect(shown(3)).toEqual(['Range', null]);
    expect(shown(12)).toEqual(['Small appl. 1', '12 · 20A']);
    expect(shown(14)).toEqual(['Small appl. 2', '14 · 20A']);
    expect(shown(16)).toEqual(['Refrigerator', '16 · 20A']);
    expect(shown(18)).toEqual(['Dishwasher', '18 · 20A']);
    expect(shown(20)).toEqual(['Disposal', '20 · 20A']);
    expect(shown(22)).toEqual(['Microwave, OTR', '22 · 20A']);
    expect(shown(24)).toEqual(['Kitchen lighting', '24 · 15A']);
  });

  it('open spaces are empty: only their number, and not a button', () => {
    const html = panelTab();
    for (const n of [2, 4, 11, 13, 23, 25, 40]) {
      const cell = spaceOf(html, n);
      expect(cell.tag).toBe('div');
      expect(textOf(cell.inner)).toBe(String(n));
      expect(attr(cell.attrs, 'data-circuit-id')).toBeNull();
    }
    const taken = elements(html, 'schedule-space').filter((e) => e.tag === 'button');
    // The board footer's "9 spaces": seven 1-pole circuits and the Range on two.
    expect(taken).toHaveLength(9);
    expect(attr(spaceOf(html, 14).attrs, 'data-circuit-id')).toBe(uid(202));
  });

  it('flags the spaces left: "31 spaces left"; "No spaces left" when the panel is full', () => {
    expect(textOf(elements(panelTab(), 'panel-schedule-left')[0]!.inner)).toBe('31 spaces left');
    const objects = electricalObjects();
    (objects.get(PANEL_A)!.data as { attributes: { spaces: number } }).attributes.spaces = 3;
    // Spaces 1 and 3 are the Range; space 2 is the only one open, then none.
    expect(textOf(elements(panelTab(objects), 'panel-schedule-left')[0]!.inner)).toBe(
      '1 space left',
    );
  });

  it('the chosen circuit spaces are pressed (both spaces of a 2-pole circuit)', () => {
    circuitView.set({ circuit: uid(207) });
    try {
      const pressed = elements(panelTab(), 'schedule-space')
        .filter((e) => attr(e.attrs, 'aria-pressed') === 'true')
        .map((e) => attr(e.attrs, 'data-space'));
      expect(pressed).toEqual(['1', '3']);
    } finally {
      circuitView.set({ circuit: null });
    }
  });

  it('the Panel schedule button shows without Edit model (View projects); the dialog is closed until pressed', () => {
    const html = panelTab();
    expect(textOf(elements(html, 'electrical-panel-schedule')[0]!.inner)).toBe('Panel schedule');
    expect(elements(html, 'panel-schedule-dialog')).toHaveLength(0);
  });
});

describe('EZD-609 full schedule table', () => {
  const table = (objects = electricalObjects()) =>
    wrap(<ScheduleTable schedule={panelSchedule(objects, PANEL_A)!} />);

  it('AC-1 columns Space, Circuit, Breaker, Poles, Wire, AFCI/GFCI, Load; one row per space', () => {
    const html = table();
    const head = [...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1]);
    expect(head).toEqual(['Space', 'Circuit', 'Breaker', 'Poles', 'Wire', 'AFCI/GFCI', 'Load']);
    expect(elements(html, 'panel-schedule-row')).toHaveLength(40);
  });

  it('AC-1 each row matches its circuit', () => {
    const objects = electricalObjects();
    // The fixture circuits carry no wire (stored before EZD-604) except Small appl. 2, given 12 AWG here.
    const c202 = objects.get(uid(202))!.data as { attributes: Record<string, unknown> };
    c202.attributes.wire = '12';
    const rows = elements(table(objects), 'panel-schedule-row');
    const cells = (n: number) =>
      [...rows[n - 1]!.inner.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => textOf(m[1]!));
    expect(cells(1)).toEqual(['1', '1-3 Range', '50A', '2', 'Not set', '', '12,000 VA']);
    expect(cells(2)).toEqual(['2', '', '', '', '', '', '']);
    expect(cells(3)).toEqual(['3', '1-3 Range', '', '', '', '', '']);
    expect(cells(12)).toEqual([
      '12',
      '12 Small appl. 1',
      '20A',
      '1',
      'Not set',
      'GFCI',
      '1,500 VA',
    ]);
    expect(cells(14)).toEqual(['14', '14 Small appl. 2', '20A', '1', '12 AWG', 'GFCI', '1,500 VA']);
    expect(cells(16)).toEqual(['16', '16 Refrigerator', '20A', '1', 'Not set', '', '720 VA']);
    expect(cells(24)).toEqual([
      '24',
      '24 Kitchen lighting',
      '15A',
      '1',
      'Not set',
      'AFCI',
      '171 VA',
    ]);
  });

  it('read only: no inputs, selects or buttons', () => {
    expect(table()).not.toMatch(/<(input|select|button|textarea)\b/);
  });
});
