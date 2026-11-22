// EZD-710 (AC-EZD-710-1 "Every sheet shows a complete title block for a filled project"; S13 Data shown "Title block";
// S13 Decisions 5, 10). Expected values: S13 Decision 1 (the ten default sheets with the RCP box), S13 Data shown
// ("sheet x of y", license CGC1541042), the S13 size toggle (permit 24x36, client 11x17), S13 Numbering (Rev 0 draft).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import type { ProjectTitleBlock } from '../../lib/title-block/sheet-title-block';
import { titleBlockColumn } from '../../components/sheets/SheetTitleBlock';
import { createSheetsScreen } from './sheets-screen-store';
import { SheetsCanvas } from './SheetsCanvas';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const ALL = defaultSheetSet(['rcp']);
const SETS: SheetSetSummary[] = [
  { id: null, kind: 'permit', size: '24x36', keyPlacement: 'every_sheet', lastIssuedVersionId: null, sheets: ALL },
  {
    id: null,
    kind: 'client',
    size: '11x17',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: ALL.filter((s) => s.number === 'R1.0'),
  },
];
const TB: ProjectTitleBlock = {
  company: { name: 'Worth Properties', licenseNo: 'CGC1541042', contact: { phone: '561-806-8987' }, logoUrl: null },
  companyName: 'Worth Properties',
  licenseNo: 'CGC1541042',
  projectName: 'Kitchen remodel',
  address: '336 Golfview Rd',
  codeEdition: 'FBC 9th ed. · NEC 2023',
  scopeOfWork: 'Kitchen remodel',
  owner: 'Hendricks',
  parcel: '00-43-44-21-01-000-0010',
  drawn: 'JB',
};

const html = (screen: ReturnType<typeof createSheetsScreen>) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <SheetsCanvas screen={screen} />
    </MessagesProvider>,
  );
const field = (h: string, f: string): string[] =>
  [...h.matchAll(new RegExp(`data-field="${f}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]!);

async function loaded(body: unknown) {
  const screen = createSheetsScreen(
    PROJECT,
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
  await screen.load();
  return screen;
}

describe('EZD-710 title block on the sheet canvas', () => {
  it('the 24x36 title block column is 4.5" wide and 23" tall inside the 0.5" border', () => {
    expect(titleBlockColumn('24x36')).toEqual({ x: 31, y: 0.5, width: 4.5, height: 23 });
  });

  it('AC-EZD-710-1 every permit sheet shows the complete title block', async () => {
    const screen = await loaded({ sets: SETS, titleBlock: TB });
    ALL.forEach((sheet, i) => {
      screen.open(sheet.number);
      const h = html(screen);
      expect(h).toContain('data-testid="title-block"');
      expect(field(h, 'company')).toEqual(['WORTH PROPERTIES']);
      expect(field(h, 'license')).toEqual(['CGC1541042']);
      expect(field(h, 'project')).toEqual(['KITCHEN REMODEL']);
      expect(field(h, 'address')).toEqual(['336 Golfview Rd']);
      expect(field(h, 'code_edition')).toEqual(['FBC 9th ed. · NEC 2023']);
      expect(field(h, 'scope_of_work')).toEqual(['Kitchen remodel']);
      expect(field(h, 'owner')).toEqual(['Hendricks']);
      expect(field(h, 'parcel')).toEqual(['00-43-44-21-01-000-0010']);
      expect(field(h, 'drawn')).toEqual(['JB']);
      expect(field(h, 'date')[0]).toMatch(/^\d\d\/\d\d\/\d\d$/);
      expect(field(h, 'sheet_number')).toEqual([sheet.number]);
      expect(field(h, 'sheet_title')).toEqual([sheet.title.toUpperCase().replace(/&/g, '&amp;')]);
      expect(field(h, 'revision')).toEqual(['REV 0']);
      expect(field(h, 'sheet_of')).toEqual([`${i + 1} OF 10`]);
      expect(h).toContain('data-part="seal"');
      expect(h).toContain('data-part="stamp"');
    });
  });

  it('the client set sheet has the title block without stamp areas (S13 Decision 10)', async () => {
    const screen = await loaded({ sets: SETS, titleBlock: TB });
    screen.chooseSet('client');
    const h = html(screen);
    expect(field(h, 'sheet_of')).toEqual(['1 OF 1']);
    expect(h).not.toContain('data-part="seal"');
    expect(h).not.toContain('data-part="stamp"');
  });

  it('an answer without a title block keeps the sheet number in the column', async () => {
    const screen = await loaded({ sets: SETS });
    expect(screen.get().titleBlock).toBeNull();
    expect(html(screen)).not.toContain('data-testid="title-block"');
  });
});
