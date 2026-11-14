// EZD-5603a T7-T13 (vault/plans/EZD-5603a.md section 4; AC-EZD-5603-2, -3, -4, -5, -12, -14). The session runs on
// a fake sync, a routed fetch stub and held promises; no live service. Sources: Q-0638 gaps 5, 9, 12, 13;
// Q-0640 row 56-7; Q-0641 row 56-7; Q-0653 (a); L-048; L-062; 09l Typical and Session rows.
import { describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../../lib/outbox/outbox-sync';
import { formatUsd, sessionTotalMicroUsd } from '../../lib/assistant/cost';
import { canSendPrompt } from './assistant-ui';
import { createAssistantSession } from './assistant-session';

type Answer = { status: number; body: unknown };
const ok = (costMicroUsd: number): Answer => ({
  status: 200,
  body: { message: 'Done.', changes: [], refs: {}, costMicroUsd, model: 'sonnet' },
});
const err = (status: number, code: string, message_key: string, extra: object = {}): Answer => ({
  status,
  body: { error: { code, message_key }, ...extra },
});
const res = (a: Answer) => new Response(JSON.stringify(a.body), { status: a.status });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ticks = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

const PRESENT = { status: 200, body: { aiKey: { last4: '7Qx2' } } };

// Fetch router: /api/profile reads answer from `profile` (a function), the assistant route from `assistant`.
function setup(
  o: {
    profile?: (n: number) => Promise<Response> | Answer;
    assistant?: (n: number, init: RequestInit) => Promise<Response> | Answer;
    flush?: () => Promise<void>;
    state?: Partial<SyncState>;
    ids?: string[];
    floor?: string | null;
  } = {},
) {
  const clock = { now: 1000 };
  let state: SyncState = {
    status: 'saved',
    failures: 0,
    problem: null,
    lastSavedAt: 5000,
    conflictRev: 0,
    ...o.state,
  };
  const profileCalls: RequestInit[] = [];
  const assistantCalls: RequestInit[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/profile') {
      const r = (o.profile ?? (() => PRESENT))(profileCalls.length);
      profileCalls.push(init);
      return r instanceof Promise ? r : res(r);
    }
    if (url === '/api/projects/p-1/assistant') {
      const n = assistantCalls.length;
      assistantCalls.push(init);
      const r = (o.assistant ?? (() => ok(20000)))(n, init);
      return r instanceof Promise ? r : res(r);
    }
    throw new Error('unexpected url ' + url);
  });
  const sync = {
    flush: vi.fn(o.flush ?? (() => Promise.resolve())),
    getState: () => state,
  };
  const session = createAssistantSession({
    projectId: 'p-1',
    sync,
    getFloorId: () => (o.floor === undefined ? 'floor-1' : o.floor),
    getSelectedIds: () => o.ids ?? ['w-1'],
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => clock.now,
  });
  return {
    session,
    sync,
    fetchImpl,
    profileCalls,
    assistantCalls,
    setState: (p: Partial<SyncState>) => {
      state = { ...state, ...p };
    },
  };
}
const requestOf = (init: RequestInit) =>
  JSON.parse((init.body as FormData).get('request') as string) as Record<string, unknown>;
const lastEntry = (s: { getUi(): { entries: readonly { kind: string }[] } }) =>
  s.getUi().entries.at(-1);

async function withKey(o: Parameters<typeof setup>[0] = {}) {
  const h = setup(o);
  await h.session.refreshKey();
  expect(h.session.getUi().keyState).toBe('present');
  return h;
}

