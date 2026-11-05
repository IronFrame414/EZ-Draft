// PreToolUse on Edit|Write|NotebookEdit: enforces who may write where (vault/PROCESS.md section 4 roster and section 14;
// project write limits in vault/PROCESS-EZDRAFT.md section 3).
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { readInput, repoRelative, canonicalPath, repoRoot, deny, projectDir, caseInsensitiveDisk, pathKey, pathIn, printableAscii } from './lib.mjs';

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
// the fault; the fix is committed with it and the handoff records it for Josh to confirm or revert. A launcher unit
// (EZD_UNIT_ID set by scripts/run.mjs) never gets fix mode, so an open fix can run beside the build (Josh 2026-11-02).
// EZD-333 (decision 2026-11-05 "Overseer repair unit"): the one exception is a repair unit, and only for a path the file lists
// under `## Paths`. A repair unit never writes a hard-limit path (scripts/launcher-idle.mjs repairForbidden, the list the
// launcher also checks after the repair), and no other launcher unit writes the fix-mode file.
const unitId = process.env.EZD_UNIT_ID || '';
const fixFile = `${projectDir()}/vault/handoff/LAUNCHER_FIX.md`;
const fixOpen = existsSync(fixFile);
let fixMode = !unitId && fixOpen;
let repairUnit = false;
if (/^repair-/.test(unitId)) {
  let lim;
  try {
    lim = await import(new URL('../../scripts/launcher-idle.mjs', import.meta.url).href);
  } catch (e) {
    deny(`${agent}: the repair unit's fix-mode limits could not load (${e?.message ?? e}); this write is refused (EZD-333).`);
  }
  repairUnit = lim.REPAIR_UNIT_RE.test(unitId);
  if (repairUnit) {
    const limit = lim.repairForbidden(key);
    if (limit) deny(`Repair unit: ${limit}. It goes in the overseer log as FAILED, never around the limit (EZD-333).`);
    let listed = [];
    try { listed = fixOpen ? lim.fixModePaths(readFileSync(fixFile, 'utf8')) : []; } catch {}
    fixMode = fixOpen && lim.fixListed(listed.map((p) => pathKey(p, fold)), key);
  }
}
if (unitId && !repairUnit && is('vault/handoff/LAUNCHER_FIX.md')) deny('Only an interactive session or the repair unit opens fix mode (vault/handoff/LAUNCHER_FIX.md; EZD-333).');

// Spec files the orchestrator may still write: decisions, the shared spec companions, and a section file that does not exist yet
// (a Stage 0 gap filled from Josh's answer). Existing section and screen files are read-only (rule 4).
const specWritable = ['vault/spec/glossary.md', 'vault/spec/non-goals.md', 'vault/spec/acceptance-criteria.md', 'vault/spec/READINESS.md', 'vault/spec/INDEX.md'];
function orchestratorSpecOk() {
  if (under('vault/spec/decisions/')) return true;
  if (specWritable.some(is)) return true;
  if (/^vault\/spec\/sections\/.+\.md$/.test(key) && !existsSync(`${projectDir()}/${rel}`)) return true;
  return false;
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
    if (!under('vault/plans/shots/') && !/^.*app\/e2e\/ui-[A-Za-z0-9-]+\.spec\.ts$/.test(key)) return 'ui-verifier writes only screenshots in vault/plans/shots/ and its spec app/e2e/ui-*.spec.ts.';
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
