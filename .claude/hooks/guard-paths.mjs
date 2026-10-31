// PreToolUse on Edit|Write|NotebookEdit: enforces who may write where (vault/PROCESS.md section 4 roster and section 14;
// project write limits in vault/PROCESS-EZDRAFT.md section 3).
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { readInput, repoRelative, canonicalPath, repoRoot, deny, projectDir, caseInsensitiveDisk, pathKey, pathIn, grantFor, printableAscii } from './lib.mjs';

const input = readInput();
const agent = input.agent_type || 'orchestrator'; // main session = orchestrator
const file = input.tool_input?.file_path || input.tool_input?.notebook_path;
if (!file) process.exit(0);
const real = canonicalPath(file, input.cwd);
if (real === null) deny(`${agent}: writing to a path that cannot be resolved is not allowed (${file}).`);
const rel = repoRelative(file, input.cwd);

if (rel === null) deny(`${agent}: writing outside the repository is not allowed (${file}).`);
try {
  const st = lstatSync(real);
  if (st.isFile() && st.nlink > 1) deny(`${agent}: writing to a file that has more than one hard link is not allowed (${file}).`);
} catch (e) {
  if (e?.code !== 'ENOENT') deny(`${agent}: writing to a path that cannot be resolved is not allowed (${file}).`);
}
const fold = caseInsensitiveDisk(repoRoot());
const asSent = input.cwd ? [file, input.cwd] : [file];
if (fold && ![...asSent, rel, real].every((s) => printableAscii(s))) deny(`${agent}: writing to a path with a character outside plain ASCII is not allowed on a disk that ignores letter case (${file}).`);
const key = pathKey(rel, fold);
const realKey = pathKey(real, fold);
const is = (p) => key === pathKey(p, fold);
const under = (prefix) => key.startsWith(pathKey(prefix, fold));

const isTest = /(^|\/)(tests?|e2e|__tests__|fixtures|__fixtures__|test-utils|test-harness)\//.test(key)
  || /\.(test|spec)\.[cm]?[jt]sx?$/.test(key)
  || /(^|\/)(vitest|playwright)(\.workspace)?(\.config)?\.[cm]?[jt]s$/.test(key);
const isSpec = under('vault/spec/');
const isVault = under('vault/');
const isEnv = /(^|\/)\.env(\.|$)/.test(key) && !key.endsWith('.env.example');

if (isEnv) deny('No agent writes .env files. Put variable names in .env.example; Josh sets values.');

// Josh-only files (PROCESS.md sections 5, 11 and 14): sign-offs, budget, hold.
const joshOnly = ['vault/spec/SIGNOFF.md', 'vault/budget.json', 'vault/handoff/BUDGET_HOLD.md'];
if (joshOnly.some(is)) deny(`${rel} is written only by Josh (or scripts/budget.mjs). Agents never edit it.`);

// Fix mode (Q-0125 (a), Josh 2026-10-19; PROCESS.md section 3 rule 19): while vault/handoff/LAUNCHER_FIX.md exists the
// orchestrator may edit hooks, skills, scripts/, vault/tools/ and the process files to repair a broken run. The file names
// the fault; the fix is committed with it and the handoff records it for Josh to confirm or revert.
const fixMode = existsSync(`${projectDir()}/vault/handoff/LAUNCHER_FIX.md`);

// Spec files the orchestrator may still write: decisions, the shared spec companions, and a section file that does not exist yet
// (a Stage 0 gap filled from Josh's answer). Existing section and screen files are read-only (rule 4).
const specWritable = ['vault/spec/glossary.md', 'vault/spec/non-goals.md', 'vault/spec/acceptance-criteria.md', 'vault/spec/READINESS.md', 'vault/spec/INDEX.md'];
function orchestratorSpecOk() {
  if (under('vault/spec/decisions/')) return true;
  if (specWritable.some(is)) return true;
  if (/^vault\/spec\/sections\/.+\.md$/.test(key) && !existsSync(`${projectDir()}/${rel}`)) return true;
  return false;
}

