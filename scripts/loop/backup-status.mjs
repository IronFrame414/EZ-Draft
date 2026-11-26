// Once a day the build loop checks the off-site backup workflows (EZD-1958, audit 2026-11-23 O4) and logs
// 'BACKUP STALE <workflow>' for any whose newest success is more than 8 days old or whose newest run failed
// (scripts/backup/status.mjs). Like the advisory check, a gh failure is logged and tried again next day; it never stops
// the loop, sets a ticket aside or touches the gate.
import { backupStatus, statusLine } from '../backup/status.mjs';

export const BACKUP_CHECK_HOURS = 24;

export function backupCheckDue(lastAt, nowMs, hours = BACKUP_CHECK_HOURS) {
  const last = Date.parse(lastAt || 0);
  return !Number.isFinite(last) || nowMs >= last + hours * 3600000;
}

// s: the loop state (s.backups_checked_at is kept there); save(s) writes it; log(line) logs one line.
// Returns the lines logged, or null when the check was not due.
export function checkBackups(s, { nowMs = Date.now(), hours = BACKUP_CHECK_HOURS, save = () => {}, log = () => {}, ...opts } = {}) {
  if (!backupCheckDue(s.backups_checked_at, nowMs, hours)) return null;
  s.backups_checked_at = new Date(nowMs).toISOString().replace(/\.\d+Z$/, 'Z'); save(s);
  const lines = backupStatus({ nowMs, ...opts }).map(statusLine);
  for (const l of lines) log(l);
  return lines;
}
