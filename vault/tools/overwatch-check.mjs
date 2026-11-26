#!/usr/bin/env node
// Overwatch quiet check (Josh 2026-11-25: "stop giving 30 minute updates... only surface issues").
// Runs the mechanical overwatch steps and prints "OK" when nothing needs an agent, else one
// "NEEDS:" line per item. It changes nothing except running reap-orphans (which kills orphans).
// Usage: node vault/tools/overwatch-check.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const B = path.join(ROOT, 'vault/build');
const REPO = 'IronFrame414/EZ-Draft';
const sh = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim(); } catch (e) { return `ERR ${(e.stderr || e.message || '').toString().trim().slice(0, 200)}`; } };
const needs = [];
const info = [];
const now = Date.now();
const hrs = (t) => (now - Date.parse(t)) / 3600e3;

// 1. loop alive
const status = sh('node', ['scripts/launchd/build.mjs', 'status']);
if (!/com\.ezdraft\.build: running/.test(status)) needs.push(`loop service not running: ${status.split('\n')[0]}`);
if (!/com\.ezdraft\.build-watchdog/.test(status)) needs.push('watchdog not listed');
if (existsSync(path.join(B, 'STOP'))) needs.push('vault/build/STOP exists');
let hb = {};
try { hb = JSON.parse(readFileSync(path.join(B, 'heartbeat.jsonl'), 'utf8').trim().split('\n').pop()); } catch {}
const hbAge = hb.ts ? (now - Date.parse(hb.ts)) / 60e3 : Infinity;
if (hbAge > 15) needs.push(`heartbeat stale ${Math.round(hbAge)} min`);
if (hb.avail_mb !== undefined && hb.avail_mb < 3000) needs.push(`low memory avail_mb ${hb.avail_mb}`);
info.push(`running ${(hb.running || []).join(',') || 'none'}`);

// 2. orphans
const reap = sh('node', ['vault/tools/reap-orphans.mjs']);
if (!/^0 orphan/m.test(reap)) info.push(`reaped: ${reap.split('\n').pop()}`);

// 3, 5, 6. log scan since last check
const log = readFileSync(path.join(B, 'loop.log'), 'utf8').split('\n');
const sf = path.join(process.env.HOME, 'Library/Logs/ezdraft/overwatch-check.json');
let st = {}; try { st = JSON.parse(readFileSync(sf, 'utf8')); } catch {}
const since = st.lines ?? log.length;
const fresh = log.slice(Math.min(since, log.length));
const lastMerged = [...log].reverse().find((l) => / MERGED EZD-/.test(l));
const lm = lastMerged?.match(/^\[([^\]]+)\]/)?.[1];
if (lm && hrs(lm) > 4) needs.push(`no MERGED in ${hrs(lm).toFixed(1)} h (last ${lm})`);
for (const l of fresh) {
  if (/MAC RESTARTED|LOOP CHANGE NOT LOADED|DOCKER DOWN/.test(l)) needs.push(`log: ${l.slice(0, 160)}`);
  if (/CLAUDE DIED .*SIGTERM/.test(l)) needs.push(`log: ${l.slice(0, 160)}`);
}
const merged = fresh.filter((l) => / MERGED EZD-/.test(l)).map((l) => l.match(/MERGED (EZD-\S+)/)[1]);
if (merged.length) info.push(`merged ${merged.join(',')}`);

// 4. set-asides
let state = {}; try { state = JSON.parse(readFileSync(path.join(B, 'state.json'), 'utf8')); } catch {}
const sa = Object.keys(state.set_aside || {});
if (sa.length) needs.push(`set aside: ${sa.join(', ')}`);

// 9. production
const prs = sh('gh', ['pr', 'list', '--repo', REPO, '--base', 'main', '--state', 'open', '--json', 'number,mergeStateStatus,headRefOid,statusCheckRollup']);
let open = []; try { open = JSON.parse(prs); } catch { needs.push(`gh pr list failed: ${prs.slice(0, 120)}`); }
for (const p of open) {
  const gate = (p.statusCheckRollup || []).find((c) => c.name === 'gate');
  const g = gate ? (gate.conclusion || gate.status) : 'none';
  if (g === 'SUCCESS' && p.mergeStateStatus !== 'BEHIND') needs.push(`release PR #${p.number} green: merge it (run gh pr merge in the background)`);
  else if (p.mergeStateStatus === 'BEHIND') needs.push(`release PR #${p.number} BEHIND: gh pr update-branch`);
  else if (g === 'FAILURE' || g === 'CANCELLED' || g === 'TIMED_OUT') needs.push(`release PR #${p.number} gate ${g} on ${p.headRefOid.slice(0, 8)}: read check-failures.log, rerun or fix ticket`);
  else info.push(`release PR #${p.number} gate ${g}`);
}
if (!open.length) {
  sh('git', ['fetch', '-q', 'origin']);
  const ahead = sh('git', ['log', '--format=%s', 'origin/main..origin/develop']).split('\n').filter((s) => /^feat\(EZD/.test(s)).length;
  const last = sh('gh', ['pr', 'list', '--repo', REPO, '--base', 'main', '--state', 'all', '--limit', '1', '--json', 'number,createdAt,mergedAt,state']);
  let lp = {}; try { lp = JSON.parse(last)[0] || {}; } catch {}
  const ref = lp.mergedAt || lp.createdAt;
  if (ahead && ref && hrs(ref) >= 6) {
    const mig = sh('gh', ['run', 'list', '--repo', REPO, '--workflow', 'Supabase dev migrations', '--limit', '1', '--json', 'conclusion,headSha']);
    let m = {}; try { m = JSON.parse(mig)[0] || {}; } catch {}
    const changed = m.headSha ? sh('git', ['diff', '--name-only', m.headSha, 'origin/develop', '--', 'supabase/migrations']) : 'unknown';
    if (m.conclusion === 'success' && !changed) needs.push(`release due: ${ahead} tickets on develop not on main; migrations current: open a release PR`);
    else info.push(`release due but migrations not current (${m.conclusion}; changed: ${changed.split('\n').length})`);
  } else info.push(`no release PR; ${ahead} tickets ahead; last PR #${lp.number} ${ref ? hrs(ref).toFixed(1) + ' h ago' : ''}`);
}

writeFileSync(sf, JSON.stringify({ lines: log.length, at: new Date().toISOString() }) + '\n');
console.log(needs.length ? needs.map((n) => `NEEDS: ${n}`).join('\n') : 'OK');
console.log(`info: ${info.join(' · ')}`);
