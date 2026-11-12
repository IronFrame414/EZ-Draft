// EZD-293 T1-T9 (vault/plans/EZD-293.md sections 3, 4; AC-EZD-293-1). Fakes only: no network, no database.
// Secrets are compared through booleans, never value matchers (L-018).
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { STREAM_PID_SQL as HARNESS_STREAM_PID_SQL } from '../../../test-harness/realtime/stream';
import {
  PROBE_EVENT,
  SILENT,
  STOP_PROMPT,
  REF_PROMPT,
  STREAM_PID_SQL,
  VERDICTS,
  classify,
  main,
  mask,
  parseInputs,
  runCheck,
} from '../../../scripts/realtime-failover-check.mjs';

const REF = 'abcdefghijklmnopqrst';
const PASSWORD = 'pw-Secret1';
const ACCESS = 'tok-Secret1';
const APP_USER = '00000000-0000-4000-8000-000000000001';
const POOLER = `postgresql://postgres.${REF}:${PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const DIRECT = `postgresql://postgres:${PASSWORD}@db.${REF}.supabase.co:5432/postgres`;
const tokenObj = (over: Record<string, unknown> = {}) => ({
  url: `https://${REF}.supabase.co`,
  apiKey: 'pk-test',
  accessToken: ACCESS,
  expiresAt: 2800,
  appUserId: APP_USER,
  ...over,
});
const validEnv = (over: Record<string, string> = {}): Record<string, string> => ({
  SUPABASE_DEV_DB_URL: POOLER,
  EZD_REALTIME_TOKEN: JSON.stringify(tokenObj()),
  ...over,
});

type Which = 'first' | 'second';
type Probe = { sentAt: number; arrivedAt: number | null; sendFailed: boolean };
type Obs = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// obs(): the `unaffected` default of section 4.
function obs(over: Obs = {}): Obs {
  return {
    join: 'SUBSCRIBED',
    baseline: { attempts: 1, arrived: true },
    stopAt: 1000,
    dbBackAt: 2000,
    streamPidBefore: 1,
    streamPidAfter: 1,
    probes: [{ sentAt: 2000, arrivedAt: 2010, sendFailed: false }],
    statuses: [{ at: 0, status: 'SUBSCRIBED' }],
    systems: [],
    socket: { opens: [0], closes: [] },
    control: { join: 'SUBSCRIBED', received: true, originalReceived: true },
    ...over,
  };
}

// Index of a nonce in order of first sight (0 = the first baseline probe).
function order() {
  const seen: string[] = [];
  return (n: string) => {
    let i = seen.indexOf(n);
    if (i < 0) {
      seen.push(n);
      i = seen.length - 1;
    }
    return i;
  };
}

type FakeOpts = {
  joinStatus?: string;
  lose?: (nonce: string, which: Which, afterStop: boolean) => boolean;
  pingFails?: boolean;
  pid?: number | null;
  pidFails?: boolean;
  sendFails?: (nonce: string) => boolean;
  systems?: { at: number; payload: unknown }[];
  askVia?: (text: string) => Promise<string>;
  joinThrows?: string;
};

function fakeDeps(o: FakeOpts = {}) {
  const { joinStatus = 'SUBSCRIBED', pingFails = false, pidFails = false } = o;
  const pid = o.pid === undefined ? 1 : o.pid;
  let t = 0;
  let asked = false;
  const askCalls: string[] = [];
  const stats = { pings: 0, ended: 0, closed: 0 };
  type Ch = {
    joined: Promise<string>;
    statuses: { at: number; status: string }[];
    systems: { at: number; payload: unknown }[];
    nonces: Map<string, number>;
  };
  const mk = (status: string, systems: Ch['systems']): Ch => ({
    joined: Promise.resolve(status),
    statuses: [{ at: t, status }],
    systems,
    nonces: new Map<string, number>(),
  });
  let first: Ch | null = null;
  let second: Ch | null = null;
  const deps = {
    appUserId: APP_USER,
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    ask: async (text: string) => {
      asked = true;
      askCalls.push(text);
      return o.askVia ? o.askVia(text) : REF;
    },
    db: {
      probe: async (_appUserId: string, nonce: string) => {
        if (o.sendFails?.(nonce)) throw new Error('send failed');
        if (first && !(o.lose?.(nonce, 'first', asked) ?? false)) first.nonces.set(nonce, t);
        if (second && !(o.lose?.(nonce, 'second', asked) ?? false)) second.nonces.set(nonce, t);
      },
      streamPid: async () => {
        if (pidFails && asked) throw new Error('pid query failed');
        return pid;
      },
      ping: async () => {
        stats.pings += 1;
        if (pingFails) throw new Error('db down');
      },
      end: async () => {
        stats.ended += 1;
      },
    },
    rt: {
      join: () => {
        if (o.joinThrows) throw new Error(o.joinThrows);
        first = mk(joinStatus, [...(o.systems ?? [])]);
        return first;
      },
      joinSecond: () => {
        second = mk('SUBSCRIBED', []);
        return second;
      },
      socket: { opens: [0] as number[], closes: [] as number[] },
      close: () => {
        stats.closed += 1;
      },
    },
  };
  return { deps, askCalls, stats };
}

