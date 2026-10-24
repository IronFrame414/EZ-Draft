// Stop hook stop-ledger-check (main session only): the orchestrator may not end a turn with an invalid ledger (vault/PROCESS.md section 14).
// Exit 2 sends the problems back to Claude to fix. Claude Code caps repeated blocks, so this cannot loop forever.
// Escape (only when the check itself is broken): if vault/handoff/FORCE_STOP exists, the failure is appended to
// vault/handoff/CURRENT.md, FORCE_STOP is deleted and the stop is allowed. The next session fixes the check first.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { readInput, projectDir } from './lib.mjs';

const input = readInput();
if (input.agent_type) process.exit(0);           // subagents do not own the ledger
if (input.stop_hook_active) process.exit(0);     // already blocked once this turn; let it stop
const r = spawnSync(process.execPath, [`${projectDir()}/vault/tools/next_ticket.mjs`, '--check'], { encoding: 'utf8' });
if (r.status === 0) process.exit(0);
const force = `${projectDir()}/vault/handoff/FORCE_STOP`;
if (existsSync(force)) {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  appendFileSync(`${projectDir()}/vault/handoff/CURRENT.md`,
    `\n\n## Ledger check failed at forced stop (${when})\nFORCE_STOP was used. First job of the next session: fix the check (next_ticket.mjs or tickets.json), then the ledger.\n\n${r.stdout || ''}${r.stderr || ''}`);
  unlinkSync(force);
  process.exit(0);
}
process.stderr.write(`Ledger check failed. Fix vault/tickets/STATUS.md before stopping:\n${r.stdout}`);
process.exit(2);
