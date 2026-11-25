// EZD-021 Step 3: the built-in recordings, keyed "<provider>/<purpose>". A later ticket adds its own entries.
// EZD-1408 adds the field task draft (server/jobs/handlers/field-task-draft-recording.ts).
// EZD-711 adds the property appraiser reads (server/jobs/ai-purposes/property-appraiser-recording.ts).
// EZD-606 adds the panel label and directory reads (server/jobs/ai-purposes/panel-read-recording.ts).
import { panelRecordings } from '../../../jobs/ai-purposes/panel-read-recording';
import { appraiserRecordings } from '../../../jobs/ai-purposes/property-appraiser-recording';
import { fieldTaskRecordings } from '../../../jobs/handlers/field-task-draft-recording';
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
  ...fieldTaskRecordings,
  ...appraiserRecordings,
  ...panelRecordings,
};
