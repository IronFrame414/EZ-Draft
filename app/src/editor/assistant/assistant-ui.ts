// EZD-5603a Build step 6 (vault/plans/EZD-5603a.md section 3 U1-U9; Decided "Error lines", "History", "Limits";
// Q-0474; Q-0638 gaps 7, 9, 13, 17; P5602 D-Map, D-Body): the Assistant panel's constants, types and pure
// functions. No React, no DOM.
import type { RailTool } from '../../components/shell/rail-types';
import type { EditorView } from '../../components/shell/editor-views';
import type { AssistantModel } from '../../lib/assistant/cost';
import type { PhotoProblem } from '../../lib/assistant/photo-rules';
import type { MessageKey } from '../../server/messages/catalog';

// U1: equal to the server's constants in server/assistant/assistant.ts (T4).
export const ASSISTANT_PROMPT_MAX_CHARS = 8_000;
export const ASSISTANT_HISTORY_MAX_TURNS = 20;
export const ASSISTANT_TURN_MAX_CHARS = 2_000;
export const ASSISTANT_SELECTED_MAX = 1_000;

export const ASSISTANT_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'assistant',
  icon: 'auto_awesome',
  label: 'office.tool.assistant',
};

// U2
export type AssistantKeyState = 'loading' | 'failed' | 'none' | 'present';

// EZD-5603b U1: the attached photo as the panel shows it; the JPEG itself stays in the session.
export type AssistantPhotoUi = { url: string; name: string; bytes: number };

// EZD-5603b U3: photoUrl is the photo sent with the prompt (absent = no photo).
export type AssistantEntry =
  | { kind: 'waiting'; id: number; prompt: string; photoUrl?: string }
  | {
      kind: 'reply';
      id: number;
      prompt: string;
      photoUrl?: string;
      message: string;
      model: AssistantModel;
      costMicroUsd: number;
      sessionMicroUsd: number;
    }
  | {
      kind: 'failed';
      id: number;
      prompt: string;
      photoUrl?: string;
      messageKey: MessageKey;
      profileLink: boolean;
      costMicroUsd: number | null;
      sessionMicroUsd: number | null;
    };

export type AssistantUi = {
  open: boolean;
  keyState: AssistantKeyState;
  entries: readonly AssistantEntry[];
  draft: string;
  model: AssistantModel;
  phase: 'idle' | 'draining' | 'waiting';
  profileOpen: boolean;
  // EZD-5603b U2
  photo: AssistantPhotoUi | null;
  photoProblem: PhotoProblem | null;
  photoPreparing: boolean;
};

export type AssistantTurn = { role: 'user' | 'assistant'; text: string };

// U3
export type AssistantFailure =
  | { kind: 'no_key' }
  | { kind: 'failed'; messageKey: MessageKey; profileLink: boolean; costMicroUsd: number | null };

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

// U5
export function assistantShown(o: { canEdit: boolean; view: EditorView }): boolean {
  return o.canEdit && o.view === 'plan';
}

// U6: the first 2,000 UTF-16 units, one fewer when the cut would split a surrogate pair.
export function cutTurn(text: string): string {
  if (text.length <= ASSISTANT_TURN_MAX_CHARS) return text;
  const last = text.charCodeAt(ASSISTANT_TURN_MAX_CHARS - 1);
  const end =
    last >= 0xd800 && last <= 0xdbff ? ASSISTANT_TURN_MAX_CHARS - 1 : ASSISTANT_TURN_MAX_CHARS;
  return text.slice(0, end);
}

// U7: replies only, oldest first, each a user and an assistant turn; then the last 20 turns.
export function historyFrom(entries: readonly AssistantEntry[]): AssistantTurn[] {
  const turns: AssistantTurn[] = [];
  for (const e of entries) {
    if (e.kind !== 'reply') continue;
    const reply = cutTurn(e.message);
    if (reply === '') continue;
    turns.push({ role: 'user', text: cutTurn(e.prompt) }, { role: 'assistant', text: reply });
  }
  return turns.slice(-ASSISTANT_HISTORY_MAX_TURNS);
}

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

// U9
export function canSendPrompt(ui: AssistantUi): boolean {
  return (
    ui.keyState === 'present' &&
    ui.phase === 'idle' &&
    !ui.photoPreparing &&
    ui.draft.trim().length > 0 &&
    ui.draft.length <= ASSISTANT_PROMPT_MAX_CHARS
  );
}

// EZD-5603b U4 (Decided "Disabled")
export function photoControlDisabled(ui: AssistantUi): boolean {
  return ui.keyState !== 'present' || ui.phase !== 'idle' || ui.photoPreparing;
}

export function photoRemoveDisabled(ui: AssistantUi): boolean {
  return ui.phase !== 'idle';
}
