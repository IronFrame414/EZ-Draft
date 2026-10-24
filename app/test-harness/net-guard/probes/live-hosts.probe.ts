// EZD-021 T12 (a): reaches six live hosts through fetch and https.request, each inside try/catch, and asserts
// nothing. The suite must still fail (the Vitest setup throws after the test). Run only by net-guard.test.ts.
import https from 'node:https';
import { describe, it } from 'vitest';

const URLS = [
  'https://api.anthropic.com/v1/messages',
  'https://generativelanguage.googleapis.com/',
  'https://api.openai.com/v1/images/edits',
  'https://api.bfl.ai/v1/flux-kontext-pro',
  'https://api.resend.com/emails',
  'https://o1.ingest.sentry.io/api/1/envelope/',
];

describe('EZD-021 probe: live hosts', () => {
  it('EZD-021 probe reaches live hosts and swallows the errors', async () => {
    for (const url of URLS) {
      try {
        await fetch(url, { method: 'POST' });
      } catch {
        // swallowed on purpose
      }
    }
    try {
      https.request('https://api.anthropic.com/');
    } catch {
      // swallowed on purpose
    }
  });
});
