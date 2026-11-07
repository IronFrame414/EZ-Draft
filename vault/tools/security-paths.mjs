// The production-sensitive path list (Q-0112; vault/PROCESS-EZDRAFT.md section 7), one source for the gate's SECURITY FLAG
// lines (scripts/gate.mjs) and the launcher's post-audit merge hold (vault/tools/next_ticket.mjs, EZD-337, Q-0594 (a)), so the
// two cannot drift. In vault/tools/ because the ledger test copies carry all of vault/.
import { trustedGit } from './trusted-git.mjs';

export const SECURITY_PATHS = Object.freeze(['auth/', 'api/', 'db/', 'middleware', 'migrations', 'billing',
  '.github/workflows/', 'scripts/release/', 'vault/tools/phase-rank.mjs', 'scripts/backup/', 'scripts/hosting/', 'supabase/migrations/', 'supabase/bootstrap/',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const securityRes = SECURITY_PATHS.map((p) => new RegExp(`(^|/)${escapeRe(p)}`, 'i'));
export const isSecurityPath = (f) => securityRes.some((re) => re.test(f));

// --no-renames lists both sides of a move; -z gives raw names (git otherwise quotes non-ASCII names); no external diff or textconv.
export const DIFF_NAMES_ARGS = Object.freeze(['diff', '--name-only', '--no-renames', '--no-ext-diff', '--no-textconv', '-z']);
export const splitNames = (s) => s.split('\0').filter(Boolean);

// The commit the last security pass covered, else the commit the phase audit ran on (`Develop at PR`).
export function reviewedBase(recordText) {
  const txt = String(recordText ?? '');
  const sha = txt.match(/^Develop at PR:\s*([0-9a-f]{7,40})/im)?.[1];
  if (!sha) return { error: 'gate record has no Develop at PR commit' };
  let last = null;
  for (const line of txt.split(/\r?\n/)) {
    if (!/^\s*security pass at\b/i.test(line)) continue;
    const m = line.trim().match(/^Security pass at: ([0-9a-f]{40})$/);
    if (!m) return { error: 'gate record pass line unreadable' };
    last = m[1];
  }
  return { sha: last ?? sha };
}

const git = (cwd, args) => trustedGit(cwd, args);
const firstErr = (r) => (r.stderr || '').split('\n').map((l) => l.trim()).find(Boolean) || `exit ${r.status}`;

// The files changed from base to the PR head, and which of them are production-sensitive. Synchronous; no fetch.
export function postAuditDelta({ cwd, base, head }) {
  if (typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head)) return { error: 'PR head commit unreadable' };
  const b = git(cwd, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (b.status !== 0) return { error: `base commit ${base} not found` };
  const fullBase = b.stdout.trim();
  if (git(cwd, ['cat-file', '-e', `${head}^{commit}`]).status !== 0) return { error: `PR head ${head.slice(0, 7)} is not in the local repository` };
  const a = git(cwd, ['merge-base', '--is-ancestor', fullBase, head]);
  if (a.status === 1) return { error: `${fullBase.slice(0, 7)} is not an ancestor of ${head.slice(0, 7)}` };
  if (a.status !== 0) return { error: `git merge-base failed: ${firstErr(a)}` };
  const d = git(cwd, [...DIFF_NAMES_ARGS, fullBase, head]);
  if (d.status !== 0) return { error: `git diff failed: ${firstErr(d)}` };
  const files = splitNames(d.stdout);
  return { base: fullBase, head, files, sensitive: files.filter(isSecurityPath) };
}
