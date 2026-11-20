# Phases 18 to 27: questions for Josh

Written 2026-11-18 when phases 18 to 27 were prepared for the build loop:
- 18: Beams, auto-layout cans, switching zones, drop-ceiling grid, ceiling HVAC, joist check, fan clearance
- 19: Electrical devices, circuits, switch legs, the existing panel, panel schedule, voltage drop
- 20: Load calculation (standard method, optional method and the five cases), appliance ratings, common loads, commercial
- 21: The code check: the engine, the first 78 Florida Residential rules, the Check button and its list, code edition settings, bath clearances, the scope-of-work match
- 22: Plumbing: supply and drain locations, the plumbing diagram and calculations
- 23: Mechanical: equipment, ducts and registers, mechanical calculations
- 24: Tile layout: pattern, start point and cuts
- 25: The sheet set and sheet viewer: the ten default sheets, viewports, keynotes and text, print rules, the symbol key
- 26: The elevations, ceiling plan and electrical sheets, the title block, the property appraiser import
- 27: Department profiles, the notes library, the permit set PDF, the issue checklist, Issue Rev 0, the cover sheet

Everything else in these phases was settled from the spec, your decisions and the drawings. Those choices are listed in `vault/build/assumptions.md` (about 190 rows, tagged with each ticket) for you to look over whenever you like.

Nine things need you. Questions 1 to 7 each hold a few pieces of work; the rest of every phase builds without waiting. Questions 8 and 9 hold nothing.

One piece is held for agent work, not for you: the optional load calc method (EZD-615) needs worked examples with known answers before it can be tested. That is proposed as a separate agent task: write the examples from published sources and record them as a decision. It waits for that work, not for you.

---

## 1. What kinds of room can you pick?

**What it is:** each room has a Room type with four choices today: Kitchen, Bath, Laundry, Other. Many Florida code rules depend on what a room is used for. A bedroom needs an escape window and can't open into the garage. Living rooms, bedrooms and hallways need 7 ft ceilings, 70 sq ft of floor and window glass of 8% of the floor area. A garage needs 1/2" drywall on the garage side and no air registers. With only "Other", EZ Draft can't tell a bedroom from a closet, so those checks can't run.

**Why you're being asked:** it adds choices you will see in the Rooms list. The four were picked earlier, before the code check was planned.

**What waits on it:** the first 78 code rules (EZD-611b and EZD-611c). The rest of phase 21 builds.

**My recommendation: (a).** A room left as "Other" is treated as "not known", and rules that need the room's use say "Room type not set" instead of guessing.

- (a) Kitchen, Bath, Laundry, Bedroom, Living (living, family, dining, den), Hallway, Garage, Closet or storage, Other (recommended)
- (b) Your own list
- (c) Keep the four. The bedroom, living-room, hallway and garage checks always say "Room type not set".

**Josh's answer (2026-11-18): (a), "yes".** Recorded as Q-0762. EZD-611b and EZD-611c are released; EZD-620 adds the five new room types.

---

## 2. Plumbing and mechanical drawings: what goes on them?

**What it is:** you said yes to plumbing and mechanical sheets in v1. An agent researched what the codes and your departments ask for (PBC, Boca, West Palm, Wellington, North Palm Beach). What departments name for a remodel is a plumbing riser diagram. For new or resized A/C in an alteration, they want a Manual J sizing report, an equipment schedule and a plan showing equipment and duct runs. For a like-for-like A/C change-out, they want only the equipment data form and AHRI matched-system proof, with no drawings. No department page asked for fixture-unit tables or pipe sizing on a residential remodel.

**Why you're being asked:** the research ended with questions for you that were never asked. What goes on a permit sheet is your call.

**What waits on it:** the plumbing diagram and calculations (EZD-730), the mechanical layout (EZD-731) and the mechanical calculations (EZD-732). Plumbing supply and drain locations (EZD-729) and tile layout (EZD-733) build now.

**My recommendation: (a), the research's recommendation.**
- Plumbing: one sheet with the fixtures (new, moved, existing) on the proposed plan, plus a riser diagram drawn from the same fixtures and labeled with pipe sizes. A drain fixture-unit table goes on the riser sheet whenever fixtures are added. Supply sizing is only for whole-house re-plumbs, and only after an agent adds the code tables it needs.
- Mechanical: for alterations only, an equipment schedule (model numbers, capacities) and a plan with the air handler, condenser, supply and return locations and duct runs. The bath fan, dryer vent and exhaust checks go on that sheet too. Manual J is a number you or your A/C sub supply from the report; EZ Draft checks the equipment size against it and does not do Manual J itself.
- Change-outs: EZ Draft prints an equipment data block you copy onto the department's form. It doesn't fill in each department's form.

