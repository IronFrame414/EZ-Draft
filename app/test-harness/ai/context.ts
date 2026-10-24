// EZD-021 Step 3 (vault/plans/EZD-021.md): an AiJobContext for unit tests of the client outside the runner.
// `sleep` records its argument and advances a fake clock; `timeLeft()` is the budget minus that clock, so a
// polling loop sees its time run out without waiting. `signal` is a fresh AbortController's.
import type { AiJobContext } from '../../src/server/ai/types';

export type AiTestContext = AiJobContext & {
  /** Every argument `sleep` was called with, in order. */
  sleeps: number[];
  /** Milliseconds the fake clock has advanced. */
  elapsedMs(): number;
  controller: AbortController;
};

export function makeAiTestContext({
  timeLeftMs = 60000,
  job,
}: { timeLeftMs?: number; job?: Partial<AiJobContext['job']> } = {}): AiTestContext {
  const sleeps: number[] = [];
  let elapsed = 0;
  const controller = new AbortController();
  return {
    job: {
      id: '00000000-0000-4000-8000-00000000a021',
      tenant_id: '00000000-0000-4000-8000-00000000a001',
      project_id: null,
      kind: 'ai_read',
      attempts: 1,
      ...job,
    } as AiJobContext['job'],
    signal: controller.signal,
    timeLeft: () => timeLeftMs - elapsed,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      elapsed += ms;
    },
    sleeps,
    elapsedMs: () => elapsed,
    controller,
  };
}
