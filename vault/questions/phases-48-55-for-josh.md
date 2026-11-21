# Phases 48 to 55: questions for Josh

Written 2026-11-20 when phases 48 to 55 were prepared for the build loop:
- 48–49: the electrical code rules (NEC), including placing the panel on the plan
- 50–51: Spanish for crew: the AI translates the text your office types (tasks, notes, keynotes), and crew phones show it
- 52: Settings › Catalog (categories, suppliers, markup per category, edge profiles) and Takeoff (quantities by room and trade, waste, CSV)
- 53: billing for other companies (Stripe, 14-day trial, paywall), the office-seat meter, sign-up and onboarding, and render credits (new ticket EZD-1714)
- 54: the event-name audit, the security test suite, event-log coverage, and the code rule list where you mark rules verified
- 55: performance checks, DXF size limits, the accessibility pass, and tests for every screen's empty, error and offline states

Everything else was settled from the spec, your decisions and the drawings. The choices are in `vault/build/assumptions.md` under "Phases 48-49 prep" to "Phases 54-55 prep", with proposed wording marked "Wording for Josh to confirm".

**Six questions. None holds a ticket**; each piece builds the recommended way and a different answer becomes a small follow-on ticket. One ticket stays held, as before: the real office render runner (EZD-1120) waits on a GPU computer (Q-0018).

**Retired, not built:** the Spanish review screen, review card buttons, draft warnings, glossary, bulk approve, propagation and translation settings (EZD-1504 to EZD-1510). Your decision Q-0234 removed the review queue they belonged to. Nothing else depended on them.

---

## 1. Screens with no drawing in phases 48 to 55: OK to build them from the written spec?

**What it is:** your drawings cover the main screens (Takeoff, Settings › Catalog, Defaults, Code edition). These pieces have no drawing:
- Electrical: a "Panel" item on the Electrical toolbar to place the panel; new inspector fields (panel width, depth, bus rating, fed from, service wires; circuit "shares a neutral with"; receptacle replacement, tamper-resistant, weather-resistant, in-use cover; light type and mounting; fan blade size; jetted tub; garage vehicle bays; wiring method)
- Spanish: one confirm box on Issue field pack when some Spanish isn't ready yet
- Catalog and takeoff: the full-page catalog from Settings, tile in 3D with its cuts, the allowance summary page in the selections PDF
- Billing: Settings › Billing, the trial banner, the paywall page, the office-seat meter, the sign-up page and its email, the two onboarding steps
- Code rules: the printable rule list and the "9th Edition section" box; two DXF limit rows in Defaults and the "this DXF is too big" message
- Any empty, loading, error or offline screen the state tests find missing

One button on your Catalog drawing won't be built: "Edit in Detail" on a custom edge profile ("Replace drawing" covers it).

**Why you're being asked:** your earlier yeses (Q-0771, Q-0781) named only their own phases.

**What waits on it:** nothing.

**My recommendation: (a).**

- (a) Build them from the spec in the style of the nearest approved drawing (recommended)
- (b) Make drawings first for the ones you name (for example billing, paywall and sign-up)

---

## 2. More electrical things EZ Draft can't draw

**What it is:** some electrical code rules are about things with no tool yet: EV chargers, home batteries, solar, electric baseboard heaters, heated floors, window or wall A/C units, central vacuums, trash compactors, sump pumps, A/C and appliance disconnects, fire alarm panels, portable-generator inlets. Microwaves and wall ovens aren't fixture types either. Some places have no room type: crawl space, basement, boathouse, sunroom, foyer, porch or deck, detached buildings.

**Why you're being asked:** same kind of choice as your "yes to everything" for the building-code objects (Q-0789), which didn't name these.

**What waits on it:** nothing. Until you choose, their rules are listed under "Not checked by EZ Draft", ready to switch on.

**My recommendation: (a).**

- (a) Add the common remodel ones: EV charger, A/C disconnect, microwave and wall oven as fixtures, and room types Porch or lanai, Sunroom and Foyer (new tickets after phase 57) (recommended)
- (b) Add all of them, as you did for Q-0789
- (c) Leave them as not checked in v1

---

## 3. Now that nobody reviews the Spanish, any guard rails?

**What it is:** you chose (Q-0234) to have the AI translate office text for Spanish-speaking crew with no review. The AI is told to keep every number, unit and code abbreviation (34 1/2", 120V 15A, GFCI) exactly as written. The old review screen also had a check that the Spanish kept every measurement, and a company word list.

**Why you're being asked:** a wrong measurement on a crew phone is a field risk.

**What waits on it:** nothing. Built as (a); (b) or (c) is a small follow-on.

**My recommendation: (a)** for v1, since the AI is already told to keep every number. (b) is cheap if you want the extra safety.

- (a) No extra guard rails in v1 (recommended)
- (b) Add the measurement check: if the Spanish changes any number, the crew sees the English for that line
- (c) (b) plus a company word list in Settings

---

## 4. The allowance summary on the client's selections PDF

**What it is:** when you tick "Include allowance summary with prices" at send, the PDF gets a last page: for each allowance category (Cabinets, Tile and so on), the client's chosen items with their sell price, and a total. EZ Draft has no place to type an allowance budget such as "Tile allowance $3,000".

**Why you're being asked:** what the client sees about money is your call.

**What waits on it:** nothing. Built as (a).

**My recommendation: (a).**

- (a) Items and sell prices per category, with a total (recommended)
- (b) Also a budget per category for each project, with "over" or "under" shown (a small follow-on ticket)

---

## 5. Who counts as an "office user" for the $10 extra seat

**What it is:** your price is $50 a month for 5 office users, with field and crew users free. EZ Draft has to decide who is "office".

**Why you're being asked:** it sets what other companies pay. Worth Properties never pays.

**What waits on it:** nothing. Built as (a). Nobody is charged until you set up Stripe.

**My recommendation: (a).** Simple and predictable for a customer.

- (a) By role: Foreman and Crew are free; everyone else (Owner, Designer, any custom role) is an office user (recommended)
- (b) By permissions: anyone who can edit drawings, create projects, issue, send to the client or change settings is an office user, whatever the role is called

---

## 6. What a company that hasn't paid can still do

**What it is:** a company hits the paywall when its trial ends with no card, or when payment fails for good.

**Why you're being asked:** how hard the paywall is, is a product choice.

**What waits on it:** nothing. Built as (a).

**My recommendation: (a).** It matches your storage-cap rule (Q-0089): nothing is lost or locked away.

- (a) View-only: everyone can still open and export projects, and client links already sent keep working; nothing can be edited, created, rendered or sent until someone pays (recommended)
- (b) Full block: only the paywall page shows; client links keep working

---

## For your information (no answer needed)

- **Billing stays off until you set up Stripe**: a Stripe account, two prices ($50 plan, $10 extra seat), and the keys in Vercel. Until then there's no Billing page, no paywall, and sign-up is closed.
- **Render credits** for paying companies (your Q-0372) had no ticket; EZD-1714 now builds them. Worth Properties is never limited.
- **Code rule "Mark verified" is per company**: your licensed check counts for Worth Properties only, never for another company.
- **DXF size limits** start at 50 MB and 150,000 entities. You can change both in Settings › Defaults after you try your architects' files.
- **No ticket owns your company rules C-01 to C-10** (vault/spec/code-check-rules.md) or the "required dedicated circuits" warning list. The NEC rules cover what code requires. Tell me if you want those company rules built.
- **Takeoff doesn't count the phase 57 objects** (stairs, fireplaces, floor drains and so on). They simply don't appear in it until a ticket adds them.