function makeIo(answer: string | (() => Promise<string>) = REF) {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  return {
    out,
    err,
    prompts,
    io: {
      out: (l: string) => void out.push(l),
      err: (l: string) => void err.push(l),
      ask: async (text: string) => {
        prompts.push(text);
        return typeof answer === 'string' ? answer : answer();
      },
      now: () => 1_000_000, // 1,000 s: expiresAt 2800 leaves exactly TOKEN_MIN_LEFT_S
    },
    lines: () => [...out, ...err].join('\n').split('\n'),
  };
}

describe('EZD-293 realtime failover check (unit)', () => {
  it('T1 inputs: each refusal, the token margin, both URL forms', () => {
    const p = (env: Record<string, string>, nowS = 1000) => parseInputs(env, nowS);
    expect(p(validEnv({ CI: '1' }))).toEqual({ ok: false, code: 'ci_refused' });
    expect(p(validEnv({ CI: '1', SUPABASE_DEV_DB_URL: '' }))).toEqual({
      ok: false,
      code: 'ci_refused',
    });
    expect(p(validEnv({ SUPABASE_DEV_DB_URL: '' }))).toEqual({ ok: false, code: 'db_url_missing' });
    expect(p(validEnv({ EZD_REALTIME_TOKEN: '' }))).toEqual({ ok: false, code: 'token_missing' });
    const bad = (token: string) => p(validEnv({ EZD_REALTIME_TOKEN: token }));
    const invalid = { ok: false, code: 'token_invalid' };
    expect(bad('not json')).toEqual(invalid);
    expect(bad(JSON.stringify(tokenObj({ url: 5 })))).toEqual(invalid);
    expect(bad(JSON.stringify(tokenObj({ apiKey: 5 })))).toEqual(invalid);
    expect(bad(JSON.stringify(tokenObj({ accessToken: null })))).toEqual(invalid);
    expect(bad(JSON.stringify(tokenObj({ expiresAt: '2800' })))).toEqual(invalid);
    expect(
      bad(
        JSON.stringify(
          tokenObj({ appUserId: '0000000a-0000-4000-8000-00000000000a'.toUpperCase() }),
        ),
      ),
    ).toEqual({ ok: false, code: 'token_invalid' });
    expect(bad(JSON.stringify(tokenObj({ appUserId: 'not-a-uuid' })))).toEqual(invalid);
    expect(bad(JSON.stringify(tokenObj({ appUserId: 7 })))).toEqual(invalid);

    expect(bad(JSON.stringify(tokenObj({ expiresAt: 2799 })))).toEqual({
      ok: false,
      code: 'token_expiring',
    });
    const edge = bad(JSON.stringify(tokenObj({ expiresAt: 2800 }))) as Record<string, unknown>;
    expect(edge.ok).toBe(true);

    expect(
      p(validEnv({ SUPABASE_DEV_DB_URL: 'postgresql://user:pw@example.com:5432/postgres' })),
    ).toEqual({ ok: false, code: 'db_url_unrecognized' });
    expect(
      bad(JSON.stringify(tokenObj({ url: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }))),
    ).toEqual({ ok: false, code: 'project_mismatch' });
    expect(bad(JSON.stringify(tokenObj({ url: 'https://example.com' })))).toEqual({
      ok: false,
      code: 'project_mismatch',
    });

    for (const url of [POOLER, DIRECT]) {
      const r = p(validEnv({ SUPABASE_DEV_DB_URL: url })) as Record<string, unknown>;
      expect(r.ok).toBe(true);
      expect(r.projectRef).toBe(REF);
      expect(r.dbUrl === url).toBe(true);
      expect(isDeepStrictEqual(r.token, tokenObj())).toBe(true);
    }
  });

  it('T2 verdicts: classify, first match wins', () => {
    const v = (over: Obs) => classify(obs(over));
    expect(v({ baseline: { attempts: 2, arrived: false } })).toBe('baseline_failed');
    expect(v({ dbBackAt: null })).toBe('db_not_back');
    const base = obs().statuses;
    expect(v({ statuses: [...base, { at: 1500, status: 'CHANNEL_ERROR' }] })).toBe('visible_drop');
    expect(v({ socket: { opens: [0], closes: [1000] } })).toBe('visible_drop');
    expect(v({ systems: [{ at: 1500, payload: { status: 'error' } }] })).toBe('system_only');
    expect(
      v({
        probes: [
          { sentAt: 2000, arrivedAt: 2010, sendFailed: false },
          { sentAt: 32000, arrivedAt: null, sendFailed: false },
        ],
      }),
    ).toBe('silent_stop');
    expect(
      v({
        probes: [
          { sentAt: 2000, arrivedAt: null, sendFailed: false },
          { sentAt: 32000, arrivedAt: 32010, sendFailed: false },
        ],
      }),
    ).toBe('silent_gap');
    expect(v({})).toBe('unaffected');
    expect(
      v({
        statuses: [...base, { at: 1500, status: 'CHANNEL_ERROR' }],
        systems: [{ at: 1500, payload: { status: 'error' } }],
      }),
    ).toBe('visible_drop');
    expect(v({ statuses: [...base, { at: 500, status: 'CHANNEL_ERROR' }] })).toBe('unaffected');
    expect([...VERDICTS]).toEqual([
      'baseline_failed',
      'db_not_back',
      'visible_drop',
      'system_only',
      'silent_stop',
      'silent_gap',
      'send_failed',
      'unaffected',
    ]);
    expect([...SILENT]).toEqual(['system_only', 'silent_stop', 'silent_gap']);
    expect(PROBE_EVENT).toBe('test.probe');
    expect(STREAM_PID_SQL).toBe(HARNESS_STREAM_PID_SQL);
  });

  it('T3 full run: 21 probes, one stop prompt, unaffected, control received', async () => {
    const { deps, askCalls } = fakeDeps();
    const o: Obs = await runCheck(deps);
    expect(o.probes.length).toBe(21);
    expect(askCalls).toEqual([STOP_PROMPT]);
    expect(classify(o)).toBe('unaffected');
    expect(o.control.received).toBe(true);
  });

  it('T4 early returns and tolerated losses', async () => {
    const stopped = async (f: ReturnType<typeof fakeDeps>) => {
      const o: Obs = await runCheck(f.deps);
      expect(f.askCalls.length).toBe(0);
      expect(o.probes.length).toBe(0);
      expect(o.control).toBeNull();
      return o;
    };
    const a = await stopped(fakeDeps({ joinStatus: 'CHANNEL_ERROR' }));
    expect(a.baseline.attempts).toBe(0);
    expect(classify(a)).toBe('baseline_failed');

    const seq1 = order();
    const b = await runCheck(
      fakeDeps({ lose: (n, w, after) => !after && w === 'first' && seq1(n) === 0 }).deps,
    );
    expect(b.baseline.attempts).toBe(2);
    expect(b.baseline.arrived).toBe(true);

    const seq2 = order();
    const c = await stopped(
      fakeDeps({ lose: (n, w, after) => !after && w === 'first' && seq2(n) < 2 }),
    );
    expect(c.baseline.attempts).toBe(2);
    expect(c.baseline.arrived).toBe(false);
    expect(classify(c)).toBe('baseline_failed');

    const d = await runCheck(fakeDeps({ pid: null }).deps);
    expect(d.streamPidBefore).toBeNull();
    expect(d.streamPidAfter).toBeNull();
    expect(d.probes.length).toBe(21);
  });

  it('T5 database not back: 121 pings, no probes', async () => {
    const f = fakeDeps({ pingFails: true });
    const o: Obs = await runCheck(f.deps);
    expect(f.stats.pings).toBe(121);
    expect(classify(o)).toBe('db_not_back');
    expect(o.probes.length).toBe(0);
  });

  it('T6 silent stop: lost after the stop, one failed send, no pid after', async () => {
    const seq = order();
    const f = fakeDeps({
      lose: (_n, w, after) => w === 'first' && after,
      sendFails: (n) => seq(n) === 5,
      pidFails: true,
    });
    const o: Obs = await runCheck(f.deps);
    expect(classify(o)).toBe('silent_stop');
    expect(o.probes.filter((p: Probe) => p.sendFailed).length).toBe(1);
    expect(o.streamPidAfter).toBeNull();
    expect(o.control.received).toBe(true);
    expect(o.control.originalReceived).toBe(false);
  });
});

