// EZD-131 (S15h; 03e library_item): server-only helpers for the Settings > Libraries routes. Reads and writes
// go through the caller's session client (RLS: the claim tenant).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  PHASES_MAX,
  ROOM_TYPES,
  TEMPLATE_TASKS_PER_PHASE_MAX,
  checkTemplatePhases,
  cleanPhases,
  templateOf,
  type TaskTemplate,
} from '../../lib/field-tasks/templates';
import {
  NOTE_GROUPS,
  NOTE_PROJECT_TYPES,
  checkLibraryDraft,
  checkNoteDraft,
  isLibraryKind,
  noteDataOf,
  type LibraryCode,
  type LibraryItem,
  type LibraryKind,
  type NoteData,
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
  const item: LibraryItem = {
    id: row.id,
    kind,
    name: row.name,
    meaning,
    updatedAt: row.updated_at,
  };
  if (kind === 'note') item.note = noteDataOf(data);
  if (kind === 'task_template') {
    const template = templateOf(data);
    if (template !== null) item.template = template;
  }
  return item;
}

export function parseKindQuery(params: URLSearchParams): LibraryKind | null {
  const kind = params.get('kind');
  return kind !== null && isLibraryKind(kind) ? kind : null;
}

export async function listLibraryItems(
  client: SupabaseClient<Database>,
  kind: LibraryKind,
): Promise<LibraryItem[]> {
  // Notes keep the order they were added in, the order a set prints them (EZD-714); other kinds by name.
  const { data, error } = await client
    .from('library_item')
    .select(LIBRARY_COLUMNS)
    .eq('kind', kind)
    .order(kind === 'note' ? 'created_at' : 'name', { ascending: true })
    .order('id', { ascending: true })
    .limit(LIBRARY_LIST_MAX);
  if (error) throw error;
  return data.map(toLibraryItem);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; code: LibraryCode };

export type LibraryValues = {
  name: string;
  meaning: string | null;
  note?: NoteData;
  template?: TaskTemplate;
};

const text = z.string().max(1000);
const createSchema = z.strictObject({ kind: z.literal('abbreviation'), name: text, meaning: text });
const patchSchema = z.strictObject({ name: text, meaning: text.optional() });
// EZD-714: a note is its text, its group and the project types it applies to.
const noteFields = {
  text: z.string().max(5000),
  group: z.enum(NOTE_GROUPS),
  projectTypes: z.array(z.enum(NOTE_PROJECT_TYPES)).max(NOTE_PROJECT_TYPES.length),
};
const noteCreateSchema = z.strictObject({ kind: z.literal('note'), ...noteFields });
const notePatchSchema = z.strictObject(noteFields);

// EZD-1408 (S15h Field task templates): a template is its name, its room type (fixed once made: one template per
// room type) and its phases in order.
const phaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().max(500),
  tasks: z.array(z.string().max(2000)).max(TEMPLATE_TASKS_PER_PHASE_MAX * 2),
});
const templateFields = {
  name: text,
  phases: z
    .array(phaseSchema)
    .max(PHASES_MAX * 2)
    .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length),
};
const templateCreateSchema = z.strictObject({
  kind: z.literal('task_template'),
  roomType: z.enum(ROOM_TYPES),
  ...templateFields,
});
const templatePatchSchema = z.strictObject(templateFields);

function checkedTemplate(
  name: string,
  roomType: TaskTemplate['roomType'],
  phases: TaskTemplate['phases'],
): Parsed<LibraryValues> {
  const nameCode = checkLibraryDraft({ name, meaning: null });
  if (nameCode !== null) return { ok: false, code: nameCode };
  const code = checkTemplatePhases(phases);
  if (code !== null) return { ok: false, code };
  return {
    ok: true,
    value: {
      name: name.trim(),
      meaning: null,
      template: { roomType, phases: cleanPhases(phases) },
    },
  };
}

function checkedNote(body: {
  text: string;
  group: NoteData['group'];
  projectTypes: NoteData['projectTypes'];
}): Parsed<LibraryValues> {
  const code = checkNoteDraft(body.text, body.projectTypes);
  if (code !== null) return { ok: false, code };
  // Stored in NOTE_PROJECT_TYPES order, each once.
  const projectTypes = NOTE_PROJECT_TYPES.filter((p) => body.projectTypes.includes(p));
  return {
    ok: true,
    value: { name: body.text.trim(), meaning: null, note: { group: body.group, projectTypes } },
  };
}

