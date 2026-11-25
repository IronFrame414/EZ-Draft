// EZD-021 Step 5 (vault/plans/EZD-021.md): the ai_read purposes in this build. A function, so VERCEL_ENV is
// read per call (as getHandlers()). Production includes only production purposes (none yet); test purposes are
// never registered there. A later ticket adds its purpose here, with its recording and a run-twice test.
// EZD-711: the property appraiser reads (link, pasted text, screenshot), registered in production too.
// EZD-606: the panel label and directory photo reads, registered in production too.
import type { ZodType } from 'zod';
import type { ZodMiniType } from 'zod/mini';
import type { AiJobContext } from '../../ai';
import { panelDirectoryPurpose, panelLabelPurpose } from './panel-read';
import { appraiserReadPurpose } from './property-appraiser-read';
import { appraiserScreenshotPurpose } from './property-appraiser-screenshot';
import { appraiserTextPurpose } from './property-appraiser-text';
import { testEchoPurpose } from './test-echo';

export type AiPurpose<I, O> = {
  purpose: string;
  input: ZodType<I>;
  // EZD-1903: the output schemas shared with the browser (lib/) are zod/mini.
  output: ZodType<O> | ZodMiniType<O>;
  run(ctx: AiJobContext, input: I): Promise<O>;
};

export function getAiPurposes(): Record<string, AiPurpose<unknown, unknown>> {
  const purposes: Record<string, AiPurpose<unknown, unknown>> = {};
  for (const p of [
    appraiserReadPurpose,
    appraiserTextPurpose,
    appraiserScreenshotPurpose,
    panelLabelPurpose,
    panelDirectoryPurpose,
  ]) {
    purposes[p.purpose] = p as unknown as AiPurpose<unknown, unknown>;
  }
  if (process.env.VERCEL_ENV !== 'production') {
    purposes[testEchoPurpose.purpose] = testEchoPurpose as AiPurpose<unknown, unknown>;
  }
  return purposes;
}
