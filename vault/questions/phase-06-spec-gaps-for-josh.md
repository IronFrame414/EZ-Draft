# Phase 6 · spec gaps for Josh (spec-check 6, 2026-11-09)

Phase 6: phase switch, layers, dimensions, thumbnails, benchmark page. The audit found 20 gaps. Agents settled 17 under your standing rule (CLAUDE.md rule 3), recorded as Q-0664 in the decisions files. Two design questions wait for you. Each holds up only the tickets named; the rest of phase 6 goes ahead.

## 1. Design questions (answer by number)

1. **Q-0665 · System status page (EZD-135, and EZD-237 on the same page).** There is no board for it, and the spec has no layout text. It is an owner-only page with four parts: job failures, webhook failures, the last off-site backup and the last restore drill.
   - (a) **Recommended:** no board. Build it as four cards in the Settings layout, using the same parts as the other Settings pages. It is a back-office page only you see, and you can change it at the field check.
   - (b) You supply a board first. EZD-135 and EZD-237 wait for it.
   - Holds up: EZD-135, EZD-237.
2. **Q-0666 · Floor switcher (new ticket EZD-6001).** You decided phase 6 adds floor tools (Q-0509: switch floor, add, rename, delete floor). Board S03 has no floor control.
   - (a) **Recommended:** a "Floor" select at the left end of the bottom status bar, beside View, Scale and Snap. It is a view setting like those, and the side panels are already full.
   - (b) At the top of the Layers tab.
   - (c) A menu in the header under the project name.
   - Holds up: EZD-6001.

## 2. Agent answers to confirm

Confirm or override each. Nothing waits on these.

- **Status bar popovers and layer locks need no new board.** The Snap, Scale and Zoom popovers, the lock icon beside each layer's eye, and the Rooms tab fields are built from the spec text and the standard parts, as you allowed for small pieces before (Q-0506, Q-0569). Source: phase-auditor; S03 Decisions.
- **Left panel tabs follow your approved board:** three text tabs (Layers, Rooms, Versions), not five icon tabs. Tasks and Takeoff are added later as text tabs. Source: phase-auditor; board S03.
- **Default view:** a new project starts in Existing. Everything drawn before phase 6 is Existing, so it shows in both views. Your View choice is saved per project. Eye toggles, layer locks and snap settings reset on reload. Source: phase-auditor; Q-0558; 03c.
- **Status on doors and windows:** a Status select (Existing / Demo / New) on the wall, door and window panels, with no extra pill in the panel header. Source: phase-auditor; Q-0633.
- **Room types:** Kitchen, Bath, Laundry, Other. Ceiling types: flat, single slope, vaulted/cathedral, tray, coffered. Floor finish is typed text until the catalog arrives. Room photos come in phase 10. Source: phase-auditor; S15h; S05.
- **Snap increments:** 1/16", 1/8", 1/4", 1/2", 1", 6", 12"; default 1/2". **Plan scales:** 1/8" to 1" = 1'-0"; default 1/2". **Zoom:** 5% to 1600%. Source: phase-auditor; Q-0569; 09h; view.ts.
- **Text on the plan:** notes print at 3/32" and labels and dimension text at 1/8", the same size on paper at any zoom. Source: phase-auditor; 09h.
- Worked examples for all of these are in `vault/spec/sections/09m-phase-switch-and-view-examples.md`.
