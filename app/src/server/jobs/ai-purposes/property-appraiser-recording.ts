// EZD-711 (EZD-021 Step 3 "a later ticket adds its own entries"; CLAUDE.md rule 5): the purpose names of the property
// appraiser read and their built-in stub replies, one POST /v1/messages exchange each. This module imports no AI
// code, so the recordings (loaded by the AI client) can name the purposes. Synthetic test data: the fields of the
// recorded page (server/property-record/fixtures/pbc-page.ts).
import type { Recording } from '../../ai/test-harness/recorded-fetch';
import { PBC_FIXTURE_FIELDS } from '../../property-record/fixtures/pbc-page';

export const APPRAISER_READ_PURPOSE = 'property_appraiser.read';
export const APPRAISER_TEXT_PURPOSE = 'property_appraiser.text';
export const APPRAISER_SCREENSHOT_PURPOSE = 'property_appraiser.screenshot';

export const appraiserRecording = (purpose: string, reply: unknown = PBC_FIXTURE_FIELDS): Recording => ({
  provider: 'anthropic',
  purpose,
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'POST', url: 'https://api.anthropic.com/v1/messages' },
      response: {
        status: 200,
        headers: { 'request-id': `req_stub_${purpose.replace('.', '_')}` },
        json: {
          id: `msg_stub_${purpose.replace('.', '_')}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: JSON.stringify(reply) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 90 },
        },
      },
    },
  ],
});

export const appraiserRecordings: Record<string, Recording> = {
  [`anthropic/${APPRAISER_READ_PURPOSE}`]: appraiserRecording(APPRAISER_READ_PURPOSE),
  [`anthropic/${APPRAISER_TEXT_PURPOSE}`]: appraiserRecording(APPRAISER_TEXT_PURPOSE),
  [`anthropic/${APPRAISER_SCREENSHOT_PURPOSE}`]: appraiserRecording(APPRAISER_SCREENSHOT_PURPOSE),
};
