// EZD-021 T3-T11 and T22 (vault/plans/EZD-021.md section 4): the AI client, the four adapters and the stub
// providers. Everything runs in stub mode (AI_MODE=stub from app/vitest.config.mts) on the recordings of
// src/server/ai/test-harness; the net guard (vitest.setup.ts) fails any test that reaches a live host.
// Expected values come from the plan's Step 1 tables, Step 3 recordings and the inputs below.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { makeAiTestContext } from '../../../test-harness/ai/context';
import { blockedAttempts } from '../../../test-harness/net-guard/net-guard.mjs';
import { getAiMode, getProviderBaseUrl } from './config';
import { AiError } from './errors';
import { callClaude, callClaudeJson, editImage } from './index';
import type { RecordedExchange, Recording } from './test-harness/recorded-fetch';
import { BUILT_IN_RECORDINGS } from './test-harness/recordings';
import { STUB_PNG, STUB_PNG_B64 } from './test-harness/recordings/image';
import { clearStubRecordings, lastStubRequests, setStubRecording } from './test-harness/stub';
import type { AiProvider, ClaudeRequest, ImageEditRequest } from './types';

const ECHO_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_IDS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;
const PROVIDERS: AiProvider[] = ['anthropic', 'gemini', 'openai', 'bfl'];

const CLAUDE_REQ: ClaudeRequest = {
  purpose: 'test.echo',
  model: 'haiku',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'EZD-021 hello' }] }],
  maxTokens: 64,
};
const IMAGE = { mediaType: 'image/png' as const, data: STUB_PNG };
const imageReq = (provider: ImageEditRequest['provider'], model: string): ImageEditRequest => ({
  purpose: 'test.image_edit',
  provider,
  model,
  instruction: 'Paint the walls white',
  image: IMAGE,
});
const GEMINI_REQ = imageReq('gemini', 'gemini-test-model');
const OPENAI_REQ = imageReq('openai', 'gpt-image-test');
const BFL_REQ = imageReq('bfl', 'flux-kontext-pro');

const anthropicOk = (text: string, extra: Record<string, unknown> = {}) => ({
  id: 'msg_x',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 6 },
  ...extra,
});
const recording = (
  provider: AiProvider,
  purpose: string,
  exchanges: RecordedExchange[],
): Recording => ({ provider, purpose, source: 'synthetic', exchanges });
const echoWith = (response: RecordedExchange['response'], purpose = 'test.echo') =>
  recording('anthropic', purpose, [{ match: { method: 'POST', url: ECHO_URL }, response }]);

async function aiError(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiError);
    return error as AiError;
  }
  throw new Error('expected the call to reject with an AiError');
}

