// EZD-711 (S01 Property appraiser link "Paste link; app reads parcel number, owner, legal description, year built,
// living area"; 07 Integrations "Claude ... property appraiser page reading"; S13 Controls): the link read. The job
// fetches the page from an appraiser host (server/property-record/import.ts) and Claude reads the five fields from
// its text. A link the server may not fetch, or a read that fails or is blocked, answers `unreadable`, so the screen
// offers "Paste page text" or "Paste screenshot" (S01). Safe to run twice: it writes nothing.
import { z } from 'zod';
import {
  appraiserReadOutputSchema,
  type AppraiserReadOutput,
  type PropertyFields,
} from '../../../lib/property-record/property-record';
import { callClaudeJson, type AiJobContext, type ClaudeContent } from '../../ai';
import { APPRAISER_URL_MAX } from '../../property-record/appraiser-hosts';
import { fetchAppraiserPage, pageText } from '../../property-record/import';
import type { AiPurpose } from './index';
import { APPRAISER_READ_PURPOSE } from './property-appraiser-recording';

export { APPRAISER_READ_PURPOSE };

// Claude answers each field or null; a value outside the column limits is dropped, not refused.
const looseText = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim();
      return t === '' || t.length > max ? null : t;
    });

const looseInt = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(v.replace(/[,\s]/g, '').replace(/sf$/i, ''));
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    });

export const appraiserReplySchema = z.object({
  parcelNo: looseText(64),
  owner: looseText(300),
  legalDescription: looseText(4000),
  yearBuilt: looseInt(1600, 2200),
  livingArea: looseInt(0, 2_147_483_647),
});

export const APPRAISER_PROMPT = [
  'You read a Florida county property appraiser parcel page for a remodeling contractor.',
  'Give the parcel control number (PCN or folio) as shown, the owner name(s), the legal description, the year built',
  'of the main building and its living area in square feet (heated or living area, not total area).',
  'Use null for anything the page does not show. Answer with JSON only:',
  '{"parcelNo":"…","owner":"…","legalDescription":"…","yearBuilt":1975,"livingArea":2140}',
].join('\n');

// One Claude call that reads the fields from page text or a screenshot.
export async function readAppraiserFields(
  ctx: AiJobContext,
  purpose: string,
  content: ClaudeContent,
): Promise<AppraiserReadOutput> {
  const { data } = await callClaudeJson(
    ctx,
    {
      purpose,
      model: 'sonnet',
      messages: [{ role: 'user', content: [{ type: 'text', text: APPRAISER_PROMPT }, content] }],
      maxTokens: 1200,
    },
    appraiserReplySchema,
  );
  const fields: PropertyFields = data;
  return Object.values(fields).every((v) => v === null) ? { status: 'unreadable' } : { status: 'read', fields };
}

export type AppraiserLinkInput = { url: string };

export const appraiserReadPurpose: AiPurpose<AppraiserLinkInput, AppraiserReadOutput> = {
  purpose: APPRAISER_READ_PURPOSE,
  input: z.object({ url: z.string().min(1).max(APPRAISER_URL_MAX) }).strict(),
  output: appraiserReadOutputSchema,
  async run(ctx, input) {
    const html = await fetchAppraiserPage(input.url, { signal: ctx.signal });
    if (html === null) return { status: 'unreadable' };
    const text = pageText(html);
    if (text === '') return { status: 'unreadable' };
    return readAppraiserFields(ctx, APPRAISER_READ_PURPOSE, { type: 'text', text });
  },
};