// PA3 builder grant (PA3-MECHANISMS.md rule 7; Q-0128 (a), 2026-10-19): in the EZD-000b..EZD-000j worktrees (EZD-000j added by Q-0138 (a)) the builder may
// edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files those tickets name. Tests, vault/PROCESS.md
// and vault/spec/ stay denied. The orchestrator removes this exception when EZD-000j merges.
const pa3Worktree = (fold ? /\/\.claude\/worktrees\/ezd-000[b-j]\// : /\/\.claude\/worktrees\/EZD-000[b-j]\//).test(realKey);
const pa3Vault = ['vault/research/', 'vault/tools/', 'vault/cost/usage.json', 'vault/cost/usage-raw-sample.json'];
function pa3Grant() {
  if (!pa3Worktree || isTest || isSpec || is('vault/PROCESS.md') || is('scripts/gate.mjs')) return false;
  return under('.claude/') || is('CLAUDE.md') || under('scripts/') || pa3Vault.some((p) => is(p) || (p.endsWith('/') && under(p)));
}

// Retrievers write only their report files (vault/PROCESS.md section 4 roster; EZD-000f).
function retriever() {
  if (!under('vault/research/pending/')) return 'Retrievers write only research reports under vault/research/pending/ (vault/PROCESS.md section 4 roster).';
}

const rules = {
  orchestrator: () => {
    if (isSpec && !orchestratorSpecOk()) return 'The spec is read-only after sign-off. Record a change in vault/spec/decisions/<area>.md; a new section file is allowed only when it does not exist yet.';
    if (!fixMode && (under('.claude/') || under('.github/') || under('scripts/') || under('vault/tools/')))
      return 'Agent config, hooks, skills, CI, the gate script, the launcher and the ledger tool are changed only by Josh (propose the change in the handoff).';
    if (!fixMode && (is('vault/PROCESS.md') || is('vault/PROCESS-EZDRAFT.md'))) return 'The process files change only with Josh\'s yes in chat; propose the change, do not edit.';
    if (is('vault/PROGRESS.md') || is('vault/tickets/TRACE.md')) return 'Generated file: run node vault/tools/next_ticket.mjs --report instead of editing it.';
    const tooling = under('.claude/') || under('scripts/') || under('vault/tools/');
    if (!isVault && !is('CLAUDE.md') && !is('docs/architecture.md') && !(fixMode && tooling))
      return 'The orchestrator does not write app code or tests. Dispatch test-author or builder.';
  },
  planner: () => {
    if (!under('vault/plans/') || under('vault/plans/shots/'))
      return 'The planner writes only vault/plans/<ticket>.md. Put questions in the plan\'s Open questions section; the orchestrator assigns Q-IDs.';
  },
  'test-author': () => {
    if (!isTest) return 'test-author writes only test files, fixtures, test configs, test-utils/ and test-harness/.';
  },
  builder: () => {
    if (isTest) return 'The builder may not change tests or fixtures. If a test looks wrong, report it as a question.';
    if (pa3Grant()) return;
    if (isVault) return 'The builder does not write in vault/. Report questions to the orchestrator.';
    // Q-0124 (a), Josh 2026-10-19: scripts/conventions/ is the builder's (the conventions check, EZD-000 and later).
    // Q-0148 / Q-0125 (a), orchestrator 2026-10-19: scripts/db/ is the builder's (local Supabase and types scripts, EZD-004a and later).
    // Q-0153 / Q-0125 (a), orchestrator 2026-10-19: scripts/email/ is the builder's (the live email check, EZD-008b and later).
    // Q-0125 (a), orchestrator 2026-10-19: scripts/release/ is the builder's (the migration release check, EZD-023a and later).
    // Q-0247 / Q-0125 (a), orchestrator 2026-10-22: scripts/perf/ is the builder's (the performance check, EZD-017 and later).
    // Q-0125 (a), EZD-149: scripts/hosting/ is the builder's (the live hosting check)
    // Q-0258, Josh 2026-10-23: scripts/backup/ is the builder's (backups, EZD-025). Q-0259, Josh 2026-10-23: scripts/auth/ is the builder's (captcha hand check, EZD-034).
    if ((under('.claude/') || is('CLAUDE.md') || under('scripts/') || is('.github/workflows/ci.yml')) && !under('scripts/conventions/') && !under('scripts/db/') && !under('scripts/email/') && !under('scripts/release/') && !under('scripts/perf/') && !under('scripts/backup/') && !under('scripts/auth/') && !under('scripts/hosting/'))
      return 'The builder may not change agent config, hooks, CLAUDE.md, scripts/ (gate, launcher, budget; scripts/conventions/, scripts/db/, scripts/email/ and scripts/release/, scripts/perf/, scripts/backup/, scripts/auth/ and scripts/hosting/ are allowed) or ci.yml. New workflow files under .github/workflows/ are allowed.';
  },
  'ui-verifier': () => {
    if (!under('vault/plans/shots/')) return 'ui-verifier writes only screenshots in vault/plans/shots/.';
  },
};
rules['retriever-digest'] = retriever;
rules['retriever-web'] = retriever;
const readOnly = ['code-reviewer', 'calc-auditor', 'security-reviewer', 'phase-auditor', 'Explore'];
if (readOnly.includes(agent)) deny(`${agent} is read-only.`);
// Builder grants (Josh 2026-10-27: "you have permission to perform everything needed for this list"): the builder of a
// ticket listed here may write exactly these files in its own worktree. Tests stay denied. The orchestrator removes a
// ticket's entry after it merges.
const AGENTS = (names) => names.map((n) => `.claude/agents/${n}.md`);
const usageFixFiles = {
  'EZD-245': ['vault/tools/findings.mjs', 'vault/tools/next_ticket.mjs', 'vault/lessons/INDEX.md', '.claude/skills/build-ticket/SKILL.md',
    '.claude/skills/build-ticket/dispatch.md', '.claude/skills/plan-ticket/SKILL.md', '.claude/skills/wrap/SKILL.md', ...AGENTS(['planner', 'plan-checker']), 'vault/PROCESS.md'],
  'EZD-246': ['vault/tools/next_ticket.mjs', '.claude/skills/build-ticket/SKILL.md', '.claude/skills/build-ticket/dispatch.md',
    ...AGENTS(['code-reviewer', 'security-reviewer']), 'vault/PROCESS.md'],
  'EZD-248': ['vault/tools/next_ticket.mjs', '.claude/hooks/session-start.mjs', '.claude/hooks/guard-bash.mjs', 'scripts/run.mjs', 'vault/questions/QUESTIONS-answered.md',
    'vault/questions/QUESTIONS-archive.md', '.claude/skills/questions/SKILL.md', '.claude/skills/plan-ticket/SKILL.md', '.claude/skills/build-ticket/SKILL.md', '.claude/skills/spec-check/SKILL.md'],
  'EZD-249': ['vault/tools/research.mjs', 'vault/tools/next_ticket.mjs', '.claude/hooks/guard-paths.mjs', '.claude/hooks/guard-bash.mjs',
    '.claude/agents/retriever-web.md', '.claude/agents/retriever-digest.md', '.claude/skills/build-ticket/dispatch.md', 'vault/PROCESS.md'],
};
// The ticket of the worktree the file really is in: a prefix match of the canonical path on <canonical project dir>/.claude/worktrees/<T>/
// (EZD-250 D1; EZD-260), so a link inside a worktree to the main checkout gets no grant.
const worktreesPrefix = `${repoRoot()}/.claude/worktrees/`;
const usageFixTicket = realKey.startsWith(pathKey(worktreesPrefix, fold)) ? (fold ? /^(ezd-\d+[a-z]?)\// : /^(EZD-\d+[a-z]?)\//).exec(realKey.slice(pathKey(worktreesPrefix, fold).length))?.[1] : undefined;
const fixPaths = usageFixTicket ? grantFor(usageFixFiles, usageFixTicket, fold) : null;
if (agent === 'builder' && fixPaths && !isTest && pathIn(fixPaths, rel, fold)) process.exit(0);
// Builder grants from .claude/hooks/grants.json (EZD-250 D1): ticket ID → the exact paths its builder may write in its own
// worktree; the launcher writes them from the ticket's approved plan (EZD-267); Josh applies a patch only for a plan that is not approved. Read on every call. Unreadable, invalid JSON or not a plain
// object grants nothing; a value that is not a list of strings grants nothing for that ticket (fail closed).
function fileGrants() {
  try {
    const g = JSON.parse(readFileSync(`${projectDir()}/.claude/hooks/grants.json`, 'utf8'));
    return g !== null && typeof g === 'object' && Object.getPrototypeOf(g) === Object.prototype ? g : null;
  } catch {
    return null;
  }
}
if (agent === 'builder' && usageFixTicket && !isTest) {
  const paths = grantFor(fileGrants(), usageFixTicket, fold);
  if (paths && pathIn(paths, rel, fold)) process.exit(0);
}
const reason = rules[agent]?.();
if (reason) deny(reason);
if (!rules[agent]) deny(`${agent} is not in the roster (vault/PROCESS.md section 4); it may not write files.`);
process.exit(0);
