// EZD-1404 (S17 Layout, Controls "Revision badge", "Project title / subtitle", "Room chips", Tabs; States "No set
// sent yet"; 03d field_pack_issue): what the phone's field pack shows, read through the caller's session client and
// RLS. The pack is the project's newest field_pack_issue; its version's rooms give the room chips. Null when the
// project is missing or out of the caller's scope; `pack` null when no field pack has been issued yet.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type { FieldPack, FieldPackRoom, FieldPackView } from '../../field-pack/types';
import { readVersion } from '../versions/versions';

export type { FieldPack, FieldPackRoom, FieldPackView };

type Client = SupabaseClient<Database>;

export async function readFieldPack(client: Client, projectId: string): Promise<FieldPackView | null> {
  const project = await client
    .from('project')
    .select('name, client_name')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const base = {
    projectName: project.data.name,
    clientName: project.data.client_name?.trim() ? project.data.client_name.trim() : null,
  };
  const issue = await client
    .from('field_pack_issue')
    .select('id, model_version_id, task_ids, issued_at, note')
    .eq('project_id', projectId)
    .order('issued_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (issue.error) throw issue.error;
  if (issue.data === null) return { ...base, pack: null };
  const version = await client
    .from('model_version')
    .select('version_no')
    .eq('id', issue.data.model_version_id)
    .maybeSingle();
  if (version.error) throw version.error;
  const doc = await readVersion(client, projectId, issue.data.model_version_id);
  const rooms: FieldPackRoom[] = [];
  for (const o of doc?.doc.objects ?? []) {
    if (o.type !== 'room') continue;
    const name = (o.data as { attributes?: { name?: unknown } }).attributes?.name;
    if (typeof name === 'string' && name !== '') rooms.push({ id: o.id, name });
  }
  const no = version.data?.version_no ?? null;
  return {
    ...base,
    pack: {
      issueId: issue.data.id,
      revision: no === null ? null : { kind: 'version', no },
      issuedAt: issue.data.issued_at,
      note: issue.data.note?.trim() ? issue.data.note.trim() : null,
      rooms,
      openTasks: issue.data.task_ids.length,
    },
  };
}
