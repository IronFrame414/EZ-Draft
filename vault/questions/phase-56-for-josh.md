# Phase 56 (AI drawing assistant) — for Josh

Updated 2026-11-09 by the questions unit.

## 1. Decisions needed

None. No design or user-interface question is left that a mockup, spec section or decision cannot settle.

## 2. Agent answers to confirm

Confirm or override each.

| ID | Ticket | Answer | Source |
| --- | --- | --- | --- |
| Q-0652 | EZD-5603 | The photo limit "up to 20 MB" is 20,000,000 bytes (decimal). A 20,000,000-byte photo is accepted; 20,000,001 shows the approved too-big line (A5). Answered by phase-auditor. | Q-0512; Q-0637; S03dSelectedObjects-wording.md:32 |
| Q-0653 | EZD-5603 | The model picker keeps the last pick (Sonnet 5.5 or Opus 5.5) for the rest of the page load. It starts on Sonnet 5.5 each time the editor opens; the cost line under each reply shows what that prompt cost. Answered by phase-auditor. | Q-0474; S03c-ai-assistant.md:9; S03cAIAssistant-wording.md:9 |
| Q-0655 | EZD-5603a | The prompt bubble's 4 px tail corner is kept as drawn, with a board-cited `--ez-radius-4` exception token (the same way you approved the 6 px tooltip radius). Answered by orchestrator. | Q-0040 (c); S03cAIAssistant board |
| Q-0656 | EZD-5603a | The model list heading reads "Model · pick per prompt" as drawn on the board (the wording list's "Pick per prompt" is part of it). Answered by orchestrator. | mockups/INDEX.md:73; S03cAIAssistant-wording.md:9 |
| Q-0660 | EZD-5603b | Phones' HEIC photos are converted in the browser with the open-source library heic-to (LGPL-3.0 licence), unmodified, loaded only when a HEIC photo is attached, with its licence text served at `/licenses/heic-to.txt`. Without it HEIC would not convert on Windows and Android. Any later change to it re-checks the licence. Answered by phase-auditor. | Q-0637; docs/architecture.md:362, 429 |
| Q-0662 | EZD-5604b | While a preview is stale (the drawing changed after it was made), the canvas stops drawing the preview lines, chips and legend; the stale line and its button show instead. No board draws this state. Answered by orchestrator. | Q-0637; Q-0640 |
| Q-0663 | EZD-5604b | The legend swatches keep the board's 3 px corner, with a board-cited `--ez-radius-3` exception token. Answered by orchestrator. | Q-0040 (c); S03cAIAssistant board |

Build-only answers (not for Josh): Q-0651, Q-0654, Q-0661 (the HEIC test file comes from a public-domain sample recorded in `SOURCE.md`).

## 3. Proposed wording

Full tables are in the plans; every Spanish line is proposed, and lines marked approved quote the boards.

- **EZD-5601** (`vault/plans/EZD-5601.md` section 6): the key errors (not a key, refused, out of credit, check failed, throttled, unavailable) and the two system emails (key added, key removed), in English and Spanish.
- **EZD-5602** (`vault/plans/EZD-5602.md` section 6): the assistant errors (no key, key refused and out of credit as approved; busy, rate limited, provider rate limited, request refused, unavailable, drawing too large, invalid reply proposed), in English and Spanish.
- **EZD-5603a** (`vault/plans/EZD-5603a.md` section 6): "Waiting for the answer…"; "Couldn't send your prompt. It's still in the box. Send again."; "Couldn't check your Anthropic key."
- **EZD-5603b** (`vault/plans/EZD-5603b.md` section 6): "EZ Draft couldn't read that photo. Attach another one."; server line "EZ Draft couldn't read that photo, so nothing was sent. Attach another one." (Spanish needs your confirm, Q-0030 (a)); "Preparing the photo…"; "Attached photo"; "{size} MB".
- **EZD-5604a**: none.
- **EZD-5604b** (`vault/plans/EZD-5604b.md` section 6): "The assistant's change doesn't fit the drawing. Nothing on the drawing changed. Try wording the prompt another way."; "The drawing changed after this preview was made, so it can't be accepted."; button "Put the prompt back".
- **EZD-5605** (`vault/plans/EZD-5605.md` section 6): toast `office.assistant.accept_too_many`: "This change touches more than 100 objects, so it wasn't saved. Undo some adjustments, then Accept again."
