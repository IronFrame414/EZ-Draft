// EZD-612: the editor's calls to the code check route (route header: GET, POST, PATCH; errors as { error: { code } }).
// A stub fetch stands in for the network (CLAUDE.md rule 5).
import { describe, expect, it, vi } from 'vitest';
import { acceptWarning, readCodeCheck, runCodeCheckNow } from './check-client';

const ANSWER = { run: null, canRun: true, canAccept: false };
const ok = () => vi.fn(async () => new Response(JSON.stringify(ANSWER), { status: 200 }));

describe('EZD-612 check client', () => {
  it('reads, runs and accepts on the project route', async () => {
    const f = ok();
    expect(await readCodeCheck('p1', f as never)).toEqual({ ok: true, answer: ANSWER });
    expect(await runCodeCheckNow('p1', f as never)).toEqual({ ok: true, answer: ANSWER });
    const body = { runId: 'r', ruleId: 'FC-001', objectId: 'o', note: 'n' };
    await acceptWarning('p1', body, f as never);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method ?? 'GET'])).toEqual([
      ['/api/projects/p1/code-check', 'GET'],
      ['/api/projects/p1/code-check', 'POST'],
      ['/api/projects/p1/code-check', 'PATCH'],
    ]);
    expect(JSON.parse(String(calls[2]![1].body))).toEqual(body);
  });

  it('answers the error code, or network when the request never lands', async () => {
    const refused = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'run_not_latest', message_key: 'x' } }), {
          status: 409,
        }),
    );
    expect(await runCodeCheckNow('p1', refused as never)).toEqual({
      ok: false,
      code: 'run_not_latest',
    });
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await readCodeCheck('p1', down as never)).toEqual({ ok: false, code: 'network' });
  });
});
