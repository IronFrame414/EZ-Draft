// EZD-131 (S15h; 03e library_item): server-only helpers for the Settings > Libraries routes. Reads and writes
// go through the caller's session client (RLS: the claim tenant).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  checkLibraryDraft,
  isLibraryKind,
  type LibraryCode,
  type LibraryItem,
  type LibraryKind,
} from '../../lib/libraries/libraries';
import type { Database, Json } from '../db/database.types';

export const LIBRARY_COLUMNS = 'id, kind, name, data, updated_at';
// A company library is small; the list is capped so one response stays bounded.
export const LIBRARY_LIST_MAX = 2000;

type Row = { id: string; kind: string; name: string; data: Json; updated_at: string };

export function toLibraryItem(row: Row): LibraryItem {
  const kind = row.kind as LibraryKind;
  const data = row.data;
  let meaning: string | null = null;
  if (
    kind === 'abbreviation' &&
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data)
  ) {
    const m = data.meaning;
    meaning = typeof m === 'string' ? m : '';
  }
  return { id: row.id, kind, name: row.name, meaning, updatedAt: row.updated_at };
}

export function parseKindQuery(params: URLSearchParams): LibraryKind | null {
  const kind = params.get('kind');
  return kind !== null && isLibraryKind(kind) ? kind : null;
}

export async function listLibraryItems(
  client: SupabaseClient<Database>,
  kind: LibraryKind,
): Promise<LibraryItem[]> {
  const { data, error } = await client
    .from('library_item')
    .select(LIBRARY_COLUMNS)
    .eq('kind', kind)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(LIBRARY_LIST_MAX);
  if (error) throw error;
  return data.map(toLibraryItem);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; code: LibraryCode };

export type LibraryValues = { name: string; meaning: string | null };

const text = z.string().max(1000);
const createSchema = z.strictObject({ kind: z.literal('abbreviation'), name: text, meaning: text });
const patchSchema = z.strictObject({ name: text, meaning: text.optional() });

function checked(name: string, meaning: string | null): Parsed<LibraryValues> {
  const code = checkLibraryDraft({ name, meaning });
  if (code !== null) return { ok: false, code };
  return {
    ok: true,
    value: { name: name.trim(), meaning: meaning === null ? null : meaning.trim() },
  };
}

// Only abbreviations are added from this page (S15h Symbols + abbreviations).
export function parseLibraryCreate(
  body: unknown,
): Parsed<LibraryValues & { kind: 'abbreviation' }> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const r = checked(parsed.data.name, parsed.data.meaning);
  return r.ok ? { ok: true, value: { ...r.value, kind: 'abbreviation' } } : r;
}

// An abbreviation takes a name and a meaning; a saved group a name only.
export function parseLibraryPatch(body: unknown, kind: LibraryKind): Parsed<LibraryValues> {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const hasMeaning = parsed.data.meaning !== undefined;
  if (hasMeaning !== (kind === 'abbreviation')) return { ok: false, code: 'invalid_input' };
  return checked(parsed.data.name, parsed.data.meaning ?? null);
}

export function dataFor(values: LibraryValues): { [key: string]: Json } {
  return values.meaning === null ? {} : { meaning: values.meaning };
}

export function isAbbreviationTaken(error: { code?: string; message?: string } | null): boolean {
  return (
    error !== null &&
    error.code === '23505' &&
    (error.message ?? '').includes('library_item_abbreviation_key')
  );
}
