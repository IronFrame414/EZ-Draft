// EZD-135 U1, U2 (vault/plans/EZD-135.md sections 3, 4; AC-EZD-135-2). Expected values: Q-0664 (30 days, 50 per
// page), sections.ts (slug system-status), Decided "Query parsing" (L-061 upper bound 999999).
import { describe, expect, it } from 'vitest';
import { sectionBySlug, settingsHref } from '../settings/sections';
import {
  JOB_FAILURE_DAYS,
  SYSTEM_STATUS_PAGE_SIZE,
  SYSTEM_STATUS_PATH,
  formatBytes,
  formatStatusTime,
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

// EZD-135b U1 (vault/plans/EZD-135b.md section 4; Decided "Times", "Sizes"). Expected values: Intl en-US short
// month with the narrow spaces made plain (UTC 15:04 is 10:04 in New York on Nov 9, EST); sizes in decimal units
// (11 Budgets "200 KB" held as 200,000 bytes, Q-0579), one decimal, rounding up to the next unit at 1000.
describe('EZD-135b system status formatting', () => {
  it('U1 (a) times in UTC and New York', () => {
    expect(formatStatusTime('2026-11-09T15:04:00Z', 'UTC')).toBe('Nov 9, 2026, 3:04 PM');
    expect(formatStatusTime('2026-11-09T15:04:00Z', 'America/New_York')).toBe(
      'Nov 9, 2026, 10:04 AM',
    );
    expect(formatStatusTime('2026-01-02T00:30:00Z', 'UTC')).toBe('Jan 2, 2026, 12:30 AM');
  });

  it('U1 (b) sizes in decimal units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1.0 KB');
    expect(formatBytes(999949)).toBe('999.9 KB');
    expect(formatBytes(999950)).toBe('1.0 MB');
    expect(formatBytes(1234567)).toBe('1.2 MB');
    expect(formatBytes(7340032)).toBe('7.3 MB');
    expect(formatBytes(123456789)).toBe('123.5 MB');
    expect(formatBytes(5000000000)).toBe('5.0 GB');
    expect(formatBytes(1500000000000)).toBe('1.5 TB');
  });
});
