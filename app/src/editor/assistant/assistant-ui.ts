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
      // EZD-5604b S2: the reply's changes do not fit the drawing (P5604a D-Refusal); nothing is previewed.
      refused?: true;
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
