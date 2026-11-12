// EZD-5603a Build step 8 (vault/plans/EZD-5603a.md section 3 S1-S3; Decided "Where state lives", "Key read", "Send
// order", "Answers", "Model"; Q-0474; Q-0638 gaps 5, 9, 12, 13; Q-0640 row 56-7; Q-0641 row 56-7; Q-0653 (a);
// L-048): one Assistant session per editor page load. It holds the conversation, the draft, the model pick and the
// session total, so closing the panel or opening My profile loses nothing. No React.
import type { AssistantModel } from '../../lib/assistant/cost';
import { ASSISTANT_MODELS, sessionTotalMicroUsd } from '../../lib/assistant/cost';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import type { MessageKey } from '../../server/messages/catalog';
import { postAssistantPrompt, readAiKeyState } from './assistant-client';
import {
  ASSISTANT_SELECTED_MAX,
  canSendPrompt,
  historyFrom,
  type AssistantEntry,
  type AssistantUi,
} from './assistant-ui';

// S1
export type AssistantSessionDeps = {
  projectId: string;
  sync: Pick<OutboxSync, 'flush' | 'getState'>;
  getFloorId: () => string | null;
  getSelectedIds: () => readonly string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
};

// S2
export type AssistantSession = {
  getUi(): AssistantUi;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean): void;
  toggle(): void;
  setDraft(text: string): void;
  setModel(model: AssistantModel): void;
  send(): Promise<void>;
  refreshKey(): Promise<void>;
  openProfile(): void;
  closeProfile(): void;
  dispose(): void;
};

const SEND_FAILED: MessageKey = 'office.assistant.send_failed';

// S3
export function createAssistantSession(deps: AssistantSessionDeps): AssistantSession {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  let ui: AssistantUi = {
    open: false,
    keyState: 'loading',
    entries: [],
    draft: '',
    model: 'sonnet',
    phase: 'idle',
    profileOpen: false,
  };
  const listeners = new Set<() => void>();
  const counted: number[] = [];
  let disposed = false;
  let keyEpoch = 0;
  let nextId = 1;
  let inFlight: AbortController | null = null;

  const set = (patch: Partial<AssistantUi>) => {
    ui = { ...ui, ...patch };
    for (const listener of [...listeners]) listener();
  };

  const count = (cost: number) => {
    counted.push(cost);
    return sessionTotalMicroUsd(counted);
  };

  const refreshKey = async () => {
    if (disposed) return;
    keyEpoch += 1;
    const epoch = keyEpoch;
    const state = await readAiKeyState({ fetchImpl });
    if (disposed || epoch !== keyEpoch) return;
    set({ keyState: state });
  };

  const setOpen = (open: boolean) => {
    if (disposed) return;
    if (ui.open !== open) set({ open });
    if (open) void refreshKey();
  };

  const send = async () => {
    if (disposed || !canSendPrompt(ui)) return;
    const prompt = ui.draft;
    const model = ui.model;
    set({ phase: 'draining' });
    const t0 = now();
    let drained = false;
    try {
      await deps.sync.flush();
      const s = deps.sync.getState();
      drained = s.status === 'saved' && s.lastSavedAt !== null && s.lastSavedAt >= t0;
    } catch {
      drained = false;
    }
    if (disposed) return;
    if (!drained) {
      set({ phase: 'idle' });
      return;
    }
    const id = nextId++;
    const floorId = deps.getFloorId();
    if (floorId === null) {
      const entry: AssistantEntry = {
        kind: 'failed',
        id,
        prompt,
        messageKey: SEND_FAILED,
        profileLink: false,
        costMicroUsd: null,
        sessionMicroUsd: null,
      };
      set({ entries: [...ui.entries, entry], phase: 'idle' });
      return;
    }
    const history = historyFrom(ui.entries);
    set({ entries: [...ui.entries, { kind: 'waiting', id, prompt }], phase: 'waiting' });
    const controller = new AbortController();
    inFlight = controller;
    const result = await postAssistantPrompt(
      deps.projectId,
      {
        prompt,
        history,
        model,
        floorId,
        selectedIds: deps.getSelectedIds().slice(0, ASSISTANT_SELECTED_MAX),
      },
      { signal: controller.signal, fetchImpl },
    );
    if (inFlight === controller) inFlight = null;
    if (disposed || result.kind === 'aborted') return;
    const others = (replacement: AssistantEntry | null) =>
      ui.entries.flatMap((e) => (e.id !== id ? [e] : replacement === null ? [] : [replacement]));
    if (result.kind === 'reply') {
      const { message, model: replyModel, costMicroUsd } = result.success;
      const entry: AssistantEntry = {
        kind: 'reply',
        id,
        prompt,
        message,
        model: replyModel,
        costMicroUsd,
        sessionMicroUsd: count(costMicroUsd),
      };
      set({
        entries: others(entry),
        phase: 'idle',
        draft: ui.draft === prompt ? '' : ui.draft,
      });
      return;
    }
    const failure = result.failure;
    if (failure.kind === 'no_key') {
      keyEpoch += 1;
      set({ entries: others(null), keyState: 'none', phase: 'idle' });
      return;
    }
    const entry: AssistantEntry = {
      kind: 'failed',
      id,
      prompt,
      messageKey: failure.messageKey,
      profileLink: failure.profileLink,
      costMicroUsd: failure.costMicroUsd,
      sessionMicroUsd: failure.costMicroUsd === null ? null : count(failure.costMicroUsd),
    };
    set({ entries: others(entry), phase: 'idle' });
  };

  return {
    getUi: () => ui,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOpen,
    toggle: () => setOpen(!ui.open),
    setDraft(text) {
      if (disposed) return;
      set({ draft: text });
    },
    setModel(model) {
      if (disposed || !(ASSISTANT_MODELS as readonly string[]).includes(model)) return;
      set({ model });
    },
    send,
    refreshKey,
    openProfile() {
      if (disposed) return;
      set({ profileOpen: true });
    },
    closeProfile() {
      if (disposed) return;
      set({ profileOpen: false });
      void refreshKey();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      inFlight?.abort();
      inFlight = null;
      listeners.clear();
    },
  };
}
