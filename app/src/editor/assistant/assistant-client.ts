// EZD-5603a Build step 7 (vault/plans/EZD-5603a.md section 3 C1-C3; Decided "Success shape", "Key read", "Error
// lines"; P5602 section 3 route row; P5601 section 3): the panel's two server calls. Neither throws.
import { ASSISTANT_MODELS, type AssistantModel } from '../../lib/assistant/cost';
import type { AssistantInput, AssistantSuccess } from '../../server/assistant/assistant';
import { failureFrom, type AssistantFailure } from './assistant-ui';

// C1
export type AssistantCallResult =
  | { kind: 'reply'; success: AssistantSuccess }
  | { kind: 'failure'; failure: AssistantFailure }
  | { kind: 'aborted' };

const SEND_FAILED: AssistantCallResult = {
  kind: 'failure',
  failure: {
    kind: 'failed',
    messageKey: 'office.assistant.send_failed',
    profileLink: false,
    costMicroUsd: null,
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isAbort = (e: unknown, signal: AbortSignal) =>
  signal.aborted || (isRecord(e) && e.name === 'AbortError');

function successFrom(body: unknown): AssistantSuccess | null {
  if (!isRecord(body)) return null;
  const { message, costMicroUsd, model, changes, refs } = body;
  if (typeof message !== 'string') return null;
  if (typeof costMicroUsd !== 'number' || !Number.isSafeInteger(costMicroUsd) || costMicroUsd < 0) {
    return null;
  }
  if (typeof model !== 'string' || !(ASSISTANT_MODELS as readonly string[]).includes(model)) {
    return null;
  }
  if (!Array.isArray(changes) || !isRecord(refs)) return null;
  return {
    message,
    changes,
    refs: refs as Record<string, string>,
    costMicroUsd,
    model: model as AssistantModel,
  };
}

// C2: POST /api/projects/{id}/assistant with one FormData entry `request`, then (EZD-5603b C1) the optional
// shrunk photo as `photo`.
export async function postAssistantPrompt(
  projectId: string,
  input: AssistantInput,
  o: { signal: AbortSignal; fetchImpl?: typeof fetch; photo?: Blob | null },
): Promise<AssistantCallResult> {
  const fetchImpl = o.fetchImpl ?? globalThis.fetch;
  const form = new FormData();
  form.append('request', JSON.stringify(input));
  if (o.photo) form.append('photo', new File([o.photo], 'photo.jpg', { type: 'image/jpeg' }));
  let response: Response;
  try {
    response = await fetchImpl(`/api/projects/${projectId}/assistant`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
      signal: o.signal,
    });
  } catch (e) {
    return isAbort(e, o.signal) ? { kind: 'aborted' } : SEND_FAILED;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (e) {
    if (isAbort(e, o.signal)) return { kind: 'aborted' };
    body = null;
  }
  if (response.status === 200) {
    const success = successFrom(body);
    return success === null ? SEND_FAILED : { kind: 'reply', success };
  }
  return { kind: 'failure', failure: failureFrom(response.status, body) };
}

// C3: GET /api/profile; the key's presence only.
export async function readAiKeyState(o: {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<'none' | 'present' | 'failed'> {
  const fetchImpl = o.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchImpl('/api/profile', {
      credentials: 'same-origin',
      signal: o.signal,
    });
    if (response.status !== 200) return 'failed';
    const body: unknown = await response.json();
    if (!isRecord(body) || !('aiKey' in body)) return 'failed';
    if (body.aiKey === null) return 'none';
    if (isRecord(body.aiKey) && typeof body.aiKey.last4 === 'string') return 'present';
    return 'failed';
  } catch {
    return 'failed';
  }
}
