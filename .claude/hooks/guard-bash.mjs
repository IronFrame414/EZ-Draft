// PreToolUse on Bash|PowerShell: backstop for the deny rules in settings.json.
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
  [/Remove-Item\b.*-Recurse/i, 'Recursive Remove-Item is not allowed.'],
  [/\bvercel\b.*(--prod\b|\bpromote\b)/, 'Production deploys are Josh\'s (merge to main).'],
  [/\b(npm|pnpm|yarn)\s+publish\b/, 'Publishing packages is not allowed.'],
  [/\bsupabase\b.*\b(db push|link)\b/, 'Remote database changes are Josh\'s. Use the local Supabase only.'],
  [/(cat|type|Get-Content|more|less)\s+[^|;&]*\.env(?!\.example)\b/i, 'Reading .env files is not allowed.'],
  [/\bgh\s+pr\s+merge\b/, 'Only Josh merges PRs.'],
];
for (const [re, why] of always) if (re.test(why.startsWith('Reading .env') ? raw : c)) deny(why);

const readOnly = ['code-reviewer', 'calc-auditor', 'security-reviewer', 'phase-auditor', 'Explore'];
if (readOnly.includes(agent)) {
  if (/\bgit\b[^;&|]*\b(commit|merge|rebase|cherry-pick|push|checkout|switch|stash|add|rm|mv|restore|branch -[dD])\b/.test(c))
    deny(`${agent} is read-only: git commands that change state are not allowed.`);
  if (/(^|[^>2&])>{1,2}(?!&)|\b(Set-Content|Out-File|Add-Content|New-Item|Move-Item|Copy-Item|mv|cp|rm|del|mkdir|touch|sed -i)\b/.test(c))
    deny(`${agent} is read-only: commands that write files are not allowed.`);
}
if (agent === 'builder' || agent === 'test-author') {
  if (/\bgit\b[^;&|]*\b(push|merge|rebase|checkout|switch|branch)\b/.test(c))
    deny(`${agent} commits in its worktree only; the orchestrator handles branches, merges and pushes.`);
}
process.exit(0);
