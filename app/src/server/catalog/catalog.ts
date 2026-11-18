// EZD-401 (03c catalog_item; S09 Data shown): server-only read of the company catalog for the picker. Reads go
// through the caller's session client (RLS: the claim tenant; an item saved to one project only when the project
// is in the member's scope). Money columns (unit_cost, sell_price, markup_pct) are never selected here: the picker shows no
// prices (S09 prices are phase 16, behind See company costs and See sell prices).
import type { SupabaseClient } from '@supabase/supabase-js';
import { isCatalogCategory, type CatalogItem } from '../../lib/catalog/catalog';
import type { Database } from '../db/database.types';

export const CATALOG_COLUMNS =
  'id, category, subcategory, line, name, brand, model, width, depth, height, finish';
// A company catalog is bounded (S09 status bar "426 products"); the cap keeps one response bounded, as the
// library list (EZD-131).
export const CATALOG_LIST_MAX = 2000;

type Row = {
  id: string;
  category: string;
  subcategory: string | null;
  line: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  finish: string | null;
};

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function toCatalogItem(row: Row): CatalogItem | null {
  if (!isCatalogCategory(row.category)) return null;
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    line: row.line,
    name: row.name,
    brand: row.brand,
    model: row.model,
    width: num(row.width),
    depth: num(row.depth),
    height: num(row.height),
    finish: row.finish,
  };
}

export async function listCatalogItems(client: SupabaseClient<Database>): Promise<CatalogItem[]> {
  const { data, error } = await client
    .from('catalog_item')
    .select(CATALOG_COLUMNS)
    .order('category', { ascending: true })
    .order('line', { ascending: true })
    .order('model', { ascending: true })
    .order('id', { ascending: true })
    .limit(CATALOG_LIST_MAX);
  if (error) throw error;
  return data.map(toCatalogItem).filter((i): i is CatalogItem => i !== null);
}
