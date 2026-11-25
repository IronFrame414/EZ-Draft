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
  wallTileAddChanges,
  wallTileChanges,
  type CabinetSelection,
} from '../../editor/cabinets/cabinet-view';
import {
  boardModel,
  boardModelWallMoved,
  CAB_FLOOR,
  cabId,
  emptyRunModel,
} from '../../editor/cabinets/test-utils/board-run';
import { cabinetAutoFillChanges } from '../../editor/cabinets/cabinet-view';
import type { Change, Objects } from '../../editor/model/patches';
import { CabinetRunScreen, type CabinetAutoFillHandlers } from './CabinetRunView';

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
    const chain = [...s.matchAll(/data-chain-id="[^"]+" data-width="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(chain).toEqual([3, 15, 24, 36, 18, 21]);
    expect(chain.reduce((a, b) => a + b, 0)).toBe(117);
    const labels = [
      ...s.slice(s.indexOf('data-testid="cabinet-chain"')).matchAll(/<text[^>]*>([^<]+)<\/text>/g),
    ]
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
    expect(
      [...s.matchAll(/data-height="(\w+)" data-size="([\d.]+)"/g)].map((m) => [m[1], Number(m[2])]),
    ).toEqual([
      ['base', 36],
      ['gap', 18],
      ['upper', 30],
    ]);
    expect(s).toContain('data-testid="cabinet-plan-wall"');
    expect(s).toContain('data-testid="cabinet-toe-kick"');
    expect(s).toContain('data-testid="cabinet-countertop"');
    // The SB36 face: a false drawer over two doors.
    const sb36 = s.slice(s.indexOf(`data-cabinet-id="${cabId(4)}" data-view="elevation"`));
    const faces = [...sb36.slice(0, sb36.indexOf('</g>')).matchAll(/data-face="(\w+)"/g)].map(
      (m) => m[1],
    );
    expect(faces).toEqual(['false_drawer', 'door', 'door']);
  });

  it('a floor with no run shows the empty prompt', () => {
    const s = html(
      <CabinetRunScreen view={null} selection={NO_CABINET_SELECTION} onInput={() => {}} />,
    );
    expect(s).toContain('Drag boxes or Auto-fill run');
  });

  // EZD-1986 (AC-EZD-1986-1; audit F9): with no run the screen is marked empty, so its see-through style applies and
  // the room shows on the plan; it holds only the prompt (no plan strip or elevation drawn over the room).
  it('EZD-1986 a floor with no run marks the screen empty and draws nothing but the prompt', () => {
    const s = html(
      <CabinetRunScreen view={null} selection={NO_CABINET_SELECTION} onInput={() => {}} />,
    );
    expect(s).toMatch(/<section[^>]*data-testid="cabinet-run"[^>]*data-empty=""/);
    expect(s).not.toContain('<svg');
    expect(s.replace(/<[^>]+>/g, '')).toBe('Drag boxes or Auto-fill run');
  });
});

// EZD-410 (AC-EZD-410-1 "A wall move that strands a cabinet flags it red"; S04 Validation "red 'Not on a wall' flag").
describe('EZD-410 Not on a wall', () => {
  const stranded = () =>
    html(
      <CabinetRunScreen
        view={cabinetView(boardModelWallMoved({ x: 0, y: 6 }), CAB_FLOOR)}
        selection={NO_CABINET_SELECTION}
        onInput={() => {}}
      />,
    );
  const flaggedIds = (s: string) =>
    [...s.matchAll(/<g [^>]*data-flagged="true"[^>]*>/g)].map((m) => [
      /data-view="(\w+)"/.exec(m[0])?.[1],
      /data-cabinet-id="([^"]+)"/.exec(m[0])?.[1],
    ]);

  it('the run on its wall shows no flag and no box is flagged', () => {
    const s = screen();
    expect(s).not.toContain('data-testid="cabinet-run-not-on-wall"');
    expect(flaggedIds(s)).toEqual([]);
  });

  it('AC-EZD-410-1: after the wall moves away the header flags "Not on a wall" and every box is flagged in both views', () => {
    const s = stranded();
    const flag = /<span[^>]*data-testid="cabinet-run-not-on-wall"[^>]*>(.*?)<\/span>/.exec(s);
    expect(flag?.[1]).toContain('Not on a wall');
    expect(flag?.[1]).toContain('#ez-icon-error');
    const ids = [1, 2, 3, 4, 5, 6, 7, 8].map(cabId);
    const got = flaggedIds(s);
    for (const id of ids) {
      expect(got).toContainEqual(['plan', id]);
      expect(got).toContainEqual(['elevation', id]);
    }
    expect(got).toHaveLength(16);
  });
});

