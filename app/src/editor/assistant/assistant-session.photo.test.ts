// EZD-5603b T8-T10 (vault/plans/EZD-5603b.md section 3 S1-S3, section 4; AC-EZD-5603-6, -8, -12, -14). The session
// runs on a fake sync, a routed fetch stub, a held shrinker and a stub for object URLs; no live service, no worker.
// Sources: Decided "Session photo", "Send with photo"; Q-0638 gaps 7, 13; Q-0640, Q-0641 row 56-7; L-048.
import { describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../../lib/outbox/outbox-sync';
import { canSendPrompt, photoControlDisabled } from './assistant-ui';
import { createAssistantSession } from './assistant-session';
import type { PhotoShrinker } from './photo-prepare';

type Answer = { status: number; body: unknown };
const ok = (): Answer => ({
  status: 200,
  body: { message: 'Done.', changes: [], refs: {}, costMicroUsd: 20000, model: 'sonnet' },
});
const err = (status: number, code: string, message_key: string): Answer => ({
  status,
  body: { error: { code, message_key } },
});
const res = (a: Answer) => new Response(JSON.stringify(a.body), { status: a.status });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => {
    resolve = a;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const ticks = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const jpegFile = (name = 'a.jpg', size = 2_400_000) => {
  const data = new Uint8Array(size);
  data.set(JPEG_HEAD);
  return new File([data], name);
};
const gifFile = () => {
  const data = new Uint8Array(20);
  data.set([...'GIF89a'].map((c) => c.charCodeAt(0)));
  return new File([data], 'a.gif');
};
const SHRUNK = () => ({
  ok: true as const,
  jpeg: new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }),
  width: 10,
  height: 8,
});

function setup(
  o: {
    assistant?: (n: number, init: RequestInit) => Promise<Response> | Answer;
    flush?: () => Promise<void>;
    shrink?: PhotoShrinker;
  } = {},
) {
  let state: SyncState = {
    status: 'saved',
    failures: 0,
    problem: null,
    lastSavedAt: 5000,
    conflictRev: 0,
  };
  const assistantCalls: RequestInit[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/profile') return res({ status: 200, body: { aiKey: { last4: '7Qx2' } } });
    if (url === '/api/projects/p-1/assistant') {
      const n = assistantCalls.length;
      assistantCalls.push(init);
      const r = (o.assistant ?? (() => ok()))(n, init);
      return r instanceof Promise ? r : res(r);
    }
    throw new Error('unexpected url ' + url);
  });
  const sync = { flush: vi.fn(o.flush ?? (() => Promise.resolve())), getState: () => state };
  let made = 0;
  const create = vi.fn(() => `blob:${++made}`);
  const revoke = vi.fn();
  const shrink = vi.fn<PhotoShrinker>(o.shrink ?? (async () => SHRUNK()));
  const session = createAssistantSession({
    projectId: 'p-1',
    sync,
    getFloorId: () => 'floor-1',
    getSelectedIds: () => ['w-1'],
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => 1000,
    shrinkPhoto: shrink,
    objectUrls: { create, revoke },
  });
  return {
    session,
    sync,
    assistantCalls,
    create,
    revoke,
    shrink,
    setState: (p: Partial<SyncState>) => {
      state = { ...state, ...p };
    },
  };
}
async function withKey(o: Parameters<typeof setup>[0] = {}) {
  const h = setup(o);
  await h.session.refreshKey();
  expect(h.session.getUi().keyState).toBe('present');
  return h;
}
const formOf = (init: RequestInit) => init.body as FormData;
const requestOf = (init: RequestInit) =>
  JSON.parse(formOf(init).get('request') as string) as Record<string, unknown>;

