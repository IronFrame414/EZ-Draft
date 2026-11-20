// EZD-137 (AC-EZD-137-1, -2, -3). Expected values: Q-0702 (Completed is a tab after In build, before Archived; the
// card menu has Mark complete or Reopen after Set status); Q-0191 (Mark complete; Reopen); Q-0199 (Set status keeps
// the five hand-moved statuses); Q-0700 decisions 03 (Complete sorts last: status rank 6), 10 (Edit model).
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, parseProjectListQuery } from '../../server/projects/projects';
import { parseCardChange } from '../../server/projects/project-card-actions';
import { cardMenuItems, SETTABLE_STATUSES } from './project-card-menu';
import { PROJECT_TABS, projectsUrl } from './projects';

describe('EZD-137 Mark complete rules', () => {
  it('tabs: Completed after In build, before Archived', () => {
    expect([...PROJECT_TABS]).toEqual([
      'all',
      'draft',
      'client_review',
      'permit_submitted',
      'approved',
      'in_build',
      'complete',
      'archived',
    ]);
    expect(projectsUrl({ tab: 'complete', sort: 'edited', after: null })).toBe(
      '/api/projects?status=complete&sort=edited',
    );
    expect(parseProjectListQuery(new URLSearchParams('status=complete'))).toEqual({
      tab: 'complete',
      sort: 'edited',
      after: null,
    });
  });

  it('menu: Mark complete needs Edit model; a completed card offers Reopen in place of Set status', () => {
    expect(cardMenuItems({ canEdit: true, canDelete: true, archived: false, complete: true })).toEqual([
      'rename',
      'reopen',
      'archive',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: true, canDelete: true, archived: true, complete: true })).toEqual([
      'rename',
      'reopen',
      'restore',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: false, canDelete: true, archived: false, complete: true })).toEqual([
      'archive',
      'delete',
    ]);
    expect(cardMenuItems({ canEdit: false, canDelete: false, archived: false })).toEqual([]);
    expect(SETTABLE_STATUSES).not.toContain('complete');
  });

  it('PATCH body: { complete: true } is Mark complete, { complete: false } Reopen; Set status refuses complete', () => {
    expect(parseCardChange({ complete: true })).toEqual({ kind: 'complete' });
    expect(parseCardChange({ complete: false })).toEqual({ kind: 'reopen' });
    expect(parseCardChange({ complete: 'true' })).toBeNull();
    expect(parseCardChange({ complete: true, status: 'draft' })).toBeNull();
    expect(parseCardChange({ status: 'complete' })).toBeNull();
  });

  it('cursor: status rank 6 (Complete) is accepted, 7 is not', () => {
    const k = {
      id: '3f2a6c1e-8b4d-4e2a-9c1f-0a1b2c3d4e5f',
      u: '2026-10-01T12:00:00.123456+00:00',
      n: 'alpha',
      m: false,
      c: 'acme',
      r: 6,
      o: 0,
    };
    expect(decodeCursor(encodeCursor(k))).toEqual(k);
    expect(decodeCursor(encodeCursor({ ...k, r: 7 }))).toBeNull();
  });
});
