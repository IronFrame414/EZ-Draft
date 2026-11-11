// EZD-135 U1, U2 (vault/plans/EZD-135.md sections 3, 4; AC-EZD-135-2). Expected values: Q-0664 (30 days, 50 per
// page), sections.ts (slug system-status), Decided "Query parsing" (L-061 upper bound 999999).
import { describe, expect, it } from 'vitest';
import { sectionBySlug, settingsHref } from '../settings/sections';
import {
  JOB_FAILURE_DAYS,
  SYSTEM_STATUS_PAGE_SIZE,
  SYSTEM_STATUS_PATH,
  parseStatusQuery,
} from './system-status';

describe('EZD-135 system status helpers', () => {
  it('U1 constants and the path match the section', () => {
    expect(SYSTEM_STATUS_PAGE_SIZE).toBe(50);
    expect(JOB_FAILURE_DAYS).toBe(30);
    expect(SYSTEM_STATUS_PATH).toBe('/settings/system-status');
    expect(SYSTEM_STATUS_PATH).toBe(settingsHref(sectionBySlug('system-status')!));
  });

  it('U2 (a) good queries', () => {
    const good: Array<{ input: string; expected: unknown }> = [
      { input: 'part=jobs', expected: { part: 'jobs', page: 1 } },
      { input: 'part=webhooks&page=2', expected: { part: 'webhooks', page: 2 } },
      { input: 'part=backups&page=3', expected: { part: 'backups', page: 3 } },
      { input: 'part=jobs&page=999999', expected: { part: 'jobs', page: 999999 } },
      { input: 'part=jobs&part=webhooks', expected: { part: 'jobs', page: 1 } },
      { input: 'part=jobs&q=x', expected: { part: 'jobs', page: 1 } },
    ];
    for (const { input, expected } of good) {
      expect(parseStatusQuery(new URLSearchParams(input)), input).toEqual(expected);
    }
  });

  it('U2 (b) bad queries are null', () => {
    const bad = [
      'part=nope',
      '',
      'part=JOBS',
      'part=jobs&page=0',
      'part=jobs&page=01',
      'part=jobs&page=1000000',
      'part=jobs&page=x',
      'part=jobs&page=-1',
      'part=jobs&page=',
      'part=jobs&page=1.5',
      'part=jobs&page=%201',
    ];
    for (const input of bad) {
      expect(parseStatusQuery(new URLSearchParams(input)), input).toBeNull();
    }
  });
});