describe('EZD-5603a assistant-session', () => {
  it('S3 initial ui', () => {
    const { session } = setup();
    expect(session.getUi()).toEqual({
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
    });
  });

  it('T7 drains the outbox first, then sends floor, selection, model and prompt', async () => {
    const flush = deferred<void>();
    const h = await withKey({ flush: () => flush.promise });
    h.session.setDraft('add a door');
    const sent = h.session.send();
    await ticks();
    expect(h.sync.flush).toHaveBeenCalledTimes(1);
    expect(h.assistantCalls).toHaveLength(0);
    expect(h.session.getUi().phase).toBe('draining');
    expect(h.session.getUi().entries).toHaveLength(0);
    h.setState({ status: 'saved', lastSavedAt: 1000 });
    flush.resolve();
    await sent;
    expect(h.assistantCalls).toHaveLength(1);
    const req = requestOf(h.assistantCalls[0]!);
    expect(req.prompt).toBe('add a door');
    expect(req.model).toBe('sonnet');
    expect(req.floorId).toBe('floor-1');
    expect(req.selectedIds).toEqual(['w-1']);
  });

  it('T8 a drain that does not end saved sends nothing and keeps the prompt', async () => {
    const cases: { name: string; o: Parameters<typeof setup>[0] }[] = [
      { name: 'offline', o: { state: { status: 'offline', lastSavedAt: 5000 } } },
      { name: 'error', o: { state: { status: 'error', lastSavedAt: 5000 } } },
      { name: 'stale saved', o: { state: { status: 'saved', lastSavedAt: 999 } } },
      { name: 'flush rejects', o: { flush: () => Promise.reject(new Error('lock')) } },
    ];
    for (const c of cases) {
      const h = await withKey(c.o);
      h.session.setDraft('add a door');
      await h.session.send();
      expect(h.assistantCalls, c.name).toHaveLength(0);
      expect(h.session.getUi().draft, c.name).toBe('add a door');
      expect(h.session.getUi().entries, c.name).toHaveLength(0);
      expect(h.session.getUi().phase, c.name).toBe('idle');
    }
  });

  it('T9 while waiting: a waiting entry, no second send', async () => {
    const held = deferred<Response>();
    const h = await withKey({ assistant: () => held.promise });
    h.session.setDraft('add a door');
    const first = h.session.send();
    await ticks();
    const second = h.session.send();
    await ticks();
    const ui = h.session.getUi();
    expect(ui.phase).toBe('waiting');
    expect(lastEntry(h.session)).toMatchObject({ kind: 'waiting', prompt: 'add a door' });
    expect(canSendPrompt(ui)).toBe(false);
    expect(h.assistantCalls).toHaveLength(1);
    held.resolve(res(ok(20000)));
    await first;
    await second;
    expect(h.assistantCalls).toHaveLength(1);
  });

  it('T10 replies add up the session total; the draft clears only if unchanged', async () => {
    const costs = [20000, 20000, 12000, 12000, 12000];
    const gates = costs.map(() => deferred<Response>());
    const h = await withKey({ assistant: (n) => gates[n]!.promise });
    const totals: number[] = [];
    for (let n = 0; n < costs.length; n++) {
      h.session.setDraft(`p${n + 1}`);
      const sent = h.session.send();
      await ticks();
      if (n === costs.length - 1) h.session.setDraft('x');
      gates[n]!.resolve(res(ok(costs[n]!)));
      await sent;
      const e = lastEntry(h.session) as unknown as { kind: string; sessionMicroUsd: number };
      expect(e.kind).toBe('reply');
      totals.push(e.sessionMicroUsd);
      if (n === 0) expect(h.session.getUi().draft).toBe('');
    }
    expect(totals).toEqual([20000, 40000, 52000, 64000, 76000]);
    expect(h.session.getUi().draft).toBe('x');
    expect(formatUsd(20000)).toBe('$0.02');
    expect(formatUsd(40000)).toBe('$0.04');
    expect(formatUsd(sessionTotalMicroUsd([12000, 12000, 12000]))).toBe('$0.04');
  });

  it('T11 failures keep the prompt and the model, show their key, and are not history', async () => {
    const answers: Answer[] = [
      err(429, 'assistant_provider_rate_limited', 'error.assistant_provider_rate_limited'),
      err(502, 'assistant_provider_unavailable', 'error.assistant_unavailable'),
      err(504, 'assistant_timeout', 'error.assistant_unavailable'),
      err(400, 'assistant_out_of_credit', 'error.assistant_out_of_credit'),
      err(502, 'assistant_invalid_reply', 'error.assistant_invalid_reply', {
        costMicroUsd: 20000,
      }),
      ok(20000),
    ];
    const keys = [
      'error.assistant_provider_rate_limited',
      'error.assistant_unavailable',
      'error.assistant_unavailable',
      'error.assistant_out_of_credit',
      'error.assistant_invalid_reply',
    ];
    const h = await withKey({ assistant: (n) => answers[n]! });
    h.session.setModel('opus');
    h.session.setDraft('add a door');
    for (let n = 0; n < 5; n++) {
      await h.session.send();
      const ui = h.session.getUi();
      expect(ui.draft).toBe('add a door');
      expect(ui.model).toBe('opus');
      expect(ui.entries).toHaveLength(n + 1);
      expect(lastEntry(h.session)).toMatchObject({ kind: 'failed', messageKey: keys[n] });
    }
    expect(lastEntry(h.session)).toMatchObject({ costMicroUsd: 20000, sessionMicroUsd: 20000 });
    await h.session.send();
    expect(requestOf(h.assistantCalls[5]!).history).toEqual([]);
  });

  it('T12 a no-key answer flips the key state; the model pick survives a send', async () => {
    const a = await withKey({
      assistant: () => err(400, 'assistant_no_key', 'error.assistant_no_key'),
    });
    a.session.setDraft('add a door');
    await a.session.send();
    expect(a.session.getUi().keyState).toBe('none');
    expect(a.session.getUi().entries).toHaveLength(0);
    expect(a.session.getUi().draft).toBe('add a door');

    const b = await withKey();
    b.session.setModel('opus');
    b.session.setDraft('add a door');
    await b.session.send();
    expect(requestOf(b.assistantCalls[0]!).model).toBe('opus');
    expect(b.session.getUi().model).toBe('opus');
  });

  it('T13 key reads: when they run and which answer wins', async () => {
    // setOpen(true) and closeProfile() each read the key once.
    const a = setup();
    a.session.setOpen(true);
    await ticks();
    expect(a.profileCalls).toHaveLength(1);
    expect(a.session.getUi().keyState).toBe('present');
    a.session.closeProfile();
    await ticks();
    expect(a.profileCalls).toHaveLength(2);

    // Two reads: the later call's answer wins even when the earlier one lands last.
    const first = deferred<Response>();
    const second = deferred<Response>();
    const b = setup({ profile: (n) => (n === 0 ? first.promise : second.promise) });
    const r1 = b.session.refreshKey();
    const r2 = b.session.refreshKey();
    second.resolve(res(PRESENT));
    await r2;
    expect(b.session.getUi().keyState).toBe('present');
    first.resolve(res({ status: 200, body: { aiKey: null } }));
    await r1;
    expect(b.session.getUi().keyState).toBe('present');

    // A read held across a no-key send answer does not overwrite it.
    const late = deferred<Response>();
    const c = setup({
      profile: (n) => (n === 0 ? PRESENT : late.promise),
      assistant: () => err(400, 'assistant_no_key', 'error.assistant_no_key'),
    });
    await c.session.refreshKey();
    const held = c.session.refreshKey();
    c.session.setDraft('add a door');
    await c.session.send();
    expect(c.session.getUi().keyState).toBe('none');
    late.resolve(res(PRESENT));
    await held;
    expect(c.session.getUi().keyState).toBe('none');

    // A read that lands after dispose changes nothing.
    const gone = deferred<Response>();
    const d = setup({ profile: () => gone.promise });
    const pending = d.session.refreshKey();
    d.session.dispose();
    gone.resolve(res(PRESENT));
    await pending;
    expect(d.session.getUi().keyState).toBe('loading');

    // dispose during a held send aborts it and changes no entry.
    const answer = deferred<Response>();
    const e = await withKey({ assistant: () => answer.promise });
    e.session.setDraft('add a door');
    const sent = e.session.send();
    await ticks();
    const entriesBefore = e.session.getUi().entries;
    expect(entriesBefore).toHaveLength(1);
    e.session.dispose();
    expect((e.assistantCalls[0]!.signal as AbortSignal).aborted).toBe(true);
    answer.resolve(res(ok(20000)));
    await sent;
    expect(e.session.getUi().entries).toEqual(entriesBefore);
  });
});
