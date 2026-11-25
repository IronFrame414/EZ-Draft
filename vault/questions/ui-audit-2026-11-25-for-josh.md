# Live screen check, 2026-11-25: questions for Josh

Written 2026-11-25 by the overwatch session after EZD-1960, the first signed-in check of every screen on desktop, iPad and phone. The full report with screenshots is `audit/ui-live-2026-11-24/REPORT.md` (screenshots in `audit/ui-live-2026-11-24/screens/`).

The 11 clear bugs it found are already queued as fix tickets EZD-1977 to EZD-1987 (deep links lost at sign-in, Projects breaking on a phone, iPad buttons covered or too small, status bar wrapping, settings clipped, "Roles" vs "Role presets", the wall size chip over the room label, the Fixtures and Cabinets panels, and the Supplier files page header).

**Nine questions below. None holds a ticket.** Each has a recommendation; the fix tickets build around the current look until you answer.

---

## Q-0805. Client links don't work yet. Hide Send, or build the client page sooner? (F1)

**What it is:** Send works and emails the client a link, but the page that link opens (the client page, EZD-1202 in phase 39) isn't built yet, so the client sees the staff sign-in page. EZD-1202 is waiting on EZD-719.

**Options:**
- (a) Hide or turn off Send until the client page is built. **Recommended:** no client gets a broken link, and nothing is lost because the client page is still to come.
- (b) Build the client page (EZD-1202 and EZD-719) next, ahead of their phases.
- (c) Leave it as is. Nobody sends to real clients before launch anyway.

## Q-0806. What should Projects look like on a phone? (F3b)

**What it is:** no drawing shows Projects on a phone. EZD-1978 stops the page breaking (one card per row, header fits). Crews use this page on a phone to reach Field measure.

**Options:** (a) one card per row, same cards as desktop (**recommended**, what EZD-1978 builds), (b) a plain list with name, address and status, (c) something else you sketch.

## Q-0807. Which status bar items show on an iPad? (F5b)

**What it is:** at iPad width the plan's status bar runs out of room. EZD-1981 keeps every item on one line and cuts the longest off with a tooltip.

**Options:** (a) keep all items and shorten the long ones (**recommended**, what EZD-1981 builds), (b) on iPad show only scale, snap and the save state, (c) you choose the list.

## Q-0808. The "Page not found" page is bare. Use the normal header and a "Back to Projects" link? (F11)

**What it is:** a wrong link shows "Page not found." in the top left with nothing else. No drawing covers it.

**Recommended:** the normal app header, the message in the middle, and a "Back to Projects" button.

## Q-0809. Where should the Fixtures panel sit? (F12)

**What it is:** the Fixtures tool opens a large floating panel over the drawing. No drawing shows the Fixtures tool. EZD-1985 stops its fields being cut off by the window edge, without moving it.

**Options:** (a) dock it on the right like the other tool panels (**recommended**), (b) leave it floating.

## Q-0810. The left panel and overlays have moved on from the S03 drawing. OK? (F13)

**What it is:** the left panel now has Floor / Ceiling / Both and a lock on each row, and the overlays are Plumbing and Mechanical. The S03 drawing shows Electrical, Ceiling, Dimensions and Architect DXF. These came from later tickets.

**Recommended:** keep it as built, and treat the S03 drawing as out of date on this point.

## Q-0811. System status has an extra "This device" card (storage, edits waiting to sync). Keep it? (F15)

**What it is:** this card isn't on the S15i drawing. It came from the offline work and shows what is waiting to sync on this device.

**Recommended:** keep it.

## Q-0812. New project step 1 has fields the drawing doesn't show (scope of work, trades, permit application date). Keep them? (F17)

**What it is:** the S01b drawing shows fewer fields. These may come from later decisions; the check didn't trace them.

**Recommended:** keep them.

## Q-0813. Title block settings: build the drawing's "Used on N sheets · Open Sheets" line and "Zoom to title block" button, or drop them? (F18)

**What it is:** the drawing shows both, but they weren't built, and the preview sheet shows only the title block.

**Options:** (a) build both (**recommended**: they're small and on your drawing), (b) drop them.

---

**Also noted, not a question:** F16. The field pack's empty page has no "EZ Binder" back link. That link may have to wait for EZ Binder single sign-on, so it will be checked before anyone fixes it.

---

## Answers (Josh, chat, 2026-11-25)

805 (b) build the client page sooner · 806 (a) · 807 (a) · 808 agree · 809 (a) dock right · 810 agree · 811 agree · 812 agree · 813 (a) build both. EZD-385: retire (recommendation followed). Recorded in vault/spec/decisions/04-app-shell-and-global-ui.md.
