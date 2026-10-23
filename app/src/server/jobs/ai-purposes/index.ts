// EZD-021 Step 5 (vault/plans/EZD-021.md): the ai_read purposes in this build. A function, so VERCEL_ENV is
// read per call (as getHandlers()). Production includes only production purposes (none yet); test purposes are
// never registered there. A later ticket adds its purpose here, with its recording and a run-twice test.
import type { ZodType } from 'zod';
import type { AiJobContext } from '../../ai';
import { testEchoPurpose } from './test-echo';

export type AiPurpose<I, O> = {
  purpose: string;
  input: ZodType<I>;
  output: ZodType<O>;
  run(ctx: AiJobContext, input: I): Promise<O>;
};

export function getAiPurposes(): Record<string, AiPurpose<unknown, unknown>> {
  const purposes: Record<string, AiPurpose<unknown, unknown>> = {};
  if (process.env.VERCEL_ENV !== 'production') {
    purposes[testEchoPurpose.purpose] = testEchoPurpose as AiPurpose<unknown, unknown>;
  }
  return purposes;
}
