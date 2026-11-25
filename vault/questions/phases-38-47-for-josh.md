# Phases 38 to 47: questions for Josh

Written 2026-11-20 when phases 38 to 47 were prepared for the build loop:
- 38: The office render worker (connect a PC that renders for free), "Render on this device (free)", Render A/B/C from the 3D view, sheet R1.0 (finish schedule and client-ready renderings), the second AI picture provider (OpenAI)
- 39: The client's phone page behind the share link: the Share panel and Send composer, the Plans tab, selections and countertop edge choice, email check and finger signature, Approve, the selections PDF, tile layout sign-off
- 40: Renderings and comments on the client page, sending design options A/B/C, the client's option choice, Send image, archiving the options not chosen when the client signs
- 41: The architect's DXF as a reference under your model: layers, lining it up with the model, the architect's sheet layouts, "Arch rev" letters, and DXF export of your model and sheets
- 42: Converting architect layers to walls, doors, windows and rooms, markup (clouds, comments, arrows, text, dimensions), new architect versions with a change list, Keep or Accept, sending markup back as PDF or DXF, a section started on the architect's drawing
- 43: Supplier markup: supplier files, the supplier's PDF and 2020 order report read into Import review, tagging cabinets on the supplier's rendering, Read codes, comparing against the order report, fixing or flagging a mismatch, suggested finishes
- 44: Editing offline while you hold the edit lock, and the conflict list when you reconnect
- 45: The crew field pack on a phone (plan, 3D, measure, tasks, photo pins, PDF), stale actions on reconnect, and the office side: task templates, the Field tasks screen, Issue field pack, field measurements review, field conflicts
- 46: Code rules: Florida Residential chapter 3 (egress, stairs, smoke alarms), Existing Building, and the construction chapters (framing, windows and doors, backer board, attics, fireplaces)
- 47: Code rules: Energy, Mechanical, Fuel gas, Plumbing

Everything else in these phases was settled from the spec, your decisions and the drawings. Those choices are in `vault/build/assumptions.md` (about 520 rows, each tagged with its ticket, under the headings "Phases 38-40 prep" to "Phases 46-47 prep") for you to look over whenever you like. They include a lot of proposed screen wording, marked "Wording for Josh to confirm".

Eight questions need you. **None of them holds a ticket.** Each piece is built the recommended way, and a different answer becomes a small follow-on ticket. Answer whenever it suits you.

**Answered 2026-11-20 (Q-0781 to Q-0785):** 1 yes; 2 one signature, plus a simple pen for the client (new ticket EZD-1216); 3 yes; 4 the architect's own colours; 6 both buttons. **Then (same day), "Take my picks", and then your final answers:** 5 (b), keep the small copy of the architect's lines (Q-0786); 7 (b), print the work-area plan (Q-0787, new ticket EZD-619); 8 yes to all 19 objects (Q-0789, new phase 57). Every question in this file is answered.

---

## 1. Screens with no drawing in phases 38 to 47: OK to build them from the written spec?

**What it is:** your approved drawings cover the main screen of each area (Render models, the client phone page and edge choice, the render view, the architect reference screen, Supplier markup, the phone field pack and its 3D tab, Field measurements review, Field tasks, the task templates). Many smaller pieces are described in the spec but have no drawing. For example:
- Renders: the render worker's Offline and Not connected states and its token window, the "Render on this device" progress bar, the iPad Fast render button, the layout of sheet R1.0
- Client page: the Share panel (link on/off, expiry, Copy link, Resend, Renew), the Send composer (tick renderings, sheets and selections), the Plans tab, the expired and offline pages, the email box and lockout, the cabinet and hardware choice pages, the thank-you page, the Compare view, typing and replying to a comment, the selections PDF
- Office side of the client page: the client's pins in the render view, the Client comments list, Send image and Copy link, the Sent / Approved / Archived marks on options
- Architect reference: the Files tab with lining up and versions, the layout picker, the layer menu and colour picker, the Markup tab, the Arrow, Text and Dimension tools, the change list's loading and failed states, the markup PDF page, the empty and "couldn't read" screens
- Supplier markup: the empty screen, the 2020 Design file message, the supplier name and email fields, the code box, the dashed "suggested" tags with Confirm and Skip, cabinet runs and order lines in Import review, the email the supplier gets
- Field pack: the phone Plan tab with Layers, Elevations and Finishes, a detail opened on the phone, the Tasks and Photo tabs, the "Made on an older version" sheet, the office Field conflicts list, the field pack PDF pages, the Issue field pack confirm box
- Code rules: new inspector fields "Exterior wall", "Required egress door", window net clear opening, door clear width and height, cooking surface height

