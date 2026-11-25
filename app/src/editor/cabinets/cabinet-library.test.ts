// EZD-403 (S04 Controls (left panel) "Search 'Code or size, e.g. B24' | Filters library rows by code or size | Matches
// code prefix and width"; "Library row B9–B24 'Base, 1 door' ... Width set by typing in the dimension bar on drop, in
// 3" steps within the range"; "Library row W1230+ 'Wall, 30" tall' | ... placed in the upper row"; "Library row T1884
// 'Tall pantry' | ... spans base and upper rows"; "F3 'Filler, scribe' | Carries a scribe allowance"; S04 Validation
// "custom boxes allowed outside increments"; AC-EZD-403-1). Expected values: the row codes and names on board S04,
// base 24" deep and 34 1/2" tall (S04 inspector "Height (34 1/2" for base)"), the 3" step.
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../lib/catalog/catalog';
import {
  LIBRARY_ROWS,
  libraryCatalogItem,
  libraryCode,
  libraryItemFor,
  libraryLineItems,
  libraryLines,
  libraryObject,
  libraryRow,
  libraryWidthOk,
  libraryWidths,
  readLibraryDrag,
  searchLibrary,
} from './cabinet-library';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const ID = 'c0000000-0000-4000-8000-000000000500';
const row = (key: string) => {
  const r = libraryRow(key);
  if (r === null) throw new Error(key);
  return r;
};

describe('EZD-403 library rows', () => {
  it('lists the board S04 rows in its order', () => {
    expect(LIBRARY_ROWS.map((r) => r.label)).toEqual([
      'B9–B24',
      'B27–B36',
      'DB12–36',
      'SB30–36',
      'BBC42',
      'W1230+',
      'T1884',
      'F3',
      'EP',
      'DWP',
    ]);
  });

  it('B9–B24 places 9" to 24" in 3" steps', () => {
    expect(libraryWidths(row('b1'))).toEqual([9, 12, 15, 18, 21, 24]);
    expect(libraryWidths(row('b2'))).toEqual([27, 30, 33, 36]);
    expect(libraryWidthOk(row('b1'), 24, false)).toBe(true);
    expect(libraryWidthOk(row('b1'), 25, false)).toBe(false);
    expect(libraryWidthOk(row('b1'), 27, false)).toBe(false);
    // Custom boxes: any width above 0.
    expect(libraryWidthOk(row('b1'), 25, true)).toBe(true);
    expect(libraryWidthOk(row('b1'), 0, true)).toBe(false);
  });

  it('a B24 is a base box 24" wide, 24" deep, 34 1/2" tall, code B24, status New', () => {
    const o = libraryObject(row('b1'), 24, ID, LEVEL, null);
    expect(o.type).toBe('cabinet_box');
    if (o.type !== 'cabinet_box') return;
    expect(o.data.attributes).toMatchObject({
      code: 'B24',
      boxType: 'base',
      width: 24,
      depth: 24,
      height: 34.5,
      catalogItemId: null,
    });
    expect(o.data.status).toBe('new');
    expect(o.data.level).toBe(LEVEL);
  });

  it('codes carry the width; W and T also their height (W1230 is 12" wide, 30" tall)', () => {
    expect(libraryCode(row('w'), 12)).toBe('W1230');
    expect(libraryCode(row('w'), 30)).toBe('W3030');
    expect(libraryCode(row('t'), 18)).toBe('T1884');
    expect(libraryCode(row('db'), 18)).toBe('DB18');
    expect(libraryCode(row('ep'), 0.75)).toBe('EP');
    expect(row('w').row).toBe('upper');
    expect(row('t').row).toBe('base');
    const w = libraryObject(row('w'), 12, ID, LEVEL, null);
    if (w.type !== 'cabinet_box') throw new Error('box');
    expect(w.data.attributes).toMatchObject({ boxType: 'wall', height: 30 });
  });

  it('a filler carries a scribe allowance no wider than itself; EP is an end panel 3/4" wide', () => {
    const f = libraryObject(row('f'), 3, ID, LEVEL, null);
    if (f.type !== 'cabinet_filler') throw new Error('filler');
    expect(f.data.attributes.scribe).toBeGreaterThan(0);
    expect(f.data.attributes.scribe).toBeLessThanOrEqual(3);
    const ep = libraryObject(row('ep'), 0.75, ID, LEVEL, null);
    if (ep.type !== 'cabinet_panel') throw new Error('panel');
    expect(ep.data.attributes).toMatchObject({ kind: 'end', width: 0.75 });
  });
});

