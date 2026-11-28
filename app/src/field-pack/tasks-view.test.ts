// EZD-1409 (S17 Tab: Tasks "Task list grouped by trade phase (demo → rough-in → inspection → drywall → finish); badge
// = open tasks"; Room chips "selects the room page"; Data shown "text in the user's language (text_en / text_es)";
// Task row checkbox "Marks task done; records user and time"; assumptions EZD-1409). Expected values come from the
// fixture tasks below.
import { describe, expect, it } from 'vitest';
import { ALL_ROOMS } from './pack-view';
import {
  doneTime,
  groupTasks,
  NO_OVERLAY,
  openCount,
  overlayTasks,
  shownChecks,
  taskText,
} from './tasks-view';
import type { FieldPackTask } from './types';

const task = (o: Partial<FieldPackTask> & Pick<FieldPackTask, 'id' | 'phase' | 'phasePosition'>): FieldPackTask => ({
  roomId: 'r1',
  room: 'Kitchen',
  position: 0,
  textEn: o.id,
  textEs: null,
  done: null,
  photos: 0,
  ...o,
});

// In the pack's order: phase position, then position.
const TASKS: FieldPackTask[] = [
  task({ id: 'demo-k', phase: 'Demo', phasePosition: 0 }),
  task({ id: 'demo-p', phase: 'Demo', phasePosition: 0, position: 1, roomId: 'r2', room: 'Pantry' }),
  task({ id: 'rough-k', phase: 'Rough-in', phasePosition: 1 }),
  task({ id: 'insp-p', phase: 'Inspection', phasePosition: 2, roomId: 'r2', room: 'Pantry' }),
  task({ id: 'dry-k', phase: 'Drywall', phasePosition: 3 }),
  task({ id: 'fin-k', phase: 'Finish', phasePosition: 4, done: { by: 'Ana', at: '2026-11-20T15:00:00Z' } }),
];

describe('EZD-1409 tasks view', () => {
  it('All groups every task by phase in trade order', () => {
    const groups = groupTasks(TASKS, ALL_ROOMS);
    expect(groups.map((g) => g.phase)).toEqual(['Demo', 'Rough-in', 'Inspection', 'Drywall', 'Finish']);
    expect(groups[0]!.tasks.map((t) => t.id)).toEqual(['demo-k', 'demo-p']);
  });

  it('a room chip shows that room only', () => {
    const groups = groupTasks(TASKS, 'r2');
    expect(groups.map((g) => [g.phase, g.tasks.map((t) => t.id)])).toEqual([
      ['Demo', ['demo-p']],
      ['Inspection', ['insp-p']],
    ]);
    expect(groupTasks(TASKS, 'r9')).toEqual([]);
  });

  it('a phase placed at different positions by two rooms sorts at its lowest position', () => {
    const mixed = [
      task({ id: 'a', phase: 'Demo', phasePosition: 0 }),
      task({ id: 'b', phase: 'Rough-in', phasePosition: 0, roomId: 'r2' }),
      task({ id: 'c', phase: 'Demo', phasePosition: 1, roomId: 'r2' }),
    ];
    expect(groupTasks(mixed, ALL_ROOMS).map((g) => [g.phase, g.tasks.map((t) => t.id)])).toEqual([
      ['Demo', ['a', 'c']],
      ['Rough-in', ['b']],
    ]);
  });

  it('a check on this phone marks the task done by me at the check time and lowers the open count', () => {
    expect(openCount(overlayTasks(TASKS, NO_OVERLAY))).toBe(5);
    const at = Date.UTC(2026, 10, 21, 14, 30, 0);
    const shown = overlayTasks(TASKS, {
      ...NO_OVERLAY,
      checked: new Map([
        ['rough-k', at],
        ['fin-k', at],
      ]),
      photos: new Map([['dry-k', 2]]),
      edited: new Map([['demo-k', { textEn: 'Remove all upper cabinets', textEs: null }]]),
      me: 'Luis Ortega',
    });
    expect(shown.find((t) => t.id === 'rough-k')!.done).toEqual({
      by: 'Luis Ortega',
      at: '2026-11-21T14:30:00.000Z',
    });
    // A task already done keeps who did it.
    expect(shown.find((t) => t.id === 'fin-k')!.done).toEqual({ by: 'Ana', at: '2026-11-20T15:00:00Z' });
    expect(shown.find((t) => t.id === 'dry-k')!.photos).toBe(2);
    expect(shown.find((t) => t.id === 'demo-k')!.textEn).toBe('Remove all upper cabinets');
    expect(openCount(shown)).toBe(4);
  });

  it('Spanish users see the Spanish text when the task has it, else the English', () => {
    expect(taskText({ textEn: 'Set the vanity', textEs: 'Colocar el tocador' }, 'es')).toBe('Colocar el tocador');
    expect(taskText({ textEn: 'Set the vanity', textEs: 'Colocar el tocador' }, 'en')).toBe('Set the vanity');
    expect(taskText({ textEn: 'Set the vanity', textEs: null }, 'es')).toBe('Set the vanity');
  });

  it('the done time reads month, day and time', () => {
    expect(doneTime('2026-11-21T14:30:00Z', 'en', 'UTC')).toBe('Nov 21, 2:30 PM');
  });
});

// EZD-2025 (AC-EZD-2025-3 "a check the office refuses for good unticks"): a refused check is not shown ticked.
describe('EZD-2025 shownChecks', () => {
  it('drops the refused checks and keeps the rest', () => {
    const checked = new Map([
      ['t1', 1000],
      ['t2', 2000],
    ]);
    expect([...shownChecks(checked, new Set(['t1']))]).toEqual([['t2', 2000]]);
  });

  it('no refused checks: the same map', () => {
    const checked = new Map([['t1', 1000]]);
    expect(shownChecks(checked, new Set())).toBe(checked);
  });
});
