// EZD-131 (S15h Layout, Controls, Decisions 1; 03e library_item; mockup S15hLibraries). Expected values: the
// tab list and order of S15h Layout and the mockup tab labels; library_item kinds of 03e; S15h Decisions 1
// (abbreviations editable, symbols read-only) and Saved groups "rename or delete".
import { describe, expect, it } from 'vitest';
import { catalogFor } from '../../server/messages/catalog';
import {
  CREATABLE_KINDS,
  EDITABLE_KINDS,
  LIBRARY_KINDS,
  LIBRARY_TABS,
  checkLibraryDraft,
  isLibraryKind,
  matchesSearch,
  type LibraryItem,
} from './libraries';

const en = catalogFor('office', 'en') as Record<string, unknown>;

describe('EZD-131 library tabs and items', () => {
  it('the seven S15h tabs in order with the mockup labels; Details has no library_item kind', () => {
    expect(LIBRARY_TABS.map((t) => en[t.label])).toEqual([
      'Notes',
      'Symbols + abbreviations',
      'Details',
      'Hatches',
      'Parts',
      'Saved groups',
      'Field task templates',
    ]);
    expect(LIBRARY_TABS.map((t) => t.kind)).toEqual([
      'note',
      'abbreviation',
      null,
      'hatch',
      'part',
      'saved_group',
      'task_template',
    ]);
    for (const t of LIBRARY_TABS) {
      expect(typeof en[t.empty], t.id).toBe('string');
      expect(typeof en[t.search], t.id).toBe('string');
    }
  });

  it('the 03e kinds; only abbreviations are added here; abbreviations and saved groups change', () => {
    expect([...LIBRARY_KINDS]).toEqual([
      'note',
      'abbreviation',
      'hatch',
      'part',
      'saved_group',
      'task_template',
    ]);
    expect(isLibraryKind('saved_group')).toBe(true);
    expect(isLibraryKind('detail')).toBe(false);
    expect([...CREATABLE_KINDS]).toEqual(['abbreviation']);
    expect([...EDITABLE_KINDS]).toEqual(['abbreviation', 'saved_group']);
  });

  it('checkLibraryDraft names the first problem in field order', () => {
    expect(checkLibraryDraft({ name: ' ', meaning: '' })).toBe('library_name_required');
    expect(checkLibraryDraft({ name: 'x'.repeat(121), meaning: 'y' })).toBe(
      'library_name_too_long',
    );
    expect(checkLibraryDraft({ name: 'x'.repeat(120), meaning: ' ' })).toBe(
      'library_meaning_required',
    );
    expect(checkLibraryDraft({ name: 'GFCI', meaning: 'm'.repeat(201) })).toBe(
      'library_meaning_too_long',
    );
    expect(
      checkLibraryDraft({ name: 'GFCI', meaning: 'Ground-fault circuit interrupter' }),
    ).toBeNull();
    // A saved group has no meaning field.
    expect(checkLibraryDraft({ name: 'Vanity set', meaning: null })).toBeNull();
  });

  it('search matches the name or the meaning, ignoring case', () => {
    const item: LibraryItem = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'abbreviation',
      name: 'GFCI',
      meaning: 'Ground-fault circuit interrupter',
      updatedAt: '2026-11-13T00:00:00Z',
    };
    expect(matchesSearch(item, '')).toBe(true);
    expect(matchesSearch(item, 'gfc')).toBe(true);
    expect(matchesSearch(item, 'CIRCUIT')).toBe(true);
    expect(matchesSearch(item, 'AFCI')).toBe(false);
  });
});
