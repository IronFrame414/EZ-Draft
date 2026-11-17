// EZD-5603a U4, U8 (vault/plans/EZD-5603a.md section 3; Decided "Error lines"; P5602 D-Map, D-Body), moved out of
// assistant-ui.ts by EZD-5604b so the mapping loads with the lazy Assistant client, not with the editor (11 Budgets;
// EZD-120c B11). Pure; no React, no DOM.
import type { MessageKey } from '../../server/messages/catalog';
import type { AssistantFailure } from './assistant-ui';

// U4: the only server message keys the panel shows (t() throws on a key it does not hold).
export const ASSISTANT_SHOWN_KEYS: ReadonlySet<MessageKey> = new Set<MessageKey>([
  'error.assistant_key_refused',
  'error.assistant_out_of_credit',
  'error.assistant_busy',
  'error.assistant_rate_limited',
  'error.assistant_provider_rate_limited',
  'error.assistant_request_refused',
  'error.assistant_unavailable',
  'error.assistant_drawing_too_large',
  'error.assistant_invalid_reply',
  'error.assistant_photo_unreadable',
  'error.ai_key_unavailable',
  'error.not_signed_in',
  'error.not_authorized',
  'error.project_not_found',
  'error.invalid_input',
  'error.db_unavailable',
]);

const SEND_FAILED: MessageKey = 'office.assistant.send_failed';
const PROFILE_CODES = new Set(['assistant_key_refused', 'assistant_out_of_credit']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// U8: a route error body to what the panel shows. Anything it cannot read is "Couldn't send your prompt".
export function failureFrom(status: number, body: unknown): AssistantFailure {
  void status;
  const error = isRecord(body) ? body.error : undefined;
  const code = isRecord(error) ? error.code : undefined;
  const key = isRecord(error) ? error.message_key : undefined;
  const rawCost = isRecord(body) ? body.costMicroUsd : undefined;
  const costMicroUsd =
    typeof rawCost === 'number' && Number.isSafeInteger(rawCost) && rawCost > 0 ? rawCost : null;
  if (typeof code !== 'string' || typeof key !== 'string') {
    return { kind: 'failed', messageKey: SEND_FAILED, profileLink: false, costMicroUsd };
  }
  if (code === 'assistant_no_key') return { kind: 'no_key' };
  if (!(ASSISTANT_SHOWN_KEYS as ReadonlySet<string>).has(key)) {
    return { kind: 'failed', messageKey: SEND_FAILED, profileLink: false, costMicroUsd };
  }
  return {
    kind: 'failed',
    messageKey: key as MessageKey,
    profileLink: PROFILE_CODES.has(code),
    costMicroUsd,
  };
}
