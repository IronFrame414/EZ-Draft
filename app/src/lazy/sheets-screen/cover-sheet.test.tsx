// EZD-728 AC-EZD-728-1 "Adding a sheet to the set adds it to the index on A0.0" (09h Sheet set rules "A0.0 Cover +
// index + key"; phase-07 EZD-728: project block, sheet index from the set, scope of work, general notes and the
// profile's required notes (EZD-714), the key when placement is cover only). Expected sheets and order: 09h and S13
// Decision 1 with Q-0779 (A6.0 joins between A5.0 and E1.0 when the Reflected ceiling plan box is ticked); titles are
// the S13 sheet list. Board S13Sheets stacks the symbol key over GENERAL NOTES in the notes column.
import { CURRENT_SCHEMA_VERSION, type KeyPlacement } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import {
  defaultSheetSet,
  sheetFrame,
  sheetNotesColumn,
  type SetNotes,
  type Sheet,
  type SheetSetSummary,
} from '../../lib/sheets/sheet-set';
import type { ProjectTitleBlock } from '../../lib/title-block/sheet-title-block';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { SheetRenderer } from '../sheets';
import { coverIndex, coverLayout, parseSetNotes, wrapText } from './cover-sheet';
import { SheetsCanvas } from './SheetsCanvas';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const OUTLET = '00000000-0000-4000-8000-0000000000a1';

const TB: ProjectTitleBlock = {
  company: null,
  companyName: 'Worth Properties',
  licenseNo: 'CGC1541042',
  projectName: 'Hendricks kitchen',
  address: '336 Golfview Rd',
  codeEdition: 'FBC 9th ed. · NEC 2023',
  scopeOfWork: 'Kitchen remodel: new cabinets, counters and lighting',
  owner: 'Hendricks',
  parcel: '00-43-44-21-01-000-0010',
  drawn: 'JB',
};

const NOTES: SetNotes = {
  general: [
    { id: 'g1', text: 'Verify all dimensions in field before ordering cabinets.', group: 'general' },
    { id: 'g2', text: 'Protect existing finishes to remain.', group: 'general' },
  ],
  required: [{ id: 'r1', text: 'Smoke alarms per FBC R314.', group: 'code' }],
};

const setOf = (sheets: Sheet[], keyPlacement: KeyPlacement = 'every_sheet'): SheetSetSummary[] => [
  { id: null, kind: 'permit', size: '24x36', keyPlacement, lastIssuedVersionId: null, sheets },
];

