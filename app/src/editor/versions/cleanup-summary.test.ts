// EZD-123 S1-S6 (AC-EZD-123-2, -9; examples 09p Cleanup clock row 6, Visual diff rows 1-4). Expected values: Q-0700
// 05 ("N added · N changed · N removed" against the parent, or "First version"; the footer shows the earliest delete
// date); 09p row 6 (A due Nov 1, B due Nov 3, sheet opened Nov 4, grace 7: Nov 8); board S20 footer ("Oct 18, 2026");
// S20 Name field ("defaults to its date and time"; board rows "Sep 11 · 5:02 PM"); board "30 days old · unsent".
import { describe, expect, it } from 'vitest';
import {
  ageDays,
  cleanupChoices,
  cleanupCounts,
  cleanupDeleteOn,
  cleanupSummaryText,
  defaultSnapshotName,
  deleteOnText,
  storedObjects,
  type CleanupRow,
  type StoredObject,
} from './cleanup-summary';

const wall = (id: string, x: number): StoredObject => ({
  id,
  type: 'wall',
  schema_version: 1,
  data: { geometry: { start: { x: 0, y: 0 }, end: { x, y: 0 } } },
});

const row = (o: Partial<CleanupRow>): CleanupRow => ({
  id: 'r',
  createdAt: '2026-09-11T17:02:00Z',
  author: null,
  cause: null,
  label: null,
  summary: null,
  shownAt: '2026-11-01T08:00:00Z',
  previewUrl: null,
  ...o,
});

describe('EZD-123 cleanup summary', () => {
  it('S1 counts against the parent by object id: moved is changed, gone is removed, new is added (AC-EZD-123-9; 09p Visual diff 1-3)', () => {
    const parent = [wall('w4', 0), wall('w5', 10)];
    const child = [wall('w4', 6), wall('w9', 20)];
    expect(cleanupCounts(parent, child)).toEqual({ added: 1, changed: 1, removed: 1 });
    expect(cleanupSummaryText({ added: 1, changed: 1, removed: 1 })).toEqual({
      key: 'office.versions.cleanup.summary',
      params: { added: 1, changed: 1, removed: 1 },
    });
  });

  it('S2 identical documents read 0 added · 0 changed · 0 removed (09p Visual diff 4); no parent reads First version (AC-EZD-123-9)', () => {
    expect(cleanupCounts([wall('w4', 0)], [wall('w4', 0)])).toEqual({
      added: 0,
      changed: 0,
      removed: 0,
    });
    expect(cleanupCounts(null, [wall('w4', 0)])).toBeNull();
    expect(cleanupSummaryText(null)).toEqual({ key: 'office.versions.cleanup.first_version' });
  });

  it('S3 a document without an objects list reads as no objects', () => {
    expect(storedObjects(null)).toEqual([]);
    expect(storedObjects({ objects: 'x' })).toEqual([]);
    expect(storedObjects({ objects: [wall('w1', 0), { nope: 1 }] })).toEqual([wall('w1', 0)]);
  });

  it('S4 the footer date is the earliest first-shown date plus grace: A Nov 1, B Nov 3, grace 7 → Nov 8, 2026 (09p row 6)', () => {
    const d = cleanupDeleteOn(
      [row({ shownAt: '2026-11-03T08:00:00Z' }), row({ shownAt: '2026-11-01T08:00:00Z' })],
      7,
    );
    expect(d?.toISOString()).toBe('2026-11-08T08:00:00.000Z');
    expect(deleteOnText(d!, 'UTC')).toBe('Nov 8, 2026');
    expect(cleanupDeleteOn([], 7)).toBeNull();
  });

  it('S5 the default name is the date and time; ages are whole days', () => {
    expect(defaultSnapshotName('2026-09-11T17:02:00Z', 'UTC')).toBe('Sep 11 · 5:02 PM');
    expect(ageDays('2026-10-01T09:00:00Z', Date.parse('2026-10-31T09:00:00Z'))).toBe(30);
    expect(ageDays('2026-10-01T09:00:00Z', Date.parse('2026-10-31T03:00:00Z'))).toBe(29);
  });

  it('S6 Save sends ticked rows with their trimmed names (blank falls back to the date and time) and unticked rows to delete (AC-EZD-123-2)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    const choices = new Map([
      ['a', { keep: true, name: '  Island 3-box layout ' }],
      ['b', { keep: true, name: '   ' }],
      ['c', { keep: false, name: 'ignored' }],
    ]);
    expect(cleanupChoices(rows, choices, 'UTC')).toEqual({
      keep: [
        { id: 'a', name: 'Island 3-box layout' },
        { id: 'b', name: 'Sep 11 · 5:02 PM' },
      ],
      remove: ['c'],
    });
  });
});
