// EZD-5603a Build step 8 (vault/plans/EZD-5603a.md section 3 S1-S3; Decided "Where state lives", "Key read", "Send
// order", "Answers", "Model"; Q-0474; Q-0638 gaps 5, 9, 12, 13; Q-0640 row 56-7; Q-0641 row 56-7; Q-0653 (a);
// L-048): one Assistant session per editor page load. It holds the conversation, the draft, the model pick and the
// session total, so closing the panel or opening My profile loses nothing. No React.
// EZD-5604b (vault/plans/EZD-5604b.md section 3 S1; Decided "D-Send", "D-Close"; AC-EZD-5604-3, -5, -7): a reply
// with changes opens the one preview; no prompt is sent while one is open; closing the panel acts as Reject. The
// preview store loads with the Assistant client and is made with the first reply that has changes (EZD-120c B11
// editor budget; vault/build/assumptions.md EZD-5604b); `getPreview` returns it, and listeners hear when it is made.
import type { ObjectStatus } from '@ezdraft/geometry';
import type { AssistantModel } from '../../lib/assistant/cost';
import { ASSISTANT_MODELS, sessionTotalMicroUsd } from '../../lib/assistant/cost';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import type { MessageKey } from '../../server/messages/catalog';
import type { AssistantCallResult } from './assistant-client';
import {
  ASSISTANT_SELECTED_MAX,
  canSendPrompt,
  historyFrom,
  photoControlDisabled,
  type AssistantEntry,
  type AssistantUi,
} from './assistant-ui';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { ModelStore } from '../model/model-store';
import type { PreviewStore } from './preview-store';
import { createAssistantControls, type AssistantControls } from './controls';
import type { createPhotoWorkerShrinker, PhotoPrepareResult, PhotoShrinker } from './photo-prepare';
import { createListeners } from '../shared/value-store';

// EZD-233 (11 Budgets editor route): the photo check and shrink load when a photo is first attached; a failed
// download reads as an unreadable photo, and the next attach tries again.
const photoPrepareModule = lazyModule(() => import('../../lazy/photo-prepare'));
// EZD-233: the two server calls load on first use; a failed download reads as a failed call.
const assistantClientModule = lazyModule(() => import('../../lazy/assistant-client'));
const readAiKeyState: typeof import('./assistant-client').readAiKeyState = (o) =>
  assistantClientModule.load().then(
    (m) => m.readAiKeyState(o),
    () => 'failed' as const,
  );
const postAssistantPrompt: typeof import('./assistant-client').postAssistantPrompt = (...args) =>
  assistantClientModule.load().then(
    (m) => m.postAssistantPrompt(...args),
    (): AssistantCallResult => ({
      kind: 'failure',
      failure: {
        kind: 'failed',
        messageKey: 'office.assistant.send_failed',
        profileLink: false,
        costMicroUsd: null,
      },
    }),
  );

// S1
export type AssistantSessionDeps = {
  projectId: string;
  // EZD-5605: `sendNow` for Accept; without it no Adjust or Accept is made.
  sync: Pick<OutboxSync, 'flush' | 'getState'> & Partial<Pick<OutboxSync, 'sendNow'>>;
  getFloorId: () => string | null;
  getSelectedIds: () => readonly string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  // EZD-5603b S1
  shrinkPhoto?: PhotoShrinker;
  objectUrls?: { create(blob: Blob): string; revoke(url: string): void };
  // EZD-5604b S1
  preview?: AssistantPreviewLink;
  // EZD-214: the phase view's status for objects a reply adds.
  getNewStatus?: () => ObjectStatus;
};

