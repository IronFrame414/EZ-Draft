# Data model

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 2: Data model. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

Each project version stores the drawing as one JSON model document; every other record (sheets, renders, takeoff, selections) points at a model version. Every table carries `tenant_id` with row-level security from day one. Model objects have stable ids across versions so revisions can diff and cloud them.

**Working copy and saves** (Claude, Oct 11 performance audit)

- The drawing being edited is the working copy. It is stored as one row per model object (model\_object), so an autosave writes only the objects that changed, a few seconds after the last edit and again on Stop editing.
- A model\_version row, holding the whole model as one document, is written only at a checkpoint: Stop editing or closing the project, lock release, a send or issue, Name snapshot, Revert and Finish import.
- These checkpoints are the unnumbered working versions in the Versions list, so the list holds about one entry per editing session, not one per save. The 30-day cleanup, snapshots and sent versions work as decided in Round 24.
- The browser keeps the open working copy in IndexedDB. Offline edits queue as per-object changes (offline\_change) and sync the same way as an autosave.

**Architecture rules** (Round 26, Oct 11 build-readiness audit). These apply to every ticket.

1. **Server-only data access.** The browser never reads or writes tables with the Supabase client. Every read and write goes through server routes that check the user's permissions with one `can()` helper; row-level security stays on every table as the backstop. The two exceptions are Realtime subscriptions (authorized per project scope) and signed uploads straight to Storage. A lint rule refuses a table query in browser code.
2. **Money fields are separate.** Cost, sell, markup, option cost lines, change-order amounts and render dollars live in their own tables or columns that only the server reads, and a route returns company costs only to a user with See company costs and sell prices only to a user with See sell prices. The cost-removal acceptance test runs from Phase 1 (EZD-133) and every ticket that adds a money field extends it.
3. **Everything printed or signed is versioned.** Anything that appears on a sheet or in a signed package is a model object and is frozen, reverted and diffed with the model: sheets, viewports, sheet annotations, countertop pieces and edges, the panel and its circuits, detail instances and design-option changes. The rows for sheet, sheet\_set, countertop\_piece, countertop\_edge and project-level detail in the table below describe those objects' fields; they are not separate tables. Company library details, reference markup, camera views and renders are not versioned.
4. **Design options.** An option's model\_delta is a list of add, replace and remove patches by object id, applied over the working model in memory for display and never saved into it. If the base object of a patch is deleted, the patch is flagged on the option card and skipped.
5. **One schema, versioned.** The model schema is one module in the geometry package (Zod, one file per object type). model\_version, model\_object and every queued change carry schema\_version. Older documents are upgraded on read by pure migrate functions and are never rewritten in storage. The server validates every save against the schema. A CI test loads a stored sample of every earlier schema version. Coordinates are stored as decimal inches with a fixed comparison tolerance of 1/64 inch; the 1/16 inch rule applies to typed and displayed lengths.
6. **Saves carry the lock generation.** edit\_lock has a lock\_epoch that goes up each time the lock changes hands. Every save is one database function, save\_objects(project, lock\_epoch, changes), which rejects a stale epoch and assigns each object's updated\_seq. Taking the lock is a single conditional write, so two users cannot both get it.
7. **Checkpoints are built on the server.** A model\_version is assembled by a database function from the saved model\_object rows, never uploaded by the browser. Closing the tab is not relied on: a holder who disappears keeps the lock until a Request edit times out, and the checkpoint is then made from what was already autosaved.
8. **Sends by a non-holder.** A user who does not hold the lock can still send or render. The send uses a server checkpoint of the rows saved so far and shows the notice "\[Name\] is editing; this send includes their saved changes up to \[time\]" (Claude).
9. **One outbox.** Every write from the device (model changes, and later task checks, photo pins and measurements) goes into one IndexedDB outbox that autosave drains; offline is only a long drain. Each queued change carries the object's base updated\_seq and the lock\_epoch. On sync, a change whose base is older than the server's updated\_seq is a conflict: nothing is overwritten, the user gets a notification that names the project and the objects, and resolves each with Keep mine or Keep theirs. The outbox is never evicted to free space.
10. **Device storage.** The app asks the browser for persistent storage and shows the answer in Settings. Cached projects other than the open one are dropped oldest-first within a size budget in Defaults. The Projects page and sign-out warn when this device holds unsynced changes.
11. **Client link.** Client pages are served only by server routes that resolve the token to its sent package and return an explicit list of fields with no money tables. Files are private and served through short-lived signed links. Only a hash of the token is stored. Comment and verify endpoints are rate-limited. The signer check stays as decided in Round 24 #32 (typing the email on the customer profile), with five attempts per hour.
12. **Old app versions.** Every request carries the app version. A device running an older version finishes draining its outbox and is then told to reload.

