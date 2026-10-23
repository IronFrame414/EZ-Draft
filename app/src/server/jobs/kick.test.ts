// EZD-009 T21 (vault/plans/EZD-009.md Tests; Step 5 kick.ts): enqueue starts a run after the response.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  runJobs: vi.fn(async () => ({})),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./runner', () => ({ runJobs: mocks.runJobs }));

import { kickJobRunner } from './kick';

describe('EZD-009 kick on enqueue', () => {
  beforeEach(() => {
    mocks.after.mockReset();
    mocks.runJobs.mockClear();
  });

  it('EZD-009 T21 kickJobRunner registers one after() function that calls runJobs once', async () => {
    kickJobRunner();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    const args = mocks.after.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(typeof args[0]).toBe('function');
    expect(mocks.runJobs).toHaveBeenCalledTimes(0);
    await (args[0] as () => unknown)();
    expect(mocks.runJobs).toHaveBeenCalledTimes(1);
  });
});
