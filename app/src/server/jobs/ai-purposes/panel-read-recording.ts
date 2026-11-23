// EZD-606 (EZD-021 Step 3 "a later ticket adds its own entries"; CLAUDE.md rule 5): the panel photo reads' stub
// replies, one POST /v1/messages exchange each. This module imports no AI code, so the recordings (loaded by the AI
// client) can name the purposes. Synthetic test data, not product wording: a 200 A, 40-space label and a short
// directory.
import type { Recording } from '../../ai/test-harness/recorded-fetch';
import { PANEL_DIRECTORY_PURPOSE, PANEL_LABEL_PURPOSE } from '../../../lib/electrical/panel-read';

export { PANEL_DIRECTORY_PURPOSE, PANEL_LABEL_PURPOSE };

export const PANEL_LABEL_STUB = { brand: 'Square D', rating: 200, spaces: 40 };
export const PANEL_DIRECTORY_STUB = {
  circuits: [
    { space: 1, name: 'Range', breaker: 40, poles: 2 },
    { space: 2, name: 'Kitchen counter', breaker: 20, poles: 1 },
    { space: 4, name: 'Bedrooms', breaker: 15, poles: 1 },
  ],
};

export const panelRecording = (purpose: string, reply: unknown): Recording => ({
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
          usage: { input_tokens: 1600, output_tokens: 60 },
        },
      },
    },
  ],
});

export const panelRecordings: Record<string, Recording> = {
  [`anthropic/${PANEL_LABEL_PURPOSE}`]: panelRecording(PANEL_LABEL_PURPOSE, PANEL_LABEL_STUB),
  [`anthropic/${PANEL_DIRECTORY_PURPOSE}`]: panelRecording(
    PANEL_DIRECTORY_PURPOSE,
    PANEL_DIRECTORY_STUB,
  ),
};
