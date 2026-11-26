// EZD-1404 (S17 Layout, Controls "Revision badge", "Project title / subtitle", "Room chips", Tabs; States "No set
// sent yet"; 03d field_pack_issue): what the phone's field pack shows, read through the caller's session client and
// RLS. The pack is the project's newest field_pack_issue; its version's rooms give the room chips. Null when the
// project is missing or out of the caller's scope; `pack` null when no field pack has been issued yet.
// EZD-1409 (S17 Tab: Tasks "Task list grouped by trade phase"; Task row; S22 Decisions 2 drafts stay hidden from
// crew): the issue's tasks, read live so checks show, published and done only, in phase order then task order, with
// the name of who checked each done one. The open count is the published ones.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type {
  FieldPack,
  FieldPackRoom,
  FieldPackTask,
  FieldPackView,
} from '../../field-pack/types';
import { readVersion } from '../versions/versions';

export type { FieldPack, FieldPackRoom, FieldPackTask, FieldPackView };

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
  const tasks = await readTasks(client, projectId, issue.data.task_ids);
  const no = version.data?.version_no ?? null;
  return {
    ...base,
    pack: {
      issueId: issue.data.id,
      revision: no === null ? null : { kind: 'version', no },
      issuedAt: issue.data.issued_at,
      note: issue.data.note?.trim() ? issue.data.note.trim() : null,
      rooms,
      openTasks: tasks.filter((t) => t.done === null).length,
      tasks,
    },
  };
}

async function readTasks(client: Client, projectId: string, ids: string[]): Promise<FieldPackTask[]> {
  if (ids.length === 0) return [];
  const rows = await client
    .from('field_task')
    .select(
      'id, room_id, room, phase, phase_position, position, text_en, text_es, status, photos, done_by, done_at',
    )
    .eq('project_id', projectId)
    .in('status', ['published', 'done'])
    .order('phase_position', { ascending: true })
    .order('position', { ascending: true })
    .order('id', { ascending: true });
  if (rows.error) throw rows.error;
  // The issue's tasks only, filtered here so a long id list never goes in the request's address.
  const issued = new Set(ids);
  const mine = rows.data.filter((r) => issued.has(r.id));
  const by = [...new Set(mine.map((r) => r.done_by).filter((u): u is string => u !== null))];
  const names = new Map<string, string>();
  if (by.length > 0) {
    const users = await client.from('app_user').select('id, name').in('id', by);
    if (users.error) throw users.error;
    for (const u of users.data) if (u.name?.trim()) names.set(u.id, u.name.trim());
  }
  return mine.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    room: r.room,
    phase: r.phase,
    phasePosition: r.phase_position,
    position: r.position,
    textEn: r.text_en,
    textEs: r.text_es?.trim() ? r.text_es : null,
    done:
      r.status === 'done'
        ? { by: r.done_by === null ? null : (names.get(r.done_by) ?? null), at: r.done_at ?? '' }
        : null,
    photos: Array.isArray(r.photos) ? r.photos.length : 0,
  }));
}
