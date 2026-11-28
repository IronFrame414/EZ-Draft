// EZD-720 (AC-EZD-720-1 "Switching to the Client set shows the countertop sheets"; AC-EZD-720-2 "the Permit set never
// contains them"). On the Sheets screen the client set's countertop sheets (A8.0 Countertop plan, A9.0 Edge details;
// vault/build/assumptions/EZD-720.md Settled) follow the live model: they come with the first countertop piece and go
// with the last, and the permit set never lists them. The pieces are EZD-418's board tops
// (editor/countertops/test-fixture.ts).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { elements } from '../../../test-harness/projects-markup';
import { defaultSheetSet, sheetsForSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { createModelStore } from '../../editor/model/model-store';
import { boardPiecesModel, CT_FLOOR } from '../../editor/countertops/test-fixture';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { SheetRenderer, SheetRenderRequest } from '../sheets';
import { createSheetsScreen } from './sheets-screen-store';
import { SheetsPanel } from './SheetsPanel';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const SETS: SheetSetSummary[] = [
  { id: null, kind: 'permit', size: '24x36', keyPlacement: 'every_sheet', lastIssuedVersionId: null, sheets: defaultSheetSet([]) },
  { id: null, kind: 'client', size: '11x17', keyPlacement: 'every_sheet', lastIssuedVersionId: null, sheets: sheetsForSet('client', []) },
];
const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const flush = () => new Promise((r) => setTimeout(r, 0));

const floorOnly = (): Map<string, ObjectValue> =>
  new Map([[CT_FLOOR, { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } }]]);

function setup() {
  const store = createModelStore({ objects: floorOnly() });
  const asked: SheetRenderRequest[] = [];
  const renderer: SheetRenderer = {
    render: vi.fn(async (req: SheetRenderRequest) => {
      asked.push(req);
      return { markup: '', shown: [] };
    }),
    dispose: vi.fn(),
  };
  const fetchFn = vi.fn(async (url: string) =>
    url.endsWith('/sheet-sets')
      ? new Response(JSON.stringify({ sets: SETS }), { status: 200 })
      : new Response('{}', { status: 404 }),
  );
  const screen = createSheetsScreen(PROJECT, fetchFn, { loadRenderer: async () => renderer });
  return { store, screen, asked, fetchFn };
}

const numbers = (screen: ReturnType<typeof setup>['screen'], kind: 'permit' | 'client') =>
  screen.get().sets.find((s) => s.kind === kind)?.sheets.map((s) => s.number);

const html = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {node}
    </MessagesProvider>,
  );

describe('EZD-720 client set countertop sheets on the Sheets screen', () => {
  it('AC-1: placing tops adds A8.0 and A9.0 to the client set; switching to it lists them; the permit set never does', async () => {
    const { store, screen } = setup();
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    expect(numbers(screen, 'client')).toEqual(['R1.0']);

    const tops = [...boardPiecesModel()].filter(([, v]) => v.type === 'countertop_piece');
    store.applyEdit(tops.map(([id, value]) => ({ id, value })));
    expect(numbers(screen, 'client')).toEqual(['A8.0', 'A9.0', 'R1.0']);
    expect(numbers(screen, 'permit')).toEqual(NINE);

    screen.chooseSet('client');
    const h = html(<SheetsPanel screen={screen} canEdit={false} />);
    expect(elements(h, 'sheet-row-A8.0')).toHaveLength(1);
    expect(elements(h, 'sheet-row-A9.0')).toHaveLength(1);

    screen.chooseSet('permit');
    const p = html(<SheetsPanel screen={screen} canEdit={false} />);
    expect(elements(p, 'sheet-row-A8.0')).toHaveLength(0);
    expect(elements(p, 'sheet-row-A9.0')).toHaveLength(0);

    // The last top removed: the countertop sheets leave the client set.
    store.applyEdit(tops.map(([id]) => ({ id, value: null })));
    expect(numbers(screen, 'client')).toEqual(['R1.0']);
  });

  it('AC-1: the open A8.0 is drawn with the model and the names it prints, read once', async () => {
    const { store, screen, asked, fetchFn } = setup();
    store.applyEdit(
      [...boardPiecesModel()].filter(([, v]) => v.type === 'countertop_piece').map(([id, value]) => ({ id, value })),
    );
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.chooseSet('client');
    screen.open('A8.0');
    await flush();
    await flush();
    expect(asked.some((r) => r.sheet === 'A8.0' && r.names !== undefined)).toBe(true);
    screen.open('A9.0');
    await flush();
    expect(asked.some((r) => r.sheet === 'A9.0')).toBe(true);
    const nameReads = fetchFn.mock.calls.filter(([u]) => u === '/api/edge-profiles');
    expect(nameReads).toHaveLength(1);
  });
});
