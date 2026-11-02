// SessionEnd (timeout 30 s): report ledger problems on stderr. It writes and commits nothing: running records live in the
// records database and only the launcher writes them; the handoff history is its events table (REMEDIATION-PLAN 2.12;
// D1 (a), D2 (a)).
import { spawnSync } from 'node:child_process';
import { projectDir } from './lib.mjs';

const root = projectDir();
try {
  const chk = spawnSync(process.execPath, [`${root}/vault/tools/next_ticket.mjs`, '--check'], { encoding: 'utf8' });
  if (chk.status !== 0) process.stderr.write(`session-end hook: ledger problems\n${chk.stdout}`);
} catch (e) {
  process.stderr.write(`session-end hook: ${e.message}\n`);
}
process.exit(0);
