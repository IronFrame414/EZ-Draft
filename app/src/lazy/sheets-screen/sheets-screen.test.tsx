// EZD-702a (AC-EZD-702a-1 "Sheets open from the list and the strip"; S13 Layout, Controls; board S13Sheets).
// Expected sets: S13 Decision 1 (ten sheets with the Reflected ceiling plan box, A3.0 Proposed is 4th, A6.0 7th),
// S13 Decision 10 (the Client set holds R1.0), the S13 size toggle (permit 24x36, client 11x17), S13 Numbering (a set
// never issued drafts Rev 0) and the board's labels ("A3.0 Proposed 4 of 10", "Sheet A3.0 · 4 of 10", "Size 24 × 36",
// "Rev 1 draft" for the board's Rev 1, so "Rev 0 draft" here).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { createSheetsScreen, type SheetsScreen } from './sheets-screen-store';
import { SheetsPanel } from './SheetsPanel';
import { SheetsCanvas } from './SheetsCanvas';
import { SheetsStatusStart } from './SheetsStatus';

const html = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  )
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const PROJECT = '00000000-0000-4000-8000-000000000001';
const ALL = defaultSheetSet(['rcp']);
const SETS: SheetSetSummary[] = [
  {
    id: null,
    kind: 'permit',
    size: '24x36',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: ALL,
  },
  {
    id: null,
    kind: 'client',
    size: '11x17',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: ALL.filter((s) => s.number === 'R1.0'),
  },
];

function stubFetch(status = 200) {
  return vi.fn(async (url: string, init?: RequestInit) =>
    url.endsWith('/sheet-sets') && init?.cache === 'no-store'
      ? new Response(JSON.stringify(status === 200 ? { sets: SETS } : { error: {} }), { status })
      : new Response('{}', { status: 404 }),
  );
}

async function loaded(): Promise<SheetsScreen> {
  const screen = createSheetsScreen(PROJECT, stubFetch());
  await screen.load();
  return screen;
}

const text = (h: string, id: string) => textOf(elements(h, id)[0]?.inner ?? '');
const current = (h: string, id: string) => attr(elements(h, id)[0]?.attrs ?? '', 'aria-current');

describe('EZD-702a Sheets screen', () => {
  it('reads the sets from the project sheet-sets route and opens the permit set first sheet', async () => {
    const f = stubFetch();
    const screen = createSheetsScreen(PROJECT, f);
    await screen.load();
    expect(f).toHaveBeenCalledWith(`/api/projects/${PROJECT}/sheet-sets`, { cache: 'no-store' });
    expect(screen.get()).toMatchObject({ load: 'ready', kind: 'permit', open: 'A0.0' });
  });

  it('AC-1: a list row opens its sheet: label, position, status bar and the active row and thumbnail follow', async () => {
    const screen = await loaded();
    // The row's click handler is screen.open(number) (SheetsPanel); the markup carries one row per sheet.
    const before = html(<SheetsPanel screen={screen} canEdit={false} />);
    expect(elements(before, 'sheet-row-A3.0')).toHaveLength(1);
    screen.open('A3.0');
    const panel = html(<SheetsPanel screen={screen} canEdit={false} />);
    const canvas = html(<SheetsCanvas screen={screen} />);
    const status = html(<SheetsStatusStart screen={screen} />);
    expect(current(panel, 'sheet-row-A3.0')).toBe('page');
    expect(current(panel, 'sheet-row-A0.0')).toBeNull();
    expect(text(canvas, 'sheets-label')).toBe('A3.0Proposed4 of 10');
    expect(current(canvas, 'sheet-thumb-A3.0')).toBe('page');
    expect(attr(elements(canvas, 'sheet-preview')[0]!.attrs, 'data-sheet')).toBe('A3.0');
    expect(text(status, 'status-sheet')).toBe('A3.0 · 4 of 10');
    expect(text(status, 'status-sheet-size')).toBe('24 × 36');
    expect(text(status, 'status-sheet-revision')).toBe('Rev 0 draft');
  });

  it('AC-1: a thumbnail opens its sheet the same way, and Previous / Next walk the set', async () => {
    const screen = await loaded();
    const strip = html(<SheetsCanvas screen={screen} />);
    expect(elements(strip, 'sheets-strip')).toHaveLength(1);
    expect(ALL.every((s) => elements(strip, `sheet-thumb-${s.number}`).length === 1)).toBe(true);
    screen.open('A6.0');
    const canvas = html(<SheetsCanvas screen={screen} />);
    expect(text(canvas, 'sheets-label')).toBe('A6.0RCP7 of 10');
    expect(current(canvas, 'sheet-thumb-A6.0')).toBe('page');
    expect(current(html(<SheetsPanel screen={screen} canEdit={false} />), 'sheet-row-A6.0')).toBe('page');
    // Previous from A0.0 is off; Next from R1.0 is off.
    screen.open('A0.0');
    expect(attr(elements(html(<SheetsCanvas screen={screen} />), 'sheets-previous')[0]!.attrs, 'disabled')).not.toBeNull();
    screen.open('R1.0');
    expect(attr(elements(html(<SheetsCanvas screen={screen} />), 'sheets-next')[0]!.attrs, 'disabled')).not.toBeNull();
  });

  it('a number not in the chosen set does not open', async () => {
    const screen = await loaded();
    screen.open('Z9.9');
    expect(screen.get().open).toBe('A0.0');
  });

  it('the list groups Architectural, Electrical, Renderings and the set line shows count, size and revision', async () => {
    const screen = await loaded();
    const panel = html(<SheetsPanel screen={screen} canEdit={false} />);
    const groups = [...panel.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(groups).toEqual(['Architectural', 'Electrical', 'Renderings', 'Viewports']);
    expect(text(panel, 'sheets-set-summary')).toBe('10 sheets · 24 × 36 · Rev 0 draft');
    expect(panel).toContain('Ready to issue');
    expect(panel).toContain('Needs approval');
  });

  it('the Client set holds R1.0 at 11 × 17 and opens it', async () => {
    const screen = await loaded();
    screen.chooseSet('client');
    expect(screen.get().open).toBe('R1.0');
    const panel = html(<SheetsPanel screen={screen} canEdit={false} />);
    expect(text(panel, 'sheets-set-summary')).toBe('1 sheet · 11 × 17 · Rev 0 draft');
    expect(elements(panel, 'sheet-row-A0.0')).toHaveLength(0);
  });

  it('the draft sheet carries the English watermark', async () => {
    const screen = await loaded();
    const canvas = html(<SheetsCanvas screen={screen} />);
    expect(text(canvas, 'sheet-watermark')).toBe('REV 0 DRAFT · NOT FOR CONSTRUCTION');
  });

  it('Add sheet shows only with Edit model and the lock', async () => {
    const screen = await loaded();
    expect(elements(html(<SheetsPanel screen={screen} canEdit={false} />), 'sheets-add')).toHaveLength(0);
    expect(text(html(<SheetsPanel screen={screen} canEdit />), 'sheets-add')).toBe('Add sheet');
  });

  it('a failed load shows the error with Retry', async () => {
    const screen = createSheetsScreen(PROJECT, stubFetch(500));
    await screen.load();
    expect(screen.get().load).toBe('failed');
    const panel = html(<SheetsPanel screen={screen} canEdit={false} />);
    expect(panel).toContain('The sheets could not load.');
    expect(panel).toContain('Retry');
  });
});
