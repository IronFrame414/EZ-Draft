// SessionEnd (timeout 30 s): archive the handoff, add any ledger problems to it, and commit vault/ on develop when no other
// unit is in flight (vault/PROCESS.md section 14; EZD-173 C14). The commit waits up to 20 s for the ledger lock.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { projectDir } from './lib.mjs';

const root = projectDir();
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
try {
  const cur = `${root}/vault/handoff/CURRENT.md`;
  if (existsSync(cur)) {
    mkdirSync(`${root}/vault/handoff/log`, { recursive: true });
    const stamp = new Date(statSync(cur).mtime).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const dest = `${root}/vault/handoff/log/${stamp}.md`;
    if (!existsSync(dest)) copyFileSync(cur, dest);
  }
  // Record the ledger state; a problem here is shown at the next session start (SessionEnd cannot block).
  const chk = spawnSync(process.execPath, [`${root}/vault/tools/next_ticket.mjs`, '--check'], { encoding: 'utf8' });
  if (chk.status !== 0) appendFileSync(cur, `\n\n## Ledger problems at session end\n${chk.stdout}`);
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'develop') process.exit(0);
  // Imported here, inside the try, so a ledger module that fails to load cannot make the hook exit non-zero.
  const { withLedgerLock, closeUnit, inflightDir, LockError } = await import(new URL('../../scripts/ledger.mjs', import.meta.url).href);
  try {
    withLedgerLock(root, { owner: 'session-end', timeoutMs: 20000 }, () => closeUnit(root, {
      dir: inflightDir({ root }), ownId: process.env.EZD_UNIT_ID, ownPaths: [], msg: 'docs(vault): session end',
    }));
  } catch (e) {
    if (!(e instanceof LockError && e.code === 'lock_timeout')) throw e;
    process.stderr.write('session-end hook: ledger lock busy; vault/ not committed\n');
  }
} catch (e) {
  process.stderr.write(`session-end hook: ${e.message}\n`);
}
process.exit(0);