**Tables**

| Entity | Key fields | Rules |
| --- | --- | --- |
| tenant | name, logo, license\_no, contact, title\_block, code\_edition, defaults (json) | One per GC company |
| user | name, email, language (en/es), ipad\_input\_mode, role\_preset | Email required. Language is per user, not a field-pack toggle |
| membership | user\_id, tenant\_id, scope (all projects / listed projects) | Clients and crew scoped to their projects |
| user\_permission | user\_id, permission\_key, granted | One row per checklist box (section 9) |
| project | name, client\_name, address, type, status, ezbinder\_job\_id, ezbinder\_job\_no, property\_record\_id, submittal\_profile\_id, code\_edition, phase\_default, thumbnail\_path, open\_items\_count (stored counter behind the review pill and the card) | Status: Draft, Client review, Permit submitted, Approved, In build |
| property\_record | parcel\_no, owner, legal\_description, year\_built, living\_area, source\_url, confirmed\_by | Year built before 1978 sets the lead flag |
| model\_version | project\_id, model\_json, parent\_version\_id, label, is\_snapshot, created\_by, created\_at | Immutable. Written only at checkpoints (see Working copy and saves); model\_json is never selected by list queries. Also: preview\_path, is\_sent, sent\_to, version\_no (only when sent), keep flag. Unsent versions auto-delete at 30 days unless kept; sent versions are permanent |
| source\_file | project\_id, kind (polycam\_dxf, polycam\_glb, pdf, supplier\_pdf, dxf, image, order\_report, photo, panel\_photo, field\_measure), storage\_path, scale\_calibration, uploaded\_by, supplier\_name and supplier\_contact\_email (supplier files) | Originals never changed |
| reference\_drawing | project\_id, source\_file\_id, version\_no, rev\_label (the architect's letter), layer\_state (json), convert\_status per layer | Full fidelity; new upload = new version of same reference |
| reference\_diff | reference\_drawing\_id, from\_version, to\_version, changes (json), affected\_markup\_ids, affected\_object\_ids | Built on upload of a new version |
| markup | project\_id, target (reference / render / plan / supplier image), kind (cloud, comment, arrow, dim, text, cabinet\_tag), geometry, text, linked\_object\_id, author | Never alters the target |
| import\_session | project\_id, source\_file\_id, source\_kind (scan, pdf, dxf, supplier, field\_measure), mode (one-by-one / accept-fix / by-room), status, items (json with confidence) | Nothing becomes model data until accepted |
| edit\_lock | project\_id, holder\_user\_id, since, device\_id, offline (bool) | One editor per project |
| edit\_request | project\_id, requester\_id, requested\_at, response (release/keep/auto), responded\_at | Auto-release after 5 minutes with no answer |
| offline\_change | project\_id, device\_id, base\_version\_id, ops (json), queued\_at, synced\_at | The device outbox (Round 26). Model changes are made while holding the lock; field actions (task checks, photo pins, measurements) queue without it. Each queued change carries the object's base sequence number and the lock generation; a conflict is a server sequence newer than the base, and the user resolves each one with Keep mine or Keep theirs |
| camera\_view | project\_id, name, mode (orbit / walk / ortho), position, target, fov, eye\_height, thumb\_path (captured on Save view and on overwrite only), created\_by | Used by renders and client gallery |
| design\_option | project\_id, group (e.g. Beams), label (A/B/C), name, model\_delta (json), internal\_cost\_lines (json), status (draft / sent / approved / archived) | Costs never shown to clients |
| render | project\_id, model\_version\_id, camera\_view\_id or site\_photo\_id, tier, style, instructions, mask, inputs (json), visible\_object\_ids (captured when the render is requested), code, name, render\_no, previous\_render\_id, design\_option\_id, output\_path, thumb\_path (400 px), preview\_path (1600 px), cost\_usd, status (pending, running, failed, needs review, approved, rejected, client-ready, outdated, hidden), model\_changed (true or false, shown as the Model changed badge; cleared by Keep as-is), error\_text, created\_by, approved\_by, approved\_at, client\_ready\_by, client\_ready\_at | Reproducible record of what was shown |
| render\_comment | render\_id, pin\_xy, author (user or client), text, resolved | Client pins and staff pins |
| catalog\_item | tenant\_id, category, name, brand, model/sku, dims, finish, cost, sell, supplier, lead\_time, install\_specs, spec\_sheet\_path, texture\_path, source\_url, ai\_confidence (per field), allowance\_category, project\_id (set only when saved to one project), subcategory, markup\_pct (empty = category default), is\_standard\_spec, lead\_time\_text, lead\_time\_days, thumb\_path (256 px), created\_at | Every AI field confirmed by a user before save |
| project\_price\_snapshot | project\_id, catalog\_item\_id, cost, sell, captured\_at | Refresh shows changes before applying |
| countertop\_piece | project\_id (in model), label (A/B…), outline, material\_item\_id, thickness, edges\[\] | See countertop edge below |
| countertop\_edge | piece\_id, segment, kind (exposed / wall / seating / flush), overhang, backsplash\_height, profile\_id | Profile applies to exposed edges only |
| edge\_profile | tenant\_id, name, section\_svg, no stored per-LF price (the price is entered per top in 04b) | Library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom |
| selection\_offer | project\_id, kind (edge\_profile, option group, finish), choices\[\], price\_deltas | What the client may pick from |
| selection | project\_id, offer\_id, choice, chosen\_by, chosen\_at, signature\_id | Flows back into model and schedules |
| selection\_set | project\_id, items, approved\_by, approved\_at, signature\_path, ip, model\_version\_id | Approval locks that model version |
| sheet | project\_id, number, title, viewports, scale, size | Generated, adjustable |
| permit\_revision | project\_id, rev\_no, model\_version\_id, issued\_at, issued\_by, sent\_to (client/department), delta\_object\_ids, description | Drives clouds and revision log |
| submittal\_profile | tenant\_id, department, submittal\_type, sheet\_size (permit 24x36 default), file\_split (combined / per discipline / per sheet), max\_file\_mb, naming\_template, revision\_naming (version in name / same name), flatten, stamp\_box (size, position), bookmarks, toc\_sheet, resubmittal\_mode (changed sheets / full set + narrative), transmittal, min\_scale, export\_unsigned, required\_notes, signer (none / EC / architect / engineer) | A new department rule is a setting |
| detail | tenant\_id or project\_id, title, scale or NTS, linework, hatches, parts, keynotes, steps/layers, library\_source\_id, sheet placement, extrusions (profile, length) | Library copy is edited in place on the job |
| electrical\_calc | model\_version\_id, case, method, inputs, results | Computed in the browser from the working copy while the load calc is on screen and at Check; a row is stored when a version is sent or a set issues |
| panel | project\_id, existing/new, service\_size, main\_breaker, spaces, brand, label\_photo\_id, circuits\[\] | The panel is a model object inside model\_json (EZD-604, EZD-606), not a table; this row lists its fields. AI reads label photo for confirmation |
| code\_check\_run | project\_id, model\_version\_id, warnings\[\], accepted\_notes\[\] | Run on demand and at issue |
| takeoff | model\_version\_id, lines by room and trade | Waste factors applied. Computed in the browser (worker) while Takeoff is open; a row is stored only for sent versions |
| field\_task | project\_id, room, phase, text\_en, text\_es, status, photos, done\_by | Published by office |
| field\_pin | project\_id, xy, photo, note, kind (note / conflict) | Conflict notifies office |
| field\_measurement | project\_id, object\_id, measured\_value, drawing\_value, status (pending / approved / rejected) | Updates model only after approval |
| translation | phrase\_en, text\_es, status (unreviewed / approved), approved\_by | Cached across jobs; edit updates every use |
| share\_link | project\_id, scope, token, expires\_at (30 days), renewed\_at | Renewable |
| change\_order\_draft | project\_id, permit\_revision\_id, before\_images, after\_images, image\_approved flags, scope\_text, lines (qty, unit, cost delta), schedule\_days, status, ezbinder\_co\_id | Sent to EZ Binder by webhook |
| notification | user\_id, kind, project\_id, payload, read\_at, emailed\_at | In-app + email |
| event\_log | actor, action, object, at, ip | Audit for approvals, issues, locks |

Added in Rounds 24 and 25 and the Oct 11 audit:

| Entity | Key fields | Rules |
| --- | --- | --- |
| customer | name, email, phone, address, ezbinder\_customer\_id, synced\_at | Two-way sync with EZ Binder when connected. The email is what a client types to verify before signing |
| role | tenant\_id, name, default\_permissions | Unlimited custom roles per tenant |
| render\_allowance | tenant\_id, amount\_usd, balance\_usd, refill\_amount\_usd, last\_refilled\_at | Auto-refills when used up; notifies owner |
| sent\_package | project\_id, model\_version\_id, kind (client, permit, CO, supplier), recipients, email\_sent\_at, copy\_link\_token | Every email send also produces a copyable link |
| field\_measurement\_review | measurement ids, reviewer, decided\_at | Backs the Field measurements review screen |
| sheet\_set | project\_id, kind (permit / client), sheet\_ids, size (permit 24x36; client 11x17 or 24x36), key\_placement (every sheet / cover only), submittal\_profile\_id, last\_issued\_version\_id | One permit set and one client set per project; countertop sheets only in the client set (Claude) |
| field\_measure\_session | project\_id, device\_id, rooms (name, shape, wall letters and lengths, ceiling height, closure result), sent\_by, sent\_at, status (saved / sent / imported) | Phone 17b capture; on send it becomes an import\_session with source\_kind field\_measure (Round 25) |
| field\_pack\_issue | project\_id, model\_version\_id, task\_ids, issued\_by, issued\_at, note | Created by Issue field pack on the Field tasks screen; drives the "New field pack issued" notification (Claude) |
| model\_object | project\_id, object\_id, type, data (json), updated\_seq, updated\_by, deleted | The working copy, one row per model object. Autosave upserts only changed rows; opening a project reads them in one query. A checkpoint assembles them into a model\_version (Claude, performance audit) |
| job | tenant\_id, project\_id, kind (import, export, render, ai\_read, thumbnail, diff, cleanup), payload (json), status (queued, running, done, failed), progress, attempts, error, run\_after | The background queue. Progress is pushed to the browser over Realtime; nothing polls |

Added in Round 26 (Oct 11 build-readiness audit):

| Entity | Key fields | Rules |
| --- | --- | --- |
| edit\_lock (added fields) | lock\_epoch | Goes up each time the lock changes hands; every save must match it |
| model\_version, model\_object (added fields) | schema\_version | Set on write; documents are upgraded on read |
| project (added fields) | scope\_of\_work, settings (json) | Scope of work prints in the title block; settings holds the per-project copies of Defaults made at creation. The code rules also need these project fields (EZD-620): county, wind-borne debris region, flood zone and base flood elevation, year built, sewer or septic, renovation cost, assessed structure value, and the computed alteration level |
| library\_item | tenant\_id, kind (note, abbreviation, hatch, part, saved\_group, task\_template), name, data (json) | Backs every Settings library tab except Details (EZD-131) |
| code\_rule | rule\_id, code (NEC, FBC-R, FBC-M, FBC-P, FBC-EC, company), edition, section, title, applies\_to, severity, verified\_by, verified\_at | The rule list shown in Settings 15g. The check logic is code keyed by rule\_id; this table holds the text, the section per edition and who verified it |
| render\_worker | tenant\_id, name, key\_hash, last\_heartbeat\_at, last\_job\_id | The local GPU worker's own revocable key; never the service key |
| order\_line | source\_file\_id, line\_no, code, width, face, finish | Confirmed 2020 order-report lines (EZD-916) |
| glossary, translation\_usage | term\_en, term\_es, keep\_in\_english; translation\_id, project\_id, place | Translation review (EZD-1501) |
| benchmark\_run | device, app\_version, results (json), run\_at | Written by the benchmark page Josh runs on the iPad (EZD-237) |

**Objects inside model\_json**

Every object has: `id`, `type`, `geometry`, `status` (existing / demo / new), `level`, `attributes`. Types:

- Walls (thickness, layers, height, top edge cut to ceiling, bearing flag), openings (door, window: size, swing, rough opening, sill height, impact rating), rooms (name, floor finish, ceiling type, ceiling heights by point or pitch).
- Ceiling objects: beams (faux or structural look, W × H, length, spacing or count, direction, follow slope or level at height, finish, end detail), soffits, trays, coffers, crown, ACT grid (2×2/2×4, direction, start point), access panels, attic hatch.
- Cabinets as individual boxes: code, width, depth, height, type, face layout, hinge side, finished ends, catalog item. Also fillers (scribe allowance), end and decorative panels, appliance panels, toe kick, light rail, crown, valance, corner treatments, open shelves.
- Countertop pieces, seams, cutouts (sink, cooktop).
- Fixtures and appliances with utility points (electric V/A, gas, water, drain). Custom tile showers (Round 3): curb (height, width), niche (size, height, count), bench, glass (fixed panel, door, swing), pan slope, drain type (center or linear) and location. Grab-bar blocking: wall objects with height, length and location that print on the plan, elevations and field pack (Round 3).
- Electrical: receptacles (GFCI/AFCI, height, circuit), switches (3-way, dimmer), lights (type tag), fans, detectors, low voltage (data, TV, doorbell, speakers, cameras, Wi-Fi APs), circuits, homeruns, switch legs, panel.
- HVAC: supply diffusers, returns, exhaust fans.
- Existing-condition pins: damage/moisture (photo), protect, lead flag, plumbing, gas, water heater. Also existing HVAC supply and return registers, smoke/CO detectors, electrical panel and devices, attic access, soffits and chases, and per room the floor level, flooring and transitions (Rounds 1 and 2).
- Annotation: dimensions, text, keynotes, callouts, section/elevation/detail markers, revision clouds, saved groups.
