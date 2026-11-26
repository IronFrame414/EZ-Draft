// Backup status (EZD-1958, audit 2026-11-23 O4): the off-site backup workflows existed, but nothing looked at whether
// they had run lately. This reads the newest runs of each backup workflow with `gh run list` and says which one is
// stale: its newest successful run is older than 8 days, or its newest finished run did not succeed. backup-db.yml
// runs weekly (Sunday), backup-files.yml and backup-check.yml daily, so 8 days gives each a day of slack.
// Usage: node scripts/backup/status.mjs   (prints one line per workflow; exit 1 when any is stale or unreadable)
// Node built-ins only. Tests pass a stub gh (rule 5).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKFLOWS = ['backup-check.yml', 'backup-db.yml', 'backup-files.yml'];
export const STALE_DAYS = 8;
const DAY = 86400000;
const FIELDS = 'databaseId,status,conclusion,createdAt,updatedAt';

// One workflow's runs (gh's JSON, any order) -> { workflow, stale, reason, lastSuccess, newest }.
// A run still queued or in progress is left out: only a finished run can have passed or failed.
export function judge(workflow, runs, nowMs, days = STALE_DAYS) {
  const done = (runs || []).filter((r) => r && r.status === 'completed')
    .map((r) => ({ ...r, at: Date.parse(r.updatedAt || r.createdAt) }))
    .filter((r) => Number.isFinite(r.at))
    .sort((a, b) => b.at - a.at);
  const newest = done[0] || null;
  const ok = done.find((r) => r.conclusion === 'success') || null;
  const base = { workflow, lastSuccess: ok ? new Date(ok.at).toISOString() : null, newest: newest ? { conclusion: newest.conclusion, at: new Date(newest.at).toISOString() } : null };
  if (newest && newest.conclusion !== 'success') return { ...base, stale: true, reason: `newest run ${newest.conclusion} at ${base.newest.at}` };
  if (!ok) return { ...base, stale: true, reason: 'no successful run found' };
  if (nowMs - ok.at > days * DAY) return { ...base, stale: true, reason: `last success ${base.lastSuccess}, more than ${days} days ago` };
  return { ...base, stale: false, reason: `last success ${base.lastSuccess}` };
}

// Runs gh for one workflow. { ok: true, runs } or { ok: false, error }.
export function listRuns(workflow, { gh = 'gh', cwd = process.cwd(), env = process.env, limit = 20 } = {}) {
  const r = spawnSync(gh, ['run', 'list', '--workflow', workflow, '--limit', String(limit), '--json', FIELDS], { cwd, env, encoding: 'utf8', timeout: 60000 });
  if (r.error || r.status !== 0) return { ok: false, error: String(r.error?.message || r.stderr || `gh exited ${r.status}`).trim().slice(0, 300) };
  try {
    const runs = JSON.parse(r.stdout);
    if (!Array.isArray(runs)) throw new Error('not a list');
    return { ok: true, runs };
  } catch (e) { return { ok: false, error: `unreadable gh output: ${e.message}` }; }
}

// Every backup workflow -> one result each; a gh failure gives { workflow, error } (stale unknown, never silent).
export function backupStatus({ nowMs = Date.now(), days = STALE_DAYS, ...opts } = {}) {
  return WORKFLOWS.map((w) => {
    const l = listRuns(w, opts);
    return l.ok ? judge(w, l.runs, nowMs, days) : { workflow: w, stale: null, error: l.error };
  });
}

// Result -> the line the loop logs. 'BACKUP STALE <workflow>' is the line to watch for (AC-EZD-1958-1).
export function statusLine(r) {
  if (r.error) return `backup status ${r.workflow} unreadable: ${r.error}`;
  return r.stale ? `BACKUP STALE ${r.workflow}: ${r.reason}` : `backup ok ${r.workflow}: ${r.reason}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = backupStatus();
  for (const r of res) console.log(statusLine(r));
  process.exit(res.some((r) => r.stale !== false) ? 1 : 0);
}
