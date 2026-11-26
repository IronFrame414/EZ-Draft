// EZD-1409 (S17 Task row "edit text: Edits the task text. Edit field tasks; online only"): the phone's Edit text,
// through the definer function edit_field_task under the member's session
// (supabase/migrations/20261126120000_field_task_actions.sql). Errors map by code; anything else is thrown.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../db/database.types';

export const TASK_TEXT_MAX = 1000;

export const editBodySchema = z.object({ text: z.string().max(4000) }).strict();

export type EditRefusal = 'permission_denied' | 'project_not_found' | 'task_not_found' | 'invalid_input';

export type EditResult =
  | { ok: true; textEn: string; textEs: string | null; editedAt: string }
  | { ok: false; code: EditRefusal };

export async function editFieldTask(
  client: SupabaseClient<Database>,
  projectId: string,
  taskId: string,
  text: string,
): Promise<EditResult> {
  const { data, error } = await client.rpc('edit_field_task', {
    p_project: projectId,
    p_task: taskId,
    p_text: text,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') {
      return { ok: false, code: error.message === 'task_not_found' ? 'task_not_found' : 'project_not_found' };
    }
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const parsed = z
    .object({ textEn: z.string(), textEs: z.string().nullable(), editedAt: z.string().min(1) })
    .safeParse(data);
  if (!parsed.success) throw new Error('edit_field_task_unexpected_result');
  return { ok: true, ...parsed.data };
}
