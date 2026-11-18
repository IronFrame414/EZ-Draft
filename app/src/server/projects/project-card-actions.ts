// EZD-124 (S01 Card overflow menu; Q-0199; Q-0201; Q-0202; Q-0700 decisions 03, 10; examples 09p Delete
// confirmation): the project card menu's writes, one definer function each, through the caller's session client
// (20261118140000_create_project_card_actions.sql). The function checks the gate, the permission switch and project
// scope itself and writes the event_log row in the same transaction.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PROJECT_STATUSES, type ProjectStatus } from '../../lib/projects/projects';
import { PROJECT_NAME_MAX } from '../../lib/projects/new-project';
import { normalizeDeleteConfirm } from '../../lib/projects/project-card-menu';
import type { Database } from '../db/database.types';

export type CardChange =
  | { kind: 'rename'; name: string }
  | { kind: 'status'; status: ProjectStatus }
  | { kind: 'archive' }
  | { kind: 'restore' }
  // EZD-137 (Q-0191; Q-0700 decisions 03, 10): Mark complete and Reopen, Edit model.
  | { kind: 'complete' }
  | { kind: 'reopen' };

const patchSchema = z.union([
  z.strictObject({ name: z.string().max(PROJECT_NAME_MAX * 2) }),
  z.strictObject({ status: z.enum(PROJECT_STATUSES) }),
  z.strictObject({ archived: z.boolean() }),
  z.strictObject({ complete: z.boolean() }),
]);

// The PATCH body: exactly one of { name }, { status }, { archived } or { complete }. A name is trimmed and must not be blank.
export function parseCardChange(body: unknown): CardChange | null {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return null;
  const d = parsed.data;
  if ('name' in d) {
    const name = d.name.trim();
    if (name === '' || name.length > PROJECT_NAME_MAX) return null;
    return { kind: 'rename', name };
  }
  if ('status' in d) return { kind: 'status', status: d.status };
  if ('complete' in d) return d.complete ? { kind: 'complete' } : { kind: 'reopen' };
  return d.archived ? { kind: 'archive' } : { kind: 'restore' };
}

// The delete body { confirmName }, trimmed as the dialog trims it.
export function parseDeleteBody(body: unknown): string | null {
  const parsed = z.strictObject({ confirmName: z.string().max(4000) }).safeParse(body);
  if (!parsed.success) return null;
  return normalizeDeleteConfirm(parsed.data.confirmName);
}

export type CardActionFailure = 'permission_denied' | 'project_not_found' | 'invalid_input' | 'name_mismatch';

export type CardActionResult =
  | { ok: true; tenantId: string; changed: boolean }
  | { ok: false; code: CardActionFailure };

export type DeleteProjectResult =
  | { ok: true; tenantId: string; jobId: string }
  | { ok: false; code: CardActionFailure };

function failure(error: { code?: string; message: string }): CardActionFailure | null {
  if (error.code === '42501') return 'permission_denied';
  if (error.code === 'P0002') return 'project_not_found';
  if (error.code === '22023') {
    return error.message.includes('name_mismatch') ? 'name_mismatch' : 'invalid_input';
  }
  return null;
}

const answerSchema = z.object({ tenant_id: z.string(), changed: z.boolean() });

export async function applyCardChange(
  client: SupabaseClient<Database>,
  projectId: string,
  change: CardChange,
): Promise<CardActionResult> {
  const { data, error } =
    change.kind === 'rename'
      ? await client.rpc('rename_project', { p_project: projectId, p_name: change.name })
      : change.kind === 'status'
        ? await client.rpc('set_project_status', { p_project: projectId, p_status: change.status })
        : change.kind === 'archive'
          ? await client.rpc('archive_project', { p_project: projectId })
          : change.kind === 'restore'
            ? await client.rpc('restore_project', { p_project: projectId })
            : change.kind === 'complete'
              ? await client.rpc('complete_project', { p_project: projectId })
              : await client.rpc('reopen_project', { p_project: projectId });
  if (error) {
    const code = failure(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
  const parsed = answerSchema.safeParse(data);
  if (!parsed.success) throw new Error('project_card_bad_result');
  return { ok: true, tenantId: parsed.data.tenant_id, changed: parsed.data.changed };
}

export async function deleteProject(
  client: SupabaseClient<Database>,
  projectId: string,
  confirmName: string,
): Promise<DeleteProjectResult> {
  const { data, error } = await client.rpc('delete_project', {
    p_project: projectId,
    p_confirm_name: confirmName,
  });
  if (error) {
    const code = failure(error);
    if (code === null) throw error;
    return { ok: false, code };
  }
  const parsed = z.object({ tenant_id: z.string(), job_id: z.string() }).safeParse(data);
  if (!parsed.success) throw new Error('delete_project_bad_result');
  return { ok: true, tenantId: parsed.data.tenant_id, jobId: parsed.data.job_id };
}
