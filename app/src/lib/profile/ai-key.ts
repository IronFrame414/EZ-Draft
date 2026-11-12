// EZD-5601 Step 6 (vault/plans/EZD-5601.md section 1 "D-Shape", "D-Codes"; AC-EZD-5601-1, -2, -5; Q-0637;
// Q-0638): the user's own Anthropic key, browser and server. The shape check runs on both sides; the browser
// makes no request on a shape problem. No React, no Supabase.

export const AI_KEY_MAX_LENGTH = 256;

export type AiKeyState = { last4: string } | null;

export type AiKeyMessageKey =
  | 'error.invalid_input'
  | 'error.ai_key_invalid'
  | 'error.ai_key_refused'
  | 'error.ai_key_out_of_credit'
  | 'error.ai_key_check_failed'
  | 'error.ai_key_throttled'
  | 'error.ai_key_unavailable'
  | 'error.not_signed_in'
  | 'error.not_authorized'
  | 'error.db_unavailable';

export type AiKeyOutcome =
  | { kind: 'saved'; last4: string }
  | { kind: 'removed' }
  | { kind: 'error'; messageKey: AiKeyMessageKey };

const KEY_SHAPE = /^sk-ant-[\x21-\x7E]+$/;

// Trims leading and trailing U+0020, U+0009, U+000A and U+000D only (D-Shape).
export function normalizeAiKey(raw: string): string {
  return raw.replace(/^[ \t\n\r]+/, '').replace(/[ \t\n\r]+$/, '');
}

export function aiKeyShapeProblem(key: string): 'ai_key_invalid' | null {
  return key.length <= AI_KEY_MAX_LENGTH && KEY_SHAPE.test(key) ? null : 'ai_key_invalid';
}

export function last4Of(key: string): string {
  return key.slice(-4);
}

// Codes POST and DELETE /api/profile/ai-key can answer (plan section 3); anything else is db_unavailable.
const AI_KEY_ERRORS: Record<string, AiKeyMessageKey> = {
  invalid_input: 'error.invalid_input',
  ai_key_invalid: 'error.ai_key_invalid',
  ai_key_refused: 'error.ai_key_refused',
  ai_key_out_of_credit: 'error.ai_key_out_of_credit',
  ai_key_check_failed: 'error.ai_key_check_failed',
  ai_key_throttled: 'error.ai_key_throttled',
  ai_key_unavailable: 'error.ai_key_unavailable',
  not_signed_in: 'error.not_signed_in',
  not_authorized: 'error.not_authorized',
  cross_origin_refused: 'error.not_authorized',
};

const URL_PATH = '/api/profile/ai-key';

function errorOf(data: unknown): AiKeyOutcome {
  const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
  const messageKey =
    typeof code === 'string' && Object.hasOwn(AI_KEY_ERRORS, code)
      ? AI_KEY_ERRORS[code]
      : 'error.db_unavailable';
  return { kind: 'error', messageKey };
}

export async function addAiKey(raw: string, fetchFn: typeof fetch = fetch): Promise<AiKeyOutcome> {
  const key = normalizeAiKey(raw);
  if (aiKeyShapeProblem(key) !== null) return { kind: 'error', messageKey: 'error.ai_key_invalid' };
  try {
    const res = await fetchFn(URL_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.status === 200) {
      const last4 = (data as { aiKey?: { last4?: unknown } } | null)?.aiKey?.last4;
      if (typeof last4 === 'string') return { kind: 'saved', last4 };
      return { kind: 'error', messageKey: 'error.db_unavailable' };
    }
    return errorOf(data);
  } catch {
    return { kind: 'error', messageKey: 'error.db_unavailable' };
  }
}

export async function removeAiKey(fetchFn: typeof fetch = fetch): Promise<AiKeyOutcome> {
  try {
    const res = await fetchFn(URL_PATH, { method: 'DELETE', credentials: 'same-origin' });
    const data: unknown = await res.json().catch(() => null);
    if (res.status === 200) return { kind: 'removed' };
    return errorOf(data);
  } catch {
    return { kind: 'error', messageKey: 'error.db_unavailable' };
  }
}
