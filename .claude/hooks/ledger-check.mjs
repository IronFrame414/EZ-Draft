// Stop hook (main session only): the orchestrator may not end a turn with an invalid ledger.
// Exit 2 sends the problems back to Claude to fix. Claude Code caps repeated blocks, so this cannot loop forever.
import { spawnSync } from 'node:child_process';
import { readInput, projectDir } from './lib.mjs';

const input = readInput();
if (input.agent_type) process.exit(0);           // subagents do not own the ledger
if (input.stop_hook_active) process.exit(0);     // already blocked once this turn; let it stop
const r = spawnSync(process.execPath, [`${projectDir()}/vault/tools/next_ticket.mjs`, '--check'], { encoding: 'utf8' });
if (r.status === 0) process.exit(0);
process.stderr.write(`Ledger check failed. Fix vault/tickets/STATUS.md before stopping:\n${r.stdout}`);
process.exit(2);