const floor: ObjectValue = { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } };
const outlet: ObjectValue = {
  type: 'device',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { geometry: { point: { x: 0, y: 0 } }, status: 'new', level: FLOOR, attributes: { kind: 'receptacle_duplex' } },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

// The project's answers: the sets (changeable between loads) and the notes.
function project(sets: { now: SheetSetSummary[] }, notes: unknown = NOTES, notesStatus = 200) {
  return vi.fn(async (url: string) =>
    url.endsWith('/sheet-sets')
      ? new Response(JSON.stringify({ sets: sets.now, titleBlock: TB }), { status: 200 })
      : url.endsWith('/notes')
        ? new Response(JSON.stringify(notes), { status: notesStatus })
        : new Response('{}', { status: 404 }),
  );
}

async function shown(fetchFn: ReturnType<typeof project>) {
  const store = createModelStore({ objects: new Map([[FLOOR, floor], [OUTLET, outlet]]) });
  const renderer: SheetRenderer = { render: vi.fn(async () => ({ markup: '', shown: [] })), dispose: vi.fn() };
  const screen = createSheetsScreen(PROJECT, fetchFn, { loadRenderer: async () => renderer });
  await screen.load();
  screen.setModel(store);
  screen.setShown(true);
  await flush();
  return { screen, renderer };
}

const html = (screen: ReturnType<typeof createSheetsScreen>) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <SheetsCanvas screen={screen} />
    </MessagesProvider>,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const rows = (h: string, block: string) => elements(h, `cover-${block}-row`).map((e) => textOf(e.inner));
const leads = (h: string) => elements(h, 'cover-index-row').map((e) => attr(e.attrs, 'data-lead'));

const NO_RCP = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-728 cover sheet A0.0', () => {
  it('AC-EZD-728-1 adding a sheet to the set adds it to the index on A0.0', async () => {
    const sets = { now: setOf(defaultSheetSet([])) };
    const { screen } = await shown(project(sets));
    expect(screen.get().open).toBe('A0.0');
    const before = html(screen);
    expect(elements(before, 'cover-index')).toHaveLength(1);
    expect(leads(before)).toEqual(NO_RCP);
    expect(rows(before, 'index')).not.toContain('A6.0RCP');

    // Ticking Reflected ceiling plan adds A6.0 to the set (Q-0779); the screen reloads the set.
    sets.now = setOf(defaultSheetSet(['rcp']));
    await screen.load();
    const after = html(screen);
    expect(leads(after)).toEqual(['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0']);
    expect(rows(after, 'index')[6]).toBe('A6.0RCP');
    expect(rows(after, 'index')[0]).toBe('A0.0Cover');
  });

  it('AC-EZD-728-1 any sheet added to the set is a row of the index, in set order', () => {
    const added: Sheet = { number: 'A1.1', title: 'Existing · Second floor', group: 'architectural', viewports: [] };
    const sheets = [...defaultSheetSet([]).slice(0, 2), added, ...defaultSheetSet([]).slice(2)];
    expect(coverIndex(sheets).map((s) => s.number)).toEqual([
      'A0.0', 'A1.0', 'A1.1', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0',
    ]);
    const layout = coverLayout({ size: '24x36', sheets, titleBlock: null, notes: null, keyHeight: null });
    const index = layout.blocks.find((b) => b.id === 'index')!;
    expect(index.title).toBe('SHEET INDEX');
    expect(index.rows.map((r) => r.lead)).toContain('A1.1');
    expect(index.rows[2]!.lines).toEqual(['Existing · Second floor']);
  });

  it('prints the project block, scope of work, general notes and the profile required notes', async () => {
    const { screen, renderer } = await shown(project({ now: setOf(defaultSheetSet([])) }));
    const h = html(screen);
    expect(textOf(elements(h, 'cover-sheet')[0]!.inner)).toContain('Hendricks kitchen');
    expect(rows(h, 'project')).toEqual([
      '336 Golfview Rd',
      'OWNER: Hendricks',
      'PARCEL: 00-43-44-21-01-000-0010',
      'CODE: FBC 9th ed. · NEC 2023',
    ]);
    expect(textOf(elements(h, 'cover-scope')[0]!.inner)).toBe(
      'SCOPE OF WORKKitchen remodel: new cabinets, counters and lighting',
    );
    expect(rows(h, 'general')).toEqual([
      '1.Verify all dimensions in field before ordering cabinets.',
      '2.Protect existing finishes to remain.',
    ]);
    expect(rows(h, 'required')).toEqual(['1.Smoke alarms per FBC R314.']);
    // The cover is drawn in the page, not by the plan renderer.
    expect(renderer.render).not.toHaveBeenCalled();
    expect(h).not.toContain('sheet-drawing');
    // Other sheets have no cover.
    screen.open('A3.0');
    expect(html(screen)).not.toContain('cover-sheet');
  });

  it('carries the set key when the placement is cover only, with the notes under it', async () => {
    const every = await shown(project({ now: setOf(defaultSheetSet([]), 'every_sheet') }));
    expect(elements(html(every.screen), 'symbol-key')).toHaveLength(0);

    const cover = await shown(project({ now: setOf(defaultSheetSet([]), 'cover_only') }));
    const h = html(cover.screen);
    const key = elements(h, 'symbol-key');
    expect(key).toHaveLength(1);
    expect(attr(key[0]!.attrs, 'data-scope')).toBe('set');
    expect(rows(h, 'general')).toHaveLength(2);

    // Layout: the notes start one margin under the key, at the top of the column without one.
    const col = sheetNotesColumn('24x36');
    const { margin } = sheetFrame('24x36');
    const at = (keyHeight: number | null) =>
      coverLayout({ size: '24x36', sheets: [], titleBlock: null, notes: NOTES, keyHeight }).blocks.find(
        (b) => b.id === 'general',
      )!;
    expect(at(null).y).toBeCloseTo(col.y);
    expect(at(2).y).toBeCloseTo(col.y + 2 + margin);
    expect(at(2).x).toBeCloseTo(col.x);
    const general = at(null);
    const required = coverLayout({ size: '24x36', sheets: [], titleBlock: null, notes: NOTES, keyHeight: null })
      .blocks.find((b) => b.id === 'required')!;
    expect(required.y).toBeCloseTo(general.y + general.height + margin);
  });

  it('a failed notes answer leaves the cover without notes and the screen ready', async () => {
    const { screen } = await shown(project({ now: setOf(defaultSheetSet([])) }, { error: {} }, 500));
    expect(screen.get().load).toBe('ready');
    expect(screen.get().notes).toBeNull();
    const h = html(screen);
    expect(elements(h, 'cover-general')).toHaveLength(0);
    expect(leads(h)).toEqual(NO_RCP);
    expect(parseSetNotes({ sets: [] })).toBeNull();
    expect(parseSetNotes(NOTES)).toEqual(NOTES);
  });

  it('wraps note text by words to the column', () => {
    expect(wrapText('Verify all dimensions in field', 12)).toEqual(['Verify all', 'dimensions', 'in field']);
    expect(wrapText('  ', 12)).toEqual([]);
    expect(wrapText('Supercalifragilistic word', 5)).toEqual(['Supercalifragilistic', 'word']);
  });
});
