// PreToolUse on Edit|Write|NotebookEdit: enforces who may write where (vault/PROCESS.md, Agents table).
import { readInput, repoRelative, deny } from './lib.mjs';

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

const rules = {
  orchestrator: () => {
    if (isSpec && rel !== 'vault/spec/decisions.md') return 'The spec is read-only. Only vault/spec/decisions.md may be appended (Josh\'s answers).';
    if (rel.startsWith('.claude/') || rel.startsWith('.github/') || rel.startsWith('scripts/') || rel.startsWith('vault/tools/'))
      return 'Agent config, hooks, CI and the gate script are changed only by Josh.';
    if (!isVault && rel !== 'CLAUDE.md' && rel !== 'docs/architecture.md')
      return 'The orchestrator does not write app code or tests. Dispatch test-author or builder.';
  },
  planner: () => {
    if (!rel.startsWith('vault/plans/'))
      return 'The planner writes only vault/plans/. Put questions in the plan\'s Open questions section; the orchestrator assigns Q-IDs.';
  },
  'test-author': () => {
    if (!isTest) return 'test-author writes only test files and fixtures.';
  },
  builder: () => {
    if (isTest) return 'The builder may not change tests or fixtures. If a test looks wrong, report it as a question.';
    if (isVault) return 'The builder does not write in vault/. Report questions to the orchestrator.';
    if (rel.startsWith('.claude/') || rel === 'CLAUDE.md' || rel === 'scripts/gate.mjs' || rel === '.github/workflows/ci.yml')
      return 'The builder may not change agent config, hooks, CLAUDE.md, the gate script or the gate workflow (.github/workflows/ci.yml). New workflow files are allowed.';
  },
  'ui-verifier': () => {
    if (!rel.startsWith('vault/plans/shots/')) return 'ui-verifier writes only screenshots in vault/plans/shots/.';
  },
};
const readOnly = ['code-reviewer', 'calc-auditor', 'security-reviewer', 'phase-auditor', 'Explore'];
if (readOnly.includes(agent)) deny(`${agent} is read-only.`);
rules['builder-senior'] = rules.builder; // same agent file with model: opus (vault/PROCESS.md, Agents)
const reason = rules[agent]?.();
if (reason) deny(reason);
process.exit(0);
