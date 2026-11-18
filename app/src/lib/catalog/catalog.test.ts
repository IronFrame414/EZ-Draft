// EZD-401 (S09 Decision 1 category order; S09 States "Empty catalog: category list with zero counts"; R23 seed
// line rows B, DB, SB, W, fillers; S04 Height "34 1/2" for base"; 03g lengths to 1/16"). Expected values come
// from those lines, not from running the code.
import { describe, expect, it } from 'vitest';
import {
  CATALOG_CATEGORIES,
  formatInches,
  groupCatalog,
  sizeText,
  type CatalogItem,
} from './catalog';

let n = 0;
const item = (over: Partial<CatalogItem>): CatalogItem => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  category: 'cabinets',
  subcategory: null,
  line: null,
  name: 'Item',
  brand: null,
  model: null,
  width: null,
  depth: null,
  height: null,
  finish: null,
  ...over,
});

describe('EZD-401 catalog grouping', () => {
  it('lists the nine S09 categories in Decision 1 order', () => {
    expect(CATALOG_CATEGORIES).toEqual([
      'cabinets',
      'countertops',
      'tile',
      'plumbing_fixtures',
      'lighting',
      'appliances',
      'hardware',
      'paint',
      'windows_doors',
    ]);
  });

  it('gives every category, with zero counts for empty ones', () => {
    const groups = groupCatalog([item({ category: 'tile', name: 'Subway 3x6' })]);
    expect(groups.map((g) => [g.category, g.count])).toEqual([
      ['cabinets', 0],
      ['countertops', 0],
      ['tile', 1],
      ['plumbing_fixtures', 0],
      ['lighting', 0],
      ['appliances', 0],
      ['hardware', 0],
      ['paint', 0],
      ['windows_doors', 0],
    ]);
    expect(groups[0]!.lines).toEqual([]);
  });

  it('groups a category by line (by name, no line last) and orders B, DB, SB, W, filler then width', () => {
    const items = [
      item({ line: 'Shaker', subcategory: 'base', model: 'B12', width: 12 }),
      item({ line: 'Generic', subcategory: 'filler', model: 'F3', width: 3 }),
      item({ line: 'Generic', subcategory: 'wall', model: 'W9', width: 9 }),
      item({ line: 'Generic', subcategory: 'base', model: 'B36', width: 36 }),
      item({ line: null, subcategory: null, model: 'X1', name: 'Odd' }),
      item({ line: 'Generic', subcategory: 'sink_base', model: 'SB30', width: 30 }),
      item({ line: 'Generic', subcategory: 'drawer_base', model: 'DB9', width: 9 }),
      item({ line: 'Generic', subcategory: 'base', model: 'B9', width: 9 }),
    ];
    const cabinets = groupCatalog(items)[0]!;
    expect(cabinets.count).toBe(8);
    expect(cabinets.lines.map((l) => [l.line, l.items.map((i) => i.model)])).toEqual([
      ['Generic', ['B9', 'B36', 'DB9', 'SB30', 'W9', 'F3']],
      ['Shaker', ['B12']],
      [null, ['X1']],
    ]);
  });
});

describe('EZD-401 size text', () => {
  it('writes inches with a reduced fraction to 1/16 and no inch mark', () => {
    expect(formatInches(36)).toBe('36');
    expect(formatInches(34.5)).toBe('34 1/2');
    expect(formatInches(9.75)).toBe('9 3/4');
    expect(formatInches(0.0625)).toBe('1/16');
  });

  it('joins W × D × H and is null when a size is missing', () => {
    expect(sizeText({ width: 24, depth: 24, height: 34.5 })).toBe('24 × 24 × 34 1/2');
    expect(sizeText({ width: 24, depth: null, height: 34.5 })).toBeNull();
  });
});
