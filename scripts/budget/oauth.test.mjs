// Tests for EZD-000i (OAuth usage fallback, Item 1b). Network, Keychain and the clock are stubs (CLAUDE.md rule 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USAGE_URL, KEYCHAIN_SERVICE, STATE_FILE, UTILIZATION_MAX, retryWaitMs, readToken, parseUsage, createOAuthFallback, probe,
} from '../oauth-usage.mjs';
import { readMeters } from '../budget.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN = 'ezd000i-fixture-token-7f3a9c41';
const NOW = new Date('2026-10-19T12:00:00Z');
const at = (ms) => new Date(NOW.getTime() + ms);
const OK_BODY = JSON.stringify({
  five_hour: { utilization: 42 * UTILIZATION_MAX / 100, resets_at: '2030-01-07T07:00:00+00:00' },
  seven_day: { utilization: 63 * UTILIZATION_MAX / 100, resets_at: '2030-01-10T06:00:00+00:00' },
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
});
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ezd000i-')));
const okTok = () => ({ token: TOKEN, source: 'file' });

// Stub fetch: answers from a queue (Response, or an Error to reject with) and records each call.
function stubFetch(queue) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  f.calls = calls;
  return f;
}
const res = (status, body = '', headers = {}) => new Response(body, { status, headers });
function counted(fn) { const g = (...a) => { g.n++; return fn(...a); }; g.n = 0; return g; }
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const statePath = (root) => path.join(root, STATE_FILE);

test('EZD-000i T1 AC-1: no second request within 15 minutes, also across a restart', async () => {
  const root = tmp();
  const f = stubFetch([res(200, OK_BODY), res(200, OK_BODY)]);
  const rt = counted(okTok);
  const A = createOAuthFallback({ fetch: f, readToken: rt });
  const r1 = await A({ root, now: at(0) });
  assert.equal(f.calls.length, 1);
  assert.equal(r1.source, 'oauth');
  assert.equal(f.calls[0].url, USAGE_URL);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
  const n = rt.n;
  assert.equal(await A({ root, now: at(899_999) }), null);
  assert.equal(f.calls.length, 1);
  const B = createOAuthFallback({ fetch: f, readToken: rt });
  assert.equal(await B({ root, now: at(600_000) }), null);
  assert.equal(f.calls.length, 1);
  assert.equal(rt.n, n, 'no token read while waiting');
  const r4 = await B({ root, now: at(900_000) });
  assert.equal(f.calls.length, 2);
  assert.equal(r4.source, 'oauth');
});

test('EZD-000i T2 AC-2: retryWaitMs is max(Retry-After, 120) + 30 seconds', () => {
  assert.equal(retryWaitMs('60', NOW), 150000);
  assert.equal(retryWaitMs('300', NOW), 330000);
  assert.equal(retryWaitMs('120', NOW), 150000);
  assert.equal(retryWaitMs(null, NOW), 150000);
  assert.equal(retryWaitMs('abc', NOW), 150000);
  assert.equal(retryWaitMs(new Date(NOW.getTime() + 200_000).toUTCString(), NOW), 230000);
});

test('EZD-000i T3 AC-2: after a 429 the retry waits 150 s (Retry-After 60) or 330 s (Retry-After 300)', async () => {
  for (const [ra, wait] of [['60', 150_000], ['300', 330_000]]) {
    const root = tmp();
    const f = stubFetch([res(429, '', { 'Retry-After': ra }), res(200, OK_BODY)]);
    const notify = counted(() => {});
    const fb = createOAuthFallback({ fetch: f, readToken: okTok, notify });
    assert.equal(await fb({ root, now: at(0) }), null);
    assert.equal(f.calls.length, 1);
    assert.equal(await fb({ root, now: at(wait - 1) }), null);
    assert.equal(f.calls.length, 1);
    await fb({ root, now: at(wait) });
    assert.equal(f.calls.length, 2, `Retry-After ${ra}`);
    assert.equal(notify.n, 0);
  }
});

