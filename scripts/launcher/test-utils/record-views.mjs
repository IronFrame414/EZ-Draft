// REMEDIATION-PLAN 2.14 (L-041): the running records are git-ignored views of the records database, so a fresh checkout
// (CI) has none and a Mac's are live state. A test that copies vault/ calls seedRecordViews on its copy: every record view
// is replaced by the last committed snapshot's (vault/snapshots/LATEST), and the folders the records used to fill exist.
// The copy then reads the same records on every machine, and never the checkout's git-ignored ones.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addNewTicketRows } from '../../records.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const RECORD_VIEWS = ['tickets/STATUS.md', 'tickets/TRACE.md', 'PROGRESS.md', 'DONE.md', 'cost/log.jsonl', 'handoff/CURRENT.md', 'lessons/findings.jsonl', 'questions/QUESTIONS.md', 'questions/QUESTIONS-answered.md', 'questions/QUESTIONS-archive.md'];

export function seedRecordViews(vaultDir, { from = repo } = {}) {
  const label = readFileSync(path.join(from, 'vault/snapshots/LATEST'), 'utf8').trim();
  const snap = path.join(from, 'vault/snapshots', label);
  for (const rel of RECORD_VIEWS) {
    const src = path.join(snap, rel);
    const dst = path.join(vaultDir, rel);
    if (!existsSync(src)) { rmSync(dst, { force: true }); continue; }
    mkdirSync(path.dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(src));
  }
  addNewTicketRows(vaultDir); // tickets added since the snapshot start as todo (scripts/records.mjs)
  mkdirSync(path.join(vaultDir, 'handoff/log'), { recursive: true });
  return label;
}
