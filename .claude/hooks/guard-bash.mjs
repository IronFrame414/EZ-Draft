// PreToolUse on Bash: backstop for the deny rules in settings.json (vault/PROCESS.md section 14, guard-bash).
import { readInput, deny } from './lib.mjs';

const input = readInput();
const agent = input.agent_type || 'orchestrator';
const cmd = String(input.tool_input?.command || '');
const raw = cmd.replace(/\s+/g, ' ');
// Quoted text (commit messages, echo strings) is ignored when matching commands.
const c = raw.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

const always = [
  [/\bgit\b[^;&|]*\bpush\b[^;&|]*(--force\b|-f\b|--force-with-lease|\+)/, 'Force push is not allowed.'],
  [/\bgit\b[^;&|]*\bpush\b[^;&|]*\b(main|master)\b/, 'Nobody pushes to main. Josh merges develop -> main through a PR.'],
  [/\bgit\b[^;&|]*\b(checkout|switch)\b[^;&|]*\bmain\b/, 'Do not check out main. Work on develop and ticket branches.'],
  [/\bgit\b[^;&|]*\breset\b[^;&|]*--hard/, 'git reset --hard is not allowed.'],
  [/\bgit\b[^;&|]*\bclean\b[^;&|]*-[a-z]*f/, 'git clean -f is not allowed.'],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, 'rm -rf is not allowed.'],
  [/\bvercel\b.*(--prod\b|\bpromote\b)/, 'Production deploys are Josh\'s (merge to main).'],
  [/\b(npm|pnpm|yarn)\s+publish\b/, 'Publishing packages is not allowed.'],
  [/\bsupabase\b.*\b(db push|link)\b/, 'Remote database changes are Josh\'s. Use the local Supabase only.'],
  [/(cat|type|more|less|head|tail|bat)\s+[^|;&]*\.env(?!\.example)\b/i, 'Reading .env files is not allowed.'],
  [/\bgh\s+pr\s+merge\b(?![^;&|]*--auto\b)/, 'Agents merge the phase PR only with --auto, so GitHub waits for the required gate check (Q-0261).'],
  [/\bpnpm\s+(run\s+)?release:|\bnode\s+\S*scripts[\\/]release[\\/]/, 'Release scripts are Josh\'s; agents never run them (EZD-023b).'],
  [/\bnode\s+\S*scripts[\\/](run|budget)\.mjs/, 'The launcher and the budget script are run by Josh, never from inside a session.'],
  [/(^|[;&|]\s*)claude(\s|$)/, 'Do not start claude from inside a session (no nested sessions; PROCESS.md rule 15). The launcher starts sessions.'],
];
for (const [re, why] of always) if (re.test(why.startsWith('Reading .env') ? raw : c)) deny(why);

// Token guard (Q-0135 (a), PA3 rule 8): an accident guard so a sign-in token is not printed into a transcript.
const KEYCHAIN_WHY = 'Printing a Keychain secret is not allowed (security with -w or -g, or dump-keychain -d). To check that an item exists, run security find-generic-password -s "<name>" without -w or -g (PA3 rule 8).';
for (const seg of raw.split(/[;&|]/)) {
  if (/\bsecurity\s+find-(generic|internet)-password\b[^;&|]*\s-(?=[A-Za-z]*[wg])[A-Za-z]+(\s|$)/.test(seg)) deny(KEYCHAIN_WHY);
  if (/\bsecurity\s+dump-keychain\b[^;&|]*\s-(?=[A-Za-z]*d)[A-Za-z]+(\s|$)/.test(seg)) deny(KEYCHAIN_WHY);
}
const noTests = raw
  .replace(/(^|\s)test\s+-f\s+(?:"[^"]*"|'[^']*'|\S+)/g, '$1')
  .replace(/\[\s+-f\s+(?:"[^"]*"|'[^']*'|\S+)\s+\]/g, '');
if (/\.credentials\.json|\.claude\/\.cred/.test(noTests)) deny('The Claude sign-in file is never read from the shell. Only test -f <path> or [ -f <path> ] may name it (PA3 rule 8).');

const readOnly = ['code-reviewer', 'calc-auditor', 'security-reviewer', 'phase-auditor', 'Explore'];
if (readOnly.includes(agent)) {
  if (/\bgit\b[^;&|]*\b(commit|merge|rebase|cherry-pick|push|checkout|switch|stash|add|rm|mv|restore|branch -[dD]|worktree)\b/.test(c))
    deny(`${agent} is read-only: git commands that change state are not allowed.`);
  if (/(^|[^>2&])>{1,2}(?!&)|\b(mv|cp|rm|mkdir|touch|sed -i|tee)\b/.test(c))
    deny(`${agent} is read-only: commands that write files are not allowed.`);
  if (/\b(pnpm|npm|npx|yarn)\s+(run\s+)?(build|test|typecheck|lint|dev|start)\b|\bnode\s+\S*scripts[\\/]gate\.mjs/.test(c) && agent !== 'phase-auditor')
    deny(`${agent} does not run builds, test suites or the gate; it reads the gate summary the orchestrator gives it. Running one test file is allowed with the runner's file argument.`);
}
if (agent === 'builder' || agent === 'test-author') {
  if (/\bgit\b[^;&|]*\b(push|merge|rebase|checkout|switch|branch|worktree)\b/.test(c))
    deny(`${agent} commits in its worktree only; the orchestrator handles branches, merges and pushes.`);
}
if (agent === 'ui-verifier') {
  if (/\b(pnpm|npm|npx|yarn)\s+(run\s+)?(build|test|typecheck|lint)\b|\bnode\s+\S*scripts[\\/]gate\.mjs/.test(c))
    deny('ui-verifier runs the app for screenshots only; it does not run builds, tests or the gate.');
}
process.exit(0);
