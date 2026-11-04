# Questions ledger split in three (Josh 2026-10-28, option 1)

Done in the checkout (not committed): `vault/questions/QUESTIONS.md` now holds the 8 open and escalated rows,
`QUESTIONS-answered.md` the 233 answered rows the build still needs, `QUESTIONS-archive.md` the 127 it no longer needs.
All 368 rows are byte for byte the old rows, each Q-ID once, old order kept. `vault/README.md` names the three files.

Rule (option 1): an answered row goes to the archive only when its Phase / ticket cell starts with a phase number, names at
least one ticket and nothing else (no "all", "process", file, script, spec section or bare number), every ticket it names is
done, and no plan of an unfinished ticket and no phase file of an unfinished phase cites the Q-ID. Everything else answered
stays in `QUESTIONS-answered.md`.

## Patch for Josh: `vault/handoff/questions-split.patch`

Files agents may not edit: `vault/tools/next_ticket.mjs` (`--sort-questions`, the rule, `--check` guards, IDs and the loop
guard over all three files), `.claude/skills/questions/SKILL.md` and `.claude/skills/wrap/SKILL.md` (run
`--sort-questions`), `.claude/agents/planner.md` (reads the answered file), `CLAUDE.md` and `vault/PROCESS.md` (directory
rows, ledger description), `scripts/ledger/questions-flow.test.mjs` (new test; it fails on the old tool).

Apply from the repo root:

```bash
git apply vault/handoff/questions-split.patch && node vault/tools/next_ticket.mjs --sort-questions && node --input-type=module -e "import { questionsFingerprint as f } from './vault/tools/next_ticket.mjs'; import fs from 'node:fs'; const p = 'vault/handoff/.questions-last-run.json'; const j = JSON.parse(fs.readFileSync(p, 'utf8')); if (j.before === j.after) { j.before = j.after = f(); fs.writeFileSync(p, JSON.stringify(j)); console.log('guard fingerprint updated'); } else console.log('guard fingerprint: nothing to update');" && node vault/tools/next_ticket.mjs --check && node --test scripts/ledger/*.test.mjs
```

Expected: `QUESTIONS SORTED: 0 moved; open 8, answered 233, archive 127`, `LEDGER OK`, all ledger tests pass (26 on
2026-10-28). The fingerprint step matters only when the loop guard is set; it keeps a guarded questions unit from rerunning.

Until the patch is applied, nothing moves rows, and the highest Q-ID (Q-0368) is in `QUESTIONS.md`, so the old tool still
assigns new IDs correctly. Tickets EZD-244, EZD-245 and EZD-246 also edit `next_ticket.mjs`, the skills and `PROCESS.md`;
if one merges first and `git apply` refuses, the patch needs a rebase.