describe('EZD-5603b assistant-session photo', () => {
  it('T8 attach: preparing blocks send and the control; an ok photo shows; a refused one keeps it; remove revokes', async () => {
    const held = deferred<ReturnType<typeof SHRUNK>>();
    const h = await withKey({ shrink: () => held.promise });
    h.session.setDraft('add a door');
    const file = jpegFile('a.jpg', 2_400_000);
    const attached = h.session.attachPhoto(file);
    await ticks();
    const during = h.session.getUi();
    expect(during.photoPreparing).toBe(true);
    expect(canSendPrompt(during)).toBe(false);
    expect(photoControlDisabled(during)).toBe(true);

    held.resolve(SHRUNK());
    await attached;
    const after = h.session.getUi();
    expect(after.photoPreparing).toBe(false);
    expect(after.photo).toEqual({ url: 'blob:1', name: 'a.jpg', bytes: 2_400_000 });

    await h.session.attachPhoto(gifFile());
    const refused = h.session.getUi();
    expect(refused.photoProblem).toBe('type');
    expect(refused.photo?.url).toBe('blob:1');

    h.session.removePhoto();
    const gone = h.session.getUi();
    expect(gone.photo).toBeNull();
    expect(gone.photoProblem).toBeNull();
    expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(h.revoke).toHaveBeenCalledWith('blob:1');
  });

  it('T9 a stale prepare is dropped: remove, a second attach while preparing, dispose', async () => {
    // (a) removePhoto while preparing: the finished prepare makes no URL.
    {
      const held = deferred<ReturnType<typeof SHRUNK>>();
      const h = await withKey({ shrink: () => held.promise });
      const attached = h.session.attachPhoto(jpegFile());
      await ticks();
      h.session.removePhoto();
      held.resolve(SHRUNK());
      await attached;
      expect(h.create).toHaveBeenCalledTimes(0);
      expect(h.session.getUi().photo).toBeNull();
    }
    // (b) a second attach while preparing is ignored; the first prepare lands.
    {
      const held = deferred<ReturnType<typeof SHRUNK>>();
      const h = await withKey({ shrink: () => held.promise });
      const first = h.session.attachPhoto(jpegFile('one.jpg'));
      await ticks();
      await h.session.attachPhoto(jpegFile('two.jpg'));
      expect(h.shrink).toHaveBeenCalledTimes(1);
      held.resolve(SHRUNK());
      await first;
      expect(h.create).toHaveBeenCalledTimes(1);
      expect(h.session.getUi().photo?.url).toBe('blob:1');
    }
    // (c) dispose while preparing: no URL is made.
    {
      const held = deferred<ReturnType<typeof SHRUNK>>();
      const h = await withKey({ shrink: () => held.promise });
      const attached = h.session.attachPhoto(jpegFile());
      await ticks();
      h.session.dispose();
      held.resolve(SHRUNK());
      await attached;
      expect(h.create).toHaveBeenCalledTimes(0);
      expect(h.session.getUi().photo).toBeNull();
    }
  });

  it('T10 the photo goes with its prompt and stays after every failure; a reply clears it; the next send has none', async () => {
    const answers: Answer[] = [
      err(429, 'assistant_provider_rate_limited', 'error.assistant_provider_rate_limited'),
      err(502, 'assistant_provider_unavailable', 'error.assistant_unavailable'),
      err(504, 'assistant_timeout', 'error.assistant_unavailable'),
      ok(),
      ok(),
    ];
    let flushFails = false;
    const h = await withKey({
      assistant: (n) => answers[n]!,
      flush: () => (flushFails ? Promise.reject(new Error('lock')) : Promise.resolve()),
    });
    await h.session.attachPhoto(jpegFile());
    const photo = h.session.getUi().photo;
    expect(photo).not.toBeNull();
    h.session.setDraft('add a door');

    for (let n = 0; n < 3; n++) {
      await h.session.send();
      expect(h.session.getUi().photo, `failure ${n}`).toBe(photo);
      expect(h.revoke, `failure ${n}`).toHaveBeenCalledTimes(0);
      const form = formOf(h.assistantCalls[n]!);
      expect(form.get('photo'), `failure ${n}`).toBeInstanceOf(File);
      expect(h.session.getUi().entries.at(-1), `failure ${n}`).toMatchObject({
        kind: 'failed',
        photoUrl: 'blob:1',
      });
    }
    expect(h.assistantCalls).toHaveLength(3);

    // The drain fails (flush rejects, then the sync is offline): nothing is sent, the photo stays.
    flushFails = true;
    await h.session.send();
    flushFails = false;
    h.setState({ status: 'offline' });
    await h.session.send();
    h.setState({ status: 'saved' });
    expect(h.assistantCalls).toHaveLength(3);
    expect(h.session.getUi().photo).toBe(photo);
    expect(h.revoke).toHaveBeenCalledTimes(0);

    // A 200 clears the photo; the reply entry keeps its URL, which stays alive.
    await h.session.send();
    expect(h.assistantCalls).toHaveLength(4);
    expect(formOf(h.assistantCalls[3]!).get('photo')).toBeInstanceOf(File);
    const done = h.session.getUi();
    expect(done.photo).toBeNull();
    expect(done.entries.at(-1)).toMatchObject({ kind: 'reply', photoUrl: 'blob:1' });
    expect(h.revoke).toHaveBeenCalledTimes(0);

    // The next send has no photo part and no blob: in its history.
    h.session.setDraft('and another');
    await h.session.send();
    expect(h.assistantCalls).toHaveLength(5);
    expect([...formOf(h.assistantCalls[4]!).keys()]).toEqual(['request']);
    const history = requestOf(h.assistantCalls[4]!).history as { text: string }[];
    expect(history.length).toBeGreaterThan(0);
    expect(JSON.stringify(history)).not.toContain('blob:');
  });

  it('T10 removePhoto while a send is waiting changes nothing', async () => {
    const held = deferred<Response>();
    const h = await withKey({ assistant: () => held.promise });
    await h.session.attachPhoto(jpegFile());
    const photo = h.session.getUi().photo;
    h.session.setDraft('add a door');
    const sent = h.session.send();
    await ticks();
    expect(h.session.getUi().phase).toBe('waiting');
    h.session.removePhoto();
    expect(h.session.getUi().photo).toBe(photo);
    expect(h.revoke).toHaveBeenCalledTimes(0);
    held.resolve(res(ok()));
    await sent;
  });

  it('T8 a replacing photo revokes the replaced URL', async () => {
    const h = await withKey();
    await h.session.attachPhoto(jpegFile('a.jpg'));
    await h.session.attachPhoto(jpegFile('b.jpg'));
    expect(h.session.getUi().photo?.url).toBe('blob:2');
    expect(h.session.getUi().photo?.name).toBe('b.jpg');
    expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(h.revoke).toHaveBeenCalledWith('blob:1');
  });

  it('T10 after a failed send the entry holds the URL, so removePhoto revokes nothing', async () => {
    const h = await withKey({
      assistant: () => err(429, 'assistant_provider_rate_limited', 'error.assistant_provider_rate_limited'),
    });
    await h.session.attachPhoto(jpegFile());
    h.session.setDraft('add a door');
    await h.session.send();
    expect(h.session.getUi().entries.at(-1)).toMatchObject({ kind: 'failed', photoUrl: 'blob:1' });
    h.session.removePhoto();
    expect(h.session.getUi().photo).toBeNull();
    expect(h.revoke).toHaveBeenCalledTimes(0);
  });

  it('S2 dispose revokes every URL the session made', async () => {
    const h = await withKey();
    await h.session.attachPhoto(jpegFile('a.jpg'));
    h.session.setDraft('add a door');
    await h.session.send();
    await h.session.attachPhoto(jpegFile('b.jpg'));
    expect(h.create).toHaveBeenCalledTimes(2);
    h.session.dispose();
    const revoked = h.revoke.mock.calls.map((c) => c[0]);
    expect(revoked).toContain('blob:1');
    expect(revoked).toContain('blob:2');
  });
});
