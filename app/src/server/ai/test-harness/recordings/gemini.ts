// EZD-021 Step 3: synthetic Gemini image-edit recording (generateContent reference; the builder confirms field
// names). Test data only.
import type { Recording } from '../recorded-fetch';
import { STUB_PNG_B64 } from './image';

export const geminiRecordings: Record<string, Recording> = {
  'gemini/test.image_edit': {
    provider: 'gemini',
    purpose: 'test.image_edit',
    source: 'synthetic',
    exchanges: [
      {
        match: {
          method: 'POST',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/*',
        },
        response: {
          status: 200,
          json: {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ inlineData: { mimeType: 'image/png', data: STUB_PNG_B64 } }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 300,
              candidatesTokenCount: 1290,
              totalTokenCount: 1590,
            },
            responseId: 'gem_stub_1',
          },
        },
      },
    ],
  },
};
