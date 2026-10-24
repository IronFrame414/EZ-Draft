// EZD-021 Step 3: synthetic Black Forest Labs recording: submit, two polls, then the delivered sample (the
// builder confirms statuses and field names). Test data only.
import type { Recording } from '../recorded-fetch';
import { STUB_PNG_B64 } from './image';

export const bflRecordings: Record<string, Recording> = {
  'bfl/test.image_edit': {
    provider: 'bfl',
    purpose: 'test.image_edit',
    source: 'synthetic',
    exchanges: [
      {
        match: { method: 'POST', url: 'https://api.bfl.ai/v1/*' },
        response: {
          status: 200,
          json: { id: 'bfl_stub_1', polling_url: 'https://api.bfl.ai/v1/get_result?id=bfl_stub_1' },
        },
      },
      {
        match: { method: 'GET', url: 'https://api.bfl.ai/v1/get_result?id=bfl_stub_1' },
        response: { status: 200, json: { id: 'bfl_stub_1', status: 'Pending' } },
      },
      {
        match: { method: 'GET', url: 'https://api.bfl.ai/v1/get_result?id=bfl_stub_1' },
        response: {
          status: 200,
          json: {
            id: 'bfl_stub_1',
            status: 'Ready',
            result: { sample: 'https://delivery.bfl.ai/stub/sample.png' },
          },
        },
      },
      {
        match: { method: 'GET', url: 'https://delivery.bfl.ai/stub/sample.png' },
        response: { status: 200, headers: { 'content-type': 'image/png' }, base64: STUB_PNG_B64 },
      },
    ],
  },
};
