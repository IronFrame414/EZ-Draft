// EZD-714 (S15h Tab: Notes "General notes and code notes, grouped by project type (kitchen, bath, whole-home)";
// Add note / Edit / Delete "Manage note text"). Expected values: the S15h groups, the project.type values
// (kitchen, bath, whole_home_interior), and the note limits of the EZD-714 migration (text up to 1000
// characters, at least one project type).
import { describe, expect, it } from 'vitest';
import {
  NOTE_GROUPS,
  NOTE_PROJECT_TYPES,
  NOTE_TEXT_MAX,
  checkNoteDraft,
  matchesSearch,
  noteDataOf,
  notesFor,
  type LibraryItem,
} from './libraries';

const note = (
  id: string,
  name: string,
  group: 'general' | 'code',
  types: string[],
): LibraryItem => ({
  id,
  kind: 'note',
  name,
  meaning: null,
  updatedAt: '2026-11-19T00:00:00Z',
  note: noteDataOf({ group, projectTypes: types }),
});

describe('EZD-714 notes', () => {
  it('notes are general or code notes for kitchen, bath and whole-home projects', () => {
    expect([...NOTE_GROUPS]).toEqual(['general', 'code']);
    expect([...NOTE_PROJECT_TYPES]).toEqual(['kitchen', 'bath', 'whole_home_interior']);
    expect(NOTE_TEXT_MAX).toBe(1000);
  });

  it('checkNoteDraft: text required, up to 1000 characters, at least one project type', () => {
    expect(checkNoteDraft('  ', ['kitchen'])).toBe('library_note_required');
    expect(checkNoteDraft('n'.repeat(1001), ['kitchen'])).toBe('library_note_too_long');
    expect(checkNoteDraft('Verify all dimensions in field.', [])).toBe(
      'library_note_project_type_required',
    );
    expect(checkNoteDraft('n'.repeat(1000), ['bath'])).toBeNull();
  });

  it('noteDataOf reads the stored group and project types; unknown values fall back', () => {
    expect(noteDataOf({ group: 'code', projectTypes: ['bath', 'kitchen'] })).toEqual({
      group: 'code',
      projectTypes: ['kitchen', 'bath'],
    });
    expect(noteDataOf({})).toEqual({
      group: 'general',
      projectTypes: ['kitchen', 'bath', 'whole_home_interior'],
    });
    expect(noteDataOf({ group: 'other', projectTypes: ['garage'] })).toEqual({
      group: 'general',
      projectTypes: ['kitchen', 'bath', 'whole_home_interior'],
    });
  });

  it('notesFor groups by general or code and filters by project type, keeping order', () => {
    const items = [
      note('1', 'Verify all dimensions in field before ordering cabinets.', 'general', [
        'kitchen',
        'bath',
        'whole_home_interior',
      ]),
      note('2', 'Bath fan ducted to exterior.', 'code', ['bath']),
      note('3', 'Kitchen hood ducted to exterior.', 'code', ['kitchen']),
      note('4', 'Protect existing finishes to remain.', 'general', ['whole_home_interior']),
    ];
    expect(notesFor(items, 'all', 'general').map((i) => i.id)).toEqual(['1', '4']);
    expect(notesFor(items, 'all', 'code').map((i) => i.id)).toEqual(['2', '3']);
    expect(notesFor(items, 'kitchen', 'general').map((i) => i.id)).toEqual(['1']);
    expect(notesFor(items, 'bath', 'code').map((i) => i.id)).toEqual(['2']);
    expect(notesFor(items, 'whole_home_interior', 'code')).toEqual([]);
    // Search runs on the note text.
    expect(matchesSearch(items[2], 'HOOD')).toBe(true);
  });
});
