// PreToolUse on Agent|Task: only the planner, code-reviewer, security-reviewer and phase-auditor may start an agent, and only a
// retriever, and the planner also plan-checker (token diet, Josh 2026-10-22); the main session may start any (vault/PROCESS.md
// section 3 rule 15; EZD-000f). Unreadable input allows, like guard-paths.mjs.
import { readInput, deny } from './lib.mjs';

const DISPATCHERS = ['planner', 'code-reviewer', 'security-reviewer', 'phase-auditor'];
const RETRIEVERS = ['retriever-digest', 'retriever-web'];

const input = readInput();
if (input.tool_name !== 'Agent' && input.tool_name !== 'Task') process.exit(0);
const caller = input.agent_type;
if (!caller) process.exit(0);
const target = input.tool_input?.subagent_type;
if (!DISPATCHERS.includes(caller))
  deny(`${caller} may not start other agents. Only the planner, code-reviewer, security-reviewer and phase-auditor may, and only retriever-digest or retriever-web (vault/PROCESS.md section 3 rule 15).`);
if (caller === 'planner' && target === 'plan-checker') process.exit(0);
if (!RETRIEVERS.includes(target))
  deny(`${caller} may start only retriever-digest or retriever-web, not ${target || 'an agent with no subagent_type'} (vault/PROCESS.md section 3 rule 15).`);
process.exit(0);
