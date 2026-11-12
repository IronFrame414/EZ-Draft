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

// EZD-5602 Build step 9 (vault/plans/EZD-5602.md "D-Stubs"; Q-0637 stub row; Q-0638 provider errors; R-055 error
// body): the assistant's recordings, one POST /v1/messages exchange each. The `changes` arrays are placeholders
// for the envelope only; EZD-5604 owns the change format and rewrites them.
export const ASSISTANT_STUB_NAMES = [
  'add_door',
  'move_wall',
  'delete_window',
  'text_only',
  'malformed',
  'error_401',
  'error_403',
  'error_402',
  'error_400_usage_limit',
  'error_429_spend_limit',
  'error_429',
  'error_400',
  'error_404',
  'error_413',
  'error_500',
  'error_504',
  'error_529',
  'timeout',
] as const;
export type AssistantStubName = (typeof ASSISTANT_STUB_NAMES)[number];

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const assistantExchange = (
  name: AssistantStubName,
  status: number,
  json: unknown,
  delayMs?: number,
): Recording => ({
  provider: 'anthropic',
  purpose: 'assistant.plan',
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'POST', url: MESSAGES_URL },
      response: {
        status,
        headers: { 'request-id': `req_stub_${name}` },
        json,
        ...(delayMs === undefined ? {} : { delayMs }),
      },
    },
  ],
});

const assistantReply = (
  name: AssistantStubName,
  text: string,
  inputTokens: number,
  outputTokens: number,
  stopReason = 'end_turn',
  delayMs?: number,
): Recording =>
  assistantExchange(
    name,
    200,
    {
      id: `msg_stub_${name}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
    delayMs,
  );

const assistantError = (
  name: AssistantStubName,
  status: number,
  type: string,
  message = 'stub',
  details?: Record<string, unknown>,
): Recording =>
  assistantExchange(name, status, {
    type: 'error',
    error: { type, message, ...(details === undefined ? {} : { details }) },
    request_id: `req_stub_${name}`,
  });

const TEXT_ONLY = '{"message":"The kitchen is 80 square feet.","changes":[]}';

export const ASSISTANT_RECORDINGS: Readonly<Record<AssistantStubName, Recording>> = {
  add_door: assistantReply(
    'add_door',
    `{"message":"Added a 3' door on w2.","changes":[{"op":"add","type":"door","ref":"n1","hostWall":"w2"}]}`,
    3000,
    1400,
  ),
  move_wall: assistantReply(
    'move_wall',
    '{"message":"Moved w1 12 inches north.","changes":[{"op":"update","type":"wall","ref":"w1"}]}',
    2500,
    1000,
  ),
  delete_window: assistantReply(
    'delete_window',
    '{"message":"Removed window o1.","changes":[{"op":"remove","type":"window","ref":"o1"}]}',
    1000,
    1000,
  ),
  text_only: assistantReply('text_only', TEXT_ONLY, 100, 0),
  malformed: assistantReply(
    'malformed',
    '{"message":"Added a door","changes":[',
    1000,
    1000,
    'max_tokens',
  ),
  error_401: assistantError('error_401', 401, 'authentication_error'),
  error_403: assistantError('error_403', 403, 'permission_error'),
  error_402: assistantError('error_402', 402, 'billing_error'),
  error_400_usage_limit: assistantError(
    'error_400_usage_limit',
    400,
    'invalid_request_error',
    'You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.',
  ),
  error_429_spend_limit: assistantError('error_429_spend_limit', 429, 'rate_limit_error', 'stub', {
    error_code: 'enforced_spend_limit_reached',
  }),
  error_429: assistantError('error_429', 429, 'rate_limit_error'),
  error_400: assistantError('error_400', 400, 'invalid_request_error'),
  error_404: assistantError('error_404', 404, 'not_found_error'),
  error_413: assistantError('error_413', 413, 'request_too_large'),
  error_500: assistantError('error_500', 500, 'api_error'),
  error_504: assistantError('error_504', 504, 'timeout_error'),
  error_529: assistantError('error_529', 529, 'overloaded_error'),
  timeout: assistantReply('timeout', TEXT_ONLY, 100, 0, 'end_turn', 125_000),
};

export const anthropicRecordings: Record<string, Recording> = {
  'anthropic/test.echo': recording('test.echo', 'EZD-021 stub response'),
  'anthropic/assistant.plan': ASSISTANT_RECORDINGS.text_only,
  'anthropic/test.json': recording('test.json', '```json\n{"name":"stub","count":3}\n```'),
  // EZD-5601 step 10 (shape R-055): the answer to GET /v1/models for a user key check.
  'anthropic/key-check': {
    provider: 'anthropic',
    purpose: 'key-check',
    source: 'synthetic',
    exchanges: [
      {
        match: { method: 'GET', url: 'https://api.anthropic.com/v1/models*' },
        response: {
          status: 200,
          json: {
            data: [
              {
                type: 'model',
                id: 'claude-sonnet-5-5',
                display_name: 'Claude Sonnet 5.5',
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            first_id: 'claude-sonnet-5-5',
            has_more: false,
            last_id: 'claude-sonnet-5-5',
          },
        },
      },
    ],
  },
};
