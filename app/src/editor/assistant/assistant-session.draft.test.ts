// EZD-2013 (AC-EZD-2013-1, -2; flaky-test audit 2026-11-27 row 6): a key read that lands late, fails or is read
// again never clears a prompt the user has typed, and one failed read is tried once more. The slow and failing reads
// are held promises and a routed fetch stub; no live service. Send needs a present key, an idle phase and a draft
// (assistant-ui.ts canSendPrompt).
import { describe, expect, it, vi } from 'vitest';
import { canSendPrompt } from './assistant-ui';
import { createAssistantSession } from './assistant-session';

const PROMPT = 'add a door';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const present = () => json({ aiKey: { last4: '7Qx2' } });
const none = () => json({ aiKey: null });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

function setup(profile: (n: number) => Promise<Response>) {
  let calls = 0;
  const fetchImpl = vi.fn((url: string) => {
    if (url !== '/api/profile') throw new Error('unexpected url ' + url);
    calls += 1;
    return profile(calls - 1);
  });
  const session = createAssistantSession({
    projectId: 'p-1',
    sync: { flush: () => Promise.resolve(), getState: () => ({ status: 'saved' }) } as never,
    getFloorId: () => 'floor-1',
    getSelectedIds: () => [],
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { session, calls: () => calls };
}

describe('EZD-2013 a late key status never clears a typed draft', () => {
  it('D1 typed while the key read is held: the draft stays and Send turns on when the read lands', async () => {
    const held = deferred<Response>();
    const { session } = setup(() => held.promise);
    const reading = session.refreshKey();
    expect(session.getUi().keyState).toBe('loading');
    session.setDraft(PROMPT);
    expect(canSendPrompt(session.getUi())).toBe(false);
    held.resolve(present());
    await reading;
    expect(session.getUi().draft).toBe(PROMPT);
    expect(session.getUi().keyState).toBe('present');
    expect(canSendPrompt(session.getUi())).toBe(true);
  });

  it('D2 one failed read is tried once more: the draft stays and Send turns on', async () => {
    const { session, calls } = setup((n) =>
      n === 0 ? Promise.reject(new TypeError('connection reset')) : Promise.resolve(present()),
    );
    const reading = session.refreshKey();
    session.setDraft(PROMPT);
    await reading;
    expect(calls()).toBe(2);
    expect(session.getUi().draft).toBe(PROMPT);
    expect(session.getUi().keyState).toBe('present');
    expect(canSendPrompt(session.getUi())).toBe(true);
  });

  it('D3 a 500 answer is tried once more too', async () => {
    const { session, calls } = setup((n) => Promise.resolve(n === 0 ? json({}, 500) : present()));
    await session.refreshKey();
    expect(calls()).toBe(2);
    expect(session.getUi().keyState).toBe('present');
  });

  it('D4 two failed reads show the key error with the draft kept; Retry turns Send on', async () => {
    const { session, calls } = setup((n) =>
      n < 2 ? Promise.reject(new TypeError('connection reset')) : Promise.resolve(present()),
    );
    const reading = session.refreshKey();
    session.setDraft(PROMPT);
    await reading;
    expect(calls()).toBe(2);
    expect(session.getUi().keyState).toBe('failed');
    expect(session.getUi().draft).toBe(PROMPT);
    expect(canSendPrompt(session.getUi())).toBe(false);
    await session.refreshKey();
    expect(calls()).toBe(3);
    expect(session.getUi().draft).toBe(PROMPT);
    expect(canSendPrompt(session.getUi())).toBe(true);
  });

  it('D5 a late no-key answer keeps the draft; the key read after My profile closes turns Send on', async () => {
    const { session } = setup((n) => Promise.resolve(n === 0 ? none() : present()));
    const reading = session.refreshKey();
    session.setDraft(PROMPT);
    await reading;
    expect(session.getUi().keyState).toBe('none');
    expect(session.getUi().draft).toBe(PROMPT);
    await session.refreshKey();
    expect(session.getUi().draft).toBe(PROMPT);
    expect(canSendPrompt(session.getUi())).toBe(true);
  });

  it('D6 the second try is dropped when a newer read started or the session was disposed', async () => {
    const first = deferred<Response>();
    const a = setup((n) => (n === 0 ? first.promise : Promise.resolve(present())));
    const r1 = a.session.refreshKey();
    const r2 = a.session.refreshKey();
    await r2;
    first.resolve(json({}, 500));
    await r1;
    expect(a.calls()).toBe(2);
    expect(a.session.getUi().keyState).toBe('present');

    const held = deferred<Response>();
    const b = setup(() => held.promise);
    const pending = b.session.refreshKey();
    b.session.setDraft(PROMPT);
    b.session.dispose();
    held.resolve(json({}, 500));
    await pending;
    expect(b.calls()).toBe(1);
  });

  it('D7 closing and opening the panel again keeps the draft', async () => {
    const { session } = setup(() => Promise.resolve(present()));
    session.setOpen(true);
    session.setDraft(PROMPT);
    session.setOpen(false);
    session.setOpen(true);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(session.getUi().draft).toBe(PROMPT);
  });
});
