// SessionEnd: archive the handoff and commit vault/ changes on develop, so nothing from the session is lost.
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
  if (!git('status', '--porcelain', '--', 'vault')) process.exit(0);
  git('add', '--', 'vault');
  git('commit', '-m', 'docs(vault): session end', '--', 'vault');
} catch (e) {
  process.stderr.write(`session-end hook: ${e.message}\n`);
}
process.exit(0);
