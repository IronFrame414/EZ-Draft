# Plan review · phase 56

Written by the launcher from the code-reviewer's final report (2026-11-09T17:33:45.833Z).

VERDICT: FAIL

1. **in-place, behavior.** `vault/plans/EZD-5601.md` §8 says "about 24 files … kept whole (Josh 2026-10-22; a split repeats the security review)". The build table (§1, steps 1–24) names about 33 non-test paths, and §4 adds about 19 test files. PROCESS.md:227 says a plan over about 20 files gets a split proposal. The Josh 2026-10-22 entry it cites raised that limit; it does not waive it. Fix: split it, e.g. 5601a (migrations, `key-crypto`, `key-check`, `user-key`, the routes, rewrap and env-check) and 5601b (`AiKeySection`, the dialog, the icon, the email text and the e2e test).
2. **in-place, behavior.** `vault/plans/EZD-5602.md` §9 counts its own files at 14 + 6 + 6 = 26 and stays whole with the same citation. Same rule. Fix: split, e.g. 5602a (`cost.ts`, `send-list.ts`, T1–T5) and 5602b (tables, functions, adapter, `callClaudeWithUserKey`, the route).
3. **in-place, behavior.** `vault/plans/EZD-5605.md` touches 18 build files (§1) plus about 17 test files (§4) and has no size line or split proposal. Fix: split, e.g. 5605a (`sendNow`, `applySavedEdit`, the `assistant` flag and event, Accept) and 5605b (routed store, Adjust, tools off, wiring). This fits with Q-0654 (a), since the seams have to be re-checked against the part plans anyway.
4. **in-place, minor.** EZD-5602 D-Run order (1): a thrown `AiKeyConfigError` maps to `error.ai_key_unavailable`. That line is from EZD-5601 §6: "Keys can't be saved right now. Nothing was saved." It would show in the Assistant panel after a prompt, which is the wrong context. Fix: map it to `error.assistant_unavailable`, or add a new key under Proposed wording.
5. **in-place, minor.** EZD-5602 D-Adapter says `AnthropicCallError` is "constructed as P5601 step 9 builds it". P5601 step 9 gives only `readonly errorClass` and no constructor signature. Fix: P5601 step 9 states the constructor, e.g. `(errorClass: AnthropicErrorClass)`.
6. **in-place, minor.** EZD-5605: step 4 names the `sendNow` options parameter `o`, but D-SendNow (7) calls `o.onSaved`. `onSaved` lives on OutboxSync's own options (`outbox-sync.ts:130,419`), not on that parameter. Fix: rename the parameter and say which object `onSaved` comes from.
7. **in-place, minor.** The EZD-5603 part a "wording" bullet and the EZD-5604 part b "wording" bullet both ask for "en and es keys for the board strings". Architecture Messages (`docs/architecture.md:450,454`) says `office` keys are English only, and `catalogFor('office','es')` throws. Fix: English only for `office.*`; Spanish only for `error.*`.
8. **defect (ledger), minor: wrong or missing dependencies.** Two dependencies are missing from `tickets.json` and STATUS:
   - EZD-5604 needs EZD-217: part a uses `deleteChanges` and `openingChange`, and EZD-217 does not come in through any other dependency.
   - EZD-5605 needs EZD-212 (seam S6, handles and Move); this also does not come in through any other dependency.

   Separately, STATUS.md:708 lists EZD-5602's dependencies as EZD-5601, EZD-021, EZD-204, while `tickets.json` and the phase file also list EZD-205a and EZD-294. Fix: orchestrator ledger commit.
9. **defect (ledger), minor.** EZD-5604 is a split proposal, but STATUS and TRACE show it as `planned`, so it looks ready to build. EZD-5603 and EZD-5604 have no lettered parts in the phase file or `tickets.json` yet (PROCESS.md:227; PROCESS-EZDRAFT ticket format). Fix: add 5603a/b and 5604a/b and set 5604's status to match, in one commit.
10. **note.** EZD-5601 T12 and T13 run about 8 key checks between them. If they share member M, the 5-per-15-minute throttle (T9) would turn later answers into 429. Fix: the plan says each row uses a fresh member, or clears `ai_key_attempt`.
11. **note.** EZD-204 is `blocked` (STATUS: its part plans are not in `tickets.json`). EZD-5602, EZD-5604a and EZD-211 all wait on it, so phase 56 cannot build until 204a and 204b exist.
12. **question (UI only; to Josh).** Q-0653: what the model picker shows after a prompt is sent with Opus. No source settles it.
13. **Settleable by an agent:**
    - Q-0651 → (a), following the Q-0644 (b) precedent.
    - Q-0652 → (a), 20 MiB = 20,971,520 bytes, following the Q-0514 precedent (`03-data-model.md:15`).
    - Q-0654 → (a).

    The orchestrator records these as answered-agent.

Checked and fine:
- Every AC of EZD-5601 (1–10), EZD-5602 (1–14) and EZD-5605 (1–8) has a test row.
- The AC maps for EZD-5603 and EZD-5604 cover every AC. The one gap is AC-EZD-5603-10's Accept/Adjust/Reject clause, which waits on Q-0651.
- 5602 T1 matches all eight rows of `09l`.
- The approved Assistant lines in 5602 §6 match `S03cAIAssistant-wording.md` word for word.
- The contracts from 5601 to 5602 to 5603 line up.
- Every plan has a `security-review` line, a complexity rating and its ACs.
- EZD-016a is listed in every plan with a visual checklist.

Re-dispatch to the planner: EZD-5601, EZD-5602, EZD-5605, EZD-5603, EZD-5604. Ledger fixes (orchestrator): findings 8 and 9.
