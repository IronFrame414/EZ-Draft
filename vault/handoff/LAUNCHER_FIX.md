# Fix mode: Stage 2 of the audit remediation

Opened 2026-11-01 by the orchestrator with Josh's yes in chat ("Yes, all of them"), Q-0125 (a).

- Fault: the build system needs the audit's Stage 2 fixes (~/Projects/ezdraft-audit/REMEDIATION-PLAN.md, Stage 2, with AUDIT-ADDENDUM.md sections 5, 8, 9 and 10) before it resumes: H7 CI, non-goals (H4), rules 17 and 18 (H2, D3), sandbox (H3, D4), records redesign (H1, D1, D2), test split (M5), cleanup (D10).
- Scope: one commit per remediation item on develop, each after a green gate, pushed. Deletions only where the plan lists them, each tagged first. CLAUDE.md and PROCESS.md edited only as Josh's decisions (vault/spec/decisions/process.md, 2026-11-01 rows) say.
- A stuck item (a guard or classifier refusal, a question for Josh, or two failed attempts) is skipped with its reason in vault/handoff/STAGE2-LOG.md, and the next independent item starts.
- vault/handoff/STOP stays in place; no unit runs until Josh says resume.
- This file is removed when Stage 2 is done; Josh confirms or reverts each commit (STAGE2-LOG.md lists them).

## 2026-11-04 (session 1, Josh confirms or reverts)

- Fault: a phase PR cannot auto-merge. main requires an up-to-date branch and takes merge commits only, so each phase PR leaves a commit develop does not have; PR 4 sat BEHIND on a1506abf. Fix: gate-phase step 6 merges origin/main first. The Stage 2 text above is finished history; STOP is not in place.
- Fault: tickets EZD-172, 262, 256, 251, 252, 174 (parallel lanes, Josh: "lets start multiple ticket builds at the same time") have parts only fix mode may write.
