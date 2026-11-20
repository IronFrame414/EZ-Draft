// EZD-714 (S15h Notes; S15c Required notes; AC-EZD-714-1): the notes a project's set prints. The cover sheet
// (EZD-728) prints them; sheet sets (EZD-726) all take the project's profile, so the query is per project.
// - general: the company's general notes for the project's type, in library order;
// - required: the project's submittal profile's required notes, in the profile's order (general or code).
// A note that is both is listed once, under required. Code notes print only when a profile requires them
// (assumptions EZD-714). Reads go through the caller's client (RLS: their own company).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NoteGroup } from '../../lib/libraries/libraries';
import type { Database } from '../db/database.types';
import { listLibraryItems } from './libraries';

export type SetNote = { id: string; text: string; group: NoteGroup };
export type SetNotes = { general: SetNote[]; required: SetNote[] };

// null when the project is not visible to the caller.
export async function getSetNotes(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<SetNotes | null> {
  const project = await client
    .from('project')
    .select('type, submittal_profile_id')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) return null;

  let requiredIds: string[] = [];
  const profileId = project.data.submittal_profile_id;
  if (profileId !== null) {
    const profile = await client
      .from('submittal_profile')
      .select('required_notes')
      .eq('id', profileId)
      .maybeSingle();
    if (profile.error) throw profile.error;
    requiredIds = profile.data?.required_notes ?? [];
  }

  const notes = await listLibraryItems(client, 'note');
  const byId = new Map(notes.map((n) => [n.id, n]));
  const toSetNote = (n: (typeof notes)[number]): SetNote => ({
    id: n.id,
    text: n.name,
    group: n.note?.group ?? 'general',
  });
  const required = requiredIds.flatMap((id) => {
    const n = byId.get(id);
    return n ? [toSetNote(n)] : [];
  });
  const requiredSet = new Set(required.map((n) => n.id));
  const type = project.data.type;
  const general = notes
    .filter(
      (n) =>
        n.note?.group === 'general' &&
        (n.note.projectTypes as string[]).includes(type) &&
        !requiredSet.has(n.id),
    )
    .map(toSetNote);
  return { general, required };
}
