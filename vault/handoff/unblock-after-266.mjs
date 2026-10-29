// After EZD-266 (K7 fix) is done, sets EZD-172 and EZD-253 back to ready: both are blocked only on the K7 failure
// (their STATUS notes: "Resume after EZD-266 merges", "Agent-fixable, not Josh"). Orchestrator 2026-10-29 under Q-0386.
// One-off; deleted by its own commit.
import fs from 'node:fs';
const S = 'vault/tickets/STATUS.md';
const st = fs.readFileSync(S, 'utf8').split('\n');
const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1);
const row = (id) => st.findIndex((l) => l.startsWith(`| ${id} |`));
if (cells(st[row('EZD-266')])[3].trim() !== 'done') throw new Error('EZD-266 not done');
for (const id of ['EZD-172', 'EZD-253']) {
  const j = row(id);
  const s = cells(st[j]);
  if (s[3].trim() !== 'blocked') throw new Error(`${id} status ${s[3]}`);
  s[3] = ' ready ';
  s[s.length - 1] = `${s[s.length - 1].trimEnd()} · 2026-10-29 orchestrator (Q-0386): EZD-266 is done, so ready again; resume as the note above says. `;
  st[j] = `|${s.join('|')}|`;
}
fs.writeFileSync(S, st.join('\n'));
console.log('EZD-172 and EZD-253 ready');
