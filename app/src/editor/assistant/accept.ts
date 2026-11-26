// EZD-5605 (vault/plans/EZD-5605.md D-Accept order, D-Messages, D-Save; Q-0474; Q-0638 gap 10; Q-0640 rows 56-1,
// 56-6; AC-EZD-5605-1, -5, -7, -8; AC-EZD-294-3): Accept. The open preview's change set is rechecked against the
// 100 limit, its new walls, doors and windows are numbered from the model's highs, and it is saved through the
// outbox as one batch marked as AI. Only a saved answer puts it in the model, as one undo step; a refusal or a
// failure shows the normal message and leaves the model, its undo stack and the preview as they were. No React.
import {
  numberKeyOf,
  numberNewObjects,
  raiseNumberHighs,
  type NumberHighs,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MAX_CHANGES_PER_SAVE, type RefusedCode } from '../../lib/outbox/outbox';
import type { OutboxSync, SendNowOutcome } from '../../lib/outbox/outbox-sync';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { applyEditTo, makeEdit, type Change } from '../model/patches';
import type { AdjustController } from './adjust';
import type { PreviewStore } from './preview-store';
import { createListeners } from '../shared/value-store';
import { idKey } from '../shared/ids';
import { withAutoDimensions } from '../edit/auto-dimensions';
import { newObjectId } from '../tools/model-changes';

export type AcceptResult =
  | { kind: 'saved'; ids: string[] }
  | { kind: 'empty' }
  | { kind: 'busy' }
  | { kind: 'no_preview' }
  | { kind: 'stale' }
  | { kind: 'too_many'; count: number }
  | { kind: 'refused'; code: RefusedCode }
  | { kind: 'failed' }
  | { kind: 'unsaved' }
  | { kind: 'cancelled' };

export type AcceptDeps = {
  projectId: string;
  lockEpoch: number;
  model: ModelStore;
  sync: Pick<OutboxSync, 'sendNow'>;
  previews: PreviewStore;
  adjust: Pick<AdjustController, 'end'> | null;
  onMessage: (key: MessageKey) => void;
};

export type AcceptController = {
  getUi(): { readonly busy: boolean };
  subscribe(listener: () => void): () => void;
  accept(): Promise<AcceptResult>;
  dispose(): void;
};

const REFUSED_MESSAGE: Record<RefusedCode, MessageKey> = {
  permission_denied: 'error.not_authorized',
  stale_lock_epoch: 'error.stale_lock_epoch',
  save_conflict: 'error.save_conflict',
  invalid_input: 'error.invalid_input',
  invalid_object: 'error.invalid_input',
  not_signed_in: 'error.not_signed_in',
  project_not_found: 'error.project_not_found',
  app_outdated: 'error.app_outdated',
};

// D-Messages: the toast for each result; none when saved, nothing to do, or the guards.
export function acceptMessage(r: AcceptResult): MessageKey | null {
  switch (r.kind) {
    case 'refused':
      return REFUSED_MESSAGE[r.code];
    case 'failed':
    case 'unsaved':
      return 'office.editor.save_failed';
    case 'too_many':
      return 'office.assistant.accept_too_many';
    default:
      return null;
  }
}

// Q-0640 row 56-6, AC-EZD-294-3: new walls, doors and windows take their numbers at Accept, in save-set order,
// from the model's highs then (the preview's numbers were provisional). Every other change is kept as it is.
export function renumberAdded(
  changes: readonly Change[],
  added: readonly string[],
  highs: NumberHighs,
): Change[] {
  const isAdded = new Set(added.map(idKey));
  const taken: number[] = [];
  const values: ObjectValue[] = [];
  changes.forEach((c, i) => {
    if (c.value !== null && isAdded.has(idKey(c.id)) && numberKeyOf(c.value) !== null) {
      taken.push(i);
      values.push(c.value);
    }
  });
  if (taken.length === 0) return [...changes];
  const numbered = numberNewObjects(values, highs).objects;
  const out = [...changes];
  taken.forEach((at, k) => {
    out[at] = { id: changes[at]!.id, value: numbered[k]! };
  });
  return out;
}

// D-Saved edit (AC-EZD-5605-1; AC-EZD-217-11): a change the server has already saved goes in the model as one undo
// step and clears redo, without `onCommit` (it is not saved again). Its undo and redo go through the store's own
// commit, so they save as usual. Kept here, out of the editor route (11 Budgets).
export function applySavedEdit(model: ModelStore, changes: Change[]): string[] {
  if (changes.length === 0) return [];
  const s = model.getState();
  const edit = makeEdit(s.objects, changes);
  const ids = edit.patches.map((p) => p.id);
  model.setState({
    objects: applyEditTo(s.objects, edit, 'forward'),
    past: [...s.past, edit],
    future: [],
    lastChangedIds: ids,
    numberHighs: raiseNumberHighs(
      s.numberHighs,
      changes.flatMap((c) => (c.value === null ? [] : [c.value])),
    ),
  });
  return ids;
}

const refusedOf = (r: SendNowOutcome): AcceptResult => {
  switch (r.kind) {
    case 'refused':
      return { kind: 'refused', code: r.code };
    case 'failed':
      return { kind: 'failed' };
    case 'cancelled':
      return { kind: 'cancelled' };
    default:
      return { kind: 'unsaved' };
  }
};

export function createAcceptController(deps: AcceptDeps): AcceptController {
  const { model, sync, previews } = deps;
  let busy = false;
  let disposed = false;
  let ui: { readonly busy: boolean } = Object.freeze({ busy: false });
  const listeners = createListeners();

  const setBusy = (b: boolean) => {
    busy = b;
    ui = Object.freeze({ busy: b });
    listeners.notify();
  };

  async function run(): Promise<AcceptResult> {
    const state = previews.getState();
    const p = state.preview;
    if (p === null) return { kind: 'no_preview' };
    if (state.stale) return { kind: 'stale' };
    if (p.changes.length === 0) {
      deps.adjust?.end();
      previews.reject();
      return { kind: 'empty' };
    }
    if (p.changes.length > MAX_CHANGES_PER_SAVE) {
      return { kind: 'too_many', count: p.changes.length };
    }
    // EZD-216: the auto dimensions of the floors the reply changes go in the same save, as the model store adds them
    // to every hand edit (edit/auto-dimensions.ts).
    const sent = withAutoDimensions(
      model.getState().objects,
      renumberAdded(p.changes, p.added, model.getState().numberHighs),
      newObjectId,
    );
    let r: SendNowOutcome;
    try {
      r = await sync.sendNow(deps.projectId, deps.lockEpoch, sent, {
        assistant: true,
        stillValid: () => {
          const s = previews.getState();
          return s.preview === p && !s.stale;
        },
      });
    } catch {
      return { kind: 'failed' };
    }
    if (r.kind !== 'saved') return refusedOf(r);
    // Adjust and the preview end first, so the model edit below neither stales nor reaches the scratch copy.
    deps.adjust?.end();
    previews.reject();
    applySavedEdit(model, sent);
    model.applySavedNumbers(r.objects);
    return { kind: 'saved', ids: sent.map((c) => c.id) };
  }

  return {
    getUi: () => ui,
    subscribe(listener) {
      if (disposed) return () => {};
      return listeners.add(listener);
    },
    async accept() {
      if (disposed) return { kind: 'unsaved' };
      if (busy) return { kind: 'busy' };
      setBusy(true);
      let result: AcceptResult;
      try {
        result = await run();
      } finally {
        if (!disposed) setBusy(false);
      }
      const key = acceptMessage(result);
      if (key !== null && !disposed) deps.onMessage(key);
      return result;
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
