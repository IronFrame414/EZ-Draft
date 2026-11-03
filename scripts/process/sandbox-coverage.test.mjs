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
const OUTSIDE = { 'scripts/gate.mjs': null, 'scripts/unit-steps.mjs': ['worktree', 'merge'], 'scripts/ui-run.mjs': null };

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

function mustRunOutside(cmd) {
  const m = cmd.match(/^node (scripts\/[\w./-]+\.mjs)(?: (\S+))?/);
  if (!m || !(m[1] in OUTSIDE)) return false;
  return OUTSIDE[m[1]] === null || OUTSIDE[m[1]].includes(m[2]);
}

test('D-022 every command the skills, agent files and architecture tell units to run outside the sandbox is an excluded command, in its written form', () => {
  const missing = [];
  let seen = 0;
  for (const file of instructionFiles()) {
    for (const m of readFileSync(file, 'utf8').matchAll(/`(node scripts\/[^`]+)`/g)) {
      const cmd = m[1].trim();
      if (!mustRunOutside(cmd)) continue;
      seen++;
      if (!covered(cmd)) missing.push(`${path.relative(repo, file)}: ${cmd}`);
    }
  }
  assert.ok(seen >= 4, `found only ${seen} such commands; the parser no longer reads the instructions`);
  assert.deepEqual(missing, []);
});

test('D-022 every excluded command names a script on the list above, and every script that stops with SANDBOX STOP is on it', () => {
  for (const p of sandbox.excludedCommands) {
    const m = p.match(/^node (scripts\/[\w./-]+\.mjs)(?: (\S+))? \*$/);
    assert.ok(m, `excluded command not of the form "node scripts/<x>.mjs [sub] *": ${p}`);
    assert.ok(m[1] in OUTSIDE, `${p}: ${m[1]} is not on the OUTSIDE list`);
    assert.ok(existsSync(path.join(repo, m[1])), `${p}: ${m[1]} does not exist`);
    if (OUTSIDE[m[1]] !== null) assert.ok(OUTSIDE[m[1]].includes(m[2]), `${p}: subcommand ${m[2]} is not on the list`);
  }
  const selfChecking = readdirSync(path.join(repo, 'scripts'))
    .filter((f) => f.endsWith('.mjs') && readFileSync(path.join(repo, 'scripts', f), 'utf8').includes('SANDBOX STOP'))
    .map((f) => `scripts/${f}`);
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
