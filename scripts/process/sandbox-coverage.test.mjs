// D-022 (sandbox audit 2026-11-03, vault/handoff/SANDBOX-AUDIT-2026-11-03.md section 4): every sandbox stop of 2026-11-02 was a
// command or folder the instructions use that scripts/unit-sandbox.json did not cover. These tests read the real files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launcherLogDir } from '../ledger.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = JSON.parse(readFileSync(path.join(repo, 'scripts/unit-sandbox.json'), 'utf8')).sandbox;

// The scripts that must run outside the sandbox, and the subcommands of each (null = every form). Each one stops with
// "SANDBOX STOP" when it finds itself sandboxed.
const OUTSIDE = { 'scripts/gate.mjs': null, 'scripts/unit-steps.mjs': ['worktree', 'merge'], 'scripts/ui-run.mjs': null, 'scripts/release/github-ops.mjs': null };

// Bash permission-rule syntax: no wildcard = exact; a trailing " *" also matches the bare prefix.
function covered(cmd) {
  return sandbox.excludedCommands.some((p) => {
    if (!p.endsWith(' *')) return cmd === p;
    const prefix = p.slice(0, -2);
    return cmd === prefix || cmd.startsWith(`${prefix} `);
  });
}

function instructionFiles() {
  const out = [];
  for (const d of readdirSync(path.join(repo, '.claude/skills'))) {
    const dir = path.join(repo, '.claude/skills', d);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.md')) out.push(path.join(dir, f));
  }
  for (const f of readdirSync(path.join(repo, '.claude/agents'))) if (f.endsWith('.md')) out.push(path.join(repo, '.claude/agents', f));
  out.push(path.join(repo, 'docs/architecture.md'));
  return out;
}

// EZD-317 C1: D = the one absolute write-denied scripts folder of the main checkout (as the D-012 test finds it below).
const D = (sandbox.filesystem.denyWrite ?? []).find((p) => path.isAbsolute(p) && p.endsWith(`${path.sep}scripts`)) ?? '';
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mustRunOutside(cmd) {
  const m = cmd.replace(`node ${D}/`, 'node scripts/').match(/^node (scripts\/[\w./-]+\.mjs)(?: (\S+))?/);
  if (!m || !(m[1] in OUTSIDE)) return false;
  return OUTSIDE[m[1]] === null || OUTSIDE[m[1]].includes(m[2]);
}

// EZD-317 C1: one line per excluded entry that does not name a script inside the write-denied scripts folder.
function excludedProblems(entries, denyScripts) {
  const out = [];
  for (const e of entries) {
    const m = e.match(/^node (\S+)( [a-z-]+)? \*$/);
    const ok = m && path.normalize(m[1]) === m[1] && m[1].startsWith(`${denyScripts}/`) && m[1].endsWith('.mjs') && !/[*?~]/.test(m[1]);
    if (!ok) out.push(`${e}: not write-denied`);
  }
  return out;
}

test('EZD-317 T1 every excluded command names a write-denied main-checkout script', () => {
  assert.ok(D, 'no absolute denyWrite entry ending /scripts');
  assert.deepEqual(excludedProblems(sandbox.excludedCommands, D), []);
  assert.equal(sandbox.excludedCommands.length, 5);
});

test('EZD-317 T1b each form outside the write-denied scripts folder is one problem', () => {
  const A = `node ${D}/`;
  for (const e of ['node scripts/gate.mjs *', 'node ./scripts/gate.mjs *', 'node ~/scripts/gate.mjs *', `${A}../app/x.mjs *`, 'node /tmp/scripts/gate.mjs *', `${A}*.mjs *`, `DO_NOT_TRACK=1 ${A}gate.mjs *`]) {
    assert.deepEqual(excludedProblems([e], D), [`${e}: not write-denied`], e);
  }
});

test('EZD-317 T2 D-022 every command the skills, agent files, architecture and CLAUDE.md tell units to run outside the sandbox is an excluded command, in its absolute form', () => {
  const missing = [];
  let seen = 0;
  const files = [...instructionFiles(), path.join(repo, 'CLAUDE.md')];
  const re = new RegExp(`\`(node (?:${escRe(D)}/|scripts/)[^\`]+)\``, 'g');
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(re)) {
      const cmd = m[1].trim();
      if (!mustRunOutside(cmd)) continue;
      seen++;
      if (!covered(cmd)) missing.push(`${path.relative(repo, file)}: ${cmd}`);
    }
  }
  assert.ok(seen >= 4, `found only ${seen} such commands; the parser no longer reads the instructions`);
  assert.deepEqual(missing, []);
  for (const c of ['node scripts/gate.mjs x', 'node scripts/unit-steps.mjs worktree x', 'node scripts/unit-steps.mjs merge x', 'node scripts/ui-run.mjs x', 'node scripts/release/github-ops.mjs x']) {
    assert.equal(covered(c), false, `${c} is still covered in its relative form`);
  }
});

