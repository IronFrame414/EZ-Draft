// EZD-126 (S06:81 presence avatars; AC-EZD-126-5; ARCH Realtime "Payload rule"; 03 rule 2): the names and initials
// of people in a project, for the presence avatars. Presence carries ids only, so the browser asks this route for
// the names. Read through the member's session client (RLS: `app_user_select` limits rows to the caller's company;
// a project out of scope reads as none). The email is read for the initials only and never returned.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { initialsFor } from '../../lib/users/initials';
import type { Database } from '../db/database.types';

export const PEOPLE_IDS_MAX = 20;

export type PersonOut = { appUserId: string; name: string | null; initials: string };

const uuid = z.uuid();

// `ids` is a comma list of at most PEOPLE_IDS_MAX distinct UUIDs (lower-cased, first order kept); anything else
// is null.
export function parsePeopleIds(raw: string | null): string[] | null {
  if (raw === null || raw === '' || raw.length > PEOPLE_IDS_MAX * 37) return null;
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.toLowerCase();
    if (!uuid.safeParse(id).success) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out.length === 0 || out.length > PEOPLE_IDS_MAX ? null : out;
}

// Null when the project is not visible to the caller; otherwise the people found, in the order of `ids` (ids
// with no visible row are left out).
export async function readPeople(
  client: SupabaseClient<Database>,
  projectId: string,
  ids: readonly string[],
): Promise<PersonOut[] | null> {
  const project = await client.from('project').select('id').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const rows = await client.from('app_user').select('id, name, email').in('id', [...ids]);
  if (rows.error) throw rows.error;
  const byId = new Map(rows.data.map((r) => [r.id, r]));
  const out: PersonOut[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const name = r.name?.trim() ? r.name.trim() : null;
    out.push({ appUserId: r.id, name, initials: initialsFor(name, r.email) });
  }
  return out;
}
