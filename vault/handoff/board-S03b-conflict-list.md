# Board brief · S03b Conflict list (for a Cowork session, 2026-11-03)

Josh, 2026-11-02 (spec-check 3, Q-0510): "make sure #2 is drawn tomorrow in cowork". EZD-299 stays blocked until Josh approves this board.

## What to draw

Two boards on the EZ Draft design canvas (https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex), same tokens, fonts and layout as S03Plan and S01cNotifications, 1600 × 1000:

1. **S03b Conflict list**: the plan editor (S03Plan) with
   - a banner under the header naming the project and the number of changes that could not be saved, with a button that opens the list;
   - the conflict list open as a panel over the editor. Each row: the object by type and number ("Wall 4", "Door 2"), what changed (my value against the saved value), and the actions:
     - a normal conflict: Keep mine and Keep theirs;
     - the other person deleted the object: Keep mine (brings it back) and Keep theirs;
     - my change was a delete: Keep mine (deletes theirs) and Keep theirs;
     - project gone, project no longer open to me, or Edit model taken away: a line saying why, with only Remove;
     - a change the app built wrong (failed the data check): a line saying it was reported, with only Remove.
   - a Show button on each row whose object is still on the plan: it goes to that object on the canvas, which ships in phase 4 (Q-0511 b; spec-check 4);
   - a change from an older app version: a line asking to reload, with Reload (the change is sent again after it, Q-0511 e);
   - the list opens the same on any device (kept on the server too, Q-0531).
2. **S01c state**: one notification row in the bell list (S01cNotifications) per project per sync, naming the project and every object; it fits online conflicts (two tabs) as well as offline ones, so propose new wording for the `sync_conflict` kind (today "Offline changes conflict with newer edits"); it opens the same list (Q-0530, Q-0531).

Wording: proposed on the board for Josh's approval (vault/PROCESS.md 3a). Sample data is not a decision.

## Sources

- Decisions: Q-0502 (`vault/spec/decisions/03-data-model.md`), Q-0511 (same file: where it shows, row names, Keep mine cases, refusals), Q-0510 (`vault/spec/decisions/05-screens.md`).
- Architecture rule 9 (`vault/spec/sections/03b-architecture-rules.md`); notification kinds (`vault/spec/sections/00c-glossary-phase-02.md`: "offline sync conflict").
- Ticket row EZD-299 (`vault/tickets/phases/phase-01.md`, last row).

## When Josh approves

1. Export PNG and HTML into `vault/mockups/` (`S03bConflictList.png`, `html/project/S03bConflictList.dc.html`, and the S01c state) as S01c to S01f were (vault/mockups/INDEX.md note under the table), and add the rows to `vault/mockups/INDEX.md`.
2. Add `mockups/S03bConflictList.png` to EZD-299's `mockups` in `vault/tickets/tickets.json`.
3. Set EZD-299 back to todo: `node scripts/ledger.mjs status EZD-299 status=todo notes="Board S03b approved by Josh <date> (Q-0510)."` (queued to the launcher inbox while it runs). The launcher then plans it.
