// Re-run 6 over-block check: node replay-b6.mjs <old hook> <new hook> <transcript dir>...
// Feeds every Bash command found in the transcripts (*.jsonl) to both hooks, as orchestrator and builder, and prints the
// commands whose verdict differs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [oldHook, newHook, ...dirs] = process.argv.slice(2);
const cmds = new Set();
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.jsonl')) {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        if (!line.includes('"Bash"')) continue;
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        for (const c of j.message?.content || []) if (c?.type === 'tool_use' && c.name === 'Bash' && c.input?.command) cmds.add(c.input.command);
      }
    }
  }
};
for (const d of dirs) if (fs.existsSync(d)) walk(d);
const denied = (hook, cmd, agent) => {
  const input = { tool_input: { command: cmd } };
  if (agent) input.agent_type = agent;
  return spawnSync('node', [hook], { input: JSON.stringify(input), encoding: 'utf8' }).stdout.includes('"deny"');
};
const why = (hook, cmd, agent) => {
  const input = { tool_input: { command: cmd } };
  if (agent) input.agent_type = agent;
  const out = spawnSync('node', [hook], { input: JSON.stringify(input), encoding: 'utf8' }).stdout;
  return out ? `(${JSON.parse(out).hookSpecificOutput.permissionDecisionReason.slice(0, 40)})` : '';
};
let changed = 0;
for (const cmd of cmds) {
  for (const agent of [null, 'builder']) {
    const a = denied(oldHook, cmd, agent);
    const b = denied(newHook, cmd, agent);
    if (a !== b) { changed++; console.log(`${b ? "NEWLY DENIED" : "NEWLY ALLOWED"} [${agent || "orchestrator"}] ${why(newHook, cmd, agent)}: ${cmd.slice(0, 300).replace(/\n/g, '\\n')}`); break; }
  }
}
console.log(`commands ${cmds.size}, verdict changed ${changed}`);