**Why you're being asked:** your yes for phases 28 to 37 (Q-0771) named only those phases' screens.

**What waits on it:** nothing. Each piece is built in the style of the nearest approved drawing, and you review it at the phase check. A change becomes a small fix ticket.

**My recommendation: (a).**

- (a) Build them from the spec in the style of the nearest approved drawing, with no new drawings (recommended)
- (b) Make drawings first for the ones you name; only those tickets wait

**Josh's answer (2026-11-20): (a), "yes".** Recorded as Q-0781.

---

## 2. How does the client sign off the tile layout?

**What it is:** your Round 1 answer (Q-0179) says the tile layout sheet needs the client's sign-off, but never said how.

**Why you're being asked:** it decides what the homeowner does on the phone.

**What waits on it:** nothing. EZD-734 builds (a). With (b), a separate tick box or signature becomes a follow-on ticket.

**My recommendation: (a).** The client already signs once on the approval page; a second signature on the same page adds a step and no new protection.

- (a) When you send the tile sheet (A7.0) with a design approval, the client's one signature also signs off the tile layout. The signature card says "Includes the tile layout (sheet A7.0)." The editor shows "Tile layout signed off by [name] · [date]" until the layout changes (recommended)
- (b) The tile layout gets its own tick box or signature on the phone page, separate from the design approval

**Josh's answer (2026-11-20): (a), "1 signature. allow client to mark up and add notes. simple pen is all they need".** Recorded as Q-0782. New ticket EZD-1216 (phase 40): on the phone page the client gets "Mark up", a pen in one colour and width with Undo and Clear, plus a typed note, on any shared sheet or rendering. Your office sees the strokes and note with the client's comments.

---

## 3. Can your office answer a client's comment so the client sees the answer?

**What it is:** the client can drop numbered comments on renderings and sheets. The phone drawing shows a comment from "Josh" on the client page, but the render-view spec says the office's own pins are never shown to the client.

**Why you're being asked:** what the homeowner sees from your office is your call.

**What waits on it:** nothing. EZD-1204 builds (a).

**My recommendation: (a).** It keeps your internal notes (like "island reads too long, check the lens") off the client's screen and still lets you answer them.

- (a) Your office's own pins stay internal. When the client leaves a comment, anyone on the project can Reply from the render view, and the client sees that reply under the person's first name (recommended)
- (b) Also add a "Show to client" switch on an office pin, so you can start a comment the client sees

**Josh's answer (2026-11-20): (a), "yes".** Recorded as Q-0783.

---

## 4. The architect's drawing under your model: gray, or the architect's layer colours?

**What it is:** the spec says the architect's drawing shows "in gray" under your model. Your drawing's layer list shows a coloured square per layer (doors green, glazing blue and so on), which looks like the architect's own colours. Each layer can be recoloured either way.

**Why you're being asked:** this decides how the screen looks every time a reference is open.

**What waits on it:** nothing. It is built gray first (EZD-904); switching is one small change.

**My recommendation: (a).** Gray keeps your own walls, cabinets and markup standing out.

- (a) Every layer gray at first; recolour any layer you want (recommended)
- (b) Each layer in the architect's own colour at first; recolour any layer you want

**Josh's answer (2026-11-20): (b), "original colors".** Recorded as Q-0784. A colour too pale to see on the screen background is drawn a shade darker; Reset color goes back to the architect's colour.

---

## 5. A section drawn on the architect's drawing: what does the new detail hold?

**What it is:** you can draw a section line or a detail bubble right on the architect's DXF. The spec only says it "starts a section or callout from reference linework".

**Why you're being asked:** what lands in your detail is a product choice.

**What waits on it:** nothing. EZD-912 builds (a); (b) would be a new ticket.

**My recommendation: (a)** for v1.

- (a) The line snaps to the architect's lines, and the detail holds your model's walls cut at that line, the same as a section on the plan. The architect's lines only guide where you draw (recommended)
- (b) Also copy the architect's linework near the line into the detail as gray lines to trace over

**Josh's reply (2026-11-20): "explain"**, then "Take my picks", then **"5 - b. keep the small copy so the end user can see where the section detail is located"**. Recorded as Q-0786: the detail keeps a small gray copy of the architect's lines around the cut, and it prints (EZD-912).

