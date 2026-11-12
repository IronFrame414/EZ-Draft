// EZD-5602 T6-T8 (vault/plans/EZD-5602.md section 1 steps 6, 7, 9, Decided "D-Adapter", "D-Call", "D-Stubs",
// section 4; AC-EZD-5602-1, -5, -9, -11, -12). callClaudeWithUserKey on the stub recordings: one POST
// /v1/messages with the user's key in x-api-key and no Authorization header, no retry, each provider answer sorted
// into its class (P5601 D-Classify; Q-0638 provider errors), and the configuration throws of D-Call. The key is
// compared only as a boolean (L-018). Nothing reaches the network (net guard).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callClaudeWithUserKey } from './client';
import { AiError } from './errors';
import { UserAiKey } from './key-check';
import type { Recording } from './test-harness/recorded-fetch';
import { ASSISTANT_RECORDINGS } from './test-harness/recordings/anthropic';
import { clearStubRecordings, lastStubRequests, setStubRecording } from './test-harness/stub';
import type { ClaudeRequest } from './types';

const CANARY_KEY = 'sk-ant-api03-EZD5602CANARYKEY0000000000000000';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ENV = { AI_MODE: 'stub', ANTHROPIC_API_KEY: 'env-key' };

const request = (model: ClaudeRequest['model'], purpose = 'assistant.plan'): ClaudeRequest => ({
  purpose,
  model,
  maxTokens: 8192,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Add a door' }] }],
});

const call = (
  name: keyof typeof ASSISTANT_RECORDINGS,
  budgetMs = 5000,
  signal: AbortSignal = new AbortController().signal,
) => {
  setStubRecording('anthropic', 'assistant.plan', ASSISTANT_RECORDINGS[name]);
  return callClaudeWithUserKey({ signal, budgetMs }, request('opus'), new UserAiKey(CANARY_KEY), {
    env: ENV,
  });
};

function expectOneUserKeyRequest(label: string) {
  const requests = lastStubRequests('anthropic');
  expect(requests, label).toHaveLength(1);
  expect(requests[0].method, label).toBe('POST');
  expect(requests[0].url, label).toBe(MESSAGES_URL);
  expect(requests[0].headers['x-api-key'] === CANARY_KEY, label).toBe(true);
  expect(requests[0].headers.authorization, label).toBeUndefined();
  return requests[0];
}

async function aiErrorCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return (e as AiError).code;
  }
  return undefined;
}

beforeEach(() => {
  clearStubRecordings();
});
afterEach(() => {
  clearStubRecordings();
});

describe('EZD-5602 callClaudeWithUserKey', () => {
  it('T6 one POST /v1/messages with the user key, opus id, 8192 tokens, no tools, temperature or cache_control', async () => {
    const result = await call('add_door');
    const sent = expectOneUserKeyRequest('add_door');
    const body = JSON.parse(sent.bodyText ?? 'null') as Record<string, unknown>;
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.max_tokens).toBe(8192);
    expect('tools' in body).toBe(false);
    expect('temperature' in body).toBe(false);
    expect(sent.bodyText ?? '').not.toContain('cache_control');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ inputTokens: 3000, outputTokens: 1400 });
      expect(result.mode).toBe('stub');
    }
  });

  it('T7 each error recording maps to its class with one request; a timeout and an abort are timeout', async () => {
    const cases: Array<[keyof typeof ASSISTANT_RECORDINGS, string]> = [
      ['error_401', 'key_refused'],
      ['error_403', 'key_refused'],
      ['error_402', 'out_of_credit'],
      ['error_400_usage_limit', 'out_of_credit'],
      ['error_429_spend_limit', 'out_of_credit'],
      ['error_429', 'rate_limited'],
      ['error_400', 'request_refused'],
      ['error_404', 'request_refused'],
      ['error_413', 'request_refused'],
      ['error_500', 'unavailable'],
      ['error_504', 'unavailable'],
      ['error_529', 'unavailable'],
    ];
    for (const [name, failure] of cases) {
      clearStubRecordings();
      const result = await call(name);
      expect(result, name).toEqual({ ok: false, failure });
      expectOneUserKeyRequest(name);
    }

    clearStubRecordings();
    expect(await call('timeout', 50)).toEqual({ ok: false, failure: 'timeout' });
    expectOneUserKeyRequest('timeout budget 50');

    clearStubRecordings();
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    expect(await call('timeout', 5000, controller.signal)).toEqual({
      ok: false,
      failure: 'timeout',
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expectOneUserKeyRequest('timeout aborted');
  });

  it('T8 configuration throws: no AI_MODE, a recording that expects GET, a purpose with no recording', async () => {
    const key = new UserAiKey(CANARY_KEY);
    const ctx = () => ({ signal: new AbortController().signal, budgetMs: 5000 });

    expect(
      await aiErrorCode(() =>
        callClaudeWithUserKey(ctx(), request('opus'), key, {
          env: { ANTHROPIC_API_KEY: 'env-key' },
        }),
      ),
    ).toBe('ai_mode_not_set');

    const textOnly = ASSISTANT_RECORDINGS.text_only;
    const expectsGet: Recording = {
      ...textOnly,
      exchanges: textOnly.exchanges.map((e) => ({ ...e, match: { ...e.match, method: 'GET' } })),
    };
    setStubRecording('anthropic', 'assistant.plan', expectsGet);
    expect(
      await aiErrorCode(() => callClaudeWithUserKey(ctx(), request('opus'), key, { env: ENV })),
    ).toBe('ai_stub_mismatch');

    clearStubRecordings();
    expect(
      await aiErrorCode(() =>
        callClaudeWithUserKey(ctx(), request('opus', 'assistant.none'), key, { env: ENV }),
      ),
    ).toBe('ai_stub_no_recording');
  });
});
