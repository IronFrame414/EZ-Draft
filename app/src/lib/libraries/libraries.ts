// EZD-131 (S15h Layout, Controls, Decisions 1; 03e library_item): the Settings > Libraries tabs in mockup
// order and the library item shape. Browser and server.
import type { MessageKey } from '../../server/messages/catalog';
import type { TaskTemplate, TemplateCode } from '../field-tasks/templates';

export const LIBRARY_KINDS = [
  'note',
  'abbreviation',
  'hatch',
  'part',
  'saved_group',
  'task_template',
] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export function isLibraryKind(v: string): v is LibraryKind {
  return (LIBRARY_KINDS as readonly string[]).includes(v);
}

export type LibraryTabId =
  'notes' | 'symbols' | 'details' | 'hatches' | 'parts' | 'saved_groups' | 'task_templates';

export type LibraryTab = {
  id: LibraryTabId;
  // The library_item kind behind the tab; Details is detail records (S10), not library_item.
  kind: LibraryKind | null;
  label: MessageKey;
  empty: MessageKey;
  search: MessageKey;
};

export const LIBRARY_TABS: readonly LibraryTab[] = [
  {
    id: 'notes',
    kind: 'note',
    label: 'office.libraries.tab.notes',
    empty: 'office.libraries.empty.notes',
    search: 'office.libraries.search.notes',
  },
  {
    id: 'symbols',
    kind: 'abbreviation',
    label: 'office.libraries.tab.symbols',
    empty: 'office.libraries.empty.symbols',
    search: 'office.libraries.search.symbols',
  },
  {
    id: 'details',
    kind: null,
    label: 'office.libraries.tab.details',
    empty: 'office.libraries.empty.details',
    search: 'office.libraries.search.details',
  },
  {
    id: 'hatches',
    kind: 'hatch',
    label: 'office.libraries.tab.hatches',
    empty: 'office.libraries.empty.hatches',
    search: 'office.libraries.search.hatches',
  },
  {
    id: 'parts',
    kind: 'part',
    label: 'office.libraries.tab.parts',
    empty: 'office.libraries.empty.parts',
    search: 'office.libraries.search.parts',
  },
  {
    id: 'saved_groups',
    kind: 'saved_group',
    label: 'office.libraries.tab.saved_groups',
    empty: 'office.libraries.empty.saved_groups',
    search: 'office.libraries.search.saved_groups',
  },
  {
    id: 'task_templates',
    kind: 'task_template',
    label: 'office.libraries.tab.task_templates',
    empty: 'office.libraries.empty.task_templates',
    search: 'office.libraries.search.task_templates',
  },
];

// Kinds that can be added (S15h: abbreviations may be added; EZD-714 notes; EZD-1408 field task templates) and
// changed (abbreviations, notes, templates; saved groups are renamed or deleted). The other kinds' own tickets add
// their editors.
export const CREATABLE_KINDS: readonly LibraryKind[] = ['note', 'abbreviation', 'task_template'];
export const EDITABLE_KINDS: readonly LibraryKind[] = [
  'note',
  'abbreviation',
  'saved_group',
  'task_template',
];

export const LIBRARY_NAME_MAX = 120;
export const LIBRARY_MEANING_MAX = 200;
// EZD-714: a note's name is its text, which may run longer than a name (20261119160000_notes_library.sql).
export const NOTE_TEXT_MAX = 1000;

// EZD-714 (S15h Tab: Notes): general notes and code notes, grouped by project type (project.type values).
export const NOTE_GROUPS = ['general', 'code'] as const;
export type NoteGroup = (typeof NOTE_GROUPS)[number];
export const NOTE_PROJECT_TYPES = ['kitchen', 'bath', 'whole_home_interior'] as const;
export type NoteProjectType = (typeof NOTE_PROJECT_TYPES)[number];
export type NoteData = { group: NoteGroup; projectTypes: NoteProjectType[] };

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  name: string;
  // An abbreviation's meaning; null for the other kinds.
  meaning: string | null;
  updatedAt: string;
  // A note's group and project types; present on notes only.
  note?: NoteData;
  // EZD-1408: a field task template's room type and phases; present on task templates only.
  template?: TaskTemplate;
};

export type LibraryCode =
  | 'invalid_input'
  | 'library_name_required'
  | 'library_name_too_long'
  | 'library_meaning_required'
  | 'library_meaning_too_long'
  | 'library_note_required'
  | 'library_note_too_long'
  | 'library_note_project_type_required'
  | TemplateCode
  | 'task_template_exists';

export type LibraryDraft = { name: string; meaning: string | null };

// The first problem with a draft, in field order; null when it may be saved. `meaning` null means the kind
// has no meaning field.
export function checkLibraryDraft(d: LibraryDraft): LibraryCode | null {
  const name = d.name.trim();
  if (name === '') return 'library_name_required';
  if (name.length > LIBRARY_NAME_MAX) return 'library_name_too_long';
  if (d.meaning !== null) {
    const meaning = d.meaning.trim();
    if (meaning === '') return 'library_meaning_required';
    if (meaning.length > LIBRARY_MEANING_MAX) return 'library_meaning_too_long';
  }
  return null;
}

// Case-insensitive match on the name and the meaning (S15h Search: filters the current tab).
export function matchesSearch(item: LibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return item.name.toLowerCase().includes(q) || (item.meaning ?? '').toLowerCase().includes(q);
}

// EZD-714: the first problem with a note draft; null when it may be saved.
export function checkNoteDraft(text: string, projectTypes: readonly string[]): LibraryCode | null {
  const t = text.trim();
  if (t === '') return 'library_note_required';
  if (t.length > NOTE_TEXT_MAX) return 'library_note_too_long';
  if (projectTypes.length === 0) return 'library_note_project_type_required';
  return null;
}

// A note's stored data read back: an unknown group is general; unknown project types are dropped and none
// left means every project type.
export function noteDataOf(data: unknown): NoteData {
  const obj =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const group: NoteGroup = obj.group === 'code' ? 'code' : 'general';
  const raw = Array.isArray(obj.projectTypes) ? obj.projectTypes : [];
  const types = NOTE_PROJECT_TYPES.filter((p) => raw.includes(p));
  return { group, projectTypes: types.length > 0 ? types : [...NOTE_PROJECT_TYPES] };
}

// The Notes tab shows one project type at a time; 'all' shows every note.
export type NoteFilter = NoteProjectType | 'all';
export function notesFor(
  items: readonly LibraryItem[],
  filter: NoteFilter,
  group: NoteGroup,
): LibraryItem[] {
  return items.filter(
    (i) =>
      i.note !== undefined &&
      i.note.group === group &&
      (filter === 'all' || i.note.projectTypes.includes(filter)),
  );
}
