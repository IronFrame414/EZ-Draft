// EZD-000h T9, T10: budget.mjs --hold-at / --raise and next_ticket.mjs --report, on a temporary copy of vault/ (vault/plans/EZD-000h.md C10, C11).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let tmp;
const f = (rel) => path.join(tmp, rel);
const budgetCli = (...args) => spawnSync(process.execPath, [f('scripts/budget.mjs'), ...args], { encoding: 'utf8' });

before(() => {
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-budgetcli-')));
  cpSync(path.join(repo, 'vault'), f('vault'), { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(f('scripts'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/budget.mjs'), f('scripts/budget.mjs'));
  for (const x of ['vault/cost/usage.json', 'vault/handoff/BUDGET_HOLD.md']) if (existsSync(f(x))) spawnSync('rm', [f(x)]);
});

test('EZD-000h T9: --hold-at sets and logs the hold and releases it; a bad value or --raise changes nothing', async () => {
  const bj = f('vault/budget.json');
  writeFileSync(f('vault/handoff/BUDGET_HOLD.md'), '# Budget hold\n');
  const original = readFileSync(bj, 'utf8');
  // The expected `from` comes from the copy (EZD-281 D1), never from a literal: the copied budget.json, else the script's default.
  const { GATE_DEFAULTS } = await import(pathToFileURL(f('scripts/budget.mjs')).href);
  const from = JSON.parse(original).hold_at_pct ?? GATE_DEFAULTS.hold_at_pct;
  const to = from === 85 ? 86 : 85;
  const a = budgetCli('--hold-at', String(to));
  assert.equal(a.status, 0);
  const b = JSON.parse(readFileSync(bj, 'utf8'));
  assert.equal(b.hold_at_pct, to);
  assert.deepEqual(b.history.at(-1), { date: new Date().toISOString().slice(0, 10), hold_at: { from, to } });
  assert.equal(existsSync(f('vault/handoff/BUDGET_HOLD.md')), false);
  const after = readFileSync(bj, 'utf8');
  const bad = budgetCli('--hold-at', '0');
  assert.equal(bad.status, 1);
  assert.equal(readFileSync(bj, 'utf8'), after);
  const raise = budgetCli('--raise', '400');
  assert.equal(raise.status, 1);
  assert.ok(raise.stderr.includes('--hold-at'));
  assert.equal(readFileSync(bj, 'utf8'), after);
  assert.notEqual(after, original);
});

test('EZD-000h T10: --report shows the three meters when usage.json is fresh, the dollar spend otherwise', () => {
  const usage = (read_at) => writeFileSync(f('vault/cost/usage.json'), JSON.stringify({
    five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' },
    seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' },
    fable_seven_day: null, read_at, source: 'statusline',
  }));
  const report = () => {
    const r = spawnSync(process.execPath, [f('vault/tools/next_ticket.mjs'), '--report'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return readFileSync(f('vault/PROGRESS.md'), 'utf8');
  };
  usage(new Date().toISOString());
  const fresh = report();
  assert.ok(fresh.includes('## Usage'));
  assert.ok(fresh.includes('| Five-hour | 42% | 2030-01-07 07:00 UTC |'));
  assert.ok(fresh.includes('| Weekly | 63% | 2030-01-10 06:00 UTC |'));
  assert.ok(fresh.includes('| Fable weekly | no meter | — |'));
  assert.ok(!fresh.includes("## This week's estimated spend"));
  usage(new Date(Date.now() - 21 * 60000).toISOString());
  const stale = report();
  assert.ok(stale.includes("## This week's estimated spend"));
  assert.ok(!stale.includes('## Usage'));
});
