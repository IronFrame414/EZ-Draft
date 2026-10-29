// EZD-250 test harness (vault/plans/EZD-250.md section 4): a temporary root with copies of the launcher, a stub ledger tool (NT)
// answering --next-unit, --check and --grant-needs from marker files, a fake claude, a PATH shim for claude and a stub notify
// command. Nothing here touches the real vault/, the real launcher log, a real claude or a live service.
//
// Stub ledger tool (vault/tools/next_ticket.mjs in the root) reads vault/tools/stub-config.json:
//   next:  entries { text, until?, untilCalls?, writes?, times?, copyState? }, checked in order; the last entry always answers.
//          An entry is skipped when its marker file markers/<until> exists, when the call number (counts.json) is above
//          untilCalls, or when it has already answered `times` times (its own count in counts.json); on call number untilCalls
//          it also writes the marker markers/<writes>. copyState: each time the entry answers, logs/launcher-state.json is
//          copied to state-copies/<list>-<n>.json (n = the entry's own answer number; `null` when the file is absent).
//   check: { failUntil?: marker, failIfStatusContains?: text, output? }: exit 1 until the marker exists / while STATUS.md has the text.
//   grantNeeds: entries as next, plus exit?: the exit code (default 0); an empty text prints nothing.
// Fake claude reads fake-rules.json: rules { prompt (prefix), writes: [markers], result, append: [{ file, text }], script }.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync, realpathSync, openSync, closeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const made = [];
process.on('exit', () => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});
export const mkTmp = (prefix = 'ezd250-') => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  made.push(d);
  return d;
};

export const STUB_NT = [
  '// Stub ledger tool for the EZD-250 launcher tests: the names run.mjs and budget.mjs import, and the CLI the launcher calls.',
  "import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';",
  "import path from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  'const here = path.dirname(fileURLToPath(import.meta.url));',
  "const root = path.resolve(here, '../..');",
  "export const weekStart = () => new Date('2030-01-07T07:00:00.000Z');",
  "export const weekSpend = () => ({ start: weekStart(), main: 0, fable: 0, runs: 0, ceiling: null, pct: null, text: 'stub' });",
  "export const questionsFingerprint = () => '';",
  'export const assignQuestionIds = () => ({});',
  'export const setArchitecture = () => ({ ok: true });',
  "const cfg = (() => { try { return JSON.parse(readFileSync(path.join(here, 'stub-config.json'), 'utf8')); } catch { return {}; } })();",
  "const marker = (n) => existsSync(path.join(root, 'markers', n));",
  "const writeMarker = (n) => { mkdirSync(path.join(root, 'markers'), { recursive: true }); writeFileSync(path.join(root, 'markers', n), 'x'); };",
  'function bump(key) {',
  "  const f = path.join(root, 'counts.json');",
  '  let c = {};',
  "  try { c = JSON.parse(readFileSync(f, 'utf8')); } catch {}",
  '  c[key] = (c[key] || 0) + 1;',
  '  writeFileSync(f, JSON.stringify(c));',
  '  return c[key];',
  '}',
  "const countOf = (key) => { try { return JSON.parse(readFileSync(path.join(root, 'counts.json'), 'utf8'))[key] || 0; } catch { return 0; } };",
  'function copyState(name) {',
  "  const src = path.join(root, 'logs', 'launcher-state.json');",
  "  mkdirSync(path.join(root, 'state-copies'), { recursive: true });",
  "  writeFileSync(path.join(root, 'state-copies', name + '.json'), existsSync(src) ? readFileSync(src, 'utf8') : 'null');",
  '}',
  'function pick(entries, calls, list) {',
  '  for (let i = 0; i < entries.length; i++) {',
  '    const e = entries[i];',
  '    if (i < entries.length - 1) {',
  '      if (e.until && marker(e.until)) continue;',
  '      if (e.untilCalls !== undefined && calls > e.untilCalls) continue;',
  "      if (e.times !== undefined && countOf(list + '-e' + i) >= e.times) continue;",
  '    }',
  "    const n = bump(list + '-e' + i);",
  '    if (e.writes && e.untilCalls === calls) writeMarker(e.writes);',
  "    if (e.copyState) copyState(list + '-' + n);",
  '    return e;',
  '  }',
  "  return { text: '' };",
  '}',
  "const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);",
  "const argv = isMain ? process.argv.slice(2) : ['--imported'];",
  "if (argv.includes('--next-unit')) {",
  "  console.log(pick(cfg.next ?? [{ text: 'none: budget hold (test)' }], bump('next'), 'next').text);",
  "} else if (argv.includes('--grant-needs')) {",
  "  const e = pick(cfg.grantNeeds ?? [{ text: '[]' }], bump('grant'), 'grant');",
  '  if (e.text) console.log(e.text);',
  '  process.exitCode = e.exit ?? 0;',
  "} else if (argv.includes('--check')) {",
  '  const k = cfg.check ?? {};',
  '  let fail = false;',
  '  if (k.failUntil && !marker(k.failUntil)) fail = true;',
  "  if (k.failIfStatusContains && readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8').includes(k.failIfStatusContains)) fail = true;",
  "  console.log(fail ? (k.output ?? 'stub check failed') : 'stub check ok');",
  '  process.exit(fail ? 1 : 0);',
  '} else if (isMain && argv.length === 0) {',
  "  console.log('stub status');",
  '}',
  '',
].join('\n');