function checked(name: string, meaning: string | null): Parsed<LibraryValues> {
  const code = checkLibraryDraft({ name, meaning });
  if (code !== null) return { ok: false, code };
  return {
    ok: true,
    value: { name: name.trim(), meaning: meaning === null ? null : meaning.trim() },
  };
}

// Abbreviations (S15h Symbols + abbreviations) and notes (EZD-714, S15h Notes) are added from this page.
export function parseLibraryCreate(
  body: unknown,
): Parsed<LibraryValues & { kind: 'abbreviation' | 'note' | 'task_template' }> {
  const template = templateCreateSchema.safeParse(body);
  if (template.success) {
    const { name, roomType, phases } = template.data;
    const r = checkedTemplate(name, roomType, phases);
    return r.ok ? { ok: true, value: { ...r.value, kind: 'task_template' } } : r;
  }
  const note = noteCreateSchema.safeParse(body);
  if (note.success) {
    const r = checkedNote(note.data);
    return r.ok ? { ok: true, value: { ...r.value, kind: 'note' } } : r;
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const r = checked(parsed.data.name, parsed.data.meaning);
  return r.ok ? { ok: true, value: { ...r.value, kind: 'abbreviation' } } : r;
}

// An abbreviation takes a name and a meaning; a saved group a name only; a task template (EZD-1408) a name and
// its phases, keeping its room type (`before`).
export function parseLibraryPatch(
  body: unknown,
  kind: LibraryKind,
  before?: LibraryItem,
): Parsed<LibraryValues> {
  if (kind === 'task_template') {
    const roomType = before?.template?.roomType;
    const parsed = templatePatchSchema.safeParse(body);
    if (!parsed.success || roomType === undefined) return { ok: false, code: 'invalid_input' };
    return checkedTemplate(parsed.data.name, roomType, parsed.data.phases);
  }
  if (kind === 'note') {
    const note = notePatchSchema.safeParse(body);
    return note.success ? checkedNote(note.data) : { ok: false, code: 'invalid_input' };
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const hasMeaning = parsed.data.meaning !== undefined;
  if (hasMeaning !== (kind === 'abbreviation')) return { ok: false, code: 'invalid_input' };
  return checked(parsed.data.name, parsed.data.meaning ?? null);
}

export function dataFor(values: LibraryValues): { [key: string]: Json } {
  if (values.template !== undefined) {
    return {
      roomType: values.template.roomType,
      phases: values.template.phases.map((p) => ({ id: p.id, name: p.name, tasks: [...p.tasks] })),
    };
  }
  if (values.note !== undefined) {
    return { group: values.note.group, projectTypes: [...values.note.projectTypes] };
  }
  return values.meaning === null ? {} : { meaning: values.meaning };
}

// EZD-714: what a note edit changed (the text is the name; the group and project types are data).
export function noteFieldsChanged(before: LibraryItem, after: LibraryValues): ('name' | 'data')[] {
  const fields: ('name' | 'data')[] = [];
  if (after.name !== before.name) fields.push('name');
  const a = after.note;
  const b = before.note;
  if (
    a !== undefined &&
    (b === undefined ||
      a.group !== b.group ||
      a.projectTypes.join(',') !== b.projectTypes.join(','))
  )
    fields.push('data');
  return fields;
}

// EZD-1408: what a template edit changed (the name, or the phases as data).
export function templateFieldsChanged(
  before: LibraryItem,
  after: LibraryValues,
): ('name' | 'data')[] {
  const fields: ('name' | 'data')[] = [];
  if (after.name !== before.name) fields.push('name');
  if (JSON.stringify(after.template?.phases) !== JSON.stringify(before.template?.phases))
    fields.push('data');
  return fields;
}

// EZD-1408 (S15h "One template per room type"): the company already has a template for this room type.
export function isTemplateTaken(error: { code?: string; message?: string } | null): boolean {
  return (
    error !== null &&
    error.code === '23505' &&
    (error.message ?? '').includes('library_item_task_template_key')
  );
}

export function isAbbreviationTaken(error: { code?: string; message?: string } | null): boolean {
  return (
    error !== null &&
    error.code === '23505' &&
    (error.message ?? '').includes('library_item_abbreviation_key')
  );
}
