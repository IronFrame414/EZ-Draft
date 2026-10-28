# Phase 1 · for Josh (questions unit, 2026-10-28)

EZD-243, EZD-244, EZD-245 and EZD-246 are ready. EZD-247 to EZD-250 stay `questions` until you answer the seven decisions below. No agent could cite an answer: each is scope or a change to a file only you edit.

## 1. Decisions needed

**Q-0373 · EZD-247.** Three more lines are stale against what Vercel holds (runbook Supabase step 7; architecture `### Environment variables` paragraph; architecture `### Hosting` sentence pinned by `hosting.test.mjs` EZD-149 T2). Pick:
- (a) widen EZD-247 to fix them too (one more test; EZD-149's `ARCH_BULLET` updated; plan re-planned). **Recommended**: rule 17, no known issue is parked.
- (b) a new phase 1 fix ticket.
- (c) leave them.

**Q-0374 · EZD-248.** The guard keeps the builder from 11 files this ticket must change (`next_ticket.mjs`, `run.mjs`, two hooks, question files, four skill files). Pick:
- (a) a builder grant for exactly these files in the EZD-248 worktree, as EZD-244 to EZD-246 had. **Recommended**: same precedent, smallest, removed at merge.
- (b) the builder writes only `.githooks/` and `docs/`; the rest comes back as a patch you apply.
- (c) the orchestrator repairs the three rows on develop in fix mode first, then (a) or (b).

**Q-0375 · EZD-249.** The guard keeps the builder from `research.mjs`, `next_ticket.mjs`, `guard-paths.mjs`, `guard-bash.mjs`. Pick:
- (a) a builder grant for exactly these four files in the EZD-249 worktree. **Recommended**: same as Q-0374 (a).
- (b) the builder writes only `docs/architecture.md`; the rest is a patch you apply.

**Q-0376 · EZD-249.** A research report that no ticket owns (Q-0089, Q-0237) cannot pass the `ticket:` check. Pick:
- (a) `ticket:` may also hold a Q-ID; P5, T8 and both retriever files widened (one more test). **Recommended**: every report keeps a true owner.
- (b) ticket IDs only; the asker names the phase ticket the answer will change.
- (c) ticket IDs only; a question with no ticket gets `REPORT: no`. (The plan is written for (b) and (c).)

**Q-0377 · EZD-249.** A hand-edited `vault/research/INDEX.md` row turned the develop gate red once (INC2); the ticket's row does not cover it. Pick:
- (a) widen EZD-249: `check` also refuses a bad INDEX row, a repeated R-ID or an R-ID without its file (two more tests). **Recommended**: rule 18, closes the class.
- (b) a new phase 1 fix ticket.
- (c) leave INDEX to T8 alone.

**Q-0378 · EZD-250.** EZD-250's own builder grant must be in place before its build, and agents cannot send ntfy. Pick:
- (a) done already: the questions unit wrote `vault/handoff/EZD-250-grant.patch` (checked with `git apply --check`) and this escalation is your notice. To authorize, from the repo root: `git apply vault/handoff/EZD-250-grant.patch && git commit -m "chore(guard): grant EZD-250" -- .claude/hooks/guard-paths.mjs`. **Recommended.** (The patch is the plan's version; the plan's `grants.json` commit line does not apply yet because that file is built by EZD-250.)
- (b) you apply it in an interactive session (same command).
- (c) narrow the file list (the 11 Build-step paths: grants.json, guard-paths.mjs, grants.mjs, next_ticket.mjs, ledger-queue.mjs, launcher-idle.mjs, run.mjs, watchdog.mjs, install.mjs, repair/SKILL.md, PROCESS.md).
Note: this grant lets the builder edit the guard hook itself, in the EZD-250 worktree only.

**Q-0379 · EZD-250.** A phase PR waiting on its CI gate counts as a wait, so a PR whose CI went red waits for Josh. Pick:
- (a) keep it a wait; you are notified as today. **Recommended**: a repair unit on a red CI is a new behavior (adds a GitHub check to NT) and CI-red fixes touch main's PR.
- (b) start a repair unit once `gh` shows the gate failed.

**Edits only you make** (from the earlier list, if not done): EZD-243 phase-01 row and tickets.json (Scope item 4, a Done-when sentence, AC-EZD-243-4, EZD-003 dependency); `vault/PROCESS-EZDRAFT.md` line 99 (Q-0364 (a)).

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

Unchanged: Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, Q-0362 (confirm or override each).

## 3. Proposed wording

EZD-243: W7–W17, vault/plans/EZD-243.md section 6. EZD-247: W1–W4, vault/plans/EZD-247.md section 6. EZD-248, EZD-249: section 6 of their plans. EZD-250: W1–W4 (repair failed; repair needs Josh; guard grant ready; queued ledger edit not applied) and the watchdog alerts, vault/plans/EZD-250.md section 6.

## 4. Rule candidates

- **L-022** (builder, EZD-166): catch only the errors the plan names, no unlisted fallback. **Ratify**: CLAUDE.md rule 4; mechanically checkable.
- **L-023** (planner, EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it as a role holding execute. **Ratify**: closes the grants-vs-tests mismatch.
- **L-024** (planner, EZD-190): catalog tests check a rule plus a minimum list (`toContain`), never `toEqual` on a snapshot. **Ratify**: a dated snapshot broke the build.
- **L-025** (planner, EZD-244): a backfill covers the open-ticket set at build time; the plan gives the builder the deriving command. **Ratify**: a frozen list failed `--check`.
- **L-026** (planner, EZD-244): when a plan edits a file, grep `scripts/**/*.test.mjs` for its path; any hash or line-count pin becomes a structural-repair row. **Ratify**: it caused a plan gap.
- **L-027** (planner, EZD-244): when a ticket removes a pattern, grep every skill and process file and give each hit a replacement row. **Ratify**: the reviewer found two missed lines.

Left `candidate` (unattended run; no Q-ID rows written).
