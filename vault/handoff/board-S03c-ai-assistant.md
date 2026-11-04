# Board brief · S03c AI assistant and S01g My profile: AI assistant (for a Cowork session)

Josh, 2026-11-04 (spec-check 4, Q-0474): the AI window gets a board, approved before its phase is planned. Phase 4 does not wait for it.

## What to draw

Boards on the EZ Draft design canvas (https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex), same tokens, fonts and layout as S03Plan and S01eMyProfile, 1600 × 1000:

1. **S03c AI assistant, preview showing**: the plan editor (S03Plan) with
   - an Assistant button on the rail;
   - the panel on the right, in the inspector's place: the conversation, a prompt box at the bottom and a model picker beside it (Claude Sonnet 5.5 selected; a higher model such as Opus 5.5 in the list), chosen per prompt;
   - a sample prompt ("add a 3' door centered on the north wall") and the AI's short reply;
   - the proposed change on the canvas: additions highlighted blue, removals red dashed;
   - Accept, Adjust and Reject. Adjust lets the user edit the preview by hand before accepting;
   - under the reply, what that prompt cost ("about $0.02") and the session total.
2. **S03c state, no key**: the same panel with a short note on how to add a key in My profile, and a link there. Drawing by hand is untouched.
3. **S03c state, key refused or out of credit**: a plain message in the panel, the prompt text still in the box, the drawing untouched, and a link to My profile.
4. **S03c state, render**: the panel on the Render tab with the same prompt box; the changed scene shown before and after; the image itself still comes from the existing Generate button and its credits, which stay on screen.
5. **S01g My profile: AI assistant**: a new section on S01e, in two states:
   - no key: a box to paste an Anthropic API key, an Add button and one line saying where to get a key and that Anthropic bills the user directly;
   - key saved: only its last 4 characters, and Remove.

Users who can only view the project do not get the Assistant button, so it needs no board.

Wording: proposed on the board for Josh's approval (vault/PROCESS.md 3a). Sample data is not a decision.

## Sources

- Decisions: AI drawing assistant, 2026-10-31 (`vault/spec/decisions/05-screens.md`); user keys only, 2026-10-31 (`vault/spec/decisions/10-permissions-and-settings.md`); answers to items 11 to 15 of `vault/questions/phase-04-spec-gaps-for-josh.md`.
- Boards to match: `vault/mockups/S03Plan.png`, `vault/mockups/S01eMyProfile.png`, `vault/mockups/S08Render.png`.

## When Josh approves

1. Export PNG and HTML into `vault/mockups/` (`S03cAIAssistant.png`, `S01gMyProfileAI.png`, `html/project/` copies) as S01c to S01f were (`vault/mockups/INDEX.md` note under the table), and add the rows to `vault/mockups/INDEX.md`.
2. Add the boards to the AI phase's tickets when they are written at phase 5's spec check.