test('EZD-317 T6 excludedPrefix names the main checkout\'s scripts for the units\' own commands', async () => {
  const { excludedPrefix } = await import('../excluded-form.mjs');
  for (const t of ['gate.mjs', 'unit-steps.mjs worktree', 'unit-steps.mjs merge', 'ui-run.mjs']) {
    assert.equal(excludedPrefix(path.join(repo, 'scripts'), t), `node ${D}/${t}`);
  }
});

test('EZD-317 T3 D-022 every excluded command is the absolute form of a script on the list, and every script that stops with SANDBOX STOP is on it', () => {
  const abs = new RegExp(`^node ${escRe(D)}/([\\w./-]+\\.mjs)(?: (\\S+))? \\*$`);
  for (const p of sandbox.excludedCommands) {
    const m = p.match(abs);
    assert.ok(m, `excluded command not of the form "node ${D}/<x>.mjs [sub] *": ${p}`);
    const key = `scripts/${m[1]}`;
    assert.ok(key in OUTSIDE, `${p}: ${key} is not on the OUTSIDE list`);
    assert.ok(existsSync(path.join(repo, key)), `${p}: ${key} does not exist`);
    if (OUTSIDE[key] !== null) assert.ok(OUTSIDE[key].includes(m[2]), `${p}: subcommand ${m[2]} is not on the list`);
  }
  const selfChecking = ['scripts', 'scripts/release']
    .flatMap((d) => readdirSync(path.join(repo, d)).filter((f) => f.endsWith('.mjs')).map((f) => `${d}/${f}`))
    .filter((f) => readFileSync(path.join(repo, f), 'utf8').includes('SANDBOX STOP'));
  assert.deepEqual(selfChecking.sort(), Object.keys(OUTSIDE).sort());
});

test('D-022 the folder the launcher gives each unit for its records queue is writable inside the sandbox', () => {
  // A unit cannot read scripts/launcher.config.json (denyRead), so it uses the default log folder; resolve it as a unit does.
  // On macOS the default is in the home folder whatever the root; elsewhere it is <checkout>/.launcher (CI has no config file).
  const root = process.platform === 'darwin' ? path.join(os.tmpdir(), 'no-such-ezdraft-root') : repo;
  const inflight = path.join(launcherLogDir(root), 'inflight');
  const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.resolve(repo, p));
  const ok = sandbox.filesystem.allowWrite.some((p) => {
    const dir = expand(p);
    return inflight === dir || inflight.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
  });
  assert.ok(ok, `${inflight} is not under any allowWrite entry`);
});

test('D-012, D-014 probe rounds 5 and 6: the main checkout scripts/ is write-denied by absolute path, and units get DO_NOT_TRACK and a writable npm cache', () => {
  // A relative denyWrite entry had no effect (round 5); the absolute one denied the main checkout and left worktrees writable (round 6).
  const deny = sandbox.filesystem.denyWrite ?? [];
  const scriptsDeny = deny.filter((p) => path.isAbsolute(p) && p.endsWith(`${path.sep}scripts`));
  assert.equal(scriptsDeny.length, 1, `denyWrite: ${JSON.stringify(deny)}`);
  if (path.dirname(scriptsDeny[0]) === repo) assert.ok(existsSync(scriptsDeny[0]));
  const env = JSON.parse(readFileSync(path.join(repo, 'scripts/unit-sandbox.json'), 'utf8')).env ?? {};
  assert.equal(env.DO_NOT_TRACK, '1', 'the Supabase CLI crashes on its telemetry write inside the sandbox without it (round 5, step 16)');
  assert.match(env.npm_config_cache ?? '', /^\/tmp\/claude-\d+\//, 'npm cannot write ~/.npm inside the sandbox (round 5, step 14)');
});

test('EZD-316 T13 D-021 the sandbox cannot read the GitHub login or write the repo git config', () => {
  const read = sandbox.filesystem.denyRead;
  for (const p of ['~/Library/Keychains', '~/.config/gh', '~/.git-credentials', '~/.netrc']) assert.ok(read.includes(p), `denyRead lacks ${p}`);
  const write = sandbox.filesystem.denyWrite;
  for (const p of ['.git/config', '.git/config.worktree', '.git/commondir']) assert.ok(write.includes(`/Users/josh/Projects/ezdraft/${p}`), `denyWrite lacks ${p}`);
  assert.ok(write.includes('~/.ezdraft-github-ops'), 'denyWrite lacks ~/.ezdraft-github-ops');
  assert.ok(sandbox.excludedCommands.includes('node /Users/josh/Projects/ezdraft/scripts/release/github-ops.mjs *'), 'excludedCommands lacks the github-ops command');
});

test('D-022 the launcher starts every unit with the sandbox settings and refuses to start one without them', () => {
  const run = readFileSync(path.join(repo, 'scripts/run.mjs'), 'utf8');
  assert.match(run, /const sandboxSettings = path\.join\(root, 'scripts\/unit-sandbox\.json'\);/);
  assert.match(run, /'--settings', sandboxSettings,/);
  assert.match(run, /if \(!existsSync\(sandboxSettings\)\) return \{ outcome: 'error'/);
});
