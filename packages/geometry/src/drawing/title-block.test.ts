// EZD-710 (S13 Data shown "Title block", Decisions 5, 6, 10; S15b Decisions 1-3; Q-0182; AC-EZD-710-1): the sheet
// title block's layout and markup. Expected sizes come from the spec: the seal box is 3" x 3" (S13 Data shown), the
// 24x36 sheet is 36" x 24" with the border 24/48 = 0.5" in and the title block column 36/8 = 4.5" wide (board
// S13Sheets, EZD-702a sheetFrame), so the column is 4.5" x 23". 11x17 is the same block scaled (board S15b).
import { describe, expect, it } from 'vitest';
import {
  SEAL_BOX_IN,
  titleBlockLayout,
  titleBlockSvg,
  wrapText,
  type TitleBlockRect,
  type TitleBlockValues,
} from '../index';

const COL_24X36: TitleBlockRect = { x: 36 - 0.5 - 4.5, y: 0.5, width: 4.5, height: 23 };
const COL_11X17: TitleBlockRect = {
  x: 17 - 11 / 48 - 17 / 8,
  y: 11 / 48,
  width: 17 / 8,
  height: 11 - 2 * (11 / 48),
};

const VALUES: TitleBlockValues = {
  company: {
    name: 'Worth Properties',
    license: 'CGC1541042',
    contact: ['561-806-8987', 'worthprop.com'],
    logoUrl: 'https://example.test/logo.png?a=1&b=2',
  },
  projectName: 'Kitchen remodel',
  address: '336 Golfview Rd',
  codeEdition: 'FBC 9th ed. · NEC 2023',
  scopeOfWork: 'Kitchen remodel: new cabinets & counters',
  owner: 'Hendricks',
  parcel: '00-43-44-21-01-000-0010',
  revisions: [{ no: '0', date: '09/29/26', description: 'Permit set' }],
  stampAreas: true,
  drawn: 'JB',
  checked: '',
  date: '10/11/26',
  scale: 'AS NOTED',
  sheetTitle: 'Proposed',
  sheetNumber: 'A3.0',
  revision: 'REV 0',
  sheetOf: '4 OF 10',
};

const inside = (r: TitleBlockRect, c: TitleBlockRect) =>
  r.x >= c.x - 1e-9 &&
  r.y >= c.y - 1e-9 &&
  r.x + r.width <= c.x + c.width + 1e-9 &&
  r.y + r.height <= c.y + c.height + 1e-9;
