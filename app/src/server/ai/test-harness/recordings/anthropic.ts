// EZD-021 Step 3: synthetic Anthropic recordings, written from the Messages API reference (no key exists,
// Q-0003). Test data, not product wording.
import type { Recording } from '../recorded-fetch';

const message = (text: string) => ({
  id: 'msg_stub_echo',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 6 },
});

const recording = (purpose: string, text: string): Recording => ({
  provider: 'anthropic',
  purpose,
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'POST', url: 'https://api.anthropic.com/v1/messages' },
      response: { status: 200, headers: { 'request-id': 'req_stub_echo' }, json: message(text) },
    },
  ],
});

export const anthropicRecordings: Record<string, Recording> = {
  'anthropic/test.echo': recording('test.echo', 'EZD-021 stub response'),
  'anthropic/test.json': recording('test.json', '```json\n{"name":"stub","count":3}\n```'),
};
