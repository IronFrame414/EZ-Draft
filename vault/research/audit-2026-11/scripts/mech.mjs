// Audit 2026-11 A1 mechanical pass: for each done/blocked ticket in phases 0-4 (STATUS.md),
// is its recorded commit on develop, is there a feat(<id>) commit, how often do test files name it.
// Usage: node vault/research/audit-2026-11/scripts/mech.mjs > a1-mechanical.csv (run from repo root)
import fs from 'node:fs'; import { execFileSync as x } from 'node:child_process';
const sh = (a) => { try { return x('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const rows = fs.readFileSync('vault/tickets/STATUS.md', 'utf8').split('\n').filter(l => /^\| EZD-/.test(l)).map(r => r.split('|').map(s => s.trim()));
const files = x('git', ['ls-files', '*.test.mjs', '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx', '*.e2e.ts', '*.test.js'], { encoding: 'utf8' }).split('\n').filter(Boolean);
let corpus = ''; for (const f of files) { try { corpus += fs.readFileSync(f, 'utf8') + '\n'; } catch {} }
const feats = sh(['log', 'develop', '--format=%h %s']).split('\n');
const out = [];
for (const c of rows) {
  const [, id, ph, , st, , , commit, , notes] = c; const p = Number(ph);
  if (!(p >= 0 && p <= 4)) continue; if (st !== 'done' && st !== 'blocked') continue;
  const sha = ((commit || '').match(/[0-9a-f]{7,40}/) || [''])[0];
  let anc = 'no-sha', subj = '';
  if (sha) { anc = sh(['merge-base', '--is-ancestor', sha, 'develop']) !== null ? 'yes' : (sh(['cat-file', '-t', sha]) ? 'not-ancestor' : 'missing'); subj = (sh(['log', '-1', '--format=%s', sha]) || '').slice(0, 70); }
  const feat = feats.find(l => (l.split(' ')[1] || '').startsWith(`feat(${id})`)) || '';
  const n = (corpus.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length;
  out.push([id, p, st, sha, anc, feat.split(' ')[0], n, /Deviation/i.test(notes || '') ? 'Y' : 'N', fs.existsSync(`vault/plans/${id}.md`) ? 'Y' : 'N', subj.replace(/,/g, ';')].join(','));
}
console.log('id,phase,status,sha,ancestor_of_develop,feat_commit_by_subject,test_file_mentions,notes_has_deviation,plan_exists,commit_subject');
console.log(out.join('\n'));