async function expectAiError(promise: Promise<unknown>, code: string, retry: boolean) {
  const error = await aiError(promise);
  expect(error.code).toBe(code);
  expect(error.retry).toBe(retry);
  return error;
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PNG_SHA = sha256(STUB_PNG);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function expectStubPng(image: { mediaType: string; data: Uint8Array }) {
  expect(image.mediaType).toBe('image/png');
  expect(sha256(image.data)).toBe(PNG_SHA);
  expect(Array.from(image.data.slice(0, 8))).toEqual(PNG_SIGNATURE);
}

const jsonBody = (request: { bodyText?: string }) =>
  JSON.parse(request.bodyText ?? 'null') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('EZD-021 AI client and stub providers', () => {
  let guardBefore = 0;
  const originalMode = process.env.AI_MODE;

  beforeEach(() => {
    clearStubRecordings();
    guardBefore = blockedAttempts().length;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (originalMode === undefined) delete process.env.AI_MODE;
    else process.env.AI_MODE = originalMode;
    expect(blockedAttempts().length, 'no guard attempts').toBe(guardBefore);
  });

  // T3 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T3 mode and keys', async () => {
    // (a) AI_MODE unset, (b) not stub / live
    expect(() => getAiMode({})).toThrow(AiError);
    try {
      getAiMode({});
    } catch (error) {
      expect((error as AiError).code).toBe('ai_mode_not_set');
      expect((error as AiError).retry).toBe(false);
    }
    delete process.env.AI_MODE;
    await expectAiError(callClaude(makeAiTestContext(), CLAUDE_REQ), 'ai_mode_not_set', false);
    vi.stubEnv('AI_MODE', 'test');
    await expectAiError(callClaude(makeAiTestContext(), CLAUDE_REQ), 'ai_mode_not_set', false);
    await expectAiError(editImage(makeAiTestContext(), GEMINI_REQ), 'ai_mode_not_set', false);

    // (c) stub is refused in production
    try {
      getAiMode({ AI_MODE: 'stub', VERCEL_ENV: 'production' });
      throw new Error('expected getAiMode to throw');
    } catch (error) {
      expect((error as AiError).code).toBe('ai_stub_not_allowed');
      expect((error as AiError).retry).toBe(false);
    }
    vi.stubEnv('AI_MODE', 'stub');
    vi.stubEnv('VERCEL_ENV', 'production');
    await expectAiError(callClaude(makeAiTestContext(), CLAUDE_REQ), 'ai_stub_not_allowed', false);

    // (d) preview: the stub works
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await callClaude(makeAiTestContext(), CLAUDE_REQ)).mode).toBe('stub');

    // (e)-(g) live with only the Anthropic key: every image provider fails with its own missing key
    vi.stubEnv('AI_MODE', 'live');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'k');
    for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'BFL_API_KEY']) vi.stubEnv(name, '');
    for (const req of [GEMINI_REQ, OPENAI_REQ, BFL_REQ]) {
      const error = await expectAiError(
        editImage(makeAiTestContext(), req),
        'ai_key_not_set',
        false,
      );
      expect(error.message).toBe('AI key not set');
    }

    // (h) stub mode never reads a real key
    vi.stubEnv('AI_MODE', 'stub');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-real');
    await callClaude(makeAiTestContext(), CLAUDE_REQ);
    const [request] = lastStubRequests('anthropic');
    expect(request.headers['x-api-key']).toBe('stub-key');
    expect(JSON.stringify(request)).not.toContain('sk-real');
  });

  // T4 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T4 Claude wire request and result', async () => {
    for (const alias of ['opus', 'sonnet', 'haiku'] as const) {
      const result = await callClaude(makeAiTestContext(), { ...CLAUDE_REQ, model: alias });
      const requests = lastStubRequests('anthropic');
      expect(requests, alias).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
      expect(requests[0].url).toBe(ECHO_URL);
      expect(jsonBody(requests[0]).model).toBe(CLAUDE_IDS[alias]);
      expect(requests[0].headers['anthropic-version']).toBeTruthy();
      expect(requests[0].headers['x-api-key']).toBe('stub-key');
      expect(result.text).toBe('EZD-021 stub response');
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 6 });
      expect(result.requestId).toBe('req_stub_echo');
      expect(result.modelId).toBe(CLAUDE_IDS[alias]);
      expect(result.mode).toBe('stub');
    }

    await callClaude(makeAiTestContext(), {
      purpose: 'test.echo',
      model: 'haiku',
      system: 'S',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', image: IMAGE },
          ],
        },
      ],
      maxTokens: 64,
    });
    const body = jsonBody(lastStubRequests('anthropic')[0]);
    expect(body.system).toBe('S');
    expect(body.temperature).toBe(0);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: STUB_PNG_B64 } },
    ]);
  });

  // T5 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T5 JSON helper', async () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    const jsonReq: ClaudeRequest = { ...CLAUDE_REQ, purpose: 'test.json' };
    const ok = await callClaudeJson(makeAiTestContext(), jsonReq, schema);
    expect(ok.data).toEqual({ name: 'stub', count: 3 });

    setStubRecording(
      'anthropic',
      'test.json',
      echoWith({ status: 200, json: anthropicOk('not json') }, 'test.json'),
    );
    await expectAiError(
      callClaudeJson(makeAiTestContext(), jsonReq, schema),
      'ai_bad_response',
      false,
    );

    setStubRecording(
      'anthropic',
      'test.json',
      echoWith({ status: 200, json: anthropicOk('{"name":"stub"}') }, 'test.json'),
    );
    await expectAiError(
      callClaudeJson(makeAiTestContext(), jsonReq, schema),
      'ai_bad_response',
      false,
    );
  });

  // T6 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T6 error mapping', async () => {
    const table: Array<[number, string, boolean]> = [
      [401, 'ai_key_rejected', false],
      [403, 'ai_key_rejected', false],
      [400, 'ai_provider_rejected', false],
      [404, 'ai_provider_rejected', false],
      [429, 'ai_rate_limited', true],
      [500, 'ai_provider_unavailable', true],
      [529, 'ai_provider_unavailable', true],
    ];
    for (const [status, code, retry] of table) {
      setStubRecording(
        'anthropic',
        'test.echo',
        echoWith({
          status,
          json: { type: 'error', error: { type: 'api_error', message: 'SECRET-BODY-MARKER' } },
        }),
      );
      const error = await expectAiError(callClaude(makeAiTestContext(), CLAUDE_REQ), code, retry);
      expect(error.message, String(status)).not.toContain('SECRET-BODY-MARKER');
      expect(error.message, String(status)).not.toContain('stub-key');
      expect(lastStubRequests('anthropic'), String(status)).toHaveLength(1);
    }

    // a network error: live mode with a global fetch that throws a TypeError
    vi.stubEnv('AI_MODE', 'live');
    vi.stubEnv('ANTHROPIC_API_KEY', 'live-key-xyz');
    const failing = vi.fn(() => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', failing);
    const network = await expectAiError(
      callClaude(makeAiTestContext(), CLAUDE_REQ),
      'ai_provider_unavailable',
      true,
    );
    expect(network.message).not.toContain('live-key-xyz');
    expect(failing).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.stubEnv('AI_MODE', 'stub');

    // the call's time runs out while the provider is slow
    setStubRecording(
      'anthropic',
      'test.echo',
      echoWith({ status: 200, json: anthropicOk('late'), delayMs: 500 }),
    );
    await expectAiError(
      callClaude(makeAiTestContext({ timeLeftMs: 50 }), CLAUDE_REQ),
      'ai_provider_timeout',
      true,
    );

    // an answer with no text
    setStubRecording(
      'anthropic',
      'test.echo',
      echoWith({ status: 200, json: anthropicOk('x', { content: [] }) }),
    );
    await expectAiError(callClaude(makeAiTestContext(), CLAUDE_REQ), 'ai_no_output', false);
    expect(lastStubRequests('anthropic')).toHaveLength(1);
  });

  // T7 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T7 Gemini adapter', async () => {
    const result = await editImage(makeAiTestContext(), GEMINI_REQ);
    const [request] = lastStubRequests('gemini');
    expect(lastStubRequests('gemini')).toHaveLength(1);
    expect(request.method).toBe('POST');
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
    );
    expect(request.headers['x-goog-api-key']).toBe('stub-key');
    const body = jsonBody(request);
    expect(body.contents[0].parts).toEqual(
      expect.arrayContaining([
        { text: 'Paint the walls white' },
        { inlineData: { mimeType: 'image/png', data: STUB_PNG_B64 } },
      ]),
    );
    expect(body.generationConfig.responseModalities).toContain('IMAGE');
    expectStubPng(result.image);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 1290, images: 1 });
    expect(result.requestId).toBe('gem_stub_1');
    expect(result.mode).toBe('stub');

    setStubRecording(
      'gemini',
      'test.image_edit',
      recording('gemini', 'test.image_edit', [
        {
          match: {
            method: 'POST',
            url: 'https://generativelanguage.googleapis.com/v1beta/models/*',
          },
          response: {
            status: 200,
            json: {
              candidates: [
                { content: { role: 'model', parts: [{ text: 'no' }] }, finishReason: 'SAFETY' },
              ],
            },
          },
        },
      ]),
    );
    await expectAiError(editImage(makeAiTestContext(), GEMINI_REQ), 'ai_no_output', false);
  });

  // T8 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T8 OpenAI adapter', async () => {
    const result = await editImage(makeAiTestContext(), OPENAI_REQ);
    const [request] = lastStubRequests('openai');
    expect(lastStubRequests('openai')).toHaveLength(1);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.openai.com/v1/images/edits');
    expect(request.headers.authorization).toBe('Bearer stub-key');
    const form = request.formData as FormData;
    expect(form.get('model')).toBe('gpt-image-test');
    expect(form.get('prompt')).toBe('Paint the walls white');
    const files = Array.from(form.entries())
      .map(([, value]) => value)
      .filter((value): value is File => typeof value !== 'string');
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('image/png');
    expect(sha256(new Uint8Array(await files[0].arrayBuffer()))).toBe(PNG_SHA);
    expectStubPng(result.image);
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 1056, images: 1 });
    expect(result.requestId).toBe('oai_stub_1');

    const openaiRec = (response: RecordedExchange['response']) =>
      recording('openai', 'test.image_edit', [
        { match: { method: 'POST', url: 'https://api.openai.com/v1/images/edits' }, response },
      ]);
    setStubRecording('openai', 'test.image_edit', openaiRec({ status: 200, json: { created: 1 } }));
    await expectAiError(editImage(makeAiTestContext(), OPENAI_REQ), 'ai_bad_response', false);
    setStubRecording(
      'openai',
      'test.image_edit',
      openaiRec({ status: 400, json: { error: { message: 'bad' } } }),
    );
    await expectAiError(editImage(makeAiTestContext(), OPENAI_REQ), 'ai_provider_rejected', false);
  });

  // T9 -------------------------------------------------------------------------------------------------------
  it('EZD-021 T9 BFL adapter', async () => {
    const POLL = 'https://api.bfl.ai/v1/get_result?id=bfl_stub_1';
    const submit = (polling = POLL): RecordedExchange => ({
      match: { method: 'POST', url: 'https://api.bfl.ai/v1/*' },
      response: { status: 200, json: { id: 'bfl_stub_1', polling_url: polling } },
    });
    const poll = (json: unknown, url = POLL): RecordedExchange => ({
      match: { method: 'GET', url },
      response: { status: 200, json },
    });
    const bfl = (...exchanges: RecordedExchange[]) =>
      setStubRecording('bfl', 'test.image_edit', recording('bfl', 'test.image_edit', exchanges));
    const urls = () => lastStubRequests('bfl').map((r) => `${r.method} ${r.url}`);

    // (a) the built-in recording
    const ctx = makeAiTestContext();
    const result = await editImage(ctx, BFL_REQ);
    const requests = lastStubRequests('bfl');
    expect(urls()).toEqual([
      'POST https://api.bfl.ai/v1/flux-kontext-pro',
      `GET ${POLL}`,
      `GET ${POLL}`,
      'GET https://delivery.bfl.ai/stub/sample.png',
    ]);
    expect(requests[0].headers['x-key']).toBe('stub-key');
    expect(jsonBody(requests[0]).prompt).toBe('Paint the walls white');
    expect(jsonBody(requests[0]).input_image).toBe(STUB_PNG_B64);
    expect(requests[1].headers['x-key']).toBe('stub-key');
    expect(requests[2].headers['x-key']).toBe('stub-key');
    expect(requests[3].headers['x-key']).toBeUndefined();
    expect(ctx.sleeps).toEqual([1000]);
    expectStubPng(result.image);
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null, images: 1 });
    expect(result.requestId).toBe('bfl_stub_1');

    // (b) a polling URL on another host: refused, and nothing is sent to it
    bfl(
      submit('https://evil.example/x'),
      poll({ id: 'bfl_stub_1', status: 'Pending' }, 'https://evil.example/x'),
    );
    await expectAiError(editImage(makeAiTestContext(), BFL_REQ), 'ai_bad_response', false);
    expect(urls().some((u) => u.includes('evil.example'))).toBe(false);

    // (c) a delivery URL that is not https: refused, and nothing is sent to it
    bfl(
      submit(),
      poll({
        id: 'bfl_stub_1',
        status: 'Ready',
        result: { sample: 'http://delivery.bfl.ai/a.png' },
      }),
      {
        match: { method: 'GET', url: 'http://delivery.bfl.ai/a.png' },
        response: { status: 200, headers: { 'content-type': 'image/png' }, base64: STUB_PNG_B64 },
      },
    );
    await expectAiError(editImage(makeAiTestContext(), BFL_REQ), 'ai_bad_response', false);
    expect(urls().some((u) => u.includes('http://delivery.bfl.ai'))).toBe(false);

    // (d) moderated
    bfl(submit(), poll({ id: 'bfl_stub_1', status: 'Content Moderated' }));
    await expectAiError(editImage(makeAiTestContext(), BFL_REQ), 'ai_no_output', false);

    // (e) provider error status
    bfl(submit(), poll({ id: 'bfl_stub_1', status: 'Error' }));
    await expectAiError(editImage(makeAiTestContext(), BFL_REQ), 'ai_provider_unavailable', true);

    // (f) the call's time runs out while the result is still pending
    bfl(
      submit(),
      poll({ id: 'bfl_stub_1', status: 'Pending' }),
      poll({ id: 'bfl_stub_1', status: 'Pending' }),
      poll({ id: 'bfl_stub_1', status: 'Pending' }),
    );
    const slow = makeAiTestContext({ timeLeftMs: 2500 });
    await expectAiError(editImage(slow, BFL_REQ), 'ai_provider_timeout', true);
    expect(slow.sleeps).toHaveLength(2);
  });

  // T10 ------------------------------------------------------------------------------------------------------
  it('EZD-021 T10 stub lookup', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd021-stub-'));
    try {
      vi.stubEnv('AI_STUB_DIR', dir);
      // (a) built-in only
      expect((await callClaude(makeAiTestContext(), CLAUDE_REQ)).text).toBe(
        'EZD-021 stub response',
      );

      // (b) a file in the stub folder wins over the built-in
      mkdirSync(path.join(dir, 'anthropic'));
      const fromFile = (text: string) => echoWith({ status: 200, json: anthropicOk(text) });
      writeFileSync(
        path.join(dir, 'anthropic', 'test.echo.json'),
        JSON.stringify(fromFile('from file')),
      );
      expect((await callClaude(makeAiTestContext(), CLAUDE_REQ)).text).toBe('from file');

      // (c) an in-process override wins over the file
      setStubRecording('anthropic', 'test.echo', fromFile('from memory'));
      expect((await callClaude(makeAiTestContext(), CLAUDE_REQ)).text).toBe('from memory');

      // (d) no recording
      await expectAiError(
        callClaude(makeAiTestContext(), { ...CLAUDE_REQ, purpose: 'test.missing' }),
        'ai_stub_no_recording',
        false,
      );

      // (e) a recording with one exchange where the adapter needs two
      setStubRecording(
        'bfl',
        'test.image_edit',
        recording('bfl', 'test.image_edit', [
          {
            match: { method: 'POST', url: 'https://api.bfl.ai/v1/*' },
            response: {
              status: 200,
              json: {
                id: 'bfl_stub_1',
                polling_url: 'https://api.bfl.ai/v1/get_result?id=bfl_stub_1',
              },
            },
          },
        ]),
      );
      await expectAiError(editImage(makeAiTestContext(), BFL_REQ), 'ai_stub_mismatch', false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(blockedAttempts().length).toBe(guardBefore);
  });

  // T11 ------------------------------------------------------------------------------------------------------
  it('EZD-021 T11 request validation', async () => {
    const snapshot = () => PROVIDERS.map((p) => lastStubRequests(p).length);
    const before = snapshot();
    const bad = <T>(base: T, patch: Record<string, unknown>) => ({ ...base, ...patch }) as T;
    const claude: ClaudeRequest[] = [
      bad(CLAUDE_REQ, { purpose: 'Echo' }),
      bad(CLAUDE_REQ, { purpose: 'test' }),
      bad(CLAUDE_REQ, { purpose: 'test.' }),
      bad(CLAUDE_REQ, { maxTokens: 0 }),
      bad(CLAUDE_REQ, { messages: [] }),
      bad(CLAUDE_REQ, {
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }],
      }),
      bad(CLAUDE_REQ, {
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: { mediaType: 'image/gif', data: STUB_PNG } }],
          },
        ],
      }),
      bad(CLAUDE_REQ, { model: 'gpt' }),
    ];
    for (const req of claude) {
      await expectAiError(callClaude(makeAiTestContext(), req), 'ai_invalid_request', false);
    }
    const images: ImageEditRequest[] = [
      bad(GEMINI_REQ, { provider: 'midjourney' }),
      bad(GEMINI_REQ, { model: 'a/b' }),
      bad(GEMINI_REQ, { model: '../x' }),
      bad(GEMINI_REQ, { model: '' }),
      bad(GEMINI_REQ, { instruction: '' }),
    ];
    for (const req of images) {
      await expectAiError(editImage(makeAiTestContext(), req), 'ai_invalid_request', false);
    }
    expect(snapshot()).toEqual(before);
  });

  // T22 ------------------------------------------------------------------------------------------------------
  it('EZD-021 T22 configurable endpoints (Q-0076)', async () => {
    // (a) defaults
    expect(getProviderBaseUrl('gemini', {})).toBe('https://generativelanguage.googleapis.com');
    expect(getProviderBaseUrl('bfl', {})).toBe('https://api.bfl.ai');

    // (b) a Gemini proxy
    vi.stubEnv('GEMINI_BASE_URL', 'https://gemini-proxy.example.test/');
    const geminiResponse = BUILT_IN_RECORDINGS['gemini/test.image_edit'].exchanges[0].response;
    setStubRecording(
      'gemini',
      'test.image_edit',
      recording('gemini', 'test.image_edit', [
        {
          match: { method: 'POST', url: 'https://gemini-proxy.example.test/v1beta/models/*' },
          response: geminiResponse,
        },
      ]),
    );
    const viaProxy = await editImage(makeAiTestContext(), GEMINI_REQ);
    expect(lastStubRequests('gemini').map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST https://gemini-proxy.example.test/v1beta/models/gemini-test-model:generateContent',
    ]);
    expectStubPng(viaProxy.image);

    // (c) a Flux proxy; the delivery host is still bfl.ai
    vi.stubEnv('BFL_BASE_URL', 'https://bfl-proxy.example.test');
    const POLL = 'https://bfl-proxy.example.test/v1/get_result?id=bfl_stub_1';
    setStubRecording(
      'bfl',
      'test.image_edit',
      recording('bfl', 'test.image_edit', [
        {
          match: { method: 'POST', url: 'https://bfl-proxy.example.test/v1/*' },
          response: { status: 200, json: { id: 'bfl_stub_1', polling_url: POLL } },
        },
        {
          match: { method: 'GET', url: POLL },
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
      ]),
    );
    const flux = await editImage(makeAiTestContext(), BFL_REQ);
    const sent = lastStubRequests('bfl');
    expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST https://bfl-proxy.example.test/v1/flux-kontext-pro',
      `GET ${POLL}`,
      'GET https://delivery.bfl.ai/stub/sample.png',
    ]);
    expect(sent[1].headers['x-key']).toBe('stub-key');
    expect(sent[2].headers['x-key']).toBeUndefined();
    expectStubPng(flux.image);
    vi.unstubAllEnvs();

    // (d) values that are refused: no request is sent
    clearStubRecordings();
    for (const value of [
      'http://gemini-proxy.example.test',
      'not a url',
      'https://gemini-proxy.example.test/?a=1',
      'https://u:p@gemini-proxy.example.test',
    ]) {
      vi.stubEnv('GEMINI_BASE_URL', value);
      await expectAiError(editImage(makeAiTestContext(), GEMINI_REQ), 'ai_base_url_invalid', false);
      expect(lastStubRequests('gemini'), value).toHaveLength(0);
    }

    // (e) only whitespace means the default
    vi.stubEnv('GEMINI_BASE_URL', '   ');
    await editImage(makeAiTestContext(), GEMINI_REQ);
    expect(lastStubRequests('gemini')[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
    );
  });
});
