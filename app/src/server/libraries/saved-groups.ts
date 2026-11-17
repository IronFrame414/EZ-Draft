// EZD-233 (S03 Decisions "Save as group is in the context menu and More. Saved groups appear in the Saved tab of the
// matching library"; R26 "placed from a Saved section in the Fixtures panel"; 03e library_item; vault/build/
// assumptions.md EZD-233): reading and checking saved groups for the Plan editor. A saved group is a library_item of
// kind saved_group whose data holds the saved objects; every object must be one the model would accept.
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { checkLibraryDraft, type LibraryCode } from '../../lib/libraries/libraries';
import type { Database, Json } from '../db/database.types';
import { LIBRARY_LIST_MAX } from './libraries';

export const SAVED_GROUP_ITEMS_MAX = 500;
// The request body cap, in characters of JSON.
export const SAVED_GROUP_BODY_MAX = 512 * 1024;
const SAVED_TYPES = ['wall', 'opening', 'fixture', 'utility_point', 'tile_shower'] as const;

const itemSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(SAVED_TYPES),
  schemaVersion: z.int().min(1).max(CURRENT_SCHEMA_VERSION),
  data: z.record(z.string(), z.unknown()),
});
const payloadSchema = z.strictObject({
  items: z.array(itemSchema).min(1).max(SAVED_GROUP_ITEMS_MAX),
});
const createSchema = z.strictObject({ name: z.string().max(1000), data: payloadSchema });

export type SavedGroupPayloadJson = z.infer<typeof payloadSchema>;
export type SavedGroupEntry = { id: string; name: string; data: SavedGroupPayloadJson };

// Every object must read as the model reads it; anything else is refused whole.
function validPayload(value: unknown): SavedGroupPayloadJson | null {
  const r = payloadSchema.safeParse(value);
  if (!r.success) return null;
  for (const i of r.data.items) {
    const parsed = parseStoredObject({
      id: i.id,
      type: i.type,
      schema_version: i.schemaVersion,
      data: i.data,
    });
    if (!parsed.ok) return null;
  }
  return r.data;
}

export function parseSavedGroupCreate(
  body: unknown,
): { ok: true; value: { name: string; data: SavedGroupPayloadJson } } | { ok: false; code: LibraryCode } {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const code = checkLibraryDraft({ name: parsed.data.name, meaning: null });
  if (code !== null) return { ok: false, code };
  const data = validPayload(parsed.data.data);
  if (data === null) return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { name: parsed.data.name.trim(), data } };
}

// The company's saved groups (RLS: the claim tenant), by name; a stored group that no longer reads is left out.
export async function listSavedGroups(
  client: SupabaseClient<Database>,
): Promise<SavedGroupEntry[]> {
  const { data, error } = await client
    .from('library_item')
    .select('id, name, data')
    .eq('kind', 'saved_group')
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(LIBRARY_LIST_MAX);
  if (error) throw error;
  const out: SavedGroupEntry[] = [];
  for (const row of data) {
    const payload = validPayload(row.data);
    if (payload !== null) out.push({ id: row.id, name: row.name, data: payload });
  }
  return out;
}

export const toJson = (p: SavedGroupPayloadJson): { [key: string]: Json } =>
  p as unknown as { [key: string]: Json };
