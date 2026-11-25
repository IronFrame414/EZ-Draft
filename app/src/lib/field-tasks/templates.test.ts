// EZD-1408 (S15h Tab: Field task templates "One template per room type (kitchen, bath, laundry, other) built from a
// default trade sequence: demo → rough-in → inspection → drywall → finish. Add, rename, delete, reorder phases";
// board S15hLibraries phase names Demo, Rough-in, Inspection, Drywall, Finish). Expected values from the spec and
// the board.
import { describe, expect, it } from 'vitest';
import {
  ROOM_TYPES,
  checkTemplatePhases,
  defaultPhases,
  defaultTemplate,
  movePhase,
  newPhaseId,
  templateForRoom,
  templateOf,
  type TemplatePhase,
} from './templates';

const names = (ps: readonly TemplatePhase[]) => ps.map((p) => p.name);

describe('EZD-1408 field task templates', () => {
  it('one template per room type, each from the default trade sequence', () => {
    expect([...ROOM_TYPES]).toEqual(['kitchen', 'bath', 'laundry', 'other']);
    expect(names(defaultPhases())).toEqual(['Demo', 'Rough-in', 'Inspection', 'Drywall', 'Finish']);
    expect(defaultTemplate('bath').roomType).toBe('bath');
  });

  it('reorders phases: Rough-in dragged above Demo, Finish moved to the top, out-of-range moves clamp', () => {
    const d = defaultPhases();
    expect(names(movePhase(d, 1, 0))).toEqual([
      'Rough-in',
      'Demo',
      'Inspection',
      'Drywall',
      'Finish',
    ]);
    expect(names(movePhase(d, 4, 0))).toEqual([
      'Finish',
      'Demo',
      'Rough-in',
      'Inspection',
      'Drywall',
    ]);
    expect(names(movePhase(d, 0, 9))).toEqual([
      'Rough-in',
      'Inspection',
      'Drywall',
      'Finish',
      'Demo',
    ]);
    expect(names(movePhase(d, 7, 0))).toEqual(names(d));
  });

  it('a new phase gets an id not already used', () => {
    const d = defaultPhases();
    expect(newPhaseId(d)).toBe('p6');
    expect(newPhaseId(d.filter((p) => p.id !== 'p2'))).toBe('p6');
    expect(newPhaseId([{ id: 'p2', name: 'A', tasks: [] }])).toBe('p3');
  });

  it('checks phases in order: at least one, named, unique ignoring case, within the caps', () => {
    const p = (name: string, tasks: string[] = []) => ({ id: name || 'x', name, tasks });
    expect(checkTemplatePhases(defaultPhases())).toBeNull();
    expect(checkTemplatePhases([])).toBe('task_template_phase_required');
    expect(checkTemplatePhases([p(' ')])).toBe('task_template_phase_name_required');
    expect(checkTemplatePhases([p('x'.repeat(61))])).toBe('task_template_phase_name_too_long');
    expect(checkTemplatePhases([p('x'.repeat(60))])).toBeNull();
    expect(checkTemplatePhases([p('Demo'), p(' demo ')])).toBe('task_template_phase_name_taken');
    expect(checkTemplatePhases([p('Demo', [''])])).toBe('task_template_task_required');
    expect(checkTemplatePhases([p('Demo', ['t'.repeat(301)])])).toBe('task_template_task_too_long');
    expect(
      checkTemplatePhases([
        p(
          'Demo',
          Array.from({ length: 41 }, () => 'Task'),
        ),
      ]),
    ).toBe('task_template_too_many_tasks');
    expect(checkTemplatePhases(Array.from({ length: 21 }, (_, i) => p(`P${i}`)))).toBe(
      'task_template_too_many_phases',
    );
  });

  it('a room uses its type’s saved template, else the default; a room with no type uses Other', () => {
    const kitchen = { roomType: 'kitchen' as const, phases: movePhase(defaultPhases(), 1, 0) };
    expect(templateForRoom([kitchen], 'kitchen')).toBe(kitchen);
    expect(templateForRoom([kitchen], 'bath')).toEqual(defaultTemplate('bath'));
    expect(templateForRoom([kitchen], null)).toEqual(defaultTemplate('other'));
  });

  it('reads stored data back, refusing anything unreadable', () => {
    const data = {
      roomType: 'laundry',
      phases: [{ id: 'p1', name: 'Demo', tasks: ['Pull the dryer'] }],
    };
    expect(templateOf(data)).toEqual(data);
    expect(templateOf({ roomType: 'garage', phases: data.phases })).toBeNull();
    expect(templateOf({ roomType: 'laundry', phases: [] })).toBeNull();
    expect(templateOf({ roomType: 'laundry', phases: [{ id: 1, name: 'x' }] })).toBeNull();
    expect(templateOf(null)).toBeNull();
  });
});
