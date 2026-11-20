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

---

## 2. How does the client sign off the tile layout?

**What it is:** your Round 1 answer (Q-0179) says the tile layout sheet needs the client's sign-off, but never said how.

**Why you're being asked:** it decides what the homeowner does on the phone.

**What waits on it:** nothing. EZD-734 builds (a). With (b), a separate tick box or signature becomes a follow-on ticket.

**My recommendation: (a).** The client already signs once on the approval page; a second signature on the same page adds a step and no new protection.

- (a) When you send the tile sheet (A7.0) with a design approval, the client's one signature also signs off the tile layout. The signature card says "Includes the tile layout (sheet A7.0)." The editor shows "Tile layout signed off by [name] · [date]" until the layout changes (recommended)
- (b) The tile layout gets its own tick box or signature on the phone page, separate from the design approval

---

## 3. Can your office answer a client's comment so the client sees the answer?

**What it is:** the client can drop numbered comments on renderings and sheets. The phone drawing shows a comment from "Josh" on the client page, but the render-view spec says the office's own pins are never shown to the client.

**Why you're being asked:** what the homeowner sees from your office is your call.

**What waits on it:** nothing. EZD-1204 builds (a).

**My recommendation: (a).** It keeps your internal notes (like "island reads too long, check the lens") off the client's screen and still lets you answer them.

- (a) Your office's own pins stay internal. When the client leaves a comment, anyone on the project can Reply from the render view, and the client sees that reply under the person's first name (recommended)
- (b) Also add a "Show to client" switch on an office pin, so you can start a comment the client sees

---

## 4. The architect's drawing under your model: gray, or the architect's layer colours?

**What it is:** the spec says the architect's drawing shows "in gray" under your model. Your drawing's layer list shows a coloured square per layer (doors green, glazing blue and so on), which looks like the architect's own colours. Each layer can be recoloured either way.

**Why you're being asked:** this decides how the screen looks every time a reference is open.

**What waits on it:** nothing. It is built gray first (EZD-904); switching is one small change.

**My recommendation: (a).** Gray keeps your own walls, cabinets and markup standing out.

- (a) Every layer gray at first; recolour any layer you want (recommended)
- (b) Each layer in the architect's own colour at first; recolour any layer you want

---

## 5. A section drawn on the architect's drawing: what does the new detail hold?

**What it is:** you can draw a section line or a detail bubble right on the architect's DXF. The spec only says it "starts a section or callout from reference linework".

**Why you're being asked:** what lands in your detail is a product choice.

**What waits on it:** nothing. EZD-912 builds (a); (b) would be a new ticket.

**My recommendation: (a)** for v1.

- (a) The line snaps to the architect's lines, and the detail holds your model's walls cut at that line, the same as a section on the plan. The architect's lines only guide where you draw (recommended)
- (b) Also copy the architect's linework near the line into the detail as gray lines to trace over

---

## 6. Suggested finishes from a supplier's rendering: what does Confirm do?

**What it is:** on Supplier markup, the AI looks at the supplier's rendering and suggests catalog items: door style, colour, countertop, hardware. Each has Confirm or Skip, but the spec doesn't say what Confirm saves.

**Why you're being asked:** whether a click changes your cabinets is your call.

**What waits on it:** nothing. EZD-920 builds (a); (b) adds a step on top and undoes nothing.

**My recommendation: (a).**

- (a) Confirm saves it as the finish chosen for that supplier file, shown as "Confirmed". You still set the cabinets' finish yourself in the cabinet inspector (recommended: no plan change, no edit lock needed)
- (b) Confirm also changes every cabinet linked to that rendering to the confirmed door style, colour and countertop

---

## 7. Work-area plan on the permit set (Existing Building code)

**What it is:** the Existing Building code wants the remodelled area shown on the drawings. The rule book suggests a small plan with the remodelled rooms hatched, their square feet and the percentage of the house. No ticket draws it.

**Why you're being asked:** it would be a new piece of the permit set.

**What waits on it:** nothing. Until you answer, the check shows it as a checklist item ("Show the work area on the drawings").

**My recommendation: (a)** for v1. EZ Draft already works out the work area and alteration level, and the reviewer can read them on the code summary.

- (a) Keep it as a checklist item in v1 (recommended)
- (b) Add a hatched work-area plan with the SF and % to the permit set (a new ticket)

---

## 8. More things the code rules ask about that EZ Draft can't draw (adds to question 8 of phases 18 to 27, still open)

**What it is:** you asked "why can't they be drawn?" about stairs, guard rails, skylights, garage doors, carports, pools and spas. These phases' rules add more items to that list: fireplaces, chimneys and hearths, glass block walls, ramps, lofts, gas furnaces, unvented gas heaters, floor drains, boilers, and valves and backflow devices.

**Why you're being asked:** same as the earlier question: each new drawing piece is a product choice.

**What waits on it:** nothing. They are listed under "Not checked by EZ Draft" at the bottom of every Check list until you pick.

**My recommendation:** answer both lists together. Interior remodels rarely add these, so (a).

- (a) List them as not checked in v1 (recommended)
- (b) Name the ones to add as drawing pieces (each becomes a new ticket, and its rules wait for it)

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
