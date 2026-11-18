// EZD-404 (AC-EZD-404-1 "Selecting a box highlights it in both views"; AC-EZD-404-2 "The elevation's chain widths sum
// to the run total"; S04 Layout; board S04Cabinets). Markup through renderToStaticMarkup (L-020: the wrapper is
// MessagesProvider). Expected values: board S04's run (3" filler, B15, DW24, SB36, B18, B21 = 117"), its height
// dimensions 36", 18", 30", its header "Back wall run" and the labels "Plan" and "Elevation A".
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import {
  NO_CABINET_SELECTION,
  cabinetSelect,
  cabinetView,
  modelObjects,
  type CabinetSelection,
} from '../../editor/cabinets/cabinet-view';
import { boardModel, CAB_FLOOR, cabId } from '../../editor/cabinets/test-utils/board-run';
import { CabinetRunScreen } from './CabinetRunView';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const view = () => cabinetView(modelObjects(boardModel()), CAB_FLOOR);
const screen = (selection: CabinetSelection = NO_CABINET_SELECTION) =>
  html(<CabinetRunScreen view={view()} selection={selection} onInput={() => {}} />);

// The opening tag of every element marked selected, as [view, id].
const selected = (s: string) =>
  [...s.matchAll(/<g [^>]*data-selected="true"[^>]*>/g)].map((m) => [
    /data-view="(\w+)"/.exec(m[0])?.[1],
    /data-cabinet-id="([^"]+)"/.exec(m[0])?.[1],
  ]);

describe('EZD-404 cabinet run screen', () => {
  it('AC-EZD-404-1: the selected SB36 is marked in the plan strip and the elevation, and nothing else is', () => {
    const sb36 = cabId(4);
    const s = screen(cabinetSelect(NO_CABINET_SELECTION, { type: 'click', id: sb36 }));
    expect(selected(s)).toEqual([
      ['plan', sb36],
      ['elevation', sb36],
    ]);
  });

  it('AC-EZD-404-1: an upper picked in the elevation is marked in the plan strip too (dashed there)', () => {
    const w = cabId(8);
    const s = screen(cabinetSelect(NO_CABINET_SELECTION, { type: 'click', id: w }));
    expect(selected(s)).toEqual([
      ['plan', w],
      ['elevation', w],
    ]);
  });

  it('every box is in both views; nothing is marked with no selection', () => {
    const s = screen();
    for (let i = 1; i <= 8; i += 1) {
      expect(s).toContain(`data-cabinet-id="${cabId(i)}" data-view="plan"`);
      expect(s).toContain(`data-cabinet-id="${cabId(i)}" data-view="elevation"`);
    }
    expect(selected(s)).toEqual([]);
  });

  it('AC-EZD-404-2: the chain reads 3", 15", 24", 36", 18", 21" and its widths add to the 117" run total', () => {
    const s = screen();
    const chain = [...s.matchAll(/data-chain-id="[^"]+" data-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(chain).toEqual([3, 15, 24, 36, 18, 21]);
    expect(chain.reduce((a, b) => a + b, 0)).toBe(117);
    const labels = [...s.slice(s.indexOf('data-testid="cabinet-chain"')).matchAll(/<text[^>]*>([^<]+)<\/text>/g)]
      .map((m) => m[1])
      .slice(0, 6);
    expect(labels).toEqual(['3"', '15"', '24"', '36"', '18"', '21"']);
  });

  it('header, labels and heights as board S04', () => {
    const s = screen();
    expect(s).toContain('>Back wall run<');
    expect(s).toContain('5 boxes · 1 filler');
    expect(s).toContain('>Auto-fill run<');
    expect(s).toContain('>Plan<');
    expect(s).toContain('>Elevation A<');
    expect([...s.matchAll(/data-height="(\w+)" data-size="([\d.]+)"/g)].map((m) => [m[1], Number(m[2])])).toEqual([
      ['base', 36],
      ['gap', 18],
      ['upper', 30],
    ]);
    expect(s).toContain('data-testid="cabinet-plan-wall"');
    expect(s).toContain('data-testid="cabinet-toe-kick"');
    expect(s).toContain('data-testid="cabinet-countertop"');
    // The SB36 face: a false drawer over two doors.
    const sb36 = s.slice(s.indexOf(`data-cabinet-id="${cabId(4)}" data-view="elevation"`));
    const faces = [...sb36.slice(0, sb36.indexOf('</g>')).matchAll(/data-face="(\w+)"/g)].map((m) => m[1]);
    expect(faces).toEqual(['false_drawer', 'door', 'door']);
  });

  it('a floor with no run shows the empty prompt', () => {
    const s = html(<CabinetRunScreen view={null} selection={NO_CABINET_SELECTION} onInput={() => {}} />);
    expect(s).toContain('Drag boxes or Auto-fill run');
  });
});
