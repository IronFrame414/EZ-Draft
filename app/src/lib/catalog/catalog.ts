// EZD-401 (03c catalog_item; S09 Decisions 1, Layout "category nav column"; S04 line picker; R23): the catalog
// categories in S09 order, the item shape the picker reads (no money: prices on the picker are phase 16), and
// the grouping by category and line. Browser and server.
import type { MessageKey } from '../../server/messages/catalog';

// S09 Decision 1: Cabinets, Countertops, Tile, Plumbing fixtures, Lighting, Appliances, Hardware, Paint, Windows
// and doors. The slugs are the catalog_item.category check values.
export const CATALOG_CATEGORIES = [
  'cabinets',
  'countertops',
  'tile',
  'plumbing_fixtures',
  'lighting',
  'appliances',
  'hardware',
  'paint',
  'windows_doors',
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<CatalogCategory, MessageKey>> = {
  cabinets: 'office.catalog.category.cabinets',
  countertops: 'office.catalog.category.countertops',
  tile: 'office.catalog.category.tile',
  plumbing_fixtures: 'office.catalog.category.plumbing_fixtures',
  lighting: 'office.catalog.category.lighting',
  appliances: 'office.catalog.category.appliances',
  hardware: 'office.catalog.category.hardware',
  paint: 'office.catalog.category.paint',
  windows_doors: 'office.catalog.category.windows_doors',
};

export function isCatalogCategory(v: string): v is CatalogCategory {
  return (CATALOG_CATEGORIES as readonly string[]).includes(v);
}

// The R23 seed line rows in their order (S04 library rows B, DB, SB, W, F); other sub-categories follow by name.
export const CABINET_SUBCATEGORY_ORDER = ['base', 'drawer_base', 'sink_base', 'wall', 'filler'] as const;

export type CatalogItem = {
  id: string;
  category: CatalogCategory;
  subcategory: string | null;
  line: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  finish: string | null;
  // EZD-406: the company cost, sent only to a member with See company costs (absent otherwise; null when the item
  // has none on record).
  unitCost?: number | null;
};

export type CatalogLineGroup = { line: string | null; items: CatalogItem[] };
export type CatalogCategoryGroup = {
  category: CatalogCategory;
  count: number;
  lines: CatalogLineGroup[];
};

function subRank(sub: string | null): number {
  const i = sub === null ? -1 : (CABINET_SUBCATEGORY_ORDER as readonly string[]).indexOf(sub);
  return i === -1 ? CABINET_SUBCATEGORY_ORDER.length : i;
}

const text = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');

function compareItems(a: CatalogItem, b: CatalogItem): number {
  return (
    subRank(a.subcategory) - subRank(b.subcategory) ||
    text(a.subcategory, b.subcategory) ||
    (a.width ?? Infinity) - (b.width ?? Infinity) ||
    text(a.name, b.name) ||
    text(a.model, b.model) ||
    text(a.id, b.id)
  );
}

// Every category in S09 order (zero counts included: S09 States "Empty catalog: category list with zero
// counts"); within one, lines by name with items that have no line last; within a line, the R23 sub-category
// order, then width.
export function groupCatalog(items: readonly CatalogItem[]): CatalogCategoryGroup[] {
  return CATALOG_CATEGORIES.map((category) => {
    const inCategory = items.filter((i) => i.category === category);
    const names = [...new Set(inCategory.map((i) => i.line))].sort((a, b) =>
      a === null ? 1 : b === null ? -1 : a.localeCompare(b),
    );
    return {
      category,
      count: inCategory.length,
      lines: names.map((line) => ({
        line,
        items: inCategory.filter((i) => i.line === line).sort(compareItems),
      })),
    };
  });
}

// One length in inches as whole inches and a reduced fraction to 1/16" (03g), without the inch mark, as the
// S09 card size line ("32 × 19 × 10").
export function formatInches(inches: number): string {
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths - whole * 16;
  let den = 16;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) return `${whole}`;
  return whole === 0 ? `${num}/${den}` : `${whole} ${num}/${den}`;
}

// W × D × H; null when any of the three is missing.
export function sizeText(item: Pick<CatalogItem, 'width' | 'depth' | 'height'>): string | null {
  const { width, depth, height } = item;
  if (width === null || depth === null || height === null) return null;
  return [width, depth, height].map(formatInches).join(' × ');
}
