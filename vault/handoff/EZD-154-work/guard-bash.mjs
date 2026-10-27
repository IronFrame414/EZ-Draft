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
// Segments split at ; & | only outside every quote ('…', "…", $'…'), substitution or group ($( ), ( ), <( ), >( ), =( ), `…`,
// ${ }, $[ ]) and redirection (>& <& &> >|). A backslash outside single quotes escapes the next character; { nests inside ${ }
// and [ inside $[ ] (zsh). An unclosed quote or substitution, or a ) that closes nothing, makes the whole command one segment
// (fail closed): where bash and zsh read a command differently, the reading with fewer splits wins (EZD-154; Q-0350 (a)).
const PAIR = { '(': ')', '{': '}', '[': ']' };
function segments(s) {
  const out = [];
  const open = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const two = s.slice(i, i + 2);
    const top = open[open.length - 1];
    if (top === "'") { cur += ch; if (ch === "'") open.pop(); continue; }
    if (ch === '\\' && i + 1 < s.length) { cur += two; i++; continue; }
    if (top === "$'" || top === '`') { cur += ch; if (ch === top.slice(-1)) open.pop(); continue; }
    if (two === '$(' || two === '${' || two === '$[') { open.push(PAIR[two[1]]); cur += two; i++; continue; }
    if (ch === '`') { open.push('`'); cur += ch; continue; }
    if (top === '"') { cur += ch; if (ch === '"') open.pop(); continue; }
    if (two === "$'") { open.push("$'"); cur += two; i++; continue; }
    if (ch === "'" || ch === '"') { open.push(ch); cur += ch; continue; }
    if (ch === '(' || (PAIR[ch] && top === PAIR[ch])) { open.push(PAIR[ch]); cur += ch; continue; }
    if (top && ch === top) { open.pop(); cur += ch; continue; }
    if (ch === ')' && !top) return [s];
    const redirect = (ch === '&' && (s[i - 1] === '>' || s[i - 1] === '<' || s[i + 1] === '>')) || (ch === '|' && s[i - 1] === '>');
    if (!top && !redirect && (ch === ';' || ch === '&' || ch === '|')) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (open.length) return [s];
  out.push(cur);
  return out;
}
// Quote marks and backslashes are dropped before matching, so a quoted or escaped option or file name is still seen (EZD-154).
const unquote = (s) => s.replace(/["'\\]/g, '');
// An option group containing w or g (dump-keychain: d) is caught whatever follows it: a space, the end, ) ` > < ; & | (EZD-154; Q-0135 (a)).
for (const seg of segments(raw)) {
  const s = unquote(seg);
  if (/\bsecurity\s+find-(generic|internet)-password\b.*\s-[A-Za-z]*[wg]/.test(s)) deny(KEYCHAIN_WHY);
  if (/\bsecurity\s+dump-keychain\b.*\s-[A-Za-z]*d/.test(s)) deny(KEYCHAIN_WHY);
}
// The test -f and [ -f ] exemption covers one path token: a single-quoted string, or a double-quoted or unquoted one whose only
// expansions are $NAME and ${NAME} (no $( ), backtick, backslash or other $ form), followed by a space or the end (test -f) or
// by ] (bracket form) (EZD-154; EZD-000i K3).
const PATH = /(?:'[^']*'|"(?:[^"\\$`]|\$[A-Za-z_]|\$\{[A-Za-z_]\w*\})*"|(?:[^\s;&|<>()`'"\\$]|\$[A-Za-z_]|\$\{[A-Za-z_]\w*\})+)/.source;
const stripped = unquote(raw
  .replace(new RegExp(String.raw`(^|\s)test\s+-f\s+${PATH}(?=\s|$)`, 'g'), '$1')
  .replace(new RegExp(String.raw`\[\s+-f\s+${PATH}\s+\]`, 'g'), ''));
// Beside a removed path token only echo of plain words may run, so nothing can reuse the path ($_, !$, fc, a substitution) (EZD-154).
const echoOnly = segments(stripped).every((seg) => /^\s*(echo(\s+[\w.,:\/+=-]+)*)?\s*$/.test(seg));
const noTests = echoOnly ? stripped : unquote(raw);
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