// EZD-733 (AC-EZD-733-1 "Changing the start point moves the cuts on the elevation"). Board wall 117 1/2"; the default
// 12" x 24" tile with a 1/8" joint from the left end: columns every 12 1/8", the tenth from 109.125" cut at the wall end;
// started 6" from the left the first piece, 0" to 5 7/8", is cut. Rows are 24 1/8" apart, so the fourth row
// (72.375" + 24" > 96") is cut along its top; the checks read the bottom row (from the floor) only.
describe('EZD-733 wall tile on the cabinet elevation', () => {
  const tiled = (fromLeft: number | null) => {
    const objects = new Map(boardModel());
    const v0 = cabinetView(modelObjects(objects), CAB_FLOOR)!;
    const [add] = wallTileAddChanges(v0, () => 'e0000000-0000-4000-8000-000000000001');
    objects.set(add!.id, add!.value!);
    if (fromLeft !== null) {
      const v1 = cabinetView(modelObjects(objects), CAB_FLOOR)!;
      const [c] = wallTileChanges(v1, modelObjects(objects), { startFromLeft: fromLeft });
      objects.set(c!.id, c!.value!);
    }
    return cabinetView(modelObjects(objects), CAB_FLOOR);
  };
  const cutStarts = (s: string) =>
    [...s.matchAll(/<polygon [^>]*data-tile-cut="true"[^>]*>/g)]
      .filter((m) => /data-y0="0"/.test(m[0]))
      .map((m) => Number(/data-x0="([^"]+)"/.exec(m[0])?.[1]))
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort((a, b) => a - b);

  it('with no tile the bar offers Add wall tile (off without Edit model) and nothing is drawn', () => {
    const s = screen();
    expect(s).toContain('data-testid="cabinet-tile-bar"');
    expect(s).toMatch(/<button[^>]*data-testid="cabinet-tile-add"[^>]*disabled=""/);
    expect(s).toContain('Add wall tile');
    expect(s).not.toContain('data-testid="cabinet-tile"');
  });

  it('AC-EZD-733-1: the elevation draws the tile; moving the start 6" from the left moves the cut pieces', () => {
    const a = html(
      <CabinetRunScreen view={tiled(null)} selection={NO_CABINET_SELECTION} onInput={() => {}} />,
    );
    expect(a).toContain('data-testid="cabinet-tile"');
    expect(cutStarts(a)).toContain(109.125);
    expect(cutStarts(a)).not.toContain(0);
    const b = html(
      <CabinetRunScreen view={tiled(6)} selection={NO_CABINET_SELECTION} onInput={() => {}} />,
    );
    expect(cutStarts(b)).toContain(0);
    expect(cutStarts(b)).not.toContain(109.125);
    expect(b).toMatch(/data-testid="cabinet-tile-start-left"[^>]*value="6""/);
    expect(b).toContain('Herringbone');
    expect(b).toContain('data-testid="cabinet-tile-start"');
  });
});

// EZD-407 (AC-EZD-407-1 "A 117" run with 1/2" scribe on a 117 1/2" wall shows green"; S04 Controls "Fit chip ("Run
// 117" fits wall 117 1/2" · 1/2" scribe")"; S04 States "Run mismatch: fit chip turns to warning with the difference").
// Expected text: board S04's chip; the mismatch wording is in vault/build/assumptions.md EZD-407.
describe('EZD-407 fit chip', () => {
  const chip = (s: string) => /<(button|span)[^>]*data-testid="cabinet-fit-chip"[^>]*>.*?<\/\1>/.exec(s)?.[0] ?? '';
  const onWall = (to: number) => {
    const v = view()!;
    return { ...v, layout: { ...v.layout, wall: { from: 0, to } } };
  };
  const at = (v: ReturnType<typeof view>, fitTolerance: number | null = null) =>
    html(
      <CabinetRunScreen
        view={v}
        selection={NO_CABINET_SELECTION}
        onInput={() => {}}
        fitTolerance={fitTolerance}
      />,
    );

  it('AC-EZD-407-1: the board run (117", 1/2" scribe) on its 117 1/2" wall shows the green chip', () => {
    const c = chip(screen());
    expect(c).toContain('data-fit="fits"');
    expect(c).toContain('Run 117" fits wall 117 1/2" · 1/2" scribe');
    expect(c).not.toMatch(/fitMismatch/);
  });

  it('a 120" wall shows the amber chip with the 3" gap; a 2 1/2" tolerance turns it green', () => {
    const c = chip(at(onWall(120)));
    expect(c).toContain('data-fit="mismatch"');
    expect(c).toContain('Run 117" is 3" short of wall 120" · 1/2" scribe');
    expect(chip(at(onWall(120), 2.5))).toContain('data-fit="fits"');
  });

  it('a run longer than its wall shows the amber chip with the overrun', () => {
    const c = chip(at(onWall(115)));
    expect(c).toContain('data-fit="mismatch"');
    expect(c).toContain('Run 117" is 2" over wall 115"');
  });

  it('a run off every wall has no chip', () => {
    const v = view()!;
    expect(at({ ...v, layout: { ...v.layout, wall: null } })).not.toContain('cabinet-fit-chip');
  });
});

// EZD-408 (AC-EZD-408-1; S04 Controls "Auto-fill run ... shows result for confirmation | Existing boxes are replaced
// only after confirm"; 12 Acceptance · Cabinets "total shown vs wall"). Expected values worked by hand: on the empty
// 117 1/2" run the result is F3, B36, B36, B36, F6 (1/2" scribe) = 117", board S04's chip text. The confirm bar
// wording is in vault/build/assumptions.md EZD-408.
describe('EZD-408 Auto-fill run', () => {
  const noop = () => {};
  const handlers = (previewing: boolean): CabinetAutoFillHandlers => ({
    previewing,
    start: noop,
    confirm: noop,
    cancel: noop,
  });
  const autoFillButton = (s: string) => /<button[^>]*data-testid="cabinet-auto-fill"[^>]*>/.exec(s)?.[0] ?? '';
  const filled = (): Objects => {
    const objects = emptyRunModel();
    const v = cabinetView(modelObjects(objects), CAB_FLOOR)!;
    const { changes } = cabinetAutoFillChanges(v, modelObjects(objects), 3, (() => {
      let n = 0;
      return () => `e0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    })());
    const next = new Map(objects);
    for (const c of changes as Change[]) {
      if (c.value === null) next.delete(c.id);
      else next.set(c.id, c.value);
    }
    return next;
  };

  it('the button is off without Edit model and on with it', () => {
    expect(autoFillButton(screen())).toContain('disabled');
    const s = html(
      <CabinetRunScreen view={view()} selection={NO_CABINET_SELECTION} onInput={noop} autoFill={handlers(false)} />,
    );
    expect(autoFillButton(s)).not.toContain('disabled');
    expect(s).not.toContain('cabinet-auto-fill-bar');
  });

  it('AC-EZD-408-1: the result is drawn with its fit chip (total vs wall) and a bar to confirm or cancel', () => {
    const v = cabinetView(modelObjects(filled()), CAB_FLOOR);
    const s = html(
      <CabinetRunScreen view={v} selection={NO_CABINET_SELECTION} onInput={noop} autoFill={handlers(true)} />,
    );
    const chain = [...s.matchAll(/data-chain-id="[^"]+" data-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(chain).toEqual([3, 36, 36, 36, 6]);
    expect(s).toContain('Run 117" fits wall 117 1/2" · 1/2" scribe');
    expect(s).toContain('data-testid="cabinet-auto-fill-bar"');
    expect(s).toContain('Auto-fill result');
    expect(s).toMatch(/data-testid="cabinet-auto-fill-confirm"[^>]*>Confirm</);
    expect(s).toMatch(/data-testid="cabinet-auto-fill-cancel"[^>]*>Cancel</);
    // While the result waits, Auto-fill is not offered again.
    expect(autoFillButton(s)).toContain('disabled');
  });
});
