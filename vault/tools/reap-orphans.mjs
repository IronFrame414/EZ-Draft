#!/usr/bin/env node
// Overwatch helper (Josh 2026-11-23): kills processes left behind by a check.
// Targets: any process whose command runs from .claude/worktrees/<T>/ when that worktree no longer exists, and any
// `supabase db reset` older than 45 min (a reset normally takes under 2 min), and any lane e2e web server
// (`pnpm start -p 30x0` / `next start -p 30x0`) adopted by launchd (ppid 1) and older than 90 min: Playwright reuses a
// server already on the lane port, so a stale one makes every later e2e run on that lane time out (2026-11-24, lane 1). Three such resets ran 1.5-5.5 days at
// ~140% CPU each before this existed. Root-cause fix: EZD-1965.
// Usage: node vault/tools/reap-orphans.mjs [--dry]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dry = process.argv.includes('--dry');
const secs = (e) => { // [[dd-]hh:]mm:ss
  const [d, rest] = e.includes('-') ? e.split('-') : ['0', e];
  const p = rest.split(':').map(Number);
  while (p.length < 3) p.unshift(0);
  return Number(d) * 86400 + p[0] * 3600 + p[1] * 60 + p[2];
};
const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,command='], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], age: secs(m[3]), cmd: m[4] }; })
  .filter(Boolean).filter((r) => r.pid !== process.pid);
const hits = [];
for (const r of rows) {
  const wt = r.cmd.match(/\.claude\/worktrees\/([^/\s]+)\//);
  if (wt && !existsSync(path.join(ROOT, '.claude/worktrees', wt[1]))) hits.push({ ...r, why: `worktree ${wt[1]} is gone` });
  else if (/supabase(\.js)?\s+db reset/.test(r.cmd) && r.age > 45 * 60) hits.push({ ...r, why: `db reset running ${Math.round(r.age / 60)} min` });
  else if (r.ppid === 1 && /\b(pnpm|next) start -p 30\d0\b/.test(r.cmd) && r.age > 90 * 60) hits.push({ ...r, why: `orphaned lane web server ${Math.round(r.age / 60)} min` });
}
for (const h of hits) {
  console.log(`${dry ? 'would kill' : 'kill'} ${h.pid} (${h.why}): ${h.cmd.slice(0, 120)}`);
  if (!dry) { try { process.kill(-h.pid, 'SIGKILL'); } catch { try { process.kill(h.pid, 'SIGKILL'); } catch {} } }
}
console.log(`${hits.length} orphan process(es)${dry ? ' found' : ' killed'}`);