describe('EZD-293 realtime failover check main (unit)', () => {
  const leaks = (lines: string[]) =>
    [ACCESS, PASSWORD].map((s) => lines.some((l) => l.includes(s)));

  it('T7 secrets never reach a line; RESULT parses; a throw prints failed: <code>', () => {
    expect(mask(`a ${ACCESS} b ${ACCESS}`, [ACCESS, ''])).toBe('a *** b ***');
    expect(mask('plain', [''])).toBe('plain');
    return (async () => {
      const m = makeIo();
      const f = fakeDeps({
        systems: [{ at: 5, payload: { status: 'ok', note: `${ACCESS} ${PASSWORD}` } }],
        askVia: m.io.ask,
      });
      const code = await main([], validEnv(), m.io, () => f.deps);
      expect(code === 0).toBe(true);
      expect(leaks(m.lines())).toEqual([false, false]);
      const line = m.lines().find((l) => l.startsWith('RESULT '));
      expect(line).toBeDefined();
      const json = JSON.parse((line as string).slice('RESULT '.length));
      expect(json.ticket).toBe('EZD-293');
      expect(f.stats.ended).toBe(1);
      expect(f.stats.closed).toBe(1);

      const t = makeIo();
      const g = fakeDeps({ joinThrows: `boom ${ACCESS} ${PASSWORD}`, askVia: t.io.ask });
      const exit = await main([], validEnv(), t.io, () => g.deps);
      expect(exit).toBe(1);
      expect(leaks(t.lines())).toEqual([false, false]);
      expect(t.lines().some((l) => /^failed: \S+/.test(l))).toBe(true);
      expect(g.stats.ended).toBe(1);
      expect(g.stats.closed).toBe(1);
    })();
  });

  it('T8 refusals: a code, exit 1, makeDeps never called', async () => {
    const refuse = async (
      argv: string[],
      env: Record<string, string>,
      answer: string | (() => Promise<string>),
      code: string,
    ) => {
      const m = makeIo(answer);
      let made = 0;
      const exit = await main(argv, env, m.io, () => {
        made += 1;
        return fakeDeps().deps;
      });
      expect(exit).toBe(1);
      expect(made).toBe(0);
      expect(m.lines()).toContain(`failed: ${code}`);
    };
    await refuse([], validEnv({ CI: '1' }), REF, 'ci_refused');
    await refuse([], validEnv(), 'zzz', 'ref_not_confirmed');
    await refuse([], validEnv(), '', 'ref_not_confirmed');
    await refuse([], validEnv(), REF.toUpperCase(), 'ref_not_confirmed');
    await refuse([], validEnv(), () => Promise.reject(new Error('closed')), 'ref_not_confirmed');
    await refuse(['--now'], validEnv(), REF, 'unknown_argument');

    const m = makeIo(REF);
    await main([], validEnv({ CI: '1' }), m.io, () => fakeDeps().deps);
    expect(m.prompts.length).toBe(0);
  });

  it('T9 exit code: a silent verdict exits 0, baseline_failed exits 1', async () => {
    const m = makeIo();
    const f = fakeDeps({ lose: (_n, w, after) => w === 'first' && after, askVia: m.io.ask });
    expect(
      await main(
        [],
        validEnv(),
        m.io,
        (a: { ask: (t: string) => Promise<string> }) =>
          fakeDeps({ lose: (_n, w, after) => w === 'first' && after, askVia: a.ask }).deps,
      ),
    ).toBe(0);
    expect(m.lines()).toContain('Result: silent_stop');
    expect(m.lines()).toContain(`Project: ${REF}`);
    expect(m.prompts).toEqual([REF_PROMPT, STOP_PROMPT]);
    void f;

    const n = makeIo();
    const seq = order();
    const exit = await main(
      [],
      validEnv(),
      n.io,
      (a: { ask: (t: string) => Promise<string> }) =>
        fakeDeps({ lose: (x, w, after) => !after && w === 'first' && seq(x) < 2, askVia: a.ask })
          .deps,
    );
    expect(exit).toBe(1);
    expect(n.lines()).toContain('Result: baseline_failed');
  });
});