- (a) As above (recommended)
- (b) As above, but you tell me what to change (for example, add an isometric view, or fill in the change-out forms)

**Josh's answer (2026-11-18):** "why cant manual j be automated within ez draft?. plumbing and electric often need 2 pages or more. E-1 would be the layout with devices and symbols. E-2 if a second floor or location or detail is needed. then panel schedule and load calc. same goes for mechanical and plumbing". Recorded as Q-0763: each trade runs to as many sheets as it needs (E1.0 layout, E2.0 for a second floor, location or detail, then the panel schedule and load calc; plumbing and mechanical the same). The rest of (a) stands, since the reply did not change it, and you review it at the phase check. EZD-730 and EZD-731 are released. **Manual J follow-up, Josh (2026-11-20): "my local building departments accept it so this should be built and incorporated in v1".** Recorded as Q-0778. EZD-732 is released (it reads a typed Manual J load for now). New tickets EZD-740 (inputs), EZD-741 (calculation) and EZD-742 (report on the mechanical sheets) wait until the method and a worked example are written into the spec from a cited source.

---

## 3. Scope of work check: how does EZ Draft tell which trades your scope lists?

**What it is:** you asked that the scope of work and the drawings agree both ways, after the Boca rejection. Scope of work is a free-text box today, so EZ Draft has to read it.

**Why you're being asked:** how it reads the scope changes what you type and what warnings you see.

**What waits on it:** only the scope-of-work check (EZD-641).

**My recommendation: (a).** EZ Draft reads the words. "Electrical, electric, outlet, receptacle, light, panel, circuit" means electrical. "Plumbing, toilet, sink, shower, tub, water heater, drain" means plumbing. "HVAC, air conditioning, A/C, duct, mechanical, exhaust fan" means mechanical. A mismatch is a warning in Check that you can accept with a note, and the issue checklist already makes you review Check before a set goes out. You would see the word lists at the phase check and could change them.

- (a) Word lists, as a warning (recommended)
- (b) Add Electrical, Plumbing and Mechanical tick boxes under Scope of work, and compare those instead

**Josh's answer (2026-11-18): (b), "tick boxes".** Recorded as Q-0764. EZD-641 is released.

---

## 4. Which code edition does a new project get around the 12/31/26 switch?

**What it is:** your approved Code edition page shows the default "By permit date (automatic)". Before 12/31/26 a project uses FBC 8th ed. with NEC 2020; from 12/31/26 it uses FBC 9th ed. with NEC 2023. EZ Draft has no permit date on a project today. You can always change a project's edition in Project settings, and existing projects never change on their own.

**Why you're being asked:** it decides which code your checks use for jobs you apply for around the switch date.

**What waits on it:** only the 8th Edition setting (EZD-643). The 9th Edition setting (EZD-613) builds now. Until you answer, projects are not locked to an edition: they show the company default (9th) and get their real edition from your answer.

**My recommendation: (a).** There's nothing extra to type. For the odd job that slips past the date, you change it by hand.

- (a) Go by the date the project is created (recommended)
- (b) Add a "Permit application date" to the project; the edition follows it, and the creation date is used until you fill it in

**Josh's answer (2026-11-18): (b), "application date".** Recorded as Q-0765. EZD-643 is released.

---

## 5. Common loads: one list with "Appliance rating defaults", and what does it start with?

**What it is:** you asked that the loads you look up on every job (Q-0181) be stored in the system. The catalog settings drawing you approved has an "Appliance rating defaults" card (Type, Volts, Amps, Add appliance type). The six rows on that drawing (Range 240 V / 40 A, Wall oven 240 V / 30 A, Dishwasher 120 V / 12 A and so on) are sample numbers, not values anyone checked.

**Why you're being asked:** the starting values were promised for a later round and never written, and I won't make up electrical values.

**What waits on it:** only the common loads list (EZD-640). The appliance card (EZD-614) builds empty, as drawn, for you to fill in.

**My recommendation: (a), one list that starts empty.** You enter your usual appliances once in Settings, and the load calc offers them on every job.

- (a) One list that starts empty; you fill it in (recommended)
- (b) One list that starts with values you send me (or the six on the drawing, if you confirm them)
- (c) Two lists: appliance defaults, plus a separate common-loads list with its own starting set

**Josh's answer (2026-11-18): "research common loads and use what is found. allow user to edit".** Recorded as Q-0766: one list, starting with researched values, editable. EZD-640 waits only for that research (agent work).