**In plain words:** say the architect's plan shows a kitchen wall with a soffit, and you want a section through it for the permit set. You draw a line across that wall on the architect's drawing, and EZ Draft opens a new detail.
- With (a), the detail starts with the walls you drew in EZ Draft, cut where your line crosses them: stud, drywall, and so on, as on a section from your own plan. The architect's lines only helped you put the line in the right place. If you haven't drawn that wall in EZ Draft yet, the detail starts empty and you draw it.
- With (b), the detail also gets a faint gray copy of the architect's lines near your cut (their wall lines, soffit, cabinet outline), so you can trace over them. The gray copy is a guide only and doesn't print as yours unless you trace it.

(b) helps most when the architect drew something you haven't modeled. (a) is simpler and is how a section from your own plan already works. My recommendation stays (a) for v1, with (b) as a later add-on if you find yourself retracing architect details.

---

## 6. Suggested finishes from a supplier's rendering: what does Confirm do?

**What it is:** on Supplier markup, the AI looks at the supplier's rendering and suggests catalog items: door style, colour, countertop, hardware. Each has Confirm or Skip, but the spec doesn't say what Confirm saves.

**Why you're being asked:** whether a click changes your cabinets is your call.

**What waits on it:** nothing. EZD-920 builds (a); (b) adds a step on top and undoes nothing.

**My recommendation: (a).**

- (a) Confirm saves it as the finish chosen for that supplier file, shown as "Confirmed". You still set the cabinets' finish yourself in the cabinet inspector (recommended: no plan change, no edit lock needed)
- (b) Confirm also changes every cabinet linked to that rendering to the confirmed door style, colour and countertop

**Josh's answer (2026-11-20): "give user both options".** Recorded as Q-0785. Each suggestion gets "Confirm" (saves it for the supplier file only) and "Confirm and apply" (also sets it on the cabinets linked to that rendering; needs the edit lock). Hardware has nothing in the model to set, so it offers Confirm only.

---

## 7. Work-area plan on the permit set (Existing Building code)

**What it is:** the Existing Building code wants the remodelled area shown on the drawings. The rule book suggests a small plan with the remodelled rooms hatched, their square feet and the percentage of the house. No ticket draws it.

**Why you're being asked:** it would be a new piece of the permit set.

**What waits on it:** nothing. Until you answer, the check shows it as a checklist item ("Show the work area on the drawings").

**My recommendation: (a)** for v1. EZ Draft already works out the work area and alteration level, and the reviewer can read them on the code summary.

- (a) Keep it as a checklist item in v1 (recommended)
- (b) Add a hatched work-area plan with the SF and % to the permit set (a new ticket)

**Josh's reply (2026-11-20): "explain"**, then "Take my picks", then **"7 - b"**. Recorded as Q-0787: the cover sheet A0.0 prints a hatched work-area plan with the SF, % and level (new ticket EZD-619, phase 46).

**In plain words:** under the Existing Building code, how much paperwork and upgrading a remodel needs depends on how much of the house you're working on. That share is the "work area": the rooms you're reconfiguring, as a percentage of the whole house. Under 50% is usually a Level 2 alteration; over 50% is Level 3, which pulls in more requirements. EZ Draft already works this out from your plan and shows it in the code check ("Work area 420 SF of 1,800 SF (23%), Alteration level 2").

The code also wants the work area shown on the drawings, so the plan reviewer can see which rooms count. The question is how:
- With (a), the code check shows a reminder, "Show the work area on the drawings", and you handle it as you do today (a note on the cover sheet or a hand-marked plan). EZ Draft prints nothing new.
- With (b), EZ Draft adds a small plan to the permit set with the work-area rooms hatched and a note like "Work area 420 SF / 1,800 SF total = 23%, Level 2". It's built from the same numbers, so it's always right.

If your plan reviewers ask for it on most remodels, (b) saves you a step every job. If they rarely do, (a) is enough for v1.

---

## 8. Things the code rules ask about that EZ Draft can't draw: one question per item

**Josh's reply (2026-11-20): "give all questions".** Here is each item on its own, covering this question and question 8 of phases 18 to 27 (which these answers also settle).

**Why they can't be drawn today:** EZ Draft only checks what it can see in your model. It draws walls, doors, windows, rooms, cabinets, fixtures, lights, outlets, ceilings and beams. It has no drawing tool for the items below, so their code rules are kept but never run. Each one shows at the bottom of every Check list under "Not checked by EZ Draft".

