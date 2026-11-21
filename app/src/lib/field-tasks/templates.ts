// EZD-1408 (S15h Tab: Field task templates "One template per room type (kitchen, bath, laundry, other) built from
// a default trade sequence: demo → rough-in → inspection → drywall → finish. Add, rename, delete, reorder phases";
// Decisions 2; mockup S15hLibraries): a field task template is a library_item of kind task_template whose data is
// { roomType, phases }. A room type with no saved template uses the default sequence. Browser and server.
import { ROOM_TYPES, type RoomType } from '@ezdraft/geometry';

export { ROOM_TYPES, type RoomType };

// The phase names as the mockup shows them (S15hLibraries: Demo, Rough-in, Inspection, Drywall, Finish).
export const DEFAULT_PHASE_NAMES = ['Demo', 'Rough-in', 'Inspection', 'Drywall', 'Finish'] as const;

export const PHASE_NAME_MAX = 60;
export const PHASES_MAX = 20;
export const TEMPLATE_TASK_MAX = 300;
export const TEMPLATE_TASKS_PER_PHASE_MAX = 40;

export type TemplatePhase = {
  // Stable within the template, so a renamed or moved phase keeps its row in the editor.
  id: string;
  name: string;
  // Starter task lines for the phase (mockup S15hLibraries phase rows); the AI draft builds on them.
  tasks: string[];
};

export type TaskTemplate = { roomType: RoomType; phases: TemplatePhase[] };

export type TemplateCode =
  | 'invalid_input'
  | 'task_template_phase_required'
  | 'task_template_phase_name_required'
  | 'task_template_phase_name_too_long'
  | 'task_template_phase_name_taken'
  | 'task_template_too_many_phases'
  | 'task_template_task_required'
  | 'task_template_task_too_long'
  | 'task_template_too_many_tasks';

export function isRoomType(v: unknown): v is RoomType {
  return typeof v === 'string' && (ROOM_TYPES as readonly string[]).includes(v);
}

export function defaultPhases(): TemplatePhase[] {
  return DEFAULT_PHASE_NAMES.map((name, i) => ({ id: `p${i + 1}`, name, tasks: [] }));
}

export function defaultTemplate(roomType: RoomType): TaskTemplate {
  return { roomType, phases: defaultPhases() };
}

// The first problem with a template's phases, in order; null when it may be saved. Phase names are unique in a
// template ignoring case, because a field task names its phase.
export function checkTemplatePhases(phases: readonly TemplatePhase[]): TemplateCode | null {
  if (phases.length === 0) return 'task_template_phase_required';
  if (phases.length > PHASES_MAX) return 'task_template_too_many_phases';
  const seen = new Set<string>();
  for (const p of phases) {
    const name = p.name.trim();
    if (name === '') return 'task_template_phase_name_required';
    if (name.length > PHASE_NAME_MAX) return 'task_template_phase_name_too_long';
    const key = name.toLowerCase();
    if (seen.has(key)) return 'task_template_phase_name_taken';
    seen.add(key);
    if (p.tasks.length > TEMPLATE_TASKS_PER_PHASE_MAX) return 'task_template_too_many_tasks';
    for (const t of p.tasks) {
      if (t.trim() === '') return 'task_template_task_required';
      if (t.trim().length > TEMPLATE_TASK_MAX) return 'task_template_task_too_long';
    }
  }
  return null;
}

// Trimmed names and task lines, as stored.
export function cleanPhases(phases: readonly TemplatePhase[]): TemplatePhase[] {
  return phases.map((p) => ({
    id: p.id,
    name: p.name.trim(),
    tasks: p.tasks.map((t) => t.trim()),
  }));
}

// A stored template's data read back; anything unreadable gives null (the caller falls back to the default).
export function templateOf(data: unknown): TaskTemplate | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (!isRoomType(obj.roomType) || !Array.isArray(obj.phases)) return null;
  const phases: TemplatePhase[] = [];
  for (const raw of obj.phases) {
    if (raw === null || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
    const tasks = Array.isArray(p.tasks) ? p.tasks.filter((t) => typeof t === 'string') : [];
    phases.push({ id: p.id, name: p.name, tasks: tasks as string[] });
  }
  if (phases.length === 0) return null;
  return { roomType: obj.roomType, phases };
}

// The template a room of this type uses: the company's saved one, else the default sequence. A room with no type
// uses the Other template.
export function templateForRoom(
  saved: readonly TaskTemplate[],
  roomType: RoomType | null,
): TaskTemplate {
  const type: RoomType = roomType ?? 'other';
  return saved.find((t) => t.roomType === type) ?? defaultTemplate(type);
}

// Moves the phase at `from` to `to` (both clamped); the other phases keep their order.
export function movePhase<T>(phases: readonly T[], from: number, to: number): T[] {
  const next = [...phases];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

// A phase id not used in the template.
export function newPhaseId(phases: readonly TemplatePhase[]): string {
  const used = new Set(phases.map((p) => p.id));
  for (let n = phases.length + 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}
