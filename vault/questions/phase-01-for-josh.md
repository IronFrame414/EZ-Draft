# Phase 1 · for Josh (questions unit, 2026-10-28, fourth run)

Agents answered Q-0384 and Q-0385 (EZD-251). New fix ticket EZD-252 added. EZD-249 stays `questions` until you answer Q-0382; EZD-245 stays blocked on Q-0383. EZD-252 (plan lint OK, no open question) is now `ready`.

## 1. Decisions needed

**Q-0382 · EZD-249.** Your Q-0376 (a) widens the research-report `ticket:` line to allow a Q-ID. The brief text that says what goes in `FOR` also sits in both retriever agent files, `.claude/skills/build-ticket/dispatch.md` (lines 24, 28) and `vault/PROCESS.md` line 121, and tests pin it. Your Q-0375 grant covers only four tooling files. Pick:
- (a) add the two retriever files, `dispatch.md` and `PROCESS.md` to the EZD-249 builder grant and change the text in all four so the brief cannot drift. **Recommended**: rule 18, closes the class. The grant patch `vault/handoff/EZD-249-grant.patch` then gets those four paths added.
- (b) add only the two retriever files; `dispatch.md` and `PROCESS.md` keep naming a ticket only.
- (c) drop the text change; askers put a Q-ID in `FOR` without the files saying so.

**Q-0383 · EZD-245.** Your one-sentence fix (Q-0380 (a)) is in and the gate is green, but a fresh re-review found four small items: `findings.mjs categories` does not refuse a bad log file; `findings.mjs list` accepts a misspelled category and prints "no findings"; a note in `.claude/agents/planner.md` sits in the wrong place; `.claude/agents/plan-checker.md` line 25 conflicts with the new lesson-gap wording. Pick:
- (a) one more cycle in this ticket: planner settles items 2 and 4, test-author adds two tests, builder fixes all four, gate, re-review, merge. **Recommended**: rule 18, every command refuses bad input.
- (b) merge as is and fix in a new phase 1 ticket. EZD-246 depends on this ticket and edits the same files, so it would build on the defects.

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

- **Q-0384 · EZD-251.** (b) 10 runs of two full lane gates started together; a failure on any run is reported and the count restarts. Source: EZD-035.md line 99 (10 of 10 full runs); CLAUDE.md rules 16, 18. Confirm or override.
- **Q-0385 · EZD-251.** (a) a separate fix ticket, EZD-252, adds a check that fails a test file which writes `error_alert` rows without `holdErrorAlertLock`. Source: CLAUDE.md rules 4, 17, 18; Q-0281, Q-0283, Q-0290. Confirm or override.
- Unchanged: Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, Q-0362.

## 3. Proposed wording

EZD-243: W7–W17, vault/plans/EZD-243.md section 6. EZD-247: W1–W7, vault/plans/EZD-247.md section 6. EZD-248, EZD-249, EZD-251: section 6 of their plans. EZD-250: W1–W5 and the watchdog alerts, vault/plans/EZD-250.md section 6.

## 4. Rule candidates

- **L-022** (builder, EZD-166): catch only the errors the plan names, no unlisted fallback. **Ratify**: CLAUDE.md rule 4; mechanically checkable.
- **L-023** (planner, EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it as a role holding execute. **Ratify**: closes the grants-vs-tests mismatch.
- **L-024** (planner, EZD-190): catalog tests check a rule plus a minimum list (`toContain`), never `toEqual` on a snapshot. **Ratify**: a dated snapshot broke the build.
- **L-025** (planner, EZD-244): a backfill covers the open-ticket set at build time; the plan gives the builder the deriving command. **Ratify**: a frozen list failed `--check`.
- **L-026** (planner, EZD-244): when a plan edits a file, grep `scripts/**/*.test.mjs` for its path; any hash or line-count pin becomes a structural-repair row. **Ratify**: it caused a plan gap.
- **L-027** (planner, EZD-244): when a ticket removes a pattern, grep every skill and process file and give each hit a replacement row. **Ratify**: the reviewer found two missed lines.

Left `candidate` (unattended run; no Q-ID rows written).
