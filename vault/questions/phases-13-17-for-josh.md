# Phases 13 to 17: questions for Josh

Written 2026-11-14 when phases 13 to 17 were prepared for the build loop:
- 13: PDF and DXF imports, import states, laser input
- 14: Field measure and office review
- 15: Cabinet runs
- 16: Countertops
- 17: Ceilings and the RCP

None of these phases starts until every phase below it is finished (your rule of 2026-11-14).

Everything else in these phases was settled from the spec, your decisions and the drawings. Those choices are listed in `vault/build/assumptions.md` for you to look over whenever you like.

Two things need you. Only question 1 holds any work.

---

## 1. Laser measuring: build it now or leave it out?

**What it is:** a laser measure set to "keyboard mode" connects like a keyboard. When you shoot a distance, it types the number into whatever box is selected and presses Enter. The app would show "Laser" or "Typing" on the status bar, and every length box would take the reading: the import review, the dimension bar and the inspector.

**Why you're being asked:** in phase 4 you said "not adding laser at this time". The note at the time said to ask you again when phase 13 came up.

**What waits on it:** only that one piece of work (EZD-315). It is held, and the rest of phase 13 builds without it. The phone's Measure tab in the field pack (much later) also uses the laser, so it waits on this answer too.

**My recommendation: (a) build it.** It is small, because the laser just types like a keyboard: no Bluetooth pairing, no battery readout. Your crews can then shoot a wall and have the number land in the box. It needs a laser model that has a keyboard mode, and the last check is you trying a real one.

- (a) Build it in phase 13 (recommended)
- (b) Leave the laser out of v1. Typed numbers only, everywhere.

**Josh's answer (2026-11-14): (b), "no laser in v1".** Recorded as Q-0759. EZD-315 is retired; the phone keypad and Measure tab drop their laser parts.

---

## 2. Screens with no drawing: OK to build them from the written spec?

Five pieces in these phases have a written description in the spec but no drawing:
- The PDF "set scale" step: click two points, type the real distance.
- The DXF layer checklist: convert all, some layers, or keep as reference only.
- The import screen while it is detecting, and when a file can't be read.
- The phone's "saved on phone" and "sent" states in Field measure.
- The countertop "Edit offered edges" list, with a small cross-section drawing of each edge profile (eased, bevel, bullnose and so on).

**My recommendation: (a) build them without new drawings.** Each would follow the look of the nearest screen you already approved. You would review them at the phase check, the way you chose no new drawings for phase 10. Nothing is held while you decide. If you later want a drawing for one of them, it becomes a small fix ticket.

- (a) Build from the spec in the style of the nearest approved screen (recommended)
- (b) Make drawings first for the ones you list. Those tickets would wait for the drawings.

**Josh's answer (2026-11-14): (a), "yes build based on the info already available".** Recorded as Q-0760.