**What a yes means:** a new drawing piece (a tool, its inspector fields and how it prints), plus its code rules switched on. Each yes is one or two new tickets in a later phase. Nothing built so far changes, and nothing waits on any answer.

Answer each with **yes** (add it to v1) or **no** (leave it as "not checked" in v1). My pick is in brackets.

1. **Stairs.** The rules check step height and depth, headroom, width, handrails and the landing at top and bottom. This is the biggest group of rules on this list. *[yes, if you redo stairs on remodels; otherwise no]*
2. **Guard rails** (open sides of stairs, lofts, balconies). The rules check guard height and baluster spacing. *[same answer as stairs]*
3. **Ramps.** The rules check slope, landings and handrails. *[no]*
4. **Lofts.** The rules check floor area, ceiling height and how you get up there. *[no]*
5. **Skylights.** The rules check glazing type and the curb on the roof. *[no]*
6. **Garage doors.** The rules check wind rating. *[no]*
7. **Carports.** The rules check that the sides stay open. *[no]*
8. **Pools.** The rules check barriers, alarms and electrical bonding. *[no, a separate trade]*
9. **Spas and hot tubs.** Same rules as pools. *[no]*
10. **Fireplaces, chimneys and hearths.** The rules check hearth size, clearance to wood trim and the chimney's height above the roof. *[no]*
11. **Glass block walls.** The rules check panel size and how the panel is braced. *[no]*
12. **Gas furnaces.** The rules check combustion air, venting and clearances. Gas ranges, dryers and water heaters are already checked through the gas line you draw. *[no]*
13. **Unvented gas heaters.** The rules check which rooms they're allowed in and the room's size. *[no]*
14. **Boilers.** The rules check relief valves and clearances. *[no]*
15. **Oil- or wood-burning appliances** (wood stoves, oil furnaces). The rules check clearances, venting and the floor under them. *[no]*
16. **Saunas.** The rules check the heater guard and the door. *[no]*
17. **Generators.** The rules check placement and fuel connection. *[no]*
18. **Floor drains.** The rules check the trap and the trap primer. *[no]*
19. **Valves, regulators and backflow devices** (shutoffs, pressure regulators, backflow preventers). The rules check that they're there and reachable. *[no]*

If you answer "yes" to any, I'll add the tickets after phase 47 so they don't hold up what's already released.

**Josh's answer (2026-11-20): "Take my picks" (no to all), then "8 yes to everything".** Recorded as Q-0789 (replaces Q-0788). New phase 57, 21 tickets (EZD-644 to EZD-664): one schema ticket, then a drawing tool and its code rules for stairs, guards, ramps and lofts, skylights, garage doors, carports and saunas, glass block, fireplaces, the fuel-burning appliances and generators, pools and spas, floor drains and valves, then 3D massing and a final check that none of these rules is still listed as not checked. Phase 57 builds when you release it (after phase 47).

---

## For your information (no answer needed)

- **Renders from the office worker or "this device" cost $0** and don't count against the render allowance. Only cloud renders cost money, matching your Render models drawing.
- **Before OpenAI can serve a render tier in production**, its API key has to be set in Vercel. That's a setup step, not a question.
- **Architect versions read "Arch rev C"**, never the drawing's "Rev C", as the spec decides (so they can't be confused with your own revisions).
- **Supplier order reports are PDF only**, as you decided (Q-0513). If a supplier sends CSV, that's a small new ticket.
- **Design option status** (Draft, Sent, Approved, Archived) is worked out from the sends and the client's signature rather than stored in the model, because a sent version is frozen.
- **"Stale actions on reconnect" moved from phase 44 to 45**, beside the field pack pieces it works with.
- **Manual J is v2 (Q-0780)**, so the earlier note "M2.0 gets a calculations block when Manual J releases" no longer applies. In phase 47 only three energy rules about equipment sizing are reminders; every other mechanical rule still checks.
- **The dimensions tool (EZD-216, phase 6) has not built yet.** The architect snap tools (EZD-902, EZD-903) and the phone Plan tab (EZD-1405) wait on it. The loop will retry it; it is not a question for you.
- **Real sample files are still needed for the field checks:** 2 or 3 of your architects' DXFs, and a supplier's 2020 export (rendering, drawings and order report). Every automated test runs on made-up files until then.
- **Not in any ticket yet:** saving reference markup while offline (markup needs a connection in v1), converting cabinets or furniture from an architect DXF (walls, doors, windows and rooms only), and a third render provider (the "Flux Kontext max" on your Render models drawing).