test('EZD-000i T4 AC-3: after 401 or 403 no poll for one hour and notify is called once', async () => {
  for (const status of [401, 403]) {
    const root = tmp();
    const f = stubFetch([res(status), res(200, OK_BODY)]);
    const msgs = [];
    const fb = createOAuthFallback({ fetch: f, readToken: okTok, notify: (m) => msgs.push(String(m)) });
    assert.equal(await fb({ root, now: at(0) }), null);
    assert.equal(msgs.length, 1);
    assert.ok(msgs[0].includes(String(status)));
    assert.ok(!msgs[0].includes(TOKEN));
    assert.equal(await fb({ root, now: at(1_800_000) }), null);
    assert.equal(await fb({ root, now: at(3_599_999) }), null);
    assert.equal(f.calls.length, 1);
    const last = await fb({ root, now: at(3_600_000) });
    assert.equal(f.calls.length, 2);
    assert.equal(last.source, 'oauth');
    assert.equal(msgs.length, 1);
  }
});

test('EZD-000i T5 AC-4 done when: after polls with a fixture token no file under the output directories contains it', async () => {
  const base = tmp();
  const home = path.join(base, 'home');
  const root = path.join(base, 'root');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: TOKEN } }));
  for (const d of ['vault', 'scripts', '.run']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const f = stubFetch([res(200, OK_BODY), res(429), res(401), res(500), new TypeError('fetch failed'), res(200, 'not json')]);
  const strings = [];
  const fb = createOAuthFallback({
    fetch: f,
    readToken: () => readToken({ home, platform: 'linux' }),
    log: (m) => strings.push(String(m)),
    notify: (m) => strings.push(String(m)),
  });
  const times = [0, 900_000, 1_050_000, 4_650_000, 5_550_000, 6_450_000];
  for (const t of times) await fb({ root, now: at(t) });
  assert.equal(f.calls.length, 6);
  for (const c of f.calls) assert.equal(c.init.headers.Authorization, 'Bearer ' + TOKEN);
  const lines = await probe({
    root, platform: 'linux', fetch: stubFetch([res(200, OK_BODY)]), readToken: okTok,
  });
  for (const file of walk(root)) assert.ok(!fs.readFileSync(file, 'utf8').includes(TOKEN), file);
  for (const s of [...strings, ...lines]) assert.ok(!s.includes(TOKEN), s);
  assert.ok(lines.includes('token found in files under vault/, scripts/, .run/: none'));
  assert.ok(fs.existsSync(path.join(root, 'vault/cost/usage.json')));
  assert.ok(fs.existsSync(statePath(root)));
});

