// EZD-706 AC-EZD-706-1 "Deleting the last outlet removes its symbol from the key"; S13 Validation "Key: only symbols
// and abbreviations actually used; updates when objects are added or removed; placement per set"; S13 Decision 8
// "On every sheet" or "On cover only"; board S13Sheets "SYMBOL KEY", "SYMBOLS USED ON THIS SHEET".
import { CURRENT_SCHEMA_VERSION, DEVICE_KEY_TEXT, type KeyPlacement } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { catalogFor } from '../../server/messages/catalog';
import { DETECTOR_TEXT } from '../room-fields/details-drawing';
import type { SheetRenderer } from '../sheets';
import { SheetsCanvas } from './SheetsCanvas';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const OUTLET_1 = '00000000-0000-4000-8000-0000000000a1';
const OUTLET_2 = '00000000-0000-4000-8000-0000000000a2';
const SWITCH = '00000000-0000-4000-8000-0000000000b1';

const sets = (keyPlacement: KeyPlacement): SheetSetSummary[] => [
  { id: null, kind: 'permit', size: '24x36', keyPlacement, lastIssuedVersionId: null, sheets: defaultSheetSet([]) },
];

const floor: ObjectValue = { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } };
const device = (kind: string, x: number): ObjectValue => ({
  type: 'device',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { geometry: { point: { x, y: 0 } }, status: 'new', level: FLOOR, attributes: { kind } },
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(keyPlacement: KeyPlacement, open: string) {
  const store = createModelStore({
    objects: new Map([
      [FLOOR, floor],
      [OUTLET_1, device('receptacle_duplex', 0)],
      [OUTLET_2, device('receptacle_duplex', 48)],
      [SWITCH, device('switch_single', 96)],
    ]),
  });
  const renderer: SheetRenderer = {
    render: vi.fn(async () => ({ markup: '', shown: [] })),
    dispose: vi.fn(),
  };
  const fetchSets = async () => new Response(JSON.stringify({ sets: sets(keyPlacement) }), { status: 200 });
  const screen = createSheetsScreen(PROJECT, fetchSets, { loadRenderer: async () => renderer });
  await screen.load();
  screen.setModel(store);
  screen.open(open);
  screen.setShown(true);
  await flush();
  return { store, screen };
}

const html = (screen: ReturnType<typeof createSheetsScreen>) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <SheetsCanvas screen={screen} />
    </MessagesProvider>,
  );
const rows = (markup: string) => [...markup.matchAll(/data-symbol="([^"]+)"/g)].map((m) => m[1]);

describe('EZD-706 symbol key on the sheet', () => {
  it('AC-EZD-706-1 deleting the last outlet removes its symbol from the key', async () => {
    const { store, screen } = await setup('every_sheet', 'E1.0');
    let page = html(screen);
    expect(page).toContain('SYMBOL KEY');
    expect(page).toContain('SYMBOLS USED ON THIS SHEET');
    expect(rows(page)).toEqual(['device.receptacle_duplex', 'device.switch_single']);
    expect(page).toContain('Duplex receptacle');

    // One outlet deleted: another is left, so the symbol stays.
    store.applyEdit([{ id: OUTLET_1, value: null }]);
    await flush();
    expect(rows(html(screen))).toEqual(['device.receptacle_duplex', 'device.switch_single']);

    // The last outlet deleted: its symbol leaves the key; the switch stays.
    store.applyEdit([{ id: OUTLET_2, value: null }]);
    await flush();
    page = html(screen);
    expect(rows(page)).toEqual(['device.switch_single']);
    expect(page).not.toContain('Duplex receptacle');

    // Nothing used: no key at all.
    store.applyEdit([{ id: SWITCH, value: null }]);
    await flush();
    expect(html(screen)).not.toContain('data-testid="symbol-key"');
  });

  it('adding an object adds its symbol', async () => {
    const { store, screen } = await setup('every_sheet', 'A1.0');
    store.applyEdit([{ id: '00000000-0000-4000-8000-0000000000c1', value: device('tv', 10) }]);
    await flush();
    expect(rows(html(screen))).toEqual(['device.receptacle_duplex', 'device.switch_single', 'device.tv']);
  });

  it('S13 Decision 8 on every sheet: each plan sheet has its key, the cover has none', async () => {
    const { screen } = await setup('every_sheet', 'A0.0');
    expect(html(screen)).not.toContain('data-testid="symbol-key"');
    screen.open('A3.0');
    expect(html(screen)).toContain('data-scope="sheet"');
  });

  it('S13 Decision 8 on cover only: the cover keys the set, the plan sheets have none', async () => {
    const { screen } = await setup('cover_only', 'A0.0');
    const cover = html(screen);
    expect(cover).toContain('data-scope="set"');
    expect(cover).toContain('SYMBOLS USED IN THIS SET');
    expect(rows(cover)).toEqual(['device.receptacle_duplex', 'device.switch_single']);
    screen.open('E1.0');
    expect(html(screen)).not.toContain('data-testid="symbol-key"');
  });

  it("the placement of the model's live sheet_set object wins over the loaded one", async () => {
    const { store, screen } = await setup('every_sheet', 'A1.0');
    store.applyEdit([
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        value: {
          type: 'sheet_set',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            kind: 'permit',
            sheetIds: [],
            size: '24x36',
            keyPlacement: 'cover_only',
            submittalProfileId: null,
            lastIssuedVersionId: null,
          },
        },
      },
    ]);
    await flush();
    expect(html(screen)).not.toContain('data-testid="symbol-key"');
    screen.open('A0.0');
    expect(html(screen)).toContain('data-scope="set"');
  });

  it("a device's key mark carries the plan's letters", () => {
    expect(DEVICE_KEY_TEXT).toEqual(DETECTOR_TEXT);
  });
});
