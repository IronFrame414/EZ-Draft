// EZD-5603b T6b (vault/plans/EZD-5603b.md section 3 P4, section 4; AC-EZD-5603-7). createPhotoWorkerShrinker on a
// test-local FakeWorker: replies match jobs by id; an error or messageerror event, a constructor that throws and
// dispose() all resolve pending jobs { ok: false }; the worker is made on the first job and again after a failure.
// Sources: Decided "Worker failure"; L-059. The fake takes both listener styles (onmessage and addEventListener).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotoWorkerShrinker } from './photo-prepare';

type Listener = (e: unknown) => void;
type Job = { id: number; file: Blob; kind: string };

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: Job[] = [];
  terminated = 0;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  onmessageerror: Listener | null = null;
  private listeners = new Map<string, Listener[]>();
  constructor(..._args: unknown[]) {
    FakeWorker.instances.push(this);
  }
  postMessage(job: Job, ..._rest: unknown[]) {
    this.posted.push(job);
  }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  terminate() {
    this.terminated += 1;
  }
  private emit(type: 'message' | 'error' | 'messageerror', event: unknown) {
    const own = { message: this.onmessage, error: this.onerror, messageerror: this.onmessageerror }[type];
    own?.(event);
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  reply(data: unknown) {
    this.emit('message', { data });
  }
  fire(type: 'error' | 'messageerror') {
    this.emit(type, { type });
  }
}
class ThrowingWorker {
  constructor() {
    throw new Error('no workers here');
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const file = () => new Blob([new Uint8Array(10)]);
const ok = (id: number, size: number) => ({
  id,
  ok: true as const,
  jpeg: new Blob([new Uint8Array(size)]),
  width: 10,
  height: 8,
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('EZD-5603b photo-worker-shrinker', () => {
  it('T6b replies match by id; failures resolve ok:false and a new worker is made; dispose ends pending jobs', async () => {
    vi.stubGlobal('Worker', FakeWorker);

    // Made on the first shrink; two answered in reverse order.
    const a = createPhotoWorkerShrinker();
    expect(FakeWorker.instances).toHaveLength(0);
    const p1 = a.shrink(file(), 'jpeg');
    const p2 = a.shrink(file(), 'png');
    await tick();
    expect(FakeWorker.instances).toHaveLength(1);
    const w = FakeWorker.instances[0]!;
    expect(w.posted).toHaveLength(2);
    expect(w.posted[0]!.kind).toBe('jpeg');
    expect(w.posted[1]!.kind).toBe('png');
    expect(w.posted[0]!.id).not.toBe(w.posted[1]!.id);
    w.reply(ok(w.posted[1]!.id, 20));
    w.reply(ok(w.posted[0]!.id, 10));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok && r1.jpeg.size).toBe(10);
    expect(r2.ok && r2.jpeg.size).toBe(20);
    expect(r1).toMatchObject({ width: 10, height: 8 });

    // An error with two pending: both fail, the worker is terminated, the next job makes a new one.
    const q1 = a.shrink(file(), 'jpeg');
    const q2 = a.shrink(file(), 'jpeg');
    await tick();
    w.fire('error');
    expect(await q1).toEqual({ ok: false });
    expect(await q2).toEqual({ ok: false });
    expect(w.terminated).toBe(1);
    expect(FakeWorker.instances).toHaveLength(1);
    const q3 = a.shrink(file(), 'jpeg');
    await tick();
    expect(FakeWorker.instances).toHaveLength(2);
    const w2 = FakeWorker.instances[1]!;
    w2.reply(ok(w2.posted[0]!.id, 5));
    expect((await q3).ok).toBe(true);

    // messageerror.
    const m = createPhotoWorkerShrinker();
    const pm = m.shrink(file(), 'jpeg');
    await tick();
    FakeWorker.instances.at(-1)!.fire('messageerror');
    expect(await pm).toEqual({ ok: false });

    // dispose with one pending.
    const d = createPhotoWorkerShrinker();
    const pd = d.shrink(file(), 'jpeg');
    await tick();
    const wd = FakeWorker.instances.at(-1)!;
    d.dispose();
    expect(await pd).toEqual({ ok: false });
    expect(wd.terminated).toBe(1);

    // A constructor that throws: ok:false, no throw.
    vi.stubGlobal('Worker', ThrowingWorker);
    const t = createPhotoWorkerShrinker();
    await expect(t.shrink(file(), 'jpeg')).resolves.toEqual({ ok: false });
  });
});