test('EZD-000i T6: readToken reads the file, then the Keychain on macOS only, and never returns error text', () => {
  const mk = (file) => {
    const home = tmp();
    if (file !== undefined) {
      fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude/.credentials.json'), file);
    }
    return home;
  };
  const good = JSON.stringify({ claudeAiOauth: { accessToken: TOKEN } });
  const exec = (r) => { const e = counted(() => r); return e; };
  let e = exec({ status: 0, stdout: '' });
  assert.deepEqual(readToken({ home: mk(good), platform: 'linux', exec: e }), { token: TOKEN, source: 'file' });
  assert.equal(e.n, 0);
  e = exec({ status: 0, stdout: '{"claudeAiOauth":{"accessToken":"K"}}\n' });
  const calls = [];
  const e2 = (...a) => { calls.push(a); return e(...a); };
  assert.deepEqual(readToken({ home: mk(), platform: 'darwin', exec: e2 }), { token: 'K', source: 'keychain' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'security');
  assert.deepEqual(calls[0][1], ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']);
  assert.equal(calls[0][2].timeout, 10000);
  assert.deepEqual(readToken({ home: mk(), platform: 'darwin', exec: exec({ status: 44, stdout: '' }) }), { token: null, source: null });
  assert.deepEqual(readToken({ home: mk(), platform: 'darwin', exec: exec({ status: 0, stdout: 'raw-not-json\n' }) }), { token: null, source: null });
  e = exec({ status: 0, stdout: '' });
  assert.deepEqual(readToken({ home: mk(), platform: 'linux', exec: e }), { token: null, source: null });
  assert.equal(e.n, 0);
  const r = readToken({ home: mk('{"claudeAiOauth":{"accessToken":"' + TOKEN + '"'), platform: 'linux', exec: exec({ status: 1, stdout: '' }) });
  assert.deepEqual(r, { token: null, source: null });
  assert.ok(!JSON.stringify(r).includes(TOKEN));
});

test('EZD-000i T7: a poll writes usage.json in the C2 shape with source oauth and readMeters returns it', async () => {
  const expected = {
    five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' },
    seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' },
    fable_seven_day: null,
    read_at: '2026-10-19T12:00:00.000Z',
    source: 'oauth',
  };
  const rootA = tmp();
  await createOAuthFallback({ fetch: stubFetch([res(200, OK_BODY)]), readToken: okTok })({ root: rootA, now: NOW });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rootA, 'vault/cost/usage.json'), 'utf8')), expected);

  const root = tmp();
  fs.mkdirSync(path.join(root, 'vault/cost'), { recursive: true });
  const stale = { ...expected, source: 'statusline', read_at: new Date(NOW.getTime() - 21 * 60000).toISOString() };
  fs.writeFileSync(path.join(root, 'vault/cost/usage.json'), JSON.stringify(stale));
  const fallback = createOAuthFallback({ fetch: stubFetch([res(200, OK_BODY)]), readToken: okTok });
  const m = await readMeters({ root, now: NOW, budget: {}, spend: { main: 0, fable: 0, pct: null, start: NOW }, fallback });
  assert.equal(m.source, 'oauth');
  assert.equal(m.seven_day.pct, 63);
  assert.equal(m.warning, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'vault/cost/usage.json'), 'utf8')), expected);
});

test('EZD-000i T8: failures return null, never reject, and wait 15 minutes', async () => {
  const cases = [
    stubFetch([res(500)]),
    stubFetch([new TypeError('fetch failed')]),
    stubFetch([res(200, 'not json')]),
    stubFetch([res(200, '{"five_hour":{"utilization":"x","resets_at":1}}')]),
  ];
  for (const f of cases) {
    const root = tmp();
    const r = await createOAuthFallback({ fetch: f, readToken: okTok })({ root, now: NOW });
    assert.equal(r, null);
    assert.equal(JSON.parse(fs.readFileSync(statePath(root), 'utf8')).next_allowed_at, at(900_000).toISOString());
  }
  const f5 = stubFetch([res(200, OK_BODY)]);
  const r5 = await createOAuthFallback({ fetch: f5, readToken: () => { throw new Error('boom'); } })({ root: tmp(), now: NOW });
  assert.equal(r5, null);
  assert.equal(f5.calls.length, 0);
  const root = tmp();
  fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
  fs.writeFileSync(statePath(root), 'not json');
  const f6 = stubFetch([res(200, OK_BODY)]);
  const r6 = await createOAuthFallback({ fetch: f6, readToken: okTok })({ root, now: NOW });
  assert.equal(f6.calls.length, 1);
  assert.equal(r6.source, 'oauth');
});

test('EZD-000i T9: with no token there is no request and the no-token line is logged once', async () => {
  const root = tmp();
  const f = stubFetch([]);
  const logs = [];
  const notify = counted(() => {});
  const fb = createOAuthFallback({ fetch: f, readToken: () => ({ token: null, source: null }), log: (m) => logs.push(String(m)), notify });
  assert.equal(await fb({ root, now: at(0) }), null);
  assert.equal(await fb({ root, now: at(900_000) }), null);
  assert.equal(f.calls.length, 0);
  const line = 'OAuth usage fallback off: no sign-in token in ~/.claude/.credentials.json or the Keychain; gating stays on the next source';
  assert.equal(logs.filter((l) => l.includes(line)).length, 1);
  assert.equal(notify.n, 0);
});

