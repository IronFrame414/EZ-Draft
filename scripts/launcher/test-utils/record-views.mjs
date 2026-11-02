// REMEDIATION-PLAN 2.14 (L-041): the running records are git-ignored views of the records database, so a fresh checkout
// (CI) has none and a Mac's are live state. A test that copies vault/ calls seedRecordViews on its copy: every record view
// is replaced by the last committed snapshot's (vault/snapshots/LATEST), and the folders the records used to fill exist.
// The copy then reads the same records on every machine, and never the checkout's git-ignored ones.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // A ticket added to tickets.json after the snapshot (a phase gate's fix tickets) gets the row every new ticket starts with,
  // `todo`, as the launcher's records give it; otherwise each new ticket breaks the copy's ledger check.
  const ticketsFile = path.join(vaultDir, 'tickets/tickets.json');
  const statusFile = path.join(vaultDir, 'tickets/STATUS.md');
  if (existsSync(ticketsFile) && existsSync(statusFile)) {
    const status = readFileSync(statusFile, 'utf8');
    const known = new Set([...status.matchAll(/^\| (EZD-[0-9A-Za-z]+) \|/gm)].map((m) => m[1]));
    const added = JSON.parse(readFileSync(ticketsFile, 'utf8')).tickets.filter((t) => !known.has(t.id));
    if (added.length) writeFileSync(statusFile, status.replace(/\n*$/, '\n') + added.map((t) => `| ${t.id} | ${t.phase} | ${t.title} | todo |  |  |  |  |  |\n`).join(''));
  }
  mkdirSync(path.join(vaultDir, 'handoff/log'), { recursive: true });
  return label;
}
