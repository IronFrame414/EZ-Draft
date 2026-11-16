// EZD-5605 T19, T20 (vault/plans/EZD-5605.md section 4; D-Accept order, D-Messages, D-Save; Q-0474; Q-0638 gap 10;
// Q-0640 rows 56-1, 56-6; AC-EZD-5605-1, -5, -7, -8; AC-EZD-294-3). Real model and preview stores; `sendNow` is a
// stub answering as OutboxSync.sendNow does. Expected numbers: AC-EZD-294-3 (a new object takes the next number of
// its kind when it is saved: door high 5 → 6), MAX_CHANGES_PER_SAVE = 100 (Q-0640 row 56-1).
import { objectNumber } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { RefusedCode } from '../../lib/outbox/outbox';
import type { SendNowOutcome } from '../../lib/outbox/outbox-sync';
import { createModelStore } from '../model/model-store';
import type { Change } from '../model/patches';
import { acceptMessage, createAcceptController, renumberAdded, type AcceptResult } from './accept';
import { touchedIds, type OkPreview } from './apply-reply';
import { createPreviewStore } from './preview-store';
import { D, F, W, door, floor, wall } from './assistant-test-values.test-helpers';

const D2 = '00000000-0000-4000-8000-0000000000d2';

function setup(o: { answer?: () => Promise<SendNowOutcome>; changes?: Change[] } = {}) {
  const onCommit = vi.fn();
  const model = createModelStore({
    objects: new Map([
      [F, floor()],
      [W, wall(6)],
    ]),
    numberHighs: { wall: 6, door: 2, window: 1 },
    onCommit,
  });
  const before = model.getState().objects;
  const changes = o.changes ?? [
    { id: D, value: door(3) },
    { id: W, value: wall(6, 100) },
  ];
  const preview: OkPreview = {
    ok: true,
    changes,
    added: changes.filter((c) => !before.has(c.id)).map((c) => c.id),
    removed: [],
    updated: changes.filter((c) => before.has(c.id)).map((c) => c.id),
    touched: touchedIds(before, changes),
    provisional: { [D]: 3 },
  };
  const previews = createPreviewStore({ store: model });
  previews.open({ preview, prompt: 'add a door', entryId: 1, before });
  const sendNow = vi.fn(
    o.answer ??
      (async (_p: string, _e: number, sent: Change[]): Promise<SendNowOutcome> => ({
        kind: 'saved',
        objects: sent.map((c) => ({ id: c.id, updatedSeq: 1 })),
      })),
  );
  const adjust = { end: vi.fn() };
  const onMessage = vi.fn();
  const accept = createAcceptController({
    projectId: 'p1',
    lockEpoch: 0,
    model,
    sync: { sendNow },
    previews,
    adjust,
    onMessage,
  });
  return { model, previews, preview, sendNow, adjust, onMessage, accept, onCommit };
}