test('EZD-000i T10: probe lists names only, writes no file, and .gitignore holds the state file', async () => {
  const root = tmp();
  const body = '{"five_hour":{"used_percentage":1,"resets_at":2},"seven_day":{},"seven_day_opus":{"used_percentage":3},"email":"x@y"}';
  const f = stubFetch([res(200, body)]);
  const lines = await probe({ root, platform: 'linux', fetch: f, readToken: okTok });
  assert.deepEqual(lines, [
    'credential source: file',
    'HTTP status: 200',
    'response keys: five_hour, seven_day, seven_day_opus, email',
    'window keys: five_hour{used_percentage, resets_at}; seven_day{}; seven_day_opus{used_percentage}',
    'model-scoped weekly window: seven_day_opus',
    'utilization: five_hour none, seven_day none',
    'token found in files under vault/, scripts/, .run/: none',
  ]);
  for (const l of lines) for (const bad of ['x@y', ': 1', TOKEN]) assert.ok(!l.includes(bad), l);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(walk(root), []);
  const gi = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(gi.includes('vault/cost/oauth-poll.json'));
});

const win = (u, r = '2030-01-07T07:00:00+00:00') => ({ utilization: u, resets_at: r });
const bodyOf = (a, b) => ({ five_hour: a, seven_day: b });

test('EZD-000j T1 AC-1 done when: a fixture usage reply gives the expected five-hour and seven-day percentages', () => {
  assert.deepEqual(parseUsage(JSON.parse(OK_BODY)), {
    five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' },
    seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' },
    fable_seven_day: null,
  });
});

test('EZD-000j T2 AC-1: utilization converts to a percent on either scale, rounded to two decimals', () => {
  assert.ok([1, 100].includes(UTILIZATION_MAX));
  const b = parseUsage(bodyOf(win(0.29), win(0.9)), 1);
  assert.equal(b.five_hour.pct, 29);
  assert.equal(b.seven_day.pct, 90);
  const c = parseUsage(bodyOf(win(33), win(89.99)), 100);
  assert.equal(c.five_hour.pct, 33);
  assert.equal(c.seven_day.pct, 89.99);
  const d = parseUsage(bodyOf(win(0.5, 1893999600), win(0)), 100);
  assert.equal(d.five_hour.pct, 0.5);
  assert.equal(d.seven_day.pct, 0);
  assert.equal(d.five_hour.resets_at, '2030-01-07T07:00:00.000Z');
});

test('EZD-000j T3 AC-1: a reply without readable utilization or resets_at gives null', () => {
  const ok = () => JSON.parse(OK_BODY);
  const cases = [
    { five_hour: { used_percentage: 42, resets_at: 1893999600 }, seven_day: { used_percentage: 63, resets_at: 1894255200 } },
    (() => { const x = ok(); delete x.seven_day.utilization; return x; })(),
    (() => { const x = ok(); x.five_hour.utilization = 'x'; return x; })(),
    (() => { const x = ok(); x.seven_day.resets_at = null; return x; })(),
    (() => { const x = ok(); x.five_hour = null; return x; })(),
    null,
  ];
  for (const c of cases) assert.equal(parseUsage(c), null);
});

test('EZD-000j T4 AC-2: probe prints the two window values and nothing else numeric', async () => {
  const root = tmp();
  const body = '{"five_hour":{"utilization":33,"resets_at":"2030-01-07T07:00:00+00:00"},"seven_day":{"utilization":13,"resets_at":"2030-01-10T06:00:00+00:00"},"extra_usage":{"utilization":5,"monthly_limit":999},"email":"x@y"}';
  const f = stubFetch([res(200, body)]);
  const lines = await probe({ root, platform: 'linux', fetch: f, readToken: okTok });
  assert.equal(lines[lines.length - 2], 'utilization: five_hour 33, seven_day 13');
  assert.equal(lines[lines.length - 1], 'token found in files under vault/, scripts/, .run/: none');
  for (const l of lines) for (const bad of ['999', 'x@y', ': 5', TOKEN]) assert.ok(!l.includes(bad), l);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(walk(root), []);
});
