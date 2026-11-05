// EZD-120c U1-U3 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-3, -4). Expected values: plan Decided "Save word"
// and "Next change" (S03 States; Q-0505; Q-0507 gaps 4, 5). The saved time is 15:45 UTC on 2026-11-04 and `now` is
// that time plus the elapsed milliseconds; the clock reads in UTC.
import { describe, expect, it } from 'vitest';
import { formatClock, nextSaveWordChangeMs, saveWord } from './save-state';

const SAVED_AT = Date.UTC(2026, 10, 4, 15, 45);
const saved = { status: 'saved' as const, lastSavedAt: SAVED_AT };

describe('EZD-120c save word', () => {
  it('U1 word: status and age give the word, and the minutes or the clock time', () => {
    const now = (e: number) => SAVED_AT + e;
    const word = (status: 'idle' | 'pending' | 'saving' | 'offline' | 'error') =>
      saveWord({ status, lastSavedAt: null }, SAVED_AT, 'UTC').key;
    expect(word('idle')).toBe('saved');
    expect(word('pending')).toBe('saving');
    expect(word('saving')).toBe('saving');
    expect(word('offline')).toBe('saved_on_device');
    expect(word('error')).toBe('not_saved');

    expect(saveWord(saved, now(0), 'UTC').key).toBe('saved_just_now');
    expect(saveWord(saved, now(59_999), 'UTC').key).toBe('saved_just_now');
    expect(saveWord(saved, now(60_000), 'UTC')).toEqual({
      key: 'saved_min_ago',
      params: { minutes: 1 },
    });
    expect(saveWord(saved, now(119_999), 'UTC')).toEqual({
      key: 'saved_min_ago',
      params: { minutes: 1 },
    });
    expect(saveWord(saved, now(3_599_999), 'UTC')).toEqual({
      key: 'saved_min_ago',
      params: { minutes: 59 },
    });
    expect(saveWord(saved, now(3_600_000), 'UTC')).toEqual({
      key: 'saved_at',
      params: { time: '3:45 PM' },
    });
    expect(saveWord({ status: 'saved', lastSavedAt: null }, SAVED_AT, 'UTC').key).toBe('saved');
  });

  it('U2 next: the milliseconds until the word changes, or null', () => {
    const next = (e: number) => nextSaveWordChangeMs(saved, SAVED_AT + e);
    expect(next(0)).toBe(60_000);
    expect(next(59_999)).toBe(1);
    expect(next(60_000)).toBe(60_000);
    expect(next(90_000)).toBe(30_000);
    expect(next(3_599_999)).toBe(1);
    expect(next(3_600_000)).toBeNull();
    expect(nextSaveWordChangeMs({ status: 'pending', lastSavedAt: SAVED_AT }, SAVED_AT)).toBeNull();
  });

  it('U3 clock: 12-hour time with AM or PM and a plain space', () => {
    expect(formatClock(Date.UTC(2026, 10, 4, 15, 45), 'UTC')).toBe('3:45 PM');
    expect(formatClock(Date.UTC(2026, 10, 4, 0, 5), 'UTC')).toBe('12:05 AM');
  });
});