describe('EZD-5605 Accept', () => {
  it('T19 saves once with the number given at Accept, then puts it in the model as one undo step', async () => {
    const sendNow = vi.fn(async (): Promise<SendNowOutcome> => ({
      kind: 'saved',
      objects: [
        { id: D, updatedSeq: 1, number: 6 },
        { id: W, updatedSeq: 2, number: 6 },
      ],
    }));
    const t = setup({ answer: sendNow });
    // Another door saved meanwhile raises the door high to 5.
    t.model.applyRemote([{ id: D2, value: door(5, 20) }]);
    const past = t.model.getState().past.length;

    const r = await t.accept.accept();
    expect(r).toEqual({ kind: 'saved', ids: [D, W] });
    expect(sendNow).toHaveBeenCalledTimes(1);
    const [projectId, lockEpoch, sent, opts] = sendNow.mock.calls[0] as unknown as [
      string,
      number,
      Change[],
      { assistant: true; stillValid: () => boolean },
    ];
    expect(projectId).toBe('p1');
    expect(lockEpoch).toBe(0);
    expect(opts.assistant).toBe(true);
    expect(sent.map((c) => c.id)).toEqual([D, W]);
    expect(objectNumber(sent[0]!.value!)).toBe(6);
    expect(sent[1]).toBe(t.preview.changes[1]);
    expect(t.previews.getState().preview).toBeNull();
    expect(t.adjust.end).toHaveBeenCalled();
    expect(t.onCommit).not.toHaveBeenCalled();
    const s = t.model.getState();
    expect(s.past).toHaveLength(past + 1);
    expect(objectNumber(s.objects.get(D)!)).toBe(6);
    expect(s.objects.get(W)).toEqual(wall(6, 100));
    expect(t.onMessage).not.toHaveBeenCalled();

    t.model.undo();
    expect(t.model.getState().objects.has(D)).toBe(false);
    expect(t.model.getState().objects.get(W)).toEqual(wall(6));
    expect(t.onCommit).toHaveBeenCalledTimes(1);
  });

  it('T19 renumberAdded numbers only added walls, doors and windows, in save-set order', () => {
    const W2 = '00000000-0000-4000-8000-0000000000a2';
    const changes: Change[] = [
      { id: W, value: wall(6, 100) },
      { id: D, value: door(3) },
      { id: W2, value: wall(7) },
      { id: F, value: floor() },
    ];
    const out = renumberAdded(changes, [D, W2.toUpperCase(), F], { wall: 9, door: 5, window: 1 });
    expect(out[0]).toBe(changes[0]);
    expect(objectNumber(out[1]!.value!)).toBe(6);
    expect(objectNumber(out[2]!.value!)).toBe(10);
    expect(out[3]).toBe(changes[3]);
  });

  const codes: Array<[RefusedCode, string]> = [
    ['permission_denied', 'error.not_authorized'],
    ['stale_lock_epoch', 'error.stale_lock_epoch'],
    ['save_conflict', 'error.save_conflict'],
    ['invalid_input', 'error.invalid_input'],
    ['invalid_object', 'error.invalid_input'],
    ['not_signed_in', 'error.not_signed_in'],
    ['project_not_found', 'error.project_not_found'],
    ['app_outdated', 'error.app_outdated'],
  ];
  const outcomes: Array<[string, () => Promise<SendNowOutcome>, string | null]> = [
    ...codes.map(
      ([code, key]) =>
        [code, async () => ({ kind: 'refused' as const, code }), key] as [
          string,
          () => Promise<SendNowOutcome>,
          string | null,
        ],
    ),
    ['failed', async () => ({ kind: 'failed' }), 'office.editor.save_failed'],
    ['unsaved', async () => ({ kind: 'unsaved' }), 'office.editor.save_failed'],
    ['cancelled', async () => ({ kind: 'cancelled' }), null],
    [
      'throw',
      async () => {
        throw new Error('boom');
      },
      'office.editor.save_failed',
    ],
  ];

  it.each(outcomes)(
    'T20 %s: the normal message; model, undo stack and preview stay',
    async (_n, answer, key) => {
      const t = setup({ answer });
      const m0 = t.model.getState();
      const p0 = t.previews.getState();
      await t.accept.accept();
      if (key === null) expect(t.onMessage).not.toHaveBeenCalled();
      else expect(t.onMessage).toHaveBeenCalledExactlyOnceWith(key);
      const m1 = t.model.getState();
      expect(m1.objects).toBe(m0.objects);
      expect(m1.past).toBe(m0.past);
      expect(m1.future).toBe(m0.future);
      expect(t.previews.getState()).toBe(p0);
      expect(t.adjust.end).not.toHaveBeenCalled();
      expect(t.accept.getUi().busy).toBe(false);
    },
  );

  it('T20 over 100 changes: nothing is sent, the preview stays; exactly 100 is sent', async () => {
    const many = (n: number): Change[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
        value: floor(),
      }));
    const over = setup({ changes: many(101) });
    expect(await over.accept.accept()).toEqual({ kind: 'too_many', count: 101 });
    expect(over.sendNow).not.toHaveBeenCalled();
    expect(over.onMessage).toHaveBeenCalledExactlyOnceWith('office.assistant.accept_too_many');
    expect(over.previews.getState().preview).not.toBeNull();

    const hundred = setup({ changes: many(100) });
    expect((await hundred.accept.accept()).kind).toBe('saved');
    expect(hundred.sendNow).toHaveBeenCalledTimes(1);
  });

  it('T20 guards: no preview, stale, a second Accept while one waits, and no changes', async () => {
    const none = setup();
    none.previews.reject();
    expect(await none.accept.accept()).toEqual({ kind: 'no_preview' });

    const stale = setup();
    stale.model.applyEdit([{ id: W, value: wall(6, 120) }]);
    expect(await stale.accept.accept()).toEqual({ kind: 'stale' });
    expect(stale.sendNow).not.toHaveBeenCalled();

    let release: (r: SendNowOutcome) => void = () => {};
    const waiting = setup({
      answer: () =>
        new Promise<SendNowOutcome>((resolve) => {
          release = resolve;
        }),
    });
    const first = waiting.accept.accept();
    expect(waiting.accept.getUi().busy).toBe(true);
    expect(await waiting.accept.accept()).toEqual({ kind: 'busy' });
    release({ kind: 'saved', objects: [] });
    expect((await first).kind).toBe('saved');
    expect(waiting.sendNow).toHaveBeenCalledTimes(1);
    expect(waiting.accept.getUi().busy).toBe(false);

    const empty = setup({ changes: [] });
    const past = empty.model.getState().past;
    expect(await empty.accept.accept()).toEqual({ kind: 'empty' });
    expect(empty.sendNow).not.toHaveBeenCalled();
    expect(empty.previews.getState().preview).toBeNull();
    expect(empty.model.getState().past).toBe(past);
  });

  it('T20 stillValid follows the preview store', async () => {
    const seen: boolean[] = [];
    let check: () => boolean = () => true;
    const t = setup({
      answer: async () => {
        seen.push(check());
        t.model.applyEdit([{ id: W, value: wall(6, 130) }]);
        seen.push(check());
        return { kind: 'cancelled' };
      },
    });
    t.sendNow.mockImplementationOnce(async (...args: unknown[]) => {
      check = (args[3] as { stillValid: () => boolean }).stillValid;
      seen.push(check());
      t.model.applyEdit([{ id: W, value: wall(6, 130) }]);
      seen.push(check());
      return { kind: 'cancelled' };
    });
    await t.accept.accept();
    expect(seen).toEqual([true, false]);
  });

  it('acceptMessage of the non-message results is null', () => {
    const results: AcceptResult[] = [
      { kind: 'saved', ids: [] },
      { kind: 'empty' },
      { kind: 'busy' },
      { kind: 'no_preview' },
      { kind: 'stale' },
      { kind: 'cancelled' },
    ];
    for (const r of results) expect(acceptMessage(r)).toBeNull();
  });
});