describe('EZD-403 search: code prefix and width', () => {
  const labels = (q: string) => searchLibrary(q).rows.map((m) => m.row.label);
  it('"B24" keeps only B9–B24 and names 24"', () => {
    expect(labels('B24')).toEqual(['B9–B24']);
    expect(searchLibrary('b24').rows[0]?.width).toBe(24);
  });
  it('a size alone keeps every row with that width', () => {
    expect(labels('36')).toEqual(['B27–B36', 'DB12–36', 'SB30–36', 'W1230+']);
  });
  it('letters alone match the code prefix: "B" keeps B, BBC; "DB" keeps the drawer base', () => {
    expect(labels('B')).toEqual(['B9–B24', 'B27–B36', 'BBC42']);
    expect(labels('DB')).toEqual(['DB12–36']);
  });
  it('W1530 reads 15" wide, 30" tall', () => {
    const r = searchLibrary('W1530').rows;
    expect(r.map((m) => [m.row.label, m.width])).toEqual([['W1230+', 15]]);
  });
  it('a width out of every range or other text keeps none; empty keeps all, trims too', () => {
    expect(labels('B25')).toEqual([]);
    expect(labels('sink!')).toEqual([]);
    expect(labels('')).toHaveLength(10);
    expect(searchLibrary('').trims.map((t) => t.trim.code)).toEqual(['TK', 'LR', 'CM']);
    expect(searchLibrary('CM').trims.map((t) => t.trim.code)).toEqual(['CM']);
  });
});

describe('EZD-403 lines', () => {
  const item = (o: Partial<CatalogItem>): CatalogItem => ({
    id: 'i',
    category: 'cabinets',
    subcategory: 'base',
    line: 'Generic',
    name: 'Base',
    brand: null,
    model: null,
    width: 24,
    depth: 24,
    height: 34.5,
    finish: null,
    ...o,
  });
  const items = [
    item({ id: 'g24' }),
    item({ id: 's24', line: 'Shaker' }),
    item({ id: 's30', line: 'Shaker', subcategory: 'sink_base', width: 30 }),
    item({ id: 'tile', category: 'tile', line: 'Zellige' }),
  ];
  it('lists the cabinet lines by name', () => {
    expect(libraryLines(items)).toEqual(['Generic', 'Shaker']);
  });
  it('a B24 in the Shaker line takes the Shaker base 24" item; none without a line', () => {
    expect(libraryCatalogItem(items, 'Shaker', row('b1'), 24)?.id).toBe('s24');
    expect(libraryCatalogItem(items, 'Shaker', row('b1'), 21)).toBeNull();
    expect(libraryCatalogItem(items, null, row('b1'), 24)).toBeNull();
  });
  it('a drag carries the line item of each width; a typed width takes its own', () => {
    const byWidth = libraryLineItems(items, 'Generic', row('b1'));
    expect(byWidth).toEqual({ '24': 'g24' });
    expect(libraryItemFor(byWidth, 24)).toBe('g24');
    expect(libraryItemFor(byWidth, 21)).toBeNull();
  });
});

describe('EZD-403 drag data', () => {
  it('reads a row drag and a trim drag; refuses a width the row does not place', () => {
    const ok = { kind: 'row', key: 'b1', width: 24, custom: false, items: { '24': 'g24' } };
    expect(readLibraryDrag(JSON.stringify(ok))).toEqual(ok);
    expect(readLibraryDrag(JSON.stringify({ ...ok, width: 25 }))).toBeNull();
    expect(readLibraryDrag(JSON.stringify({ ...ok, width: 25, custom: true }))?.kind).toBe('row');
    expect(readLibraryDrag(JSON.stringify({ kind: 'trim', trim: 'crown' }))).toEqual({
      kind: 'trim',
      trim: 'crown',
    });
    expect(readLibraryDrag('not json')).toBeNull();
    expect(readLibraryDrag(JSON.stringify({ kind: 'row', key: 'zz', width: 3 }))).toBeNull();
  });
});
