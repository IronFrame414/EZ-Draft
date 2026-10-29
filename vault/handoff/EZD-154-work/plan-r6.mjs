// Re-run 6 plan patch (Q-0418 (a)): node plan-r6.mjs <plan path>. Tightens the finished Re-run 1-5 step lists (their
// steps stay in the plan's git history; Blocks B3-B5, A3 and every sample stay) and adds Re-run 6, Block B6 and Samples B6.
import fs from 'node:fs';
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');
const lines = s.split('\n');
// Replace the whole line that starts with `start` (must be unique).
const line = (start, text) => {
  const hits = lines.flatMap((l, i) => (l.startsWith(start) ? [i] : []));
  if (hits.length !== 1) throw new Error(`line start not unique (${hits.length}): ${start}`);
  lines[hits[0]] = text;
};
const drop = (start) => line(start, '\u0000');

const R6 = fs.readFileSync(new URL('./plan-r6-section.md', import.meta.url), 'utf8').trimEnd();
line('**Re-run 3** (2026-10-27', `${R6}\n\n**Re-runs 3 to 5 (done; full steps in this plan's git history, last at \`8d6481e8\`).** Re-run 3 (2026-10-27; Q-0361 (b)): rebase onto develop \`85e3fdcd\`, Samples B3, Blocks A3 and B3, applied as \`246e6bce\`. Re-run 4 (2026-10-28; Q-0366 (b)): Samples B4, Block B4, KNOWN-LIMITS entry for the \`cd ~/.claude\` form, \`1aad6907\`. Re-run 5 (2026-10-28; Q-0407 (a) under Q-0386): Samples B5, Block B5, \`7424332b\`. Each: test-author appends its samples with the Edit tool, the orchestrator builds the work copy and the step 4 patch (guard-bash only after Re-run 3), the patch is applied in the worktree, then V3, gate and both reviewers. The planner is not dispatched for guard-hook work (classifier, as Q-0350).`);
for (const start of ['- R0 rebase:', '- R1 tests (test-author, Edit tool): in `stillAllowed`', '- R2 work copies:', '- V1 for Re-run 5', '- V1 for Re-run 4', '- V1 for Re-run 3', '- R3 patch (step 4 recipe, both files)', '**Re-run 4** (2026-10-28', '- R1 tests (test-author, Edit tool, worktree `246e6bce`)', '- R2 KNOWN-LIMITS (orchestrator): one entry', '- R3 patch: work copy = `246e6bce`', '**Re-run 5** (2026-10-28', '- R1 tests (test-author, Edit tool, worktree `1aad6907`)', '- R2 patch: work copy = `1aad6907`']) drop(start);
line('- **Re-run** (security review 2026-10-26', "- **Re-runs 1 and 2** (security reviews r1 and r2, 2026-10-26; Q-0350 (a)): Samples B appended (`chains` 10-17, `quoted` 9-43, `stillAllowed` 8-15), Block B, patches applied as `b5fca75` and later; full steps in this plan's git history.");
drop('- **Re-run 2** (security review r2');
// Section 4: Samples B6 after Samples B5; T6 and T8 counts.
const SB6 = fs.readFileSync(new URL('./plan-r6-samples.md', import.meta.url), 'utf8').trimEnd();
const b5 = lines.findIndex((l) => l.startsWith('**Samples B5**'));
if (b5 < 0) throw new Error('Samples B5');
lines.splice(b5 + 1, 0, '', SB6);
const T6 = lines.findIndex((l) => l.startsWith('| EZD-154 T6 '));
const T8 = lines.findIndex((l) => l.startsWith('| EZD-154 T8 '));
const counts = JSON.parse(fs.readFileSync(new URL('./plan-r6-counts.json', import.meta.url), 'utf8'));
const swap = (i, a, b) => { if (!lines[i].includes(a)) throw new Error(a); lines[i] = lines[i].replace(a, b); };
swap(T6, 'cmd in `stillAllowed` (25)', `cmd in \`stillAllowed\` (${counts.stillAllowed}; Samples B3-B6)`);
swap(T8, 'cmd in `builtPaths` (25; Samples B3, B4, B5)', `cmd in \`builtPaths\` (${counts.builtPaths}; Samples B3-B6)`);
fs.writeFileSync(file, lines.filter((l) => l !== '\u0000').join('\n'));
console.log(`${file}: ${fs.readFileSync(file, 'utf8').length} characters`);
