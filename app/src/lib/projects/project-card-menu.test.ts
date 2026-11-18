// EZD-124 (AC-EZD-124-1, -4, -7). Expected values: examples 09p Delete confirmation rows 1-4 (trimmed, case
// included); S01 Controls and Q-0700 decisions 10 (Rename and Set status need Edit model; Archive, Restore and
// Delete need Delete projects; items the user lacks are absent); Q-0201 (Delete at any time; Archive or Restore);
// Q-0199 (the five hand-moved statuses, no Complete).
import { describe, expect, it } from 'vitest';
import { cardMenuItems, deleteConfirmMatches, SETTABLE_STATUSES } from './project-card-menu';

describe('EZD-124 project card menu rules', () => {
  it('09p Delete confirmation: enabled only for the trimmed name, case included', () => {
    expect(deleteConfirmMatches('Kitchen remodel', 'Kitchen remodel')).toBe(true);
    expect(deleteConfirmMatches('Kitchen remodel', 'kitchen remodel')).toBe(false);
    expect(deleteConfirmMatches('Kitchen remodel', '  Kitchen remodel ')).toBe(true);
    expect(deleteConfirmMatches('Kitchen remodel', '')).toBe(false);
  });

  it('items follow the permissions; an archived card offers Restore in place of Archive', () => {
    expect(cardMenuItems({ canEdit: true, canDelete: true, archived: false })).toEqual([
      'rename',
      'status',
      'complete',
      'archive',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: true, canDelete: true, archived: true })).toEqual([
      'rename',
      'status',
      'complete',
      'restore',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: true, canDelete: false, archived: false })).toEqual([
      'rename',
      'status',
      'complete',
    ]);
    expect(cardMenuItems({ canEdit: false, canDelete: true, archived: false })).toEqual([
      'archive',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: false, canDelete: false, archived: false })).toEqual([]);
  });

  it('Set status offers the five hand-moved statuses and not Complete', () => {
    expect([...SETTABLE_STATUSES]).toEqual([
      'draft',
      'client_review',
      'permit_submitted',
      'approved',
      'in_build',
    ]);
    expect(SETTABLE_STATUSES).not.toContain('complete');
  });
});
