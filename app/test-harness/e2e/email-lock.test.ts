// EZD-016a T7 (vault/plans/EZD-016a.md section 4; Step 1: poll 100 ms, wait 30,000 ms, stale 60,000 ms).
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { lockPathFor, withEmailLock } from './email-lock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('EZD-016a email lock', () => {
  test('EZD-016a T7 (a) two runs for one email do not overlap', async () => {
    const spans: { start: number; end: number }[] = [];
    const run = () =>
      withEmailLock('a@x.test', async () => {
        const start = Date.now();
        await sleep(300);
        spans.push({ start, end: Date.now() });
      });
    await Promise.all([run(), run()]);
    expect(spans).toHaveLength(2);
    const [first, second] = [...spans].sort((x, y) => x.start - y.start);
    expect(second.start).toBeGreaterThanOrEqual(first.end);
  });

  test('EZD-016a T7 (b) runs for two emails overlap', async () => {
    const spans: { start: number; end: number }[] = [];
    const run = (email: string) =>
      withEmailLock(email, async () => {
        const start = Date.now();
        await sleep(300);
        spans.push({ start, end: Date.now() });
      });
    await Promise.all([run('a@x.test'), run('b@x.test')]);
    const [first, second] = [...spans].sort((x, y) => x.start - y.start);
    expect(second.start).toBeLessThan(first.end);
  });

  test('EZD-016a T7 (c) a lock file older than 60 s is taken over', async () => {
    const file = lockPathFor('c@x.test');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
    const old = new Date(Date.now() - 61_000);
    utimesSync(file, old, old);
    const t0 = Date.now();
    let ran = false;
    await withEmailLock('c@x.test', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(Date.now() - t0).toBeLessThanOrEqual(1000);
  });

  test('EZD-016a T7 (d) an error from fn is re-thrown and the lock file removed', async () => {
    const boom = new Error('boom');
    let caught: unknown;
    try {
      await withEmailLock('d@x.test', async () => {
        throw boom;
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect(existsSync(lockPathFor('d@x.test'))).toBe(false);
  });

  test('EZD-016a T7 (e) the lock path ignores case and ends in 16 hex and .lock', () => {
    expect(lockPathFor('A@X.test')).toBe(lockPathFor('a@x.test'));
    expect(path.basename(lockPathFor('A@X.test'))).toMatch(/^[0-9a-f]{16}\.lock$/);
  });
});
