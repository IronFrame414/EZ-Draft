# Phase 1 · for Josh (questions unit, 2026-10-28, sixth run)

EZD-253 is `ready`. Nothing new is waiting for a decision.

## 1. Decisions needed

None.

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

- **Q-0384 · EZD-251.** (b) 10 runs of two full lane gates started together; a failure on any run is reported and the count restarts. Source: EZD-035.md line 99 (10 of 10 full runs); CLAUDE.md rules 16, 18. Confirm or override.
- **Q-0385 · EZD-251.** (a) a separate fix ticket, EZD-252, adds a check that fails a test file which writes `error_alert` rows without `holdErrorAlertLock`. Source: CLAUDE.md rules 4, 17, 18; Q-0281, Q-0283, Q-0290. Confirm or override.
- **Q-0387 · EZD-253.** (a) EZD-250 added to EZD-253's dependencies (tickets.json, phase row, STATUS), so the build waits for the grant tool and launcher lines EZD-250 supplies. Source: vault/plans/EZD-253.md section 9; CLAUDE.md rules 4, 18. Confirm or override.
- **Q-0388 · EZD-253.** (a) all planning-stage units (plan, plan-review, questions) of any signed-off phase run before the current phase's remaining builds. Source: your EZD-253 row ("planned ... while the current phase still builds"); Q-0129. Confirm or override.
- Unchanged: Q-0384, Q-0385, Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, Q-0362.

## 3. Proposed wording

EZD-243: W7–W17, vault/plans/EZD-243.md section 6. EZD-247: W1–W7, vault/plans/EZD-247.md section 6. EZD-248, EZD-249, EZD-251: section 6 of their plans. EZD-250: W1–W5 and the watchdog alerts, vault/plans/EZD-250.md section 6. EZD-253: the three lines in vault/plans/EZD-253.md section 6.

## 4. Rule candidates

- **L-022** (builder, EZD-166): catch only the errors the plan names, no unlisted fallback. **Ratify**: CLAUDE.md rule 4; mechanically checkable.
- **L-023** (planner, EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it as a role holding execute. **Ratify**: closes the grants-vs-tests mismatch.
- **L-024** (planner, EZD-190): catalog tests check a rule plus a minimum list (`toContain`), never `toEqual` on a snapshot. **Ratify**: a dated snapshot broke the build.
- **L-025** (planner, EZD-244): a backfill covers the open-ticket set at build time; the plan gives the builder the deriving command. **Ratify**: a frozen list failed `--check`.
- **L-026** (planner, EZD-244): when a plan edits a file, grep `scripts/**/*.test.mjs` for its path; any hash or line-count pin becomes a structural-repair row. **Ratify**: it caused a plan gap.
- **L-027** (planner, EZD-244): when a ticket removes a pattern, grep every skill and process file and give each hit a replacement row. **Ratify**: the reviewer found two missed lines.

Left `candidate` (unattended run; no Q-ID rows written).
