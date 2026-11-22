// EZD-711 (S01 Property appraiser link "On read failure, offer 'Paste page text' ... for AI extraction"): the pasted
// page text read. The text rides in the job payload, so it is capped at PASTED_TEXT_MAX_BYTES (payload limit 16 KB).
// Safe to run twice: it writes nothing.
import { z } from 'zod';
import {
  PASTED_TEXT_MAX_BYTES,
  appraiserReadOutputSchema,
  type AppraiserReadOutput,
} from '../../../lib/property-record/property-record';
import type { AiPurpose } from './index';
import { readAppraiserFields } from './property-appraiser-read';
import { APPRAISER_TEXT_PURPOSE } from './property-appraiser-recording';

export { APPRAISER_TEXT_PURPOSE };

export type AppraiserTextInput = { text: string };

export const appraiserTextPurpose: AiPurpose<AppraiserTextInput, AppraiserReadOutput> = {
  purpose: APPRAISER_TEXT_PURPOSE,
  input: z
    .object({
      text: z
        .string()
        .refine((t) => t.trim() !== '')
        .refine((t) => Buffer.byteLength(t, 'utf8') <= PASTED_TEXT_MAX_BYTES),
    })
    .strict(),
  output: appraiserReadOutputSchema,
  async run(ctx, input) {
    return readAppraiserFields(ctx, APPRAISER_TEXT_PURPOSE, { type: 'text', text: input.text.trim() });
  },
};
