// Durable holds (2026-11-18). A held ticket never builds, whatever vault/tickets/STATUS.md says. STATUS.md is gitignored and
// is regenerated from the records database (`records.mjs export`, `apply`, `views-from-snapshot`); on 2026-11-18 an export
// wiped every `blocked` row. Holds live in the tracked vault/build/holds.json, which the loop reads on top of STATUS.md and
// which every STATUS.md writer re-applies. Release a ticket by deleting its entry from holds.json (and committing it).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const HOLDS_REL = 'vault/build/holds.json';
export const HOLD_STATUS = 'blocked';

// holds.json: { "_readme": "...", "holds": [{ "ticket", "reason", "question", "since" }] }. Missing file → no holds.
// A file that exists but cannot be read as holds throws: falling back to "no holds" would release every held ticket.
export function readHolds(file) {
  if (!existsSync(file)) return [];
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON (${e.message}); fix it, holds are not read`); }
  if (!j || !Array.isArray(j.holds)) throw new Error(`${file} has no "holds" list`);
  for (const h of j.holds) if (!h || typeof h.ticket !== 'string' || !/^EZD-/.test(h.ticket)) throw new Error(`${file}: hold without a ticket id: ${JSON.stringify(h)}`);
  return j.holds;
}
export const heldIds = (holds) => new Set(holds.map((h) => h.ticket));

// Status column (5th cell) of every STATUS.md ticket row.
export function parseStatuses(text) {
  const st = {};
  for (const line of text.split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (/^EZD-/.test(c[1] || '')) st[c[1]] = c[4];
  }
  return st;
}

// The statuses the loop schedules by: STATUS.md, with every held ticket forced to `blocked` (also a held ticket with no row).
export function effectiveStatuses(root) {
  const statusFile = path.join(root, 'vault/tickets/STATUS.md');
  const st = existsSync(statusFile) ? parseStatuses(readFileSync(statusFile, 'utf8')) : {};
  for (const id of heldIds(readHolds(path.join(root, HOLDS_REL)))) st[id] = HOLD_STATUS;
  return st;
}

// STATUS.md text with the Status cell of each held ticket's row set to `blocked`; other rows and cells are left as written.
export function withHolds(text, ids) {
  return text.split('\n').map((line) => {
    const m = /^\| (EZD-[0-9A-Za-z]+) \|/.exec(line);
    if (!m || !ids.has(m[1])) return line;
    const cells = line.split('|');
    if (cells.length < 6 || cells[4].trim() === HOLD_STATUS) return line;
    cells[4] = ` ${HOLD_STATUS} `;
    return cells.join('|');
  }).join('\n');
}

// For the STATUS.md writers: re-apply holds to <vaultDir>/tickets/STATUS.md from <vaultDir>/build/holds.json.
// No holds file or no STATUS.md → nothing to do. Returns the ticket ids whose row was changed.
export function applyHoldsToVault(vaultDir) {
  const statusFile = path.join(vaultDir, 'tickets/STATUS.md');
  const holdsFile = path.join(vaultDir, 'build/holds.json');
  if (!existsSync(statusFile) || !existsSync(holdsFile)) return [];
  const ids = heldIds(readHolds(holdsFile));
  const before = readFileSync(statusFile, 'utf8');
  const after = withHolds(before, ids);
  if (after === before) return [];
  const was = parseStatuses(before);
  const changed = Object.entries(parseStatuses(after)).filter(([id, s]) => was[id] !== s).map(([id]) => id);
  const tmp = `${statusFile}.tmp-${process.pid}`;
  writeFileSync(tmp, after);
  renameSync(tmp, statusFile);
  return changed;
}
