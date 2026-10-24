/* global Response */
// EZD-034 N1-N7 (vault/plans/EZD-034.md Tests; Steps 10-13; section 6 lines R1-R6; Q-0153; Q-0243 (c)):
// the hand-check script scripts/auth/captcha-check.mjs (stubbed fetch and io, no network) and the repo files
// that must name the captcha settings.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CHECK_EMAIL_DOMAIN,
  buildCheckRequest,
  main,
  readAuthErrorCode,
} from '../captcha-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const R1 =
  'captcha-check.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Captcha, step 5).';
const R2 =
  'Usage: node scripts/auth/captcha-check.mjs (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY first)';
const R3 =
  'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set in this terminal (docs/runbook.md, Captcha, step 5).';
const R5 =
  'PASS: Supabase Auth refused a sign-in code request without a captcha token (HTTP 400 captcha_failed).';
const R6 = (status, code) =>
  `FAIL: expected HTTP 400 captcha_failed, got HTTP ${status} ${code}. Captcha protection is not on for this project.`;

const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://p.example', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' };

function harness(answer) {
  const calls = [];
  const logs = [];
  const errors = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return { calls, logs, errors, fetchImpl, io: { log: (l) => logs.push(String(l)), error: (l) => errors.push(String(l)) } };
}
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('EZD-034 captcha-check script', () => {
  test('EZD-034 N1 refuses to run under CI and calls nothing', async () => {
    const h = harness(() => json(200, {}));
    const code = await main([], { ...ENV, CI: 'true' }, h.fetchImpl, h.io);
    assert.equal(code, 1);
    assert.equal(h.calls.length, 0);
    assert.ok(h.errors.includes(R1), h.errors.join('\n'));
  });

  test('EZD-034 N2 refuses an argument and missing env, calls nothing', async () => {
    const h = harness(() => json(200, {}));
    assert.equal(await main(['--x'], ENV, h.fetchImpl, h.io), 1);
    assert.ok(h.errors.includes(R2), h.errors.join('\n'));
    const h2 = harness(() => json(200, {}));
    assert.equal(
      await main([], { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' }, h2.fetchImpl, h2.io),
      1,
    );
    assert.ok(h2.errors.includes(R3), h2.errors.join('\n'));
    const h3 = harness(() => json(200, {}));
    assert.equal(
      await main([], { NEXT_PUBLIC_SUPABASE_URL: 'https://p.example' }, h3.fetchImpl, h3.io),
      1,
    );
    assert.ok(h3.errors.includes(R3), h3.errors.join('\n'));
    assert.equal(h.calls.length + h2.calls.length + h3.calls.length, 0);
  });

  test('EZD-034 N3 builds the code request with no captcha token', () => {
    assert.equal(CHECK_EMAIL_DOMAIN, 'example.invalid');
    const req = buildCheckRequest({ url: 'https://p.example/', key: 'k', email: 'a@example.invalid' });
    assert.equal(req.url, 'https://p.example/auth/v1/otp');
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.headers, { apikey: 'k', 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(req.body), { email: 'a@example.invalid', create_user: true });
  });

  test('EZD-034 N4 a captcha_failed refusal passes', async () => {
    assert.equal(readAuthErrorCode({ error_code: 'a', code: 'b' }), 'a');
    assert.equal(readAuthErrorCode({ code: 'b' }), 'b');
    assert.equal(readAuthErrorCode({ code: 400 }), null);
    assert.equal(readAuthErrorCode({}), null);
    for (const body of [{ code: 400, error_code: 'captcha_failed' }, { code: 'captcha_failed' }]) {
      const h = harness(() => json(400, body));
      assert.equal(await main([], ENV, h.fetchImpl, h.io), 0);
      assert.ok(h.logs.includes(R5), h.logs.join('\n'));
      assert.equal(h.calls.length, 1);
      const sent = JSON.parse(h.calls[0].init.body);
      assert.ok(sent.email.endsWith('@example.invalid'), sent.email);
    }
  });

  test('EZD-034 N5 anything else fails with its status and code', async () => {
    const cases = [
      [403, { error_code: 'email_address_not_authorized' }, '403', 'email_address_not_authorized'],
      [400, { error_code: 'validation_failed' }, '400', 'validation_failed'],
      [200, {}, '200', 'none'],
    ];
    for (const [status, body, s, c] of cases) {
      const h = harness(() => json(status, body));
      assert.equal(await main([], ENV, h.fetchImpl, h.io), 1);
      assert.ok(h.errors.includes(R6(s, c)), h.errors.join('\n'));
    }
    const h = harness(() => {
      const e = new Error('boom');
      e.name = 'TypeError';
      throw e;
    });
    assert.equal(await main([], ENV, h.fetchImpl, h.io), 1);
    assert.ok(h.errors.includes('Could not reach Supabase Auth: TypeError.'), h.errors.join('\n'));
  });

  test('EZD-034 N6 env example, architecture and runbook name the captcha settings', () => {
    assert.match(read('.env.example'), /^TURNSTILE_SITE_KEY=$/m);
    const arch = read('docs/architecture.md');
    assert.match(arch, /^\| `TURNSTILE_SITE_KEY` \|/m);
    assert.match(arch, /^### Captcha \(EZD-034\)$/m);
    const run = read('docs/runbook.md');
    const start = run.indexOf('\n## Captcha (EZD-034)');
    assert.ok(start >= 0, 'runbook heading missing');
    const rest = run.slice(start + 1);
    const next = rest.slice(1).search(/\n## /);
    const section = next < 0 ? rest : rest.slice(0, next + 1);
    const key = section.indexOf('TURNSTILE_SITE_KEY');
    const bot = section.indexOf('Bot and Abuse Protection');
    assert.ok(key >= 0 && bot >= 0 && key < bot, 'TURNSTILE_SITE_KEY must come before Bot and Abuse Protection');
    assert.ok(section.includes('scripts/auth/captcha-check.mjs'));
    const pkg = JSON.parse(read('package.json'));
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      assert.ok(!name.includes('captcha-check') && !String(cmd).includes('captcha-check'), name);
    }
  });

  test('EZD-034 N7 Auth captcha stays off and Cloudflare is named only in captcha-config.ts', () => {
    assert.doesNotMatch(read('supabase/config.toml'), /^\s*\[auth\.captcha\]/m);
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== 'node_modules') walk(full);
        } else if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) {
          if (readFileSync(full, 'utf8').includes('challenges.cloudflare.com')) {
            hits.push(path.relative(root, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(path.join(root, 'app', 'src'));
    assert.deepEqual(hits, ['app/src/server/auth/captcha-config.ts']);
  });
});
