// EZD-021 Step 3: the built-in recordings, keyed "<provider>/<purpose>". A later ticket adds its own entries.
import type { Recording } from '../recorded-fetch';
import { anthropicRecordings } from './anthropic';
import { bflRecordings } from './bfl';
import { geminiRecordings } from './gemini';
import { openaiRecordings } from './openai';

export const BUILT_IN_RECORDINGS: Record<string, Recording> = {
  ...anthropicRecordings,
  ...geminiRecordings,
  ...openaiRecordings,
  ...bflRecordings,
};