const fakeClaude = () =>
  [
    `#!${process.execPath}`,
    "const fs = require('fs');",
    "const path = require('path');",
    "const { spawnSync } = require('child_process');",
    'const args = process.argv.slice(2);',
    "if (args[0] === '--help') { console.log('--max-turns --session-id --permission-prompts'); process.exit(0); }",
    'const root = __dirname;',
    "const prompt = args[args.indexOf('-p') + 1] || '';",
    "const markers = fs.existsSync(path.join(root, 'markers')) ? fs.readdirSync(path.join(root, 'markers')).sort() : [];",
    "fs.appendFileSync(path.join(root, 'prompts.txt'), prompt + '\\n');",
    "fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify({ prompt, markers }) + '\\n');",
    'let rules = [];',
    "try { rules = JSON.parse(fs.readFileSync(path.join(root, 'fake-rules.json'), 'utf8')); } catch {}",
    'const rule = rules.find((r) => prompt.startsWith(r.prompt)) || {};',
    "for (const a of rule.append || []) { fs.mkdirSync(path.dirname(path.join(root, a.file)), { recursive: true }); fs.appendFileSync(path.join(root, a.file), a.text); }",
    "if (rule.script) spawnSync(process.execPath, [path.join(root, rule.script)], { cwd: root, stdio: 'ignore', env: { ...process.env, FAKE_ROOT: root } });",
    "for (const m of rule.writes || []) { fs.mkdirSync(path.join(root, 'markers'), { recursive: true }); fs.writeFileSync(path.join(root, 'markers', m), 'x'); }",
    "console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: rule.result || 'fake unit done', session_id: 'ezd250-fake-session', num_turns: 1, duration_ms: 5, total_cost_usd: 0, modelUsage: {} }));",
    '',
  ].join('\n');

const pathShim = (callsFile) => ['#!/bin/sh', `printf '%s\\n' "$*" >> "${callsFile}"`, 'exit 1', ''].join('\n');

const BASE_COPY = ['scripts/run.mjs', 'scripts/budget.mjs', 'scripts/oauth-usage.mjs', 'scripts/cost-log.mjs', 'scripts/launcher-idle.mjs', 'scripts/ledger.mjs', 'vault/tools/boost.mjs'];