// EZD-352 (D-037; vault/plans/EZD-352.md sections 3-4): a probe whose database send failed is its own verdict.
// Fakes only, as above. Probe shorthand: S a→b = a sent probe; F a→b = a probe whose send failed.
describe('EZD-352 failover check: a failed send is its own verdict (unit)', () => {
  const S = (sentAt: number, arrivedAt: number | null): Probe => ({
    sentAt,
    arrivedAt,
    sendFailed: false,
  });
  const F = (sentAt: number, arrivedAt: number | null): Probe => ({
    sentAt,
    arrivedAt,
    sendFailed: true,
  });
  const silentList: readonly string[] = SILENT;
  const verdictList: readonly string[] = VERDICTS;

  it('EZD-352 N1 classify: a failed send is never silent_stop or silent_gap', () => {
    const v = (probes: Probe[]) => classify(obs({ probes }));
    expect(v([S(2000, 2010), F(32000, null)])).toBe('send_failed'); // (a) old: silent_stop
    expect(v([F(2000, null), S(32000, 32010)])).toBe('send_failed'); // (b) old: silent_gap
    expect(v([F(2000, null), F(32000, null)])).toBe('send_failed'); // (c) old: silent_stop
    expect(v([S(2000, 2010), F(32000, 32010)])).toBe('send_failed'); // (d) old: unaffected
    expect(v([S(2000, null), S(32000, 32010), F(62000, null)])).toBe('silent_gap'); // (e) old: silent_stop
    expect(v([S(2000, 2010), S(32000, null), F(62000, null)])).toBe('silent_stop'); // (f) old: silent_stop
    expect(v([S(2000, null), F(32000, null), S(62000, 62010)])).toBe('silent_gap'); // (g) old: silent_gap
  });

  it('EZD-352 N2 classify: earlier verdicts still win over send_failed', () => {
    const failed = [F(2000, null)];
    expect(
      classify(
        obs({
          probes: failed,
          statuses: [
            { at: 0, status: 'SUBSCRIBED' },
            { at: 1500, status: 'CHANNEL_ERROR' },
          ],
        }),
      ),
    ).toBe('visible_drop');
    expect(
      classify(obs({ probes: failed, systems: [{ at: 1500, payload: { status: 'error' } }] })),
    ).toBe('system_only');
    expect(classify(obs({ probes: failed, dbBackAt: null }))).toBe('db_not_back');
    expect(silentList.includes('send_failed')).toBe(false);
    expect(verdictList.indexOf('send_failed')).toBe(6);
  });

  it('EZD-352 N3 run: one failed window send and nothing lost gives send_failed', async () => {
    const seq = order();
    const run1: Obs = await runCheck(fakeDeps({ sendFails: (n) => seq(n) === 21 }).deps);
    expect(run1.probes.length).toBe(21);
    expect(run1.probes[20].sendFailed).toBe(true);
    expect(run1.probes.filter((p: Probe) => p.sendFailed).length).toBe(1);
    expect(classify(run1)).toBe('send_failed'); // old: silent_stop
    expect(run1.control.received).toBe(true);

    const seq2 = order();
    const run2: Obs = await runCheck(fakeDeps({ sendFails: (n) => seq2(n) === 5 }).deps);
    expect(run2.probes[4].sendFailed).toBe(true);
    expect(classify(run2)).toBe('send_failed'); // old: silent_gap
    expect(run2.control.received).toBe(true);
  });

  it('EZD-352 N4 main: prints send_failed, not silent, exit 1', async () => {
    const m = makeIo();
    const seq = order();
    const exit = await main(
      [],
      validEnv(),
      m.io,
      (a: { ask: (t: string) => Promise<string> }) =>
        fakeDeps({ sendFails: (n) => seq(n) === 5, askVia: a.ask }).deps,
    );
    expect(exit).toBe(1); // Q-0608
    expect(m.lines()).toContain('Result: send_failed');
    expect(m.lines()).not.toContain('Result: silent_gap');
    const line = m.lines().find((l) => l.startsWith('RESULT '));
    expect(line).toBeDefined();
    const json = JSON.parse((line as string).slice('RESULT '.length));
    expect(json.verdict).toBe('send_failed');
    expect(json.silent).toBe(false);
    expect(json.probes.filter((p: Probe) => p.sendFailed).length).toBe(1);
  });
});