// EZD-5604b S1: the open model store (its objects and highs the reply is applied to; the preview watches it) and the
// new-object id maker.
export type AssistantPreviewLink = {
  model: ModelStore;
  newId(): string;
  // EZD-5605 D-Wire: what Adjust and Accept need; they are made with the preview store.
  adjust?: Omit<
    Parameters<typeof createAssistantControls>[0],
    'projectId' | 'model' | 'previews' | 'sync'
  >;
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
  // EZD-5603b S2
  attachPhoto(file: File): Promise<void>;
  removePhoto(): void;
  // EZD-5604b: the one preview store, null until the first reply with changes.
  getPreview(): PreviewStore | null;
  // EZD-5605: Adjust and Accept for that store, null until it is made.
  getControls(): AssistantControls | null;
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
    photo: null,
    photoProblem: null,
    photoPreparing: false,
  };
  const listeners = createListeners();
  const counted: number[] = [];
  let disposed = false;
  let keyEpoch = 0;
  let nextId = 1;
  let inFlight: AbortController | null = null;
  // EZD-5603b Decided "Session photo": one counter for every photo change; the JPEGs by object URL.
  let photoGen = 0;
  const blobs = new Map<string, Blob>();
  const objectUrls = deps.objectUrls ?? {
    create: (blob: Blob) => URL.createObjectURL(blob),
    revoke: (url: string) => URL.revokeObjectURL(url),
  };
  let workerShrinker: ReturnType<typeof createPhotoWorkerShrinker> | null = null;
  let preview: PreviewStore | null = null;
  let controls: AssistantControls | null = null;
  const shrinkPhoto: PhotoShrinker = (file, kind) => {
    if (deps.shrinkPhoto) return deps.shrinkPhoto(file, kind);
    const mod = photoPrepareModule.peek();
    if (mod === undefined) return Promise.resolve({ ok: false });
    workerShrinker ??= mod.createPhotoWorkerShrinker();
    return workerShrinker.shrink(file, kind);
  };

  const set = (patch: Partial<AssistantUi>) => {
    ui = { ...ui, ...patch };
    listeners.notify();
  };

  const count = (cost: number) => {
    counted.push(cost);
    return sessionTotalMicroUsd(counted);
  };

  const refreshKey = async () => {
    if (disposed) return;
    keyEpoch += 1;
    const epoch = keyEpoch;
    let state = await readAiKeyState({ fetchImpl });
    // EZD-2013: one failed read (a dropped connection) is tried once more before the panel shows the key error, so
    // Send does not stay off under a typed prompt. Only keyState is set here: a late answer never touches the draft.
    if (state === 'failed' && !disposed && epoch === keyEpoch) {
      state = await readAiKeyState({ fetchImpl });
    }
    if (disposed || epoch !== keyEpoch) return;
    set({ keyState: state });
  };

  // A photo URL no entry shows is revoked; one an entry shows lives until dispose.
  const release = (url: string) => {
    if (ui.entries.some((e) => e.photoUrl === url)) return;
    objectUrls.revoke(url);
    blobs.delete(url);
  };

  const attachPhoto = async (file: File) => {
    if (disposed || photoControlDisabled(ui)) return;
    photoGen += 1;
    const gen = photoGen;
    set({ photoPreparing: true, photoProblem: null });
    const result: PhotoPrepareResult = await photoPrepareModule.load().then(
      (m) => m.preparePhoto(file, shrinkPhoto),
      (): PhotoPrepareResult => ({ ok: false, problem: 'unreadable' }),
    );
    if (disposed || gen !== photoGen) return;
    if (!result.ok) {
      set({ photoPreparing: false, photoProblem: result.problem });
      return;
    }
    const url = objectUrls.create(result.photo.jpeg);
    blobs.set(url, result.photo.jpeg);
    const replaced = ui.photo;
    set({ photoPreparing: false, photo: { url, name: file.name, bytes: file.size } });
    if (replaced !== null) release(replaced.url);
  };

  const removePhoto = () => {
    if (disposed || ui.phase !== 'idle') return;
    photoGen += 1;
    const removed = ui.photo;
    set({ photoPreparing: false, photoProblem: null, photo: null });
    if (removed !== null) release(removed.url);
  };

  const setOpen = (open: boolean) => {
    if (disposed) return;
    // D-Close: × and the rail button that close the panel act as Reject.
    if (!open) preview?.reject();
    if (ui.open !== open) set({ open });
    if (open) void refreshKey();
  };

  const send = async () => {
    if (disposed || !canSendPrompt(ui) || (preview !== null && preview.getState().preview !== null))
      return;
    const prompt = ui.draft;
    const model = ui.model;
    const sent = ui.photo;
    set({ phase: 'draining', photoProblem: null });
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
    // D-Send: the drawing the prompt goes with, taken before the wait, so an edit meanwhile stales the preview.
    const before = deps.preview?.model.getState().objects ?? null;
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
    const photoUrl = sent === null ? {} : { photoUrl: sent.url };
    set({
      entries: [...ui.entries, { kind: 'waiting', id, prompt, ...photoUrl }],
      phase: 'waiting',
    });
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
      {
        signal: controller.signal,
        fetchImpl,
        photo: sent === null ? null : (blobs.get(sent.url) ?? null),
      },
    );
    if (inFlight === controller) inFlight = null;
    if (disposed || result.kind === 'aborted') return;
    const others = (replacement: AssistantEntry | null) =>
      ui.entries.flatMap((e) => (e.id !== id ? [e] : replacement === null ? [] : [replacement]));
    if (result.kind === 'reply') {
      const { message, model: replyModel, costMicroUsd, changes, refs } = result.success;
      const link = deps.preview;
      const client = assistantClientModule.peek();
      const applied =
        link !== undefined && before !== null && changes.length > 0 && client !== undefined
          ? client.applyAssistantReply({
              objects: before,
              floorId,
              changes,
              refs,
              highs: link.model.getState().numberHighs,
              newId: link.newId,
              status: deps.getNewStatus?.() ?? 'existing',
            })
          : null;
      const shown = applied !== null && applied.ok && applied.changes.length > 0 ? applied : null;
      // Made before the entry is stored, so the listeners that hear the entry also find the store.
      if (shown !== null && link !== undefined && client !== undefined) {
        if (preview === null) {
          preview = client.createPreviewStore({ store: link.model });
          const sendNow = deps.sync.sendNow;
          if (link.adjust !== undefined && sendNow !== undefined) {
            controls = createAssistantControls({
              ...link.adjust,
              sync: { sendNow },
              projectId: deps.projectId,
              model: link.model,
              previews: preview,
            });
            // The editor greys its rail while adjusting: Adjust starting or ending is told to the listeners.
            controls.adjust.subscribe(() => {
              listeners.notify();
            });
          }
        }
      }
      const entry: AssistantEntry = {
        kind: 'reply',
        id,
        prompt,
        ...photoUrl,
        message,
        model: replyModel,
        costMicroUsd,
        sessionMicroUsd: count(costMicroUsd),
        ...(applied !== null && !applied.ok ? { refused: true as const } : {}),
      };
      set({
        entries: others(entry),
        phase: 'idle',
        draft: ui.draft === prompt ? '' : ui.draft,
        ...(ui.photo === sent ? { photo: null } : {}),
      });
      if (shown !== null && before !== null)
        preview?.open({ preview: shown, prompt, entryId: id, before });
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
      ...photoUrl,
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
      return listeners.add(listener);
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
    attachPhoto,
    removePhoto,
    getPreview: () => preview,
    getControls: () => controls,
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
      for (const url of blobs.keys()) objectUrls.revoke(url);
      blobs.clear();
      workerShrinker?.dispose();
      workerShrinker = null;
      controls?.accept.dispose();
      controls?.adjust.dispose();
      preview?.dispose();
    },
  };
}
