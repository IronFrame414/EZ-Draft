// EZD-1409 (S17 Tab: Tasks "Task list grouped by trade phase (demo → rough-in → inspection → drywall → finish); badge
// = open tasks"; Task row; Data shown "field_task: text in the user's language (text_en / text_es), status, photos";
// Room chips "selects the room page"; vault/build/assumptions/EZD-1409.md): the Tasks tab's pure rules. The pack's
// tasks, with what this phone did since the pack was read laid over them (a check or photo queued or sent, a saved
// edit), filtered to the selected room and grouped by phase in phase order.
import type { Language } from '../lib/messages/types';
import { ALL_ROOMS } from './pack-view';
import type { FieldPackTask } from './types';

// What this phone did to the pack's tasks since it was read.
export type TaskOverlay = {
  // Task id → when it was checked (ms), by this user.
  checked: ReadonlyMap<string, number>;
  // Task id → photos added on this phone.
  photos: ReadonlyMap<string, number>;
  // Task id → the saved text.
  edited: ReadonlyMap<string, { textEn: string; textEs: string | null }>;
  // The signed-in user's name, shown as who checked a task checked here.
  me: string | null;
};

export const NO_OVERLAY: TaskOverlay = {
  checked: new Map(),
  photos: new Map(),
  edited: new Map(),
  me: null,
};

export function overlayTasks(tasks: readonly FieldPackTask[], o: TaskOverlay): FieldPackTask[] {
  return tasks.map((t) => {
    const at = o.checked.get(t.id);
    const edit = o.edited.get(t.id);
    return {
      ...t,
      ...(edit ? { textEn: edit.textEn, textEs: edit.textEs } : {}),
      done: t.done ?? (at === undefined ? null : { by: o.me, at: new Date(at).toISOString() }),
      photos: t.photos + (o.photos.get(t.id) ?? 0),
    };
  });
}

export function openCount(tasks: readonly FieldPackTask[]): number {
  return tasks.filter((t) => t.done === null).length;
}

// Spanish when the user's language is Spanish and the task has it, else English (assumptions EZD-1409 "Language of
// task text").
export function taskText(t: Pick<FieldPackTask, 'textEn' | 'textEs'>, language: Language): string {
  return language === 'es' && t.textEs ? t.textEs : t.textEn;
}

export type TaskGroup = { phase: string; tasks: FieldPackTask[] };

// The selected room's tasks (every task under All), one group per phase name. Groups in phase order (the lowest
// phase position of the phase's tasks; a tie keeps the first seen); tasks keep the pack's order (phase position,
// then position).
export function groupTasks(tasks: readonly FieldPackTask[], room: string): TaskGroup[] {
  const shown = room === ALL_ROOMS ? tasks : tasks.filter((t) => t.roomId === room);
  const groups = new Map<string, { group: TaskGroup; rank: number; first: number }>();
  shown.forEach((t, i) => {
    const g = groups.get(t.phase);
    if (g === undefined) {
      groups.set(t.phase, { group: { phase: t.phase, tasks: [t] }, rank: t.phasePosition, first: i });
    } else {
      g.group.tasks.push(t);
      g.rank = Math.min(g.rank, t.phasePosition);
    }
  });
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.first - b.first)
    .map((g) => g.group);
}

// "Oct 8, 2:30 PM" in the phone's time zone.
export function doneTime(iso: string, language: Language, timeZone?: string): string {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
