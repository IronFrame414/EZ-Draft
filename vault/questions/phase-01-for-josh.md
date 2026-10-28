# Phase 1 · for Josh (questions unit, 2026-10-28, second run)

Your answers to Q-0373 to Q-0380 are recorded. EZD-247, EZD-248 and EZD-250 are re-planned and ready (with EZD-243 to EZD-246). EZD-249 stays `questions` until you answer Q-0382. EZD-172 stays blocked on Q-0381.

## 1. Decisions needed

**Q-0382 · EZD-249.** Your Q-0376 (a) widens the research-report `ticket:` line to allow a Q-ID. The brief text that says what goes in `FOR` also sits in both retriever agent files, `.claude/skills/build-ticket/dispatch.md` (lines 24, 28) and `vault/PROCESS.md` line 121, and tests pin it. Your Q-0375 grant covers only four tooling files. Pick:
- (a) add the two retriever files, `dispatch.md` and `PROCESS.md` to the EZD-249 builder grant, and change the text in all four so the brief cannot drift. **Recommended**: rule 18, closes the class. The grant patch `vault/handoff/EZD-249-grant.patch` then gets those four paths added.
- (b) add only the two retriever files; `dispatch.md` and `PROCESS.md` keep naming a ticket only.
- (c) drop the text change; askers put a Q-ID in `FOR` without the files saying so.

**Q-0381 · EZD-172.** Round 6 is green but both reviewers FAILED it on small items (an empty-lock-file window in the gate lock; two slips of mine; two out-of-date architecture lines). Pick: (a) round 7, only these items (**recommended**); (b) merge now and fix later (rule 17 forbids it for a lock defect); (c) drop the ticket. Also noted: EZD-181 T3 is a timing race in develop's test and needs its own phase 1 fix ticket (orchestrator adds it in fix mode).

**Edits only you make** (if not done): EZD-243 phase-01 row and tickets.json (Scope item 4, a Done-when sentence, AC-EZD-243-4, EZD-003 dependency); `vault/PROCESS-EZDRAFT.md` line 99 (Q-0364 (a)); EZD-247's row Scope and ACs still name only the first four places (plan files T6 under AC-EZD-247-2). Apply `vault/handoff/EZD-249-grant.patch` only after Q-0382 is answered. After EZD-250 merges, rerun `node scripts/launchd/install.mjs install` once.

(Q-0089 and Q-0237 stay escalated; not phase 1.)

## 2. Agent answers to confirm

Unchanged: Q-0232, Q-0266, Q-0269, Q-0277, Q-0279, Q-0280, Q-0281, Q-0282, Q-0362 (confirm or override each).

## 3. Proposed wording

EZD-243: W7–W17, vault/plans/EZD-243.md section 6. EZD-247: W1–W7, vault/plans/EZD-247.md section 6. EZD-248, EZD-249: section 6 of their plans. EZD-250: W1–W5 (W5 is the CI-red repair) and the watchdog alerts, vault/plans/EZD-250.md section 6.

## 4. Rule candidates

- **L-022** (builder, EZD-166): catch only the errors the plan names, no unlisted fallback. **Ratify**: CLAUDE.md rule 4; mechanically checkable.
- **L-023** (planner, EZD-190): a plan adding a `private` function lists its `PRIVATE_EXECUTE` entry and tests it as a role holding execute. **Ratify**: closes the grants-vs-tests mismatch.
- **L-024** (planner, EZD-190): catalog tests check a rule plus a minimum list (`toContain`), never `toEqual` on a snapshot. **Ratify**: a dated snapshot broke the build.
- **L-025** (planner, EZD-244): a backfill covers the open-ticket set at build time; the plan gives the builder the deriving command. **Ratify**: a frozen list failed `--check`.
- **L-026** (planner, EZD-244): when a plan edits a file, grep `scripts/**/*.test.mjs` for its path; any hash or line-count pin becomes a structural-repair row. **Ratify**: it caused a plan gap.
- **L-027** (planner, EZD-244): when a ticket removes a pattern, grep every skill and process file and give each hit a replacement row. **Ratify**: the reviewer found two missed lines.

Left `candidate` (unattended run; no Q-ID rows written).
