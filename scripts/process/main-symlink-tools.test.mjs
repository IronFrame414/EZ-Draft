// EZD-178 T1-T8: the six tools print their output when run through a symlinked folder (vault/plans/EZD-178.md section 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const NEXT_TICKET_STUB = `export const weekStart = () => new Date('2030-01-06T00:00:00.000Z');
export const weekSpend = () => ({ start: new Date('2030-01-06T00:00:00.000Z'), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub week spend' });
`;

const SIX_TOOLS = [
  'scripts/budget.mjs',
  'scripts/oauth-usage.mjs',
  'scripts/watchdog.mjs',
  'vault/tools/plan_lint.mjs',
  'vault/tools/usage-by-agent.mjs',
  'vault/tools/outline.mjs',
];

// A temp root holding a copy of one repo file at its own relative path, the given fixture files,
// and a folder symlink (`link`) to the copy's folder. `files` may be a function of the root.
function linkedCopy(t, rel, files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd178-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (p, text) => {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  put(path.join(root, rel), readFileSync(path.join(repo, rel), 'utf8'));
  const entries = typeof files === 'function' ? files(root) : files;
  for (const [f, text] of Object.entries(entries)) put(path.join(root, f), text);
  symlinkSync(path.join(root, path.dirname(rel)), path.join(root, 'link'), 'dir');
  return { root, direct: path.join(root, rel), viaLink: path.join(root, 'link', path.basename(rel)) };
}

function runBoth(c, args, env = process.env) {
  const run = (p) => spawnSync(process.execPath, [p, ...args], { encoding: 'utf8', env, timeout: 20000 });
  return { direct: run(c.direct), link: run(c.viaLink) };
}

test('EZD-178 T1 budget.mjs prints its report through a symlink', (t) => {
  const readAt = new Date().toISOString();
  const usage = JSON.stringify({
    five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' },
    seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' },
    fable_seven_day: null,
    read_at: readAt,
    source: 'statusline',
  });
  const c = linkedCopy(t, 'scripts/budget.mjs', {
    'vault/tools/next_ticket.mjs': NEXT_TICKET_STUB,
    'vault/budget.json': JSON.stringify({ meter_source: 'statusline' }),
    'vault/cost/usage.json': usage,
    'vault/handoff/.keep': '',
  });
  const { direct, link } = runBoth(c, []);
  assert.equal(direct.status, 0, direct.stderr);
  assert.ok(direct.stdout.includes('five-hour 42% (resets 2030-01-07 07:00 UTC) · weekly 63% (resets 2030-01-10 06:00 UTC) · Fable no meter'), direct.stdout);
  assert.ok(direct.stdout.includes('stub week spend'), direct.stdout);
  assert.ok(direct.stdout.includes('Override: none · Hold: none'), direct.stdout);
  assert.equal(link.status, 0, link.stderr);
  assert.equal(link.stdout, direct.stdout);
});

test('EZD-178 T2 oauth-usage.mjs --probe prints through a symlink', (t) => {
  const c = linkedCopy(t, 'scripts/oauth-usage.mjs', { 'home/.keep': '', 'no-bin/.keep': '' });
  const env = { ...process.env, HOME: path.join(c.root, 'home'), PATH: path.join(c.root, 'no-bin') };
  const { direct, link } = runBoth(c, ['--probe'], env);
  assert.equal(direct.status, 0, direct.stderr);
  assert.ok(direct.stdout.includes('credential source: none\n'), direct.stdout);
  assert.ok(direct.stdout.includes('HTTP status: not requested (no token)\n'), direct.stdout);
  assert.ok(direct.stdout.includes('token expiry: no credentials\n'), direct.stdout);
  assert.equal(link.status, 0, link.stderr);
  assert.equal(link.stdout, direct.stdout);
});

test('EZD-178 T3 watchdog.mjs --check prints through a symlink', (t) => {
  const c = linkedCopy(t, 'scripts/watchdog.mjs', (root) => ({
    'scripts/launcher.config.json': JSON.stringify({ log_dir: path.join(root, 'logs') }),
    'vault/handoff/STOP': '',
    'home/.keep': '',
    'no-bin/.keep': '',
  }));
  const env = { ...process.env, HOME: path.join(c.root, 'home'), PATH: path.join(c.root, 'no-bin') };
  const { direct, link } = runBoth(c, ['--check'], env);
  const line = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z paused \(STOP\) · launcher down · unit none · idle \? min\n$/;
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, line);
  assert.equal(link.status, 0, link.stderr);
  assert.match(link.stdout, line);
  // The first word is the run's clock time, so only the text after it is compared.
  assert.equal(link.stdout.replace(/^\S+ /, ''), direct.stdout.replace(/^\S+ /, ''));
});

test('EZD-178 T4 plan_lint.mjs prints its result through a symlink', (t) => {
  const c = linkedCopy(t, 'vault/tools/plan_lint.mjs', {
    'plan.md': '# EZD-999 · fixture\n',
    'vault/tools/outline.mjs': readFileSync(path.join(repo, 'vault/tools/outline.mjs'), 'utf8'),
  });
  const plan = path.join(c.root, 'plan.md');
  const { direct, link } = runBoth(c, [plan]);
  assert.equal(direct.status, 1, direct.stderr);
  assert.ok(direct.stdout.startsWith(`PLAN LINT FAIL ${plan} (`), direct.stdout);
  assert.ok(direct.stdout.includes('- section 1 missing\n'), direct.stdout);
  assert.equal(link.status, 1, link.stderr);
  assert.equal(link.stdout, direct.stdout);
});

test('EZD-178 T5 usage-by-agent.mjs prints its tables through a symlink', (t) => {
  const c = linkedCopy(t, 'vault/tools/usage-by-agent.mjs', { 'log.jsonl': '', 'projects/.keep': '' });
  const args = ['--log', path.join(c.root, 'log.jsonl'), '--projects', path.join(c.root, 'projects')];
  const { direct, link } = runBoth(c, args);
  assert.equal(direct.status, 0, direct.stderr);
  assert.ok(direct.stdout.startsWith('# Cost by agent\n'), direct.stdout);
  assert.ok(direct.stdout.includes('Log rows: 0. Missing transcripts: 0.'), direct.stdout);
  assert.equal(link.status, 0, link.stderr);
  assert.equal(link.stdout, direct.stdout);
});

test('EZD-178 T6 outline.mjs prints the outline through a symlink', (t) => {
  const c = linkedCopy(t, 'vault/tools/outline.mjs', { 'doc.md': '# Title\n\n## One\n\ntext\n\n## Two\n' });
  const doc = path.join(c.root, 'doc.md');
  const { direct, link } = runBoth(c, [doc]);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.stdout, '1: # Title\n3: ## One\n7: ## Two\n');
  assert.equal(link.status, 0, link.stderr);
  assert.equal(link.stdout, direct.stdout);
});

// Six import lines, one per tool, by absolute file URL.
const importLines = () => SIX_TOOLS.map((rel) => `await import(${JSON.stringify(pathToFileURL(path.join(repo, rel)).href)});`);

test('EZD-178 T7 importing the six tools runs no CLI (control)', (t) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd178-import-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const importer = path.join(dir, 'importer.mjs');
  writeFileSync(importer, importLines().join('\n') + '\n');
  const r = spawnSync(process.execPath, [importer], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('EZD-178 T8 an unresolvable argv[1] is not main (control)', (t) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd178-missing-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const missing = path.join(dir, 'missing.mjs');
  // With -e, argv[1] is the first argument after the code, and that file does not exist.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', importLines().join('\n'), missing], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
