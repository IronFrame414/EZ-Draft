// EZD-021 Step 3: synthetic OpenAI image-edit recording (images/edits reference; the builder confirms field
// names). Test data only.
import type { Recording } from '../recorded-fetch';
import { STUB_PNG_B64 } from './image';

export const openaiRecordings: Record<string, Recording> = {
  'openai/test.image_edit': {
    provider: 'openai',
    purpose: 'test.image_edit',
    source: 'synthetic',
    exchanges: [
      {
        match: { method: 'POST', url: 'https://api.openai.com/v1/images/edits' },
        response: {
          status: 200,
          headers: { 'x-request-id': 'oai_stub_1' },
          json: {
            created: 1760000000,
            data: [{ b64_json: STUB_PNG_B64 }],
            usage: { input_tokens: 300, output_tokens: 1056, total_tokens: 1356 },
          },
        },
      },
    ],
  },
};