const overlap = (a: TitleBlockRect, b: TitleBlockRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const fieldText = (markup: string, field: string): string[] =>
  [...markup.matchAll(new RegExp(`data-field="${field}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]!);

describe('EZD-710 titleBlockLayout', () => {
  it('24x36: the seal box is 3" x 3", the stamp area is a separate box, both inside the column', () => {
    const L = titleBlockLayout(COL_24X36, true);
    expect(L.k).toBe(1);
    expect(SEAL_BOX_IN).toBe(3);
    expect(L.seal!.width).toBeCloseTo(3, 9);
    expect(L.seal!.height).toBeCloseTo(3, 9);
    expect(L.stamp).not.toBeNull();
    expect(overlap(L.seal!, L.stamp!)).toBe(false);
    for (const r of [L.company, L.project, L.revisions, L.seal!, L.stamp!, L.signature!, L.drawn, L.checked, L.date, L.scale, L.sheetTitle, L.sheet]) {
      expect(inside(r, COL_24X36)).toBe(true);
      expect(r.height).toBeGreaterThan(0);
    }
    // The sheet box ends at the column's bottom.
    expect(L.sheet.y + L.sheet.height).toBeCloseTo(23.5, 9);
  });

  it('a set without stamp areas (client set) has no seal box and no stamp area', () => {
    const L = titleBlockLayout(COL_24X36, false);
    expect(L.seal).toBeNull();
    expect(L.stamp).toBeNull();
    expect(L.signature).toBeNull();
  });

  it('11x17 is the same block scaled by the column height: the seal box stays square and inside', () => {
    const L = titleBlockLayout(COL_11X17, true);
    expect(L.k).toBeCloseTo(COL_11X17.height / 23, 9);
    expect(L.seal!.width).toBeCloseTo(3 * L.k, 9);
    expect(L.seal!.height).toBeCloseTo(L.seal!.width, 9);
    for (const r of [L.seal!, L.stamp!, L.sheet]) expect(inside(r, COL_11X17)).toBe(true);
  });
});

describe('EZD-710 titleBlockSvg', () => {
  it('prints every title block field (S13 Data shown)', () => {
    const svg = titleBlockSvg(VALUES, COL_24X36);
    expect(fieldText(svg, 'company')).toEqual(['WORTH PROPERTIES']);
    expect(fieldText(svg, 'license')).toEqual(['CGC1541042']);
    expect(fieldText(svg, 'contact')).toEqual(['561-806-8987', 'worthprop.com']);
    expect(fieldText(svg, 'project')).toEqual(['KITCHEN REMODEL']);
    expect(fieldText(svg, 'address')).toEqual(['336 Golfview Rd']);
    expect(fieldText(svg, 'code_edition')).toEqual(['FBC 9th ed. · NEC 2023']);
    expect(fieldText(svg, 'scope_of_work').join(' ')).toBe('Kitchen remodel: new cabinets &amp; counters');
    expect(fieldText(svg, 'owner')).toEqual(['Hendricks']);
    expect(fieldText(svg, 'parcel')).toEqual(['00-43-44-21-01-000-0010']);
    expect(fieldText(svg, 'revision_no')).toEqual(['0']);
    expect(fieldText(svg, 'revision_date')).toEqual(['09/29/26']);
    expect(fieldText(svg, 'revision_description')).toEqual(['Permit set']);
    expect(fieldText(svg, 'drawn')).toEqual(['JB']);
    expect(fieldText(svg, 'date')).toEqual(['10/11/26']);
    expect(fieldText(svg, 'scale')).toEqual(['AS NOTED']);
    expect(fieldText(svg, 'sheet_title')).toEqual(['PROPOSED']);
    expect(fieldText(svg, 'sheet_number')).toEqual(['A3.0']);
    expect(fieldText(svg, 'revision')).toEqual(['REV 0']);
    expect(fieldText(svg, 'sheet_of')).toEqual(['4 OF 10']);
    for (const l of ['LICENSE', 'PROJECT', 'OWNER', 'PCN', 'From property appraiser link', 'REVISIONS', 'NO', 'DESCRIPTION', 'SEAL', 'DEPT. APPROVAL', 'SIGNATURE', 'DRAWN', 'CHECKED', 'SCALE', 'SHEET TITLE', 'SHEET']) {
      expect(svg).toContain(`>${l}</text>`);
    }
    expect(svg).toContain('data-part="seal"');
    expect(svg).toContain('data-part="stamp"');
    expect(svg).toContain('href="https://example.test/logo.png?a=1&amp;b=2"');
  });

  it('code edition and scope of work print under the address (S13 Decision 6)', () => {
    const svg = titleBlockSvg(VALUES, COL_24X36);
    const y = (field: string) =>
      Number(new RegExp(`y="([^"]+)"[^>]*data-field="${field}"`).exec(svg)![1]);
    expect(y('code_edition')).toBeGreaterThan(y('address'));
    expect(y('scope_of_work')).toBeGreaterThan(y('address'));
    expect(y('owner')).toBeGreaterThan(y('scope_of_work'));
  });

  it('the company switch off drops logo, company, license and contact; the client set drops both blank areas', () => {
    const svg = titleBlockSvg({ ...VALUES, company: null, stampAreas: false }, COL_24X36);
    for (const f of ['company', 'license', 'contact']) expect(fieldText(svg, f)).toEqual([]);
    expect(svg).not.toContain('data-part="logo"');
    expect(svg).not.toContain('data-part="seal"');
    expect(svg).not.toContain('data-part="stamp"');
    expect(fieldText(svg, 'sheet_number')).toEqual(['A3.0']);
  });

  it('escapes typed text', () => {
    const svg = titleBlockSvg({ ...VALUES, owner: '<script>"x"</script>' }, COL_24X36);
    expect(svg).not.toContain('<script>');
    expect(fieldText(svg, 'owner')).toEqual(['&lt;script&gt;&quot;x&quot;&lt;/script&gt;']);
  });
});

describe('EZD-710 wrapText', () => {
  it('keeps each line inside the width and keeps every word', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', 1, 7 / 72, 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('one two three four five six seven eight nine ten');
  });
  it('cuts to maxLines with an ellipsis', () => {
    const lines = wrapText('a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(4), 0.5, 7 / 72, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });
});
