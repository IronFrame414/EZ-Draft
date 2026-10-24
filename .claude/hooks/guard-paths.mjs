// PreToolUse on Edit|Write|NotebookEdit: enforces who may write where (vault/PROCESS.md section 4 roster and section 14;
// project write limits in vault/PROCESS-EZDRAFT.md section 3).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readInput, repoRelative, deny, projectDir, norm } from './lib.mjs';

const input = readInput();
const agent = input.agent_type || 'orchestrator'; // main session = orchestrator
const file = input.tool_input?.file_path || input.tool_input?.notebook_path;
if (!file) process.exit(0);
const rel = repoRelative(file, input.cwd);

if (rel === null) deny(`${agent}: writing outside the repository is not allowed (${file}).`);

const isTest = /(^|\/)(tests?|e2e|__tests__|fixtures|__fixtures__|test-utils|test-harness)\//.test(rel)
  || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
  || /(^|\/)(vitest|playwright)(\.workspace)?(\.config)?\.[cm]?[jt]s$/.test(rel);
const isSpec = rel.startsWith('vault/spec/');
const isVault = rel.startsWith('vault/');
const isEnv = /(^|\/)\.env(\.|$)/.test(rel) && !rel.endsWith('.env.example');

if (isEnv) deny('No agent writes .env files. Put variable names in .env.example; Josh sets values.');

// Josh-only files (PROCESS.md sections 5, 11 and 14): sign-offs, budget, hold.
const joshOnly = ['vault/spec/SIGNOFF.md', 'vault/budget.json', 'vault/handoff/BUDGET_HOLD.md'];
if (joshOnly.includes(rel)) deny(`${rel} is written only by Josh (or scripts/budget.mjs). Agents never edit it.`);

// Fix mode (Q-0125 (a), Josh 2026-10-19; PROCESS.md section 3 rule 19): while vault/handoff/LAUNCHER_FIX.md exists the
// orchestrator may edit hooks, skills, scripts/, vault/tools/ and the process files to repair a broken run. The file names
// the fault; the fix is committed with it and the handoff records it for Josh to confirm or revert.
const fixMode = existsSync(`${projectDir()}/vault/handoff/LAUNCHER_FIX.md`);

// Spec files the orchestrator may still write: decisions, the shared spec companions, and a section file that does not exist yet
// (a Stage 0 gap filled from Josh's answer). Existing section and screen files are read-only (rule 4).
const specWritable = ['vault/spec/glossary.md', 'vault/spec/non-goals.md', 'vault/spec/acceptance-criteria.md', 'vault/spec/READINESS.md', 'vault/spec/INDEX.md'];
function orchestratorSpecOk() {
  if (rel.startsWith('vault/spec/decisions/')) return true;
  if (specWritable.includes(rel)) return true;
  if (/^vault\/spec\/sections\/.+\.md$/.test(rel) && !existsSync(`${projectDir()}/${rel}`)) return true;
  return false;
}

// PA3 builder grant (PA3-MECHANISMS.md rule 7; Q-0128 (a), 2026-10-19): in the EZD-000b..EZD-000j worktrees (EZD-000j added by Q-0138 (a)) the builder may
// edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files those tickets name. Tests, vault/PROCESS.md
// and vault/spec/ stay denied. The orchestrator removes this exception when EZD-000j merges.
const pa3Worktree = /\/\.claude\/worktrees\/EZD-000[b-j]\//.test(norm(path.resolve(norm(input.cwd) || projectDir(), norm(file))));
const pa3Vault = ['vault/research/', 'vault/tools/', 'vault/cost/usage.json', 'vault/cost/usage-raw-sample.json'];
function pa3Grant() {
  if (!pa3Worktree || isTest || isSpec || rel === 'vault/PROCESS.md' || rel === 'scripts/gate.mjs') return false;
  return rel.startsWith('.claude/') || rel === 'CLAUDE.md' || rel.startsWith('scripts/') || pa3Vault.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)));
}

// Retrievers write only their report files (vault/PROCESS.md section 4 roster; EZD-000f).
function retriever() {
  if (!rel.startsWith('vault/research/pending/')) return 'Retrievers write only research reports under vault/research/pending/ (vault/PROCESS.md section 4 roster).';
}

const rules = {
  orchestrator: () => {
    if (isSpec && !orchestratorSpecOk()) return 'The spec is read-only after sign-off. Record a change in vault/spec/decisions/<area>.md; a new section file is allowed only when it does not exist yet.';
    if (!fixMode && (rel.startsWith('.claude/') || rel.startsWith('.github/') || rel.startsWith('scripts/') || rel.startsWith('vault/tools/')))
      return 'Agent config, hooks, skills, CI, the gate script, the launcher and the ledger tool are changed only by Josh (propose the change in the handoff).';
    if (!fixMode && (rel === 'vault/PROCESS.md' || rel === 'vault/PROCESS-EZDRAFT.md')) return 'The process files change only with Josh\'s yes in chat; propose the change, do not edit.';
    if (rel === 'vault/PROGRESS.md' || rel === 'vault/tickets/TRACE.md') return 'Generated file: run node vault/tools/next_ticket.mjs --report instead of editing it.';
    const tooling = rel.startsWith('.claude/') || rel.startsWith('scripts/') || rel.startsWith('vault/tools/');
    if (!isVault && rel !== 'CLAUDE.md' && rel !== 'docs/architecture.md' && !(fixMode && tooling))
      return 'The orchestrator does not write app code or tests. Dispatch test-author or builder.';
  },
  planner: () => {
    if (!rel.startsWith('vault/plans/') || rel.startsWith('vault/plans/shots/'))
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
    // Q-0258, Josh 2026-10-23: scripts/backup/ is the builder's (backups, EZD-025). Q-0259, Josh 2026-10-23: scripts/auth/ is the builder's (captcha hand check, EZD-034).
    if ((rel.startsWith('.claude/') || rel === 'CLAUDE.md' || rel.startsWith('scripts/') || rel === '.github/workflows/ci.yml') && !rel.startsWith('scripts/conventions/') && !rel.startsWith('scripts/db/') && !rel.startsWith('scripts/email/') && !rel.startsWith('scripts/release/') && !rel.startsWith('scripts/perf/') && !rel.startsWith('scripts/backup/') && !rel.startsWith('scripts/auth/'))
      return 'The builder may not change agent config, hooks, CLAUDE.md, scripts/ (gate, launcher, budget; scripts/conventions/, scripts/db/, scripts/email/ and scripts/release/, scripts/perf/, scripts/backup/ and scripts/auth/ are allowed) or ci.yml. New workflow files under .github/workflows/ are allowed.';
  },
  'ui-verifier': () => {
    if (!rel.startsWith('vault/plans/shots/')) return 'ui-verifier writes only screenshots in vault/plans/shots/.';
  },
};
rules['retriever-digest'] = retriever;
rules['retriever-web'] = retriever;
const readOnly = ['code-reviewer', 'calc-auditor', 'security-reviewer', 'phase-auditor', 'Explore'];
if (readOnly.includes(agent)) deny(`${agent} is read-only.`);
const reason = rules[agent]?.();
if (reason) deny(reason);
if (!rules[agent]) deny(`${agent} is not in the roster (vault/PROCESS.md section 4); it may not write files.`);
process.exit(0);
