// EZD-1409 (07 field_task.completed "task, room, photos, by, at"): the task a recorded task check completed, read
// through the caller's session client, as the event's payload. Null when the check completed no task (already
// done, a draft, or no such task; 20261126120000_field_task_actions.sql records the check and applies nothing).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type { EventPayloads } from '../../lib/events/registry';

export async function completedTask(
  client: SupabaseClient<Database>,
  projectId: string,
  changeId: string,
): Promise<EventPayloads['field_task.completed'] | null> {
  const { data, error } = await client
    .from('field_task')
    .select('id, room, photos, done_by, done_at')
    .eq('project_id', projectId)
    .eq('done_change_id', changeId)
    .maybeSingle();
  if (error) throw error;
  if (data === null || data.done_by === null || data.done_at === null) return null;
  return {
    projectId,
    taskId: data.id,
    room: data.room,
    photos: Array.isArray(data.photos) ? data.photos.length : 0,
    by: data.done_by,
    at: data.done_at,
  };
}
