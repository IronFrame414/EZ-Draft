# Phase 56 (AI drawing assistant) — for Josh

Written 2026-11-09 by the questions unit.

## 1. Decisions needed

None. No design or user-interface question is left unsettled by a mockup, spec section or decision.

## 2. Agent answers to confirm

Confirm or override each.

| ID | Ticket | Answer | Source |
| --- | --- | --- | --- |
| Q-0652 | EZD-5603 | The photo limit "up to 20 MB" is 20,000,000 bytes (decimal). A 20,000,000-byte photo is accepted; 20,000,001 shows the approved too-big line (A5). Answered by phase-auditor. | Q-0512 (4 MB = 4,000,000 bytes); Q-0637; S03dSelectedObjects-wording.md:32 |
| Q-0653 | EZD-5603 | The model picker keeps the last pick (Sonnet 5.5 or Opus 5.5) for the rest of the page load. It starts on Sonnet 5.5 each time the editor opens, and the cost line under each reply shows what that prompt cost. Answered by phase-auditor. | Q-0474; S03c-ai-assistant.md:9; S03cAIAssistant-wording.md:9 |

Build-only answers (not for Josh): Q-0651 (the Accept, Adjust and Reject touch-target test sits in EZD-5604), Q-0654 (EZD-5605 is re-validated against the part plans at build time).

## 3. Proposed wording

Full tables are in the plans; every Spanish line is proposed, and lines marked approved quote the boards.

- **EZD-5601** (`vault/plans/EZD-5601.md` section 6, lines 143-154): the key errors (not a key, refused, out of credit, check failed, throttled, unavailable) and the two system emails (key added, key removed), in English and Spanish.
- **EZD-5602** (`vault/plans/EZD-5602.md` section 6, from line 126): the assistant errors (no key, key refused and out of credit as approved; busy, rate limited, provider rate limited, request refused, unavailable proposed), in English and Spanish.
- **EZD-5603** (`vault/plans/EZD-5603.md`, wording step line 84): waiting, loading, read-failure and network lines. The plan is a split proposal; the exact text is written in its part plans.
- **EZD-5604** (`vault/plans/EZD-5604.md`, wording step line 136): the stale-preview line, its action and each refusal line. The text is written in its part plans.
- **EZD-5605** (`vault/plans/EZD-5605.md` section 6, line 146): toast `office.assistant.accept_too_many`: "This change touches more than 100 objects, so it wasn't saved. Undo some adjustments, then Accept again."
