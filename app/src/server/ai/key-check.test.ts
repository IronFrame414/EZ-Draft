// EZD-5601 T4, T5 and T6 (vault/plans/EZD-5601.md section 1 steps 8-10, "D-Check", "D-Classify", section 4;
// AC-EZD-5601-1, -2, -4). UserAiKey never shows its value, classifyAnthropicError sorts provider answers, and
// checkAnthropicKey asks GET /v1/models on the stub recording. Response bodies are the plan's section 4
// list; the 429 spend body is verbatim from R-055:30. Nothing reaches the network (net guard).
import { randomUUID } from 'node:crypto';
import util from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { AiError } from './errors';
import { checkAnthropicKey, UserAiKey } from './key-check';
import { classifyAnthropicError } from './providers/anthropic';
import type { Recording } from './test-harness/recorded-fetch';
import { clearStubRecordings, lastStubRequests, setStubRecording } from './test-harness/stub';

const CANARY = 'sk-ant-api03-EZD5601CANARY' + randomUUID().replaceAll('-', '');
const MODELS_URL = 'https://api.anthropic.com/v1/models';

const errorBody = (type: string, message: string) => ({
  type: 'error',
  error: { type, message },
  request_id: 'req_1',
});
const SPEND_429 = {
  type: 'error',
  error: {
    type: 'rate_limit_error',
    message:
      "You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-09-01 at 00:00 UTC.",
    details: { error_code: 'enforced_spend_limit_reached' },
  },
  request_id: 'req_018EeWyXxfu5pfWkrYcMdjWG',
};
const USAGE_400 = errorBody(
  'invalid_request_error',
  'You have reached your specified API usage limits. You will regain access on 2026-09-01 at 00:00 UTC.',
);

const keyCheck = (status: number, json: unknown, delayMs?: number): Recording => ({
  provider: 'anthropic',
  purpose: 'key-check',
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'GET', url: `${MODELS_URL}*` },
      response: { status, json, ...(delayMs === undefined ? {} : { delayMs }) },
    },
  ],
});

afterEach(() => {
  clearStubRecordings();
});

describe('EZD-5601 UserAiKey', () => {
  it('T4 shows [redacted] everywhere except reveal()', () => {
    const k = new UserAiKey(CANARY);
    expect(String(k)).toBe('[redacted]');
    expect(`${k}`).toBe('[redacted]');
    expect(JSON.stringify({ k })).toBe('{"k":"[redacted]"}');
    const shown = util.inspect(k, { depth: 5, showHidden: true });
    expect(shown).toContain('[redacted]');
    expect(shown.includes(CANARY)).toBe(false);
    expect(k.reveal() === CANARY).toBe(true);
  });
});

describe('EZD-5601 classifyAnthropicError', () => {
  it('T5 sorts statuses and bodies into the five classes of D-Classify', () => {
    expect(
      classifyAnthropicError(401, errorBody('authentication_error', 'invalid x-api-key')),
    ).toBe('key_refused');
    expect(classifyAnthropicError(403, errorBody('permission_error', 'no'))).toBe('key_refused');
    expect(classifyAnthropicError(402, errorBody('billing_error', 'no'))).toBe('out_of_credit');
    expect(classifyAnthropicError(400, USAGE_400)).toBe('out_of_credit');
    expect(classifyAnthropicError(429, SPEND_429)).toBe('out_of_credit');
    expect(classifyAnthropicError(429, errorBody('rate_limit_error', 'slow down'))).toBe(
      'rate_limited',
    );
    expect(classifyAnthropicError(400, errorBody('invalid_request_error', 'bad field'))).toBe(
      'request_refused',
    );
    expect(classifyAnthropicError(404, errorBody('not_found_error', 'no'))).toBe('request_refused');
    expect(classifyAnthropicError(413, errorBody('request_too_large', 'no'))).toBe(
      'request_refused',
    );
    expect(classifyAnthropicError(500, errorBody('api_error', 'no'))).toBe('unavailable');
    expect(classifyAnthropicError(504, errorBody('timeout_error', 'no'))).toBe('unavailable');
    expect(classifyAnthropicError(529, errorBody('overloaded_error', 'no'))).toBe('unavailable');
    expect(classifyAnthropicError(undefined, undefined)).toBe('unavailable');
    // a body that is not an object reads as no message
    expect(classifyAnthropicError(400, 'plain text')).toBe('request_refused');
    expect(classifyAnthropicError(429, null)).toBe('rate_limited');
  });
});

describe('EZD-5601 checkAnthropicKey', () => {
  const env = { ANTHROPIC_API_KEY: 'env-key', AI_MODE: 'stub' };
  const check = (opts: { budgetMs?: number } = {}) =>
    checkAnthropicKey(new UserAiKey(CANARY), { env, ...opts });

  function expectOneKeyRequest() {
    const requests = lastStubRequests('anthropic');
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url.startsWith(MODELS_URL)).toBe(true);
    expect(requests[0].headers['x-api-key'] === CANARY).toBe(true);
    expect(requests[0].headers.authorization).toBeUndefined();
  }

  it('T6 ok on the built-in recording: one GET /v1/models with the user key and not the env key', async () => {
    expect(await check()).toBe('ok');
    expectOneKeyRequest();
  });

  it('T6 each provider answer maps to its result and the key header stays the user key', async () => {
    const cases: Array<[string, number, unknown, string]> = [
      ['401', 401, errorBody('authentication_error', 'invalid x-api-key'), 'refused'],
      ['403', 403, errorBody('permission_error', 'no'), 'refused'],
      ['402', 402, errorBody('billing_error', 'no'), 'out_of_credit'],
      ['429 spend', 429, SPEND_429, 'out_of_credit'],
      ['400 usage', 400, USAGE_400, 'out_of_credit'],
      ['429 plain', 429, errorBody('rate_limit_error', 'slow down'), 'failed'],
      ['500', 500, errorBody('api_error', 'no'), 'failed'],
      ['529', 529, errorBody('overloaded_error', 'no'), 'failed'],
    ];
    for (const [name, status, json, expected] of cases) {
      setStubRecording('anthropic', 'key-check', keyCheck(status, json));
      expect(await check(), name).toBe(expected);
      expectOneKeyRequest();
      clearStubRecordings();
    }
  });

  it('T6 a call slower than its budget is failed', async () => {
    setStubRecording('anthropic', 'key-check', keyCheck(200, { data: [] }, 500));
    expect(await check({ budgetMs: 50 })).toBe('failed');
    expect(lastStubRequests('anthropic')[0]?.headers['x-api-key'] === CANARY).toBe(true);
  });

  it('T6 AI_MODE unset throws AiError ai_mode_not_set', async () => {
    let caught: unknown;
    try {
      await checkAnthropicKey(new UserAiKey(CANARY), { env: { ANTHROPIC_API_KEY: 'env-key' } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AiError);
    expect((caught as AiError).code).toBe('ai_mode_not_set');
  });
});
