# Brief for session 6: Lean process implementation (Josh approved 2026-11-04)

Title the session "6 Lean process implementation". Josh approved vault/handoff/lean-process-proposal.md in session 5 ("Approve"). Evidence and per-rule verdicts: vault/research/lean-process-analysis-2026-11-04.md (sections 4 and 5). Implement exactly the proposal; nothing beyond it (CLAUDE.md rule 4).

## First message to Josh
Ask one yes/no: "May I pause the launcher with the STOP file (fix mode) for about 1-2 hours to make the rule and skill edits?" The STOP file and any launchd command need his yes in chat in this session (memory: ledger-edits-while-launcher-runs, tooling-edits-need-patch). Wait for running units to end before editing develop; their finish step commits all of vault/.

## Work, in order
1. **Fix mode:** write vault/handoff/LAUNCHER_FIX.md naming this change (PROCESS.md rule 19), create vault/handoff/STOP after Josh's yes, and wait until no `^claude -p ` unit runs.
2. **Decision record:** append a row to vault/spec/decisions/process.md: "Lean process, Josh 2026-11-04 (approved proposal vault/handoff/lean-process-proposal.md)", listing items 1-6 of its rule set.
3. **CLAUDE.md rules** (target: the Rules section about one page; keep rules 1-16 in substance):
   - Rule 17: app findings unchanged (fix in place up to ~30 lines, or a defect ticket at the front). Build-system and test-plumbing findings that did not fail the gate become one line in a tooling notes file (no severity, no deadline, never blocking a merge or phase gate). A finding that fails the gate is still a defect.
   - Rule 18: "close the whole class" applies to app security and data integrity only; for the agents' own accident guards (guard-bash, guard-paths), fix the case found and stop.
   - New: the build system is frozen. A new build-system ticket only if the launcher cannot run at all, or secrets or app data are exposed; each still needs Josh's yes.
   - New: build-system questions stop at the orchestrator (level 2) and never go to Josh. Josh's daily list is product, scope, wording, money and security only.
4. **PROCESS.md:** add a short section "Lean process (Josh 2026-11-04)" at the top of section 3 that overrides the rest. Edit in place only where text contradicts it:
   - section 3 rule 20 (findings)
   - section 6 (plan size caps H2 and the waiver questions dropped; keep "one fresh session per ticket" and the split guidance)
   - section 7 (the agent-answers-to-confirm list is limited to product, wording, money and security; rule candidates are no longer sent to Josh)
   - section 13 (lessons: agents ratify; Josh sees them in the phase PR)
   - section 2 tooling track (frozen)
   - PROCESS-EZDRAFT.md section 8 KEEP list: one line saying a classifier refusal sets the ticket aside and the launcher moves on
5. **Skills** (.claude/skills/*/SKILL.md):
   - plan-ticket: after the plan, run `node vault/tools/next_ticket.mjs --set-architecture <T>` (this caused 41 ledger failures).
   - build-ticket: findings follow the new rule 17 (tooling notes file), and one bookkeeping commit per unit.
   - questions: build-system questions are settled at level 2; the confirm list for Josh is limited as above; no rule-candidate section.
   - reviewer agent files, if they tag findings: the same four kinds, with tooling going to notes.
6. **Questions re-runs:** a questions unit ran three times in two minutes with no change (launcher.log 23:38-23:39, "changed nothing … (1 in a row)"). Find the cause in scripts/run.mjs / next_ticket.mjs. If the fix is a few lines, make it in fix mode; if not, put one line in the tooling notes file and tell Josh (the proposal promised no launcher code beyond small fixes).
7. **Tooling notes file:** create it. Move the open tooling rows of vault/debt.md into it as plain lines. App rows stay on debt.md under today's deadlines. D-015 and D-016 are each used twice; give the duplicates new IDs.
8. **The ten machine tickets** (analysis section 5). Use the ledger tools (scripts/ledger.mjs / next_ticket.mjs), never a hand edit of STATUS.md.
   - **EZD-279:** finish after EZD-330 lands.
   - **EZD-280:** re-validate against 279's globReach, with at most 2 review rounds.
   - **EZD-154:** shrink to Block A3 (remove the PA3 grant).
   - **EZD-265, 268, 269, 270, 271, 272, 274:** drop. Check what the ledger supports for dropping. STATUS has no "dropped" status, so either remove the entries or mark them blocked with the note "dropped: lean process, Josh 2026-11-04", whichever `--check` accepts.
   - Keep EZD-268's branch t/EZD-268 unmerged. Don't touch .claude/worktrees/EZD-279 or EZD-268 beyond what the 279 merge needs.
9. **Commit and finish:** commit by path, end fix mode (remove STOP and LAUNCHER_FIX.md), check that `next_ticket.mjs --check` passes and the launcher resumes. Update vault/handoff/CURRENT.md.

## Unchanged (do not touch)
Tests first, the builder never edits tests, the gate script, code, security and ui review, the phase audit and punch list, the secret-file guards, Josh's product decisions, lanes, budget gates, and the Q-0580 gate-lock defect at the front of the queue.

## Check after one week (put it in CURRENT.md)
Compare product merges per day (baseline 6.5) and Josh's questions per day (baseline about 25) against analysis section 1.

## If a guarded edit is refused
Build a patch under vault/handoff/ (`git diff --no-index`) and give Josh the one `git apply` command (memory: tooling-edits-need-patch).
