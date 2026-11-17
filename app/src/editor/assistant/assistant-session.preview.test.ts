// EZD-5604b SS1-SS4 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-1, -3, -4, -5, -7, -9). The session on a fake
// sync and a routed fetch stub, as EZD-5603a's T7-T13; no live service. Expected values: P5604a D-Wall add and
// D-Result (an added wall gets the next id and the number highest + 1, P294), D-Refusal (a ref outside the sent set
// refuses the reply), Q-0637 (one preview at a time; stale when a touched object changes), Q-0638 gap 13 (× acts as
// Reject).
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { SyncState } from '../../lib/outbox/outbox-sync';
import { createModelStore } from '../model/model-store';
import { baseObjects, F1, idSeq, uid, withWalls } from '../tools/test-utils/fixtures';
import { createAssistantSession } from './assistant-session';
import { EMPTY_PREVIEW_STATE } from './preview-store';

const R = withWalls(
  baseObjects(),
  1,
  [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
  ],
  false,
);

const UPDATE = { op: 'update', type: 'wall', ref: 'w1', height: 100 };
const ADD = {
  op: 'add',
  type: 'wall',
  ref: 'n1',
  start: { x: 0, y: 300 },
  end: { x: 120, y: 300 },
};
const REFS = { f1: F1, w1: uid(1) };

const reply = (changes: unknown[], refs: Record<string, string> = REFS) => ({
  message: 'Here is the change.',
  changes,
  refs,
  costMicroUsd: 20000,
  model: 'sonnet',
});
const res = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => {
    resolve = a;
  });
  return { promise, resolve };
}

function h(v: ObjectValue, n: number): ObjectValue {
  const data = v.data as { attributes: Record<string, unknown> };
  return { ...v, data: { ...data, attributes: { ...data.attributes, height: n } } };
}

async function setup(answer: (n: number) => Promise<Response> | unknown) {
  const model = createModelStore({ objects: R, numberHighs: { wall: 4, door: 2, window: 1 } });
  const assistantCalls: RequestInit[] = [];
  const state: SyncState = {
    status: 'saved',
    failures: 0,
    problem: null,
    lastSavedAt: 5000,
    conflictRev: 0,
  };
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/profile') return res({ aiKey: { last4: '7Qx2' } });
    if (url === '/api/projects/p-1/assistant') {
      const n = assistantCalls.length;
      assistantCalls.push(init);
      const a = answer(n);
      return a instanceof Promise ? a : res(a);
    }
    throw new Error('unexpected url ' + url);
  });
  const session = createAssistantSession({
    projectId: 'p-1',
    sync: { flush: () => Promise.resolve(), getState: () => state },
    getFloorId: () => F1,
    getSelectedIds: () => [],
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => 1000,
    preview: { model, newId: idSeq(100) },
  });
  await session.refreshKey();
  expect(session.getUi().keyState).toBe('present');
  // The session makes its preview store with the first reply that has changes.
  const preview = {
    getState: () => session.getPreview()?.getState() ?? EMPTY_PREVIEW_STATE,
  };
  return { model, preview, session, assistantCalls };
}

describe('EZD-5604b assistant-session preview', () => {
  it('SS1 a reply with changes opens the preview and saves nothing', async () => {
    const t = await setup(() => reply([UPDATE, ADD]));
    const objects = t.model.getState().objects;
    t.session.setDraft('raise the wall and add one');
    // The listeners that hear the reply entry already find the preview store (the editor reads it then).
    const seen: boolean[] = [];
    t.session.subscribe(() => {
      if (t.session.getUi().entries.at(-1)?.kind === 'reply')
        seen.push(t.session.getPreview() !== null);
    });
    await t.session.send();
    expect(seen[0]).toBe(true);
    const entry = t.session.getUi().entries.at(-1)!;
    expect(entry.kind).toBe('reply');
    const s = t.preview.getState();
    expect(s.preview).not.toBeNull();
    expect(s.preview!.updated).toEqual([uid(1)]);
    expect(s.preview!.added).toEqual([uid(100)]);
    expect(s.preview!.provisional).toEqual({ [uid(100)]: 5 });
    expect(s.prompt).toBe('raise the wall and add one');
    expect(s.entryId).toBe(entry.id);
    expect(s.stale).toBe(false);
    expect(t.model.getState().objects).toBe(objects);
    expect(t.model.getState().past).toHaveLength(0);
  });

  it('SS2 a reply that does not fit is refused with no preview; a text-only reply has neither', async () => {
    const t = await setup((n) => (n === 0 ? reply([{ ...UPDATE, ref: 'w9' }]) : reply([])));
    t.session.setDraft('raise wall 9');
    await t.session.send();
    expect(t.session.getUi().entries.at(-1)).toMatchObject({ kind: 'reply', refused: true });
    expect(t.preview.getState().preview).toBeNull();
    expect(t.session.getPreview()).toBeNull();
    t.session.setDraft('what is this wall');
    await t.session.send();
    const last = t.session.getUi().entries.at(-1)!;
    expect(last.kind).toBe('reply');
    expect(Object.hasOwn(last, 'refused')).toBe(false);
    expect(t.preview.getState().preview).toBeNull();
  });

  it('SS3 no second prompt while a preview is open; × and the closing toggle act as Reject', async () => {
    const t = await setup(() => reply([UPDATE, ADD]));
    t.session.setOpen(true);
    t.session.setDraft('raise the wall and add one');
    await t.session.send();
    expect(t.preview.getState().preview).not.toBeNull();
    const entries = t.session.getUi().entries;
    t.session.setDraft('x');
    await t.session.send();
    expect(t.assistantCalls).toHaveLength(1);
    expect(t.session.getUi().entries).toBe(entries);

    const store = t.session.getPreview();
    t.session.setOpen(false);
    expect(t.preview.getState().preview).toBeNull();
    expect(t.session.getUi().open).toBe(false);

    t.session.setOpen(true);
    t.session.setDraft('again');
    await t.session.send();
    expect(t.assistantCalls).toHaveLength(2);
    expect(t.preview.getState().preview).not.toBeNull();
    expect(t.session.getPreview()).toBe(store);
    t.session.toggle();
    expect(t.preview.getState().preview).toBeNull();
    expect(t.session.getUi().open).toBe(false);
  });

  it('SS4 an edit while waiting makes the preview stale when it opens', async () => {
    for (const [edited, stale] of [
      [uid(1), true],
      [uid(2), false],
    ] as const) {
      const held = deferred<Response>();
      const t = await setup(() => held.promise);
      t.session.setDraft('raise the wall');
      const sent = t.session.send();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      expect(t.assistantCalls).toHaveLength(1);
      const v = t.model.getState().objects.get(edited)!;
      t.model.applyEdit([{ id: edited, value: h(v, 90) }]);
      held.resolve(res(reply([UPDATE])));
      await sent;
      expect(t.preview.getState().preview).not.toBeNull();
      expect(t.preview.getState().stale).toBe(stale);
    }
  });
});
