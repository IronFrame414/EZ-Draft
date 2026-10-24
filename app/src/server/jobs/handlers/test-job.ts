// EZD-009 Step 5 (vault/plans/EZD-009.md): the Done when's test job. It sleeps stepMs per step and reports
// progress after each one; it stops early with a cursor when the next step will not fit the run's time
// (always doing at least one step per slice). It has no side effects, so it is safe to run twice.
import { z } from 'zod';
import type { JobHandler } from '../registry';

const payloadSchema = z.object({
  steps: z.number().int().min(1).max(20),
  stepMs: z.number().int().min(0).max(10000),
  failFirst: z.number().int().min(0).max(10).default(0),
});

export type TestJobPayload = { steps: number; stepMs: number; failFirst: number };

export const testJobHandler: JobHandler<TestJobPayload, { next: number }, { steps: number }> = {
  kind: 'test',
  payload: payloadSchema,
  state: z.object({ next: z.number().int().min(0) }),
  result: z.object({ steps: z.number().int() }),
  async run(ctx) {
    const { steps, stepMs, failFirst } = ctx.payload;
    if (ctx.job.attempts <= failFirst) throw new Error('test failure');
    const first = ctx.state?.next ?? 0;
    for (let i = first; i < steps; i++) {
      if (i > first && ctx.timeLeft() < stepMs) return { continue: { next: i } };
      await ctx.sleep(stepMs);
      await ctx.progress(Math.round((100 * (i + 1)) / steps));
    }
    return { done: { steps } };
  },
};