---

## 6. Commercial load calculation: keep it in v1?

**What it is:** on 2026-10-20 you moved "commercial load calc and service design" into v1. EZ Draft's project types are Kitchen, Bath and Whole-home interior, and commercial tenant improvement is out of scope for every version.

**Why you're being asked:** nothing says which jobs it's for, which method it uses, or what a correct answer looks like, and I won't write NEC commercial numbers from memory.

**What waits on it:** only EZD-642.

**My recommendation: (a).** The residential load calc already covers panel changes, service upgrades, subpanels and EV chargers.

- (a) Move it out of v1 (to later) and retire EZD-642 for now (recommended)
- (b) Keep it. Tell me the kind of job (for example, a small office in a house, or a duplex) and send one real calc of yours to use as the test example.

**Josh's answer (2026-11-18): (a), "v2".** Recorded as Q-0767. EZD-642 is retired; commercial load calc is back on the not-in-v1 list.

---

## 7. Where do faux beam finishes go in the catalog?

**What it is:** a faux beam has a finish you pick from the catalog (stained pine, painted, and so on). None of the nine catalog groups fits beams, and crown and trim have no group either.

**Why you're being asked:** the group list is visible to everyone in Settings and the catalog drawer.

**What waits on it:** only the beam finish tile and the More menu on the ceiling plan (EZD-516).

**My recommendation: (a).**

- (a) Add a tenth group, "Trim and beams", at the end (recommended)
- (b) A "Beam finishes" sub-group under Paint

**Josh's answer (2026-11-18): (a), "trim and beams works".** Recorded as Q-0768. EZD-516 is released.

---

## 8. Things the code rules ask about that EZ Draft can't draw

**What it is:** some Florida rules are about stairs, guard rails, skylights, garage doors, carports, pools and spas. EZ Draft has no tool to draw these.

**Why you're being asked:** adding a drawing tool is a product choice.

**What waits on it:** nothing if you pick (a).

**My recommendation: (a).** Interior remodels rarely add these. The rules are kept but never run, and they're named at the bottom of every Check list under "Not checked by EZ Draft", the same way the spec already handles structural and pipe sizing.

- (a) Leave them out of v1 and list them as not checked (recommended)
- (b) Tell me which to add (stairs first?). Each becomes a new drawing piece, and its rules wait for it.

**Josh's reply (2026-11-18): "why cant they be drawn?"** Answered in chat 2026-11-18. Still open; holds nothing. Until Josh picks, the rules are listed as not checked.

---

## 9. Screens with no drawing: OK to build them from the written spec?

These pieces have a written description in the spec but no drawing. Your answer for phases 13 to 17 (Q-0760) covered only those phases.
- Ceiling plan: the auto-layout cans box and preview, drawing switching zones and the dimmer mark, the drop-ceiling grid settings, the ceiling HVAC settings, "Framing known" and joist lines, beam Count and Length, the amber warnings and red "Not on a ceiling", the More menu, the light-level target popover in Defaults.
- Electrical: the Existing panel window (photos read by AI, then you confirm), the load calc case list and Optional method switch, the subpanel picker, the full panel schedule, the height-note switch, the Low voltage, Smoke/CO and Fan buttons, the common load picker.
- Code check: the results list that opens from the Check button.
- Plumbing locations and tile layout: their tools and symbols.
- Sheets: the Add sheet picker, the empty-set note, the E1.0 electrical plan sheet, the cover sheet A0.0, and the Export menu.

**My recommendation: (a) build them without new drawings.** Each would follow the look of the nearest screen you already approved. You'd review them at the phase check, the way you chose for phases 10 and 13 to 17. Nothing is held while you decide. If you later want a drawing for one, it becomes a small fix ticket.

- (a) Build from the spec in the style of the nearest approved screen (recommended)
- (b) Make drawings first for the ones you list. Those tickets would wait for the drawings.

**Josh's answer (2026-11-18): (a), "yes".** Recorded as Q-0769.

---

## Added 2026-11-20: reflected ceiling plan sheet is optional

**Josh (2026-11-20): "this isn't always needed but should be one of the check boxes to add".** Recorded as Q-0779. A fourth tick box, "Reflected ceiling plan", sits with Electrical, Plumbing and Mechanical. Ticked, the A6.0 sheet is in the set; unticked, it is left out, and drawn ceiling work then gets a Check warning. It starts unticked; that default and the wording are listed in `vault/build/assumptions.md` for you to confirm. Tickets: EZD-739 (new), EZD-701, EZD-708a, EZD-641.
