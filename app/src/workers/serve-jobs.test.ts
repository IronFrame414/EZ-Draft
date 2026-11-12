// EZD-235b S1, S2 (vault/plans/EZD-235b.md section 4; AC-EZD-235-3): serveJobs, the worker side of the job protocol.
import { describe, expect, it, vi } from 'vitest';
import { serveJobs, type JobHandler, type JobReply, type JobScope } from './serve-jobs';

function fakeScope() {
  const post = vi.fn<(m: JobReply) => void>();
  const scope: JobScope = { onmessage: null, postMessage: post };
  return { scope, post };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

describe('EZD-235b serveJobs', () => {
  it('EZD-235b S1 serveJobs answers each request once with its output or an error code', async () => {
    const { scope, post } = fakeScope();
    const handlers: Record<string, JobHandler> = {
      a: (x) => (x as number) + 1,
      b: async (x) => (x as number) * 3,
      c: () => {
        throw new Error('c');
      },
      d: () => Promise.reject(new Error('d')),
    };
    serveJobs(scope, handlers);
    expect(typeof scope.onmessage).toBe('function');
    const send = (data: unknown) => scope.onmessage!({ data });
    send({ id: 1, kind: 'a', input: 1 });
    send({ id: 2, kind: 'b', input: 1 });
    send({ id: 3, kind: 'c' });
    send({ id: 4, kind: 'd' });
    send({ id: 5, kind: 'toString' });
    send({ id: 6, kind: '__proto__' });
    send({ id: 7, kind: 5 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(7));
    await flush();
    expect(post).toHaveBeenCalledTimes(7);
    const replies = post.mock.calls.map((c) => c[0]).sort((x, y) => x.id - y.id);
    expect(replies).toEqual([
      { id: 1, ok: true, output: 2 },
      { id: 2, ok: true, output: 3 },
      { id: 3, ok: false, error: 'worker.job_failed' },
      { id: 4, ok: false, error: 'worker.job_failed' },
      { id: 5, ok: false, error: 'worker.unknown_job' },
      { id: 6, ok: false, error: 'worker.unknown_job' },
      { id: 7, ok: false, error: 'worker.unknown_job' },
    ]);
  });

  it('EZD-235b S2 serveJobs ignores malformed requests and replies once when the output cannot be posted', async () => {
    const { scope, post } = fakeScope();
    serveJobs(scope, { a: (x) => (x as number) + 1 });
    const send = (data: unknown) => scope.onmessage!({ data });
    const malformed: unknown[] = [
      null,
      'x',
      [],
      { id: '1', kind: 'a' },
      { id: 1.5, kind: 'a' },
      { id: 0, kind: 'a' },
      { id: 2 ** 53, kind: 'a' },
    ];
    for (const data of malformed) send(data);
    await flush();
    expect(post).toHaveBeenCalledTimes(0);

    send({ id: Number.MAX_SAFE_INTEGER, kind: 'a', input: 1 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toEqual({ id: Number.MAX_SAFE_INTEGER, ok: true, output: 2 });

    post.mockClear();
    post.mockImplementationOnce(() => {
      throw new Error('clone');
    });
    send({ id: 8, kind: 'a', input: 1 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]![0]).toEqual({ id: 8, ok: false, error: 'worker.job_failed' });

    post.mockClear();
    post.mockImplementation(() => {
      throw new Error('clone');
    });
    expect(() => send({ id: 9, kind: 'a', input: 1 })).not.toThrow();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await flush();
    expect(post).toHaveBeenCalledTimes(2);
  });
});
