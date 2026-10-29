// EZD-260, EZD-261 and EZD-262 were added as `ready` with no plan; a build unit would start without one and stop the
// launcher. Sets them to `todo` so the launcher plans them first (2026-10-29 orchestrator). One-off; deleted after use.
import fs from 'node:fs';
const S = 'vault/tickets/STATUS.md';
const st = fs.readFileSync(S, 'utf8').split('\n');
const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1);
for (const id of ['EZD-260', 'EZD-261', 'EZD-262']) {
  if (fs.existsSync(`vault/plans/${id}.md`)) throw new Error(`${id} has a plan`);
  const j = st.findIndex((l) => l.startsWith(`| ${id} |`));
  const s = cells(st[j]);
  if (s[3].trim() !== 'ready') throw new Error(`${id} status ${s[3]}`);
  s[3] = ' todo ';
  s[s.length - 1] = `${s[s.length - 1].trimEnd()} · 2026-10-29 orchestrator: back to todo, it was set ready with no plan (a build would start without one). `;
  st[j] = `|${s.join('|')}|`;
}
fs.writeFileSync(S, st.join('\n'));
console.log('EZD-260, EZD-261, EZD-262 set to todo');
