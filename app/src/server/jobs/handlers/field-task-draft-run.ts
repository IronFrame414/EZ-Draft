// EZD-1408 (S22 Draft tasks with AI "Builds draft tasks per room and phase from the model's Demo and New objects
// and the room's template (15h). Shown as drafts for review"; S22 Decisions 2; 02 Stack AI "Claude for ... task
// drafts"; 03c field_task): the field_task_draft job's work. With the secret key, so every query is filtered by
// the job's company. One Claude call per run (EZD-021 client; the stub in tests):
//
// 1. The project's live rooms (model_object type room) and its live Demo and New objects.
// 2. Each room's template: the company's task_template for its room type, else the default sequence; a room with
//    no type uses Other.
// 3. Claude gets the rooms as refs r1, r2 … in model order with their phases, starter tasks and the objects, and
//    answers {"tasks":[{"room":"r1","phase":"Demo","text":"…"}]}. A task naming an unknown room or a phase not in
//    that room's template is dropped.
// 4. A room and phase the reply left empty gets the template's starter tasks.
// 5. The project's draft rows are replaced by the new ones (status draft, job_id the job). Published and done
//    tasks are never touched. Safe to run twice: the second run gives the same rows.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { templateForRoom, templateOf, type TaskTemplate } from '../../../lib/field-tasks/templates';
import { callClaudeJson, type AiJobContext } from '../../ai';
import type { Database } from '../../db/database.types';
import { FIELD_TASK_DRAFT_PURPOSE } from './field-task-draft-purpose';

export { FIELD_TASK_DRAFT_PURPOSE };
// A project's model is bounded; these caps keep one prompt and one insert small.
export const DRAFT_ROOMS_MAX = 100;
export const DRAFT_OBJECTS_MAX = 400;
export const DRAFT_TASKS_MAX = 2000;
const TASK_TEXT_MAX = 1000;

type Db = SupabaseClient<Database>;

export type DraftRoom = {
  ref: string;
  id: string;
  name: string;
  template: TaskTemplate;
};

export type DraftObject = { type: string; status: 'demo' | 'new'; name: string | null };

export type DraftRow = {
  room_id: string;
  room: string;
  phase: string;
  phase_position: number;
  position: number;
  text_en: string;
};

const replySchema = z.object({
  tasks: z
    .array(z.object({ room: z.string(), phase: z.string(), text: z.string() }))
    .max(DRAFT_TASKS_MAX),
});
export type DraftReply = z.infer<typeof replySchema>;

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

async function readRooms(db: Db, tenantId: string, projectId: string, templates: TaskTemplate[]) {
  const { data, error } = await db
    .from('model_object')
    .select('object_id, data, created_at')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('type', 'room')
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    .order('object_id', { ascending: true })
    .limit(DRAFT_ROOMS_MAX);
  if (error) throw error;
  return data.map((row, i): DraftRoom => {
    const attrs = asRecord(asRecord(row.data).attributes);
    const type = attrs.roomType;
    const roomType =
      type === 'kitchen' || type === 'bath' || type === 'laundry' || type === 'other' ? type : null;
    return {
      ref: `r${i + 1}`,
      id: row.object_id,
      name: typeof attrs.name === 'string' ? attrs.name.slice(0, 120) : '',
      template: templateForRoom(templates, roomType),
    };
  });
}

async function readObjects(db: Db, tenantId: string, projectId: string): Promise<DraftObject[]> {
  const { data, error } = await db
    .from('model_object')
    .select('type, data')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('deleted', false)
    .neq('type', 'room')
    .in('data->>status', ['demo', 'new'])
    .order('object_id', { ascending: true })
    .limit(DRAFT_OBJECTS_MAX);
  if (error) throw error;
  return data.map((row) => {
    const d = asRecord(row.data);
    const attrs = asRecord(d.attributes);
    const name = typeof attrs.name === 'string' ? attrs.name.slice(0, 80) : null;
    return { type: row.type, status: d.status === 'demo' ? 'demo' : 'new', name };
  });
}

async function readTemplates(db: Db, tenantId: string): Promise<TaskTemplate[]> {
  const { data, error } = await db
    .from('library_item')
    .select('data')
    .eq('tenant_id', tenantId)
    .eq('kind', 'task_template');
  if (error) throw error;
  return data.map((row) => templateOf(row.data)).filter((t): t is TaskTemplate => t !== null);
}

export function draftPrompt(rooms: readonly DraftRoom[], objects: readonly DraftObject[]): string {
  const model = {
    rooms: rooms.map((r) => ({
      room: r.ref,
      name: r.name,
      roomType: r.template.roomType,
      phases: r.template.phases.map((p) => ({ phase: p.name, starterTasks: p.tasks })),
    })),
    objects,
  };
  return [
    'Draft the crew task list for a residential remodel.',
    'For each room, write short tasks for each of its phases, in the order the crew does them, from the',
    'objects being demolished (status demo) and built (status new), building on the starter tasks.',
    'Use only the room refs and phase names given. Answer with JSON only:',
    '{"tasks":[{"room":"r1","phase":"<phase name>","text":"<task>"}]}',
    '',
    JSON.stringify(model),
  ].join('\n');
}

// The rows to write, from the reply and the templates (steps 3 and 4).
export function draftRows(rooms: readonly DraftRoom[], reply: DraftReply): DraftRow[] {
  const rows: DraftRow[] = [];
  for (const room of rooms) {
    room.template.phases.forEach((phase, phasePosition) => {
      const key = phase.name.trim().toLowerCase();
      const fromAi = reply.tasks
        .filter((t) => t.room === room.ref && t.phase.trim().toLowerCase() === key)
        .map((t) => t.text.trim().slice(0, TASK_TEXT_MAX))
        .filter((t) => t !== '');
      const texts = fromAi.length > 0 ? fromAi : phase.tasks.filter((t) => t.trim() !== '');
      texts.forEach((text, position) => {
        rows.push({
          room_id: room.id,
          room: room.name,
          phase: phase.name,
          phase_position: phasePosition,
          position,
          text_en: text,
        });
      });
    });
  }
  return rows.slice(0, DRAFT_TASKS_MAX);
}

export type DraftResult = { projectId: string; rooms: number; tasks: number };

export async function draftFieldTasks(
  db: Db,
  ctx: AiJobContext,
  projectId: string,
): Promise<DraftResult> {
  const tenantId = ctx.job.tenant_id;
  const templates = await readTemplates(db, tenantId);
  const rooms = await readRooms(db, tenantId, projectId, templates);
  let rows: DraftRow[] = [];
  if (rooms.length > 0) {
    const objects = await readObjects(db, tenantId, projectId);
    const { data } = await callClaudeJson(
      ctx,
      {
        purpose: FIELD_TASK_DRAFT_PURPOSE,
        model: 'sonnet',
        messages: [
          { role: 'user', content: [{ type: 'text', text: draftPrompt(rooms, objects) }] },
        ],
        maxTokens: 8000,
      },
      replySchema,
    );
    rows = draftRows(rooms, data);
  }

  const removed = await db
    .from('field_task')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('status', 'draft');
  if (removed.error) throw removed.error;
  if (rows.length > 0) {
    const inserted = await db.from('field_task').insert(
      rows.map((r) => ({
        ...r,
        tenant_id: tenantId,
        project_id: projectId,
        status: 'draft',
        job_id: ctx.job.id,
      })),
    );
    if (inserted.error) throw inserted.error;
  }
  return { projectId, rooms: rooms.length, tasks: rows.length };
}
