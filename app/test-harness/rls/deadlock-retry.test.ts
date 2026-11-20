// EZD-426 AC-EZD-426-1: the harness retry reruns a unit of work on Postgres deadlock (40P01) only, at most
// 3 tries in total. Counts come from the acceptance criterion, not from running the code.
import { describe, expect, it } from 'vitest';
import { DEADLOCK_TRIES, retryOnDeadlock } from './deadlock-retry';

const pgError = (code: string) => Object.assign(new Error(`postgres ${code}`), { code });
const noWait = { waitMs: () => 0 };

describe('EZD-426 retryOnDeadlock', () => {
  it('EZD-426 allows at most 3 tries in total', () => {
    expect(DEADLOCK_TRIES).toBe(3);
  });

  it('EZD-426 two deadlocks then success resolves on the third try', async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls++;
      if (calls < 3) throw pgError('40P01');
      return 'done';
    }, noWait);
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('EZD-426 three deadlocks reject with the deadlock after exactly 3 tries', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls++;
        throw pgError('40P01');
      }, noWait),
    ).rejects.toMatchObject({ code: '40P01' });
    expect(calls).toBe(3);
  });

  it('EZD-426 any other error is thrown after 1 try', async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => {
        calls++;
        throw pgError('23503');
      }, noWait),
    ).rejects.toMatchObject({ code: '23503' });
    expect(calls).toBe(1);
  });

  it('EZD-426 waits between tries with the given wait', async () => {
    const waits: number[] = [];
    let calls = 0;
    await retryOnDeadlock(
      async () => {
        calls++;
        if (calls < 3) throw pgError('40P01');
      },
      { waitMs: (attempt) => (waits.push(attempt), 0) },
    );
    expect(waits).toEqual([1, 2]);
  });
});