// A temporary launcher root. copy: more repo files to copy to the same relative path. Every root is a git repository on develop
// with scripts/ and vault/ committed. stub: the stub ledger tool's config. rules: fake claude rules.
export function makeLauncherRoot({ stub = {}, rules = [], copy = [] } = {}) {
  const tmp = mkTmp();
  const at = (...p) => path.join(tmp, ...p);
  for (const d of ['scripts', 'vault/tools', 'vault/tickets', 'vault/cost', 'vault/handoff', 'logs', 'bin', 'markers']) mkdirSync(at(d), { recursive: true });
  for (const f of [...BASE_COPY, ...copy]) {
    mkdirSync(path.dirname(at(f)), { recursive: true });
    copyFileSync(path.join(repo, f), at(f));
  }
  writeFileSync(at('vault/tools/next_ticket.mjs'), STUB_NT);
  writeFileSync(at('vault/tools/stub-config.json'), JSON.stringify(stub));
  writeFileSync(at('vault/tickets/STATUS.md'), 'stub\n');
  writeFileSync(at('vault/budget.json'), JSON.stringify({ meter_source: 'statusline', weekly_ceiling_usd_est: 1000 }));
  // Meters below every hold: five-hour 10% (pause at 90%), weekly 10% (warning at 70%, hold at 80%).
  const now = Date.now();
  writeFileSync(
    at('vault/cost/usage.json'),
    JSON.stringify({
      five_hour: { pct: 10, resets_at: new Date(now + 7_200_000).toISOString() },
      seven_day: { pct: 10, resets_at: new Date(now + 3 * 86_400_000).toISOString() },
      fable_seven_day: null,
      read_at: new Date(now).toISOString(),
      source: 'statusline',
    }),
  );
  writeFileSync(at('fake-claude'), fakeClaude(), { mode: 0o755 });
  chmodSync(at('fake-claude'), 0o755);
  writeFileSync(at('fake-rules.json'), JSON.stringify(rules));
  writeFileSync(at('bin/claude'), pathShim(at('path-claude-calls.txt')), { mode: 0o755 });
  chmodSync(at('bin/claude'), 0o755);
  writeFileSync(
    at('scripts/launcher.config.json'),
    JSON.stringify({
      claude_bin: at('fake-claude'),
      log_dir: at('logs'),
      idle_poll_ms: 200,
      notify_cmd: `printf '%s\\n' "$MSG" >> "${at('notified.txt')}"`,
    }),
  );
  // Every root is a git repository: run.mjs imports ledger.mjs, whose lock needs .git (plan C9, Decided "Launcher test roots").
  gitInit(tmp, ['scripts', 'vault']);
  return { tmp, at };
}

export function gitInit(dir, paths) {
  const g = (...a) => {
    const r = spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  g('init', '-q', '-b', 'develop');
  g('config', 'user.name', 'EZD test');
  g('config', 'user.email', 'test@example.invalid');
  g('config', 'commit.gpgsign', 'false');
  g('add', '--', ...paths);
  g('commit', '-q', '-m', 'initial');
}

export const git = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });

const readIfExists = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const lines = (f) => (readIfExists(f) ?? '').split('\n').filter(Boolean);
export const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// One continuous launcher run (no --once unless args say so), stdout and stderr appended to logs/launcher.log as launchd does.
// env: extra child variables, applied last.
export function runLauncher(root, { args = [], timeout = 25000, env: extraEnv = {} } = {}) {
  const fd = openSync(root.at('logs/launcher.log'), 'a');
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'EZD_LAUNCHER_RESTARTED')),
    GIT_CEILING_DIRECTORIES: path.dirname(root.tmp),
    PATH: `${root.at('bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    ...extraEnv,
  };
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [root.at('scripts/run.mjs'), ...args], { stdio: ['ignore', fd, fd], env });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      closeSync(fd);
      const log = readFileSync(root.at('logs/launcher.log'), 'utf8');
      resolve({
        status,
        signal,
        timedOut,
        pid: child.pid,
        ms: Date.now() - t0,
        log,
        notified: lines(root.at('notified.txt')),
        prompts: lines(root.at('prompts.txt')),
        calls: lines(root.at('calls.jsonl')).map((l) => JSON.parse(l)),
        state: readJson(root.at('logs/launcher-state.json')),
        repairState: readJson(root.at('logs/repair-state.json')),
        repairMd: readIfExists(root.at('vault/handoff/REPAIR.md')),
      });
    });
  });
}

export const why = (r) => `exit ${r.status}, signal ${r.signal}${r.timedOut ? ', TIMED OUT' : ''}\n${r.log}`;

// A plan with a Build steps table (vault/plans/TEMPLATE.md section 1), for planPaths and grantNeeds.
export const planText = (id, paths) =>
  [
    `# ${id} · test plan`,
    '',
    '## 1. What to build',
    '',
    '### Build steps',
    '| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |',
    '| --- | --- | --- | --- | --- | --- |',
    ...paths.map((p, i) => `| ${i + 1} | ${p} | change | none | none | none |`),
    '',
    '## 2. Sources',
    '',
  ].join('\n');

export const GH_ARGV = 'pr checks https://github.com/o/r/pull/5 --json name,bucket,link';
