// EZD-401 (S09 Layout "category nav column", Decision 1; S04 "Line: [Supplier] Shaker"; AC-EZD-401-1). Server
// markup of the picker view (the unit project has no DOM): the category column with counts, the active
// category's items under their line heading, and the empty line for a category with no items. Loading from
// GET /api/catalog is proven in app/e2e/catalog-picker.spec.ts.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogCategory, CatalogItem } from '../../lib/catalog/catalog';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { CatalogPickerView } from './CatalogPicker';

const cab = (model: string, sub: string, width: number, line = 'Generic'): CatalogItem => ({
  id: `id-${line}-${model}`,
  category: 'cabinets',
  subcategory: sub,
  line,
  name: sub === 'wall' ? 'Wall cabinet' : 'Base cabinet',
  brand: null,
  model,
  width,
  depth: sub === 'wall' ? 12 : 24,
  height: sub === 'wall' ? 30 : 34.5,
  finish: null,
});

const ITEMS = [cab('W12', 'wall', 12), cab('B9', 'base', 9), cab('B15', 'base', 15, 'Shaker')];

const html = (initialCategory?: CatalogCategory) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <CatalogPickerView items={ITEMS} initialCategory={initialCategory} />
    </MessagesProvider>,
  );

const categories = (markup: string) =>
  Array.from(
    markup.matchAll(
      /<button[^>]*aria-pressed="(true|false)"[^>]*data-testid="catalog-category-[a-z_]+"[^>]*><span>([^<]*)<\/span><span[^>]*>(\d+)<\/span>/g,
    ),
    (m) => ({ on: m[1] === 'true', label: m[2], count: Number(m[3]) }),
  );

describe('EZD-401 CatalogPickerView markup', () => {
  it('lists the nine categories with counts and opens the first with items', () => {
    const c = categories(html());
    expect(c.map((x) => [x.label, x.count])).toEqual([
      ['Cabinets', 3],
      ['Countertops', 0],
      ['Tile', 0],
      ['Plumbing fixtures', 0],
      ['Lighting', 0],
      ['Appliances', 0],
      ['Hardware', 0],
      ['Paint', 0],
      ['Windows and doors', 0],
    ]);
    expect(c.filter((x) => x.on).map((x) => x.label)).toEqual(['Cabinets']);
  });

  it('shows the items under their line, with code, name and W × D × H', () => {
    const markup = html();
    const heads = Array.from(markup.matchAll(/<h3[^>]*><span>([^<]*)<\/span><span[^>]*>(\d+)/g), (m) => [
      m[1],
      Number(m[2]),
    ]);
    expect(heads).toEqual([
      ['Line: Generic', 2],
      ['Line: Shaker', 1],
    ]);
    const codes = Array.from(markup.matchAll(/data-testid="catalog-item"[^>]*><span[^>]*>([^<]*)/g), (m) => m[1]);
    expect(codes).toEqual(['B9', 'W12', 'B15']);
    expect(markup).toContain('9 × 24 × 34 1/2');
    expect(markup).toContain('12 × 12 × 30');
  });

  it('shows the empty line for a category with no items', () => {
    expect(html('tile')).toContain('No items in this category yet.');
  });
});
