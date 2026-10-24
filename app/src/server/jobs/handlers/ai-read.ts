// EZD-021 Step 5 (vault/plans/EZD-021.md): the ai_read job. The payload names a purpose and its input; the
// schema looks the purpose up and checks the input, so enqueueJob refuses an unknown purpose or bad input
// before the insert and the runner marks a bad stored row invalid_payload. The result is { purpose, output },
// output checked with the purpose's schema. No maxAttempts override: EZD-009's default (Q-0059 (a)); AiError
// retry stops every failure a later try cannot fix. Results hold no money (EZD-009 Step 1).
import { z } from 'zod';
import { getAiPurposes } from '../ai-purposes';
import type { JobHandler } from '../registry';

export type AiReadPayload = { purpose: string; input: unknown };
export type AiReadResult = { purpose: string; output: unknown };

const payloadSchema = z
  .object({ purpose: z.string(), input: z.unknown() })
  .superRefine((value, ctx) => {
    const purpose = getAiPurposes()[value.purpose];
    if (!purpose) {
      ctx.addIssue({ code: 'custom', path: ['purpose'], message: 'unknown_purpose' });
      return;
    }
    if (!purpose.input.safeParse(value.input).success) {
      ctx.addIssue({ code: 'custom', path: ['input'], message: 'invalid_input' });
    }
  });

const resultSchema = z
  .object({ purpose: z.string(), output: z.unknown() })
  .superRefine((value, ctx) => {
    const purpose = getAiPurposes()[value.purpose];
    if (!purpose || !purpose.output.safeParse(value.output).success) {
      ctx.addIssue({ code: 'custom', path: ['output'], message: 'invalid_output' });
    }
  });

export const aiReadHandler: JobHandler<AiReadPayload, never, AiReadResult> = {
  kind: 'ai_read',
  payload: payloadSchema as z.ZodType<AiReadPayload>,
  result: resultSchema as z.ZodType<AiReadResult>,
  async run(ctx) {
    const purpose = getAiPurposes()[ctx.payload.purpose];
    const input = purpose.input.parse(ctx.payload.input);
    const output = await purpose.run(ctx, input);
    return { done: { purpose: purpose.purpose, output } };
  },
};
