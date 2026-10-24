# EZ Draft: Build Specification

Oct 11, 2026 · @Josh

## How to use this spec

This is the build spec for EZ Draft v1, served at ezdraft.ezcontractorbinder.com. It covers every screen, control, workflow, hook, file format and rule decided through Round 25 of the interview. Round 24, Round 25 and Round 26 decisions (last section) override anything earlier. Anything not decided is listed under Still open instead of being guessed.

**Sources, in order of authority**

1. Your answers in the interview rounds (Rounds 1–23 of the Blueprint Creator plan doc).
2. The Studio-style mockups on the EZ Draft design canvas (screens 01–18b). They define layout and controls.
3. The rest of the plan doc (feature specs, data model, architecture, costs). Where it conflicts with a later round, the later round wins.

When a mockup and a decision disagree, this spec follows the decision and notes the conflict in that screen's Decisions.

**For build agents:** read the ticket row, the sections its Spec ref names, Data model, App shell and Non-functional requirements (Performance). Also read the Architecture rules in Data model and the conventions file from EZD-000. Do not load the whole spec for one ticket. If the spec does not decide something, write the question to the handoff file and move to the next ticket; do not guess.

**Conventions**

- Units: imperial only. Lengths in feet-inches with fractions to 1/16". Display precision is 1/2" on plans and 1/16" on details.
- Accepted typed formats in every length field: `12'6"`, `12' 6 1/2"`, `150"`, `12.5'`.
- Permissions use the names from the per-user checklist (section 9), for example *Edit model* or *Issue permit sets*.
- Events use dot names, for example `plan_set.issued`. An event marked *(new)* was added in this spec; all are accepted, and the canonical names are the ones in section 6 (Claude).
- "(not in mockup)" marks a control or screen the decisions require but no mockup shows yet.
- Placeholders in brackets, like \[Supplier\] or $\[ \], are sample data, not decisions. Section numbers used in cross-references: 1 Product overview, 2 Data model, 3 App shell, 4 Screen-by-screen spec, 5 Workflows, 6 Hooks, 7 Import and export, 8 Calculations, 9 Permissions and settings, 10 Non-functional, 11 Build phases, 12 Decisions and remaining items.

**Glossary**

| Term | Meaning |
| --- | --- |
| Model | The single parametric drawing of a project. Every sheet, render, takeoff and field pack reads it. |
| Model version | An immutable saved state of the model. Checkpoints of the working copy (Stop editing, closing the project, Finish import, Revert; autosaves in between do not make one) are unnumbered working versions (cleaned up after 30 days unless kept); a version sent to another party is numbered (Version N before permit, Rev N after) and permanent. |
| Snapshot | A version you name. Named snapshots are never offered for deletion. |
| Status | Existing, Demo or New on each object. Drives the Existing, Demo and Proposed sheets. |
| Phase switch | The Existing / Proposed toggle in the status bar. Sets the default status for new objects. |
| Revision (Rev) | A formal, numbered issue. Rev 0 is the first issued permit set; Rev 1, 2… are assigned when a changed set is next sent to the client or department. |
| Reference drawing | An uploaded DXF or PDF kept at full fidelity under the model. |
| Markup layer | Clouds, comments, arrows, dims and text drawn over a reference without changing it. |
| Camera view | A named saved 3D angle, reused for renders and the client gallery. |
| Client-ready | A render that was approved and then marked client-ready (two steps). Only client-ready renders reach the share link. |
| Selection | A client choice (option A/B/C, countertop edge, finishes) recorded with approval data. |
| Submittal profile | A saved preset per building department: file split, naming, sheet size, flatten, stamp box, resubmittal mode, minimum scale, required notes, who signs. |
| Edit lock | The rule that one person edits a project at a time. |
| Field pack | The phone view of a project for crews. |
| EZ Binder | EZ Contractor Binder, the job management app EZ Draft links to. |

## Product overview

EZ Draft is a web app that turns a site scan, a PDF, a DXF or a blank page into one model of an interior remodel. Permit sheets, client renderings, field packs, material lists and change orders all come from that model. It is separate from EZ Binder and connected to it by API, webhooks and shared sign-on. Worth Properties is tenant 1; the data model is multi-tenant from the first table so it can be sold later.

**v1 scope**

| Area | In v1 | Later (v2) | Out of scope |
| --- | --- | --- | --- |
| Project types | Kitchen, bath, whole-home interior | Additions, site plans | New construction, commercial TI |
| Inputs | Polycam DXF + GLB, PDF underlay, supplier PDF, architect DXF (full fidelity), supplier rendering image, 2020 order report, blank start with templates | Photo-to-plan, in-app LiDAR, Polycam API pull, DWG | Point clouds |
| Drafting | Walls, openings, rooms, ceilings (flat, slope, vault, tray, coffered), cabinets as boxes, countertops, fixtures (including custom tile showers and grab-bar blocking), devices, existing conditions, dimensions, text, custom details | — | Structural calculations |
| Electrical | Devices, circuits, homeruns, switch legs, low voltage, NEC Art. 220 residential load calc (5 cases), panel schedule, code check on demand (NEC and Florida Building Code rule sets, Round 26) | Commercial load calc | Service design above residential |
| Ceilings | RCP with lighting layout, switching, fixture schedule, ACT grid, HVAC, detectors, beams | Sprinkler heads | — |
| 3D | Live 3D, free orbit, walk, look up, section, saved views, options A/B/C | AR on iPhone beyond USDZ export | VR |
| Render | Angle-first AI render, Fast / Standard / Photoreal tiers, markup-to-fix, approve before client-ready | — | — |
| Takeoff | Quantities by room and trade, waste factors, CSV | Push to EZ Binder estimate | Pricing engine |
| Field | Phone field pack, tasks, measure, 3D, photo pins, conflicts, offline, PDF, per-user language | Progress check-off synced to EZ Binder | Scheduling |
| Client | Share link (30-day expiry), gallery, comments, options, selections, finger signature, selections PDF | Inside the EZ Binder client portal, e-sign via EZ Binder | Payments |
| Revisions | Version history, snapshots, revert, Rev 0/1/2 with clouds, change-order draft to EZ Binder, reference DXF diff | — | — |
| Exports | PDF sets, DXF, GLB, USDZ, CSV, selections PDF, markup PDF/DXF | DWG (paid converter), IFC | — |
| Users | Multi-tenant model, per-user permissions, WP as tenant 1 | Billing, onboarding for other GCs | — |

RCP, photoreal render and reference DXF diff are confirmed v1 (Round 24). Items in the Later column stay later unless moved.

**Users and role presets**

Roles are presets that pre-tick permission boxes. Each user's real access is their own checklist (section 9). Tenants can add unlimited custom roles; there is no user limit in v1.

| Preset | Who | Typical access | Devices |
| --- | --- | --- | --- |
| Owner | Josh | Everything, including users, settings, issuing sets, costs | Desktop, iPad |
| Designer | Office staff, future drafter | Draw, edit, render, export; no issuing | Desktop, iPad |
| Foreman | Superintendent, lead carpenter | Field pack, tasks, photo pins, conflicts, field-verified measurements, fast renders, export, approve translations | Phone, iPad |
| Crew | Field staff | View field pack in their language | Phone |
| Client | Homeowner | Share link only: view, comment, choose options, sign. Not a preset or a user; a customer record (Claude) | Phone, desktop |

Every user must have an email. Crew sign in with a magic link that also carries a 6-digit code to type into the installed app (no password); clients are not users and act through the share link (Round 26); every email the app sends also has a Copy link button so the link can be texted if the email lands in spam. Crew coming from EZ Binder are already signed in through shared sign-on. Users are invited in EZ Draft; when EZ Binder is connected, users can be synced and the customer list syncs both ways.

**Platform**

- One web app, installable as a PWA, for desktop, iPad and phone. No native app in v1.
- Desktop and iPad landscape: full editor. Phone: field pack, client view, 3D viewer, measure, photo markup. No full drafting on phone.
- iPad: large touch targets, Apple Pencil or finger drawing (setting), camera capture into a room.
- Bluetooth laser: through the laser's keyboard mode typing into the focused length field. Safari on iPad has no Web Bluetooth, so direct pairing needs a native shell (not v1).

**Stack**

| Layer | Choice |
| --- | --- |
| App shell | Next.js + React + TypeScript, PWA |
| Geometry core | Own TypeScript package (walls, openings, rooms, snapping, dimensions, countertops, cabinets), pure functions, unit-tested, no UI code |
| 2D + 3D | Three.js via React Three Fiber (orthographic plan, perspective 3D), drawn on demand with batched geometry (section 10, Performance rules) |
| Polygon math | Clipper (booleans), wall openings in 3D by extruding the wall face with holes; three-bvh-csg only where that cannot express the shape |
| Browser path tracing | three-gpu-pathtracer (free photoreal option on user GPU) |
| PDF in | pdf.js |
| PDF out | The geometry package emits one drawing list per view (lines, arcs, fills, and text with metrics from bundled font files). The plan canvas, the on-screen sheet (SVG) and the PDF writer all draw from that list, so screen and print cannot drift. The PDF is written directly from the list with PDFKit in a background job, with embedded fonts and one bookmark per sheet (Round 26) |
| DXF in/out | dxf-parser to read and a DXF writer package to write, both confirmed or replaced by the Phase 0 spike (EZD-029) and then recorded in the conventions file. The same parser serves Phase 3 imports and Phase 9 references. Entity types it cannot read are counted and listed per file, never dropped silently (Round 26) |
| GLB / USDZ | Three.js exporters |
| Database, auth, files | Supabase: Postgres with row-level security, Auth, Storage, Realtime (lock, presence, job progress, notifications) |
| Background jobs | Job table in Postgres for imports, exports, renders and AI reads. Workers run as Vercel Functions, started on enqueue and by a once-a-minute sweep; each job is split so one run fits the function time limit. Long renders run on the local GPU worker or at the provider and report back. Progress reaches the browser over Supabase Realtime (Claude) |
| AI | Image-edit model APIs per render tier; Claude for catalog extraction, translation, task drafts, CO scope text, panel-label reading |
| Offline | Service worker cache + local change queue; the open project's working copy is kept in IndexedDB |
| Hosting | Vercel (app, at ezdraft.ezcontractorbinder.com) + Supabase (data). The local GPU render worker is the preferred render path; it pulls jobs from the cloud queue, and the paid API is the fallback when it is off. |

**Named tools** (Round 26, Claude). One choice per job so every build session uses the same thing. Exact versions are pinned in the conventions file by EZD-000; a new dependency needs an entry there in the same commit.

| Job | Choice |
| --- | --- |
| Next.js mode | App Router; the editor is a client-only shell so it can open offline |
| Package manager and layout | pnpm workspace: the app, the geometry package, the local render worker |
| State store for the open model | Zustand, holding the patch store from EZD-120b |
| Schema and validation | Zod, one file per model object type |
| Unit tests / browser tests | Vitest / Playwright |
| Styling and UI primitives | CSS modules on the design tokens; Radix primitives for dialogs, menus and popovers |
| Device storage | IndexedDB through the idb wrapper; service worker built with Workbox |
| Polygon math | Clipper2 (WebAssembly build), in a worker |
| PDF writer | PDFKit, in the job only |
| DXF | dxf-parser to read, a DXF writer package to write (both confirmed by EZD-029) |
| Email | Resend |
| CI and repository | GitHub with GitHub Actions |
| Error reporting | Sentry (browser, functions and worker), emailing the owner on new errors |
| Database migrations | Supabase CLI migrations, timestamp-named, with generated TypeScript types |

**Relationship to EZ Binder**

- EZ Draft opens from EZ Binder; a project can be created from an EZ Binder job with client, address and job number filled in.
- Shared sign-on: no second login moving between apps. Every EZ Draft screen reached from EZ Binder shows a Back to EZ Binder control that returns to the same job.
- EZ Draft never writes to EZ Binder's database. It sends signed webhooks; EZ Binder calls EZ Draft's inbound API (section 6).
- EZ Binder shows 3D models with Google's `<model-viewer>` component reading the GLB (USDZ for iPhone AR).

## Data model

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

## App shell and global UI

Every editor screen uses one fixed shell: header card, tool rail, left panel, canvas, inspector and status bar. Most work happens on this one screen; Plan, 3D, Sheets and Render are tabs of it, not separate pages. The only separate pages are Projects, Settings, the phone field pack and the client link.

**Frame and visual system (Studio)**

- Desktop frame 1600 × 1000 reference. Header card 60 px, margin 16. Body padding 16, gap 16. Tool rail 56 px. Left panel 248 px. Inspector 336 px. Status bar 30 px.
- Colors: cobalt `oklch(0.55 0.17 262)` (primary, selection), cobalt text `oklch(0.45 0.17 262)`, cobalt tint `#eef1ff`, ink `#14171c`, slate 700/500/400/300 `#3b424d` `#5e6672` `#7a828e` `#9aa3af`, border `#dfe2e6`, divider `#eef0f3`, hover `#f2f4f7`, canvas `#f6f7f9` with 32 px grid `#e6e9ed`, surface `#fff`.
- Status colors: demo / error red `oklch(0.6 0.19 28)`; review amber `oklch(0.72 0.16 65)` on `oklch(0.96 0.04 80)`; approved green `oklch(0.42 0.12 150)` on `oklch(0.95 0.05 150)`.
- Type: Instrument Sans 400/500/600 for UI; DM Mono for every measurement, code and number; Material Symbols Outlined icons, shipped as an SVG sprite of the icons used (the mockups load the icon font; the app does not).
- Radii 5/7/8/10/12/999. Card shadow `0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)`; floating bars `0 6px 20px rgba(20,30,50,.08)`.

**Header card (left to right)**

| Control | Action |
| --- | --- |
| ezdraft wordmark | Goes to Projects |
| Project name + chevron | Opens project switcher (recent projects, search) |
| Subtitle | Client · version · save state ("Saved just now", "Saving…", "Offline, 3 changes queued") |
| Plan / 3D / Sheets / Render tabs | Switch the canvas view. Active tab has cobalt text and a 2 px inset bottom border. Selection carries across tabs. |
| "N to review" pill (amber) | Opens a review list: renders needing approval, unreviewed translations, field conflicts, field measurements, client comments, open code warnings, orphan flags. Hidden when N = 0. |
| Share | Opens share-link panel (create, copy, renew, expire, scope) |
| Export | Opens export menu (section 7) |
| Issue set (primary) | Opens the issue checklist on the Sheets tab. Hidden without *Issue permit sets* or *Issue revisions*. |

Also in the header (Round 24): **Stop editing**, shown only to the lock holder, saves and releases the lock. **Version label**: "Version N" for client sends before permit, "Rev N" after the first permit issue. Every Send dialog in the app has a **Copy link** button beside Send.

**Tool rail**

The rail sits on the left of every editor tab. The active tool is a cobalt button with a white icon; hovering shows a dark tooltip with name and shortcut.

| Tool | Default key | Opens / does | Shown on |
| --- | --- | --- | --- |
| Select | V | Click picks the smallest object; repeated clicks cycle outward (outlet → cabinet → wall). Box select, Shift-click add. | Every editor tab and mode rail |
| Move | M | Drag selection with live distances; type a distance | Plan, 3D (switches to Plan) |
| Wall | W | Single-wall (click, type length, turn) | Plan, 3D (switches to Plan) |
| Room rectangle | R | Click a corner, drag or type width and depth; makes four walls and a room | Plan, 3D (switches to Plan) |
| Door | D | Place on a wall: type offset from a corner or drag with live distances both sides | Plan, 3D (switches to Plan) |
| Window | N | Same placement as doors | Plan, 3D (switches to Plan) |
| Cabinets | C | Cabinet library in left panel; run elevation view (04) | Plan, 3D (switches to Plan) |
| Countertops | K | Trace cabinets, draw outline, seam, cutout (04b) | Plan, 3D (switches to Plan) |
| Fixtures | F | Plumbing fixtures, appliances, custom tile showers, grab-bar blocking | Plan, 3D (switches to Plan) |
| Electrical | E | Devices, circuits, load calc (06) | Plan, 3D (switches to Plan) |
| Ceiling | G | Switches canvas to RCP (05) | Plan, 3D (switches to Plan) |
| Catalog | P | Opens the catalog drawer over the canvas (09) | Plan, 3D, Render |
| Dimension | L | Linear and angular dimensions | Plan, 3D (switches to Plan) |
| Text | T | Text and keynotes | Plan, Sheets |
| Sketch | S | Freehand markup on a markup layer | Plan |
| Detail callout | X | Place a callout; opens the Detail editor (10) | Plan, Sheets |
| Revision cloud | Q | Draw a cloud and delta tag manually | Plan, Sheets |
| Reference | Shift+R | Reference DXF mode (11) | Plan |
| Markup | Shift+M | Markup tools on a reference (11) | Plan (reference mode) |
| Supplier markup | Shift+S | Supplier rendering markup (12) | Plan |
| Measure | Shift+L | Distance between two points; no model change | Every editor tab |
| Check | Shift+C | Runs the code check for the whole project (Run code check) | Every editor tab |
| Help | ? | Shortcuts and help | Every editor tab |

Other default keys: Pan H (Sheets), Look up U (3D), Plan / 3D / Sheets / Render tabs 1 to 4, Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Copy / Paste Ctrl/Cmd+C / V, Save Ctrl/Cmd+S. Mode rails (Ceiling, Detail, Reference, Supplier markup, Sheets) show their own tools plus Select, Check and Help.

Also on the rail of every editor tab, above Help: **Check** (run code check). It checks the whole project, not only electrical, and opens the warning list. Requires *Run code check*. Every tool's shortcut is set in company settings → Defaults.

Decided: every rail tool has a default key. The mockup letters V, M, W, D, C, K, E, L, T are kept; the other keys were chosen so no two commands in the same view share a key. All keys are editable in company settings → Defaults (Claude). Catalog sits on the standard rail (Plan, 3D, Render tabs) and opens as a drawer over the canvas (Claude).

**Left panel and inspector**

- The left panel changes with the active tool: layers and overlays (Select), library (Cabinets), pieces and materials (Countertops), circuits (Electrical), ceiling info and fixture schedule (Ceiling), layers (Reference).
- The inspector shows the selected object: title, sub-line (where it is), status pill (Existing / Demo / New), editable fields in DM Mono, and actions at the bottom. Multi-selection shows shared fields for bulk edit; mixed values show "Mixed".

**Status bar**

- View name, scale (e.g. 1/4" = 1'-0"), snap increment, cursor coordinates or tool hints, zoom %.
- Existing / Proposed segmented toggle: sets the default status for new objects. Each object can still be changed in the inspector.
- Screen-specific readouts, e.g. exposed countertop edge length in linear feet.

**Measurement entry**

- Every length field accepts `12'6"`, `12' 6 1/2"`, `150"`, `12.5'`; stores to 1/16".
- While drawing, typing a number opens an inline length box at the cursor; Enter commits, Tab moves to the angle.
- A laser in keyboard mode types into the focused field.
- Typed or laser values override scanned values; the app then lists every conflict created (section 8).

**Selection, undo and flags**

- Layer filter limits what can be selected. Saved groups (e.g. vanity + mirror + light) can be placed again.
- Undo / redo within the session (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z). Older changes come back through version history.
- Hosted items left off a wall (doors, windows, cabinets, devices) stay put and turn red: "Not on a wall". Open flags block issue.

**Edit lock (all editor tabs)**

1. The first person to open a project for editing holds the lock. Everyone else is view-only.
2. View-only users see an amber banner: "\[Name\] is editing since 9:42 AM · view only" with a **Request edit** button.
3. Request edit prompts the holder: Release or Keep. With no answer in 5 minutes, the holder's work is saved and the lock releases automatically.
4. When the lock is free, the banner turns green: "Available to edit", with a **Start editing** button.

   The free lock goes to anyone: the first person to press Start editing gets it (decided Oct 11).
5. The lock holds while the holder is offline. A Request edit still auto-releases after 5 minutes even if the holder is offline; when the holder reconnects, the app lists every conflict between their queued offline changes and later changes for them to resolve. There is no silent idle timeout.

**Notifications**

In-app bell and email (no SMS in v1), each email with a copyable link: client approval or comment, field conflict, field measurements received, photoreal render finished, edit request, offline sync conflicts, version cleanup due, render allowance refilled, new field pack issued (crew). Sent to the EZ Binder feed once integrated.

## Screen-by-screen spec

Each screen lists its purpose, entry points, permissions, layout, every control with its action and rules, data, states, validation, events and decisions. Screens that use the editor shell describe only what differs from section 3. Numbers match the Studio mockups on the design canvas.

### 01 · Projects

**Purpose:** List every project the user can see, filter and search them, and start a new project from an EZ Binder job, from scratch, or from a file. This is a separate page, not part of the editor shell.

**Entry points:**

- App home after sign-in.
- "Back to projects" from the editor project switcher (header project name menu).
- From EZ Binder: the "EZ Contractor Binder" back link is the return path; EZ Binder can also open this page through shared sign-on.
- Notification links that target a project open that project in the editor, not this page.

**Permissions:**

- View projects: required to see the page and any card. Users scoped to specific projects (Foreman and Crew presets, and clients) see only their projects.
- Create projects: required to see the New project button and all three menu items.
- Delete projects: required for Archive/Delete on a card (not in mockup).
- Manage users and settings: required to see the Company settings button.
- See company costs and See sell prices: no money data on this page.

**Layout:**

- Header card (not the editor shell): wordmark, page title "Projects", "EZ Contractor Binder" back link, search field, notifications button, company settings button, user avatar.
- Title row: H1 "Projects", status filter tabs, sort button, New project split button with menu.
- Project grid: 4 columns of project cards.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Wordmark "ez draft" | Header, left | No action on this page | Static |
| "EZ Contractor Binder" back link | Header, after title | Opens EZ Binder in the same tab, signed in (shared sign-on) | Shown only when the tenant has EZ Binder connected. Opens EZ Binder home |
| Search field | Header, center-right | Filters the grid as you type by client, address or project name | Placeholder "Search client, address or project". Case-insensitive. Combines with the active status tab. Clear by deleting text or Esc |
| Keyboard "/" | Global on page | Focuses the search field | Ignored when focus is already in a text input. Hint chip "/" shown in the field |
| Notifications button | Header | Opens notification list (every kind listed under Notifications in section 3) | Amber dot when unread items exist. aria-label states the count ("Notifications, 3 new"). Clicking an item opens the related project and screen and marks it read |
| Company settings button (gear) | Header | Opens Settings screen | Hidden without Manage users and settings |
| User avatar (initials) | Header, right | Opens account menu: language (English/Spanish, per user), sign out (not in mockup) | Language is a per-user setting (Round 18) |
| Status tab "All" | Title row | Shows all projects. Every status tab shows its count | Default on load. Active tab highlighted |
| Status tab "Draft" | Title row | Filters to status Draft |  |
| Status tab "Client review" | Title row | Filters to status Client review |  |
| Status tab "Permit submitted" | Title row | Filters to status Permit submitted |  |
| Status tab "Approved" | Title row | Filters to status Approved |  |
| Status tab "In build" | Title row | Filters to status In build |  |
| Sort button ("Last edited") | Title row, right | Opens sort menu: Last edited (default), Name, Client, Status, Open items (not in mockup, options beyond Last edited) | Button label shows current sort |
| New project button | Title row, right | Opens the New project menu | Hidden without Create projects |
| Menu item "From an EZ Binder job" | New project menu | Opens New project wizard with an EZ Binder job picker first; client, address and job number prefill | Requires EZ Binder link. Sets project.ezbinder\_job\_id |
| Menu item "Standalone" | New project menu | Opens New project wizard with empty fields |  |
| Menu item "Start from a file" | New project menu | Opens New project wizard with input source preset to "From a file" and the file drop step. Step 1 includes the optional EZ Binder job picker | Accepts Polycam DXF + GLB, PDF, DXF. DWG prompts for DXF (see wizard) |
| Esc / click outside | New project menu open | Closes the menu |  |
| Project card | Grid | Opens the project in the Plan editor (03) | Whole card is one link. Opens view-only with lock banner if another user holds the edit lock |
| Card thumbnail | Card top | Part of card link | Thumbnail of current plan |
| Card status pill | Card, top right | None (display) | Colors per status: Draft grey, Client review blue, Permit submitted amber, Approved green, In build black |
| Card open-items indicator | Card, bottom right | None (display) | "N to review" amber dot, or "Nothing to review" grey |
| Card overflow menu: Rename, Set status, Archive, Delete (not in mockup) | Card, on hover | Rename inline; Set status picks one of the five statuses; Archive hides from default list; Delete asks to confirm by typing the project name | Delete requires Delete projects and is offered only before any version has been sent. After a send, only Archive (sent versions are permanent). Items the user lacks permission for are hidden |
| Drag a file onto the page (not in mockup) | Anywhere on grid | Starts "Start from a file" with that file | Requires Create projects |

**New project wizard (modal or full page; not in mockup):**

Fields from the plan doc screen list: address, client, type, input source, units.

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| EZ Binder job picker | Step 1, EZ Binder path only | Search and pick a job; prefills client, address, job number | Only jobs the user can see in EZ Binder |
| Project name | Step 1 | Text | Required. Default "\<Type> remodel" (e.g. "Kitchen remodel"), editable |
| Address | Step 1 | Text | Required. Used for PDF file naming (Round 4) |
| Property appraiser link | Step 1 | Paste link; app reads parcel number, owner, legal description, year built, living area; user confirms each field | Optional. On read failure, offer "Paste page text" or "Paste screenshot" for AI extraction. Year built before 1978 sets the lead flag |
| Client | Step 1 | Name, email, phone | Picked from the customer list (syncs both ways with EZ Binder) or added new. Optional at creation; required before the first send. Email required. Every emailed link also has a Copy link button |
| Project type | Step 1 | Select: Kitchen, Bath, Whole-home interior | v1 types only |
| Input source | Step 2 | Choice: Polycam scan, PDF, DXF, Field measure (phone), Blank (template) | Preset to file choices when entered via "Start from a file". Field measure creates the project and sends the Foreman a link to 17b; the project opens on 02 Import review when the rooms arrive (Claude) |
| Template picker | Step 2, Blank only | Galley kitchen, L-kitchen, 5x8 bath, primary bath; editable dimensions | Dimension fields accept 12'6", 12' 6 1/2", 150", 12.5' |
| Units | Step 2 | Display only: Imperial | v1 is imperial only, fractions to 1/16" |
| Code edition | Step 2 | Select, defaults from tenant | Per-project setting |
| Submittal profile | Step 2 (not in plan screen list) | Select department profile | Optional; can set later |
| Back / Next / Create | Wizard footer | Navigate; Create makes the project and opens 02 (file) or 03 (blank) | Create disabled until required fields valid |
| Cancel | Wizard footer | Closes without creating | Confirm if fields were edited |

**Start from a file flow (not in mockup as its own screen):**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| File drop zone / Browse | Wizard step 2 | Upload one or more files | Polycam: DXF floor plan plus GLB/GLTF mesh. PDF: vector or scanned. DXF: supplier or architect drawing |
| DWG upload | Drop zone | Rejected with prompt: "Save this drawing as DXF and upload the DXF" | v1 accepts DXF only (Round 21) |
| File type tag per file | File list | Auto-detected: polycam\_dxf, polycam\_glb, pdf, supplier\_pdf, dxf, order\_report, photo, image (supplier rendering) | User can correct the tag |
| PDF: scale calibration | After upload, PDF only | Click two points on the page, type the real distance | Required before tracing. Stored in source\_file.scale\_calibration |
| PDF: detect type | After upload | Vector PDF: auto-detect walls (and cabinet labels for supplier kitchen PDFs). Scanned PDF: trace-only, lower confidence |  |
| DXF: conversion choice | After upload, DXF only | Convert all, convert some layers (layer checklist), or keep as reference only | Original kept at full fidelity as reference\_drawing (Round 22) |
| Supplier rendering images | After upload | Kept as style and finish reference; AI suggests catalog matches for confirmation | Never used as geometry |
| Continue to review | Footer | Queues the import job; opens 02 Import review when detection finishes | Progress shown; editor never blocked |
| Remove file | File list row | Removes the file before import |  |

**Data shown:**

- Per card: thumbnail (current plan), project name, status, client name, address, version label ("Working copy" when nothing has been sent; "Version N" = last version sent before permit; "Rev N" after permit issue), open items count. Source: project, model\_version, permit\_revision, open-item count (review queue).
- Status tab counts: count of projects per status, shown on every tab.
- Notification count: unread notifications for this user.

**States:**

- Empty (no projects): message plus New project button (if Create projects).
- Empty filter/search result: "No projects match" with clear-filter link.
- Loading: card skeletons (placeholder count 6).
- Error: inline banner "Projects could not load" with Retry.
- Offline: show cached projects that were opened on this device; New project disabled; banner "Offline".
- Permission-denied: user without View projects sees "You do not have access to projects"; New project hidden without Create projects.
- Import in progress: card shows "Importing" in place of the open-items indicator (not in mockup).
- Locked by another editor: card can show the editor's initials (not in mockup).

**Validation & warnings:**

- Wizard: name, address and type required; client optional at creation and required before the first send to a client; client email required.
- Length inputs accept the four formats; invalid input shows "Use 12'6", 12' 6 1/2", 150" or 12.5'".
- DWG upload: message to supply DXF.
- Property appraiser read failure: "Could not read this page. Paste the page text or a screenshot."
- Delete: type project name to confirm.

**Events emitted:**

- project.created (new): project id, source (ezbinder, standalone, file), ezbinder\_job\_id.
- import.started (new): project id, source\_file ids.
- project.deleted (new).

**Decisions:**

- Product name is EZ Draft, at ezdraft.ezcontractorbinder.com (Round 24).
- Status list is Draft, Client review, Permit submitted, Approved, In build. Draft on create; Client review on the first send to a client; Permit submitted when a permit set issues; Approved and In build set by the user from the card menu, which can also change any status manually. (Claude)
- Every status tab shows its count. (Claude)
- Sort options: Last edited (default), Name, Client, Status, Open items. (Claude)
- Default project name is "\<Type> remodel" (e.g. "Kitchen remodel"), editable. (Claude)
- Delete is offered only before any version has been sent; after a send the project can only be archived, because sent versions are permanent (Round 24). (Claude)
- No fourth menu item. Blank (template) is an input source in wizard step 2 for both "From an EZ Binder job" and "Standalone"; "Start from a file" presets the file source. (Claude)
- "Start from a file" step 1 includes the optional EZ Binder job picker. (Claude)
- The "EZ Contractor Binder" link opens EZ Binder home and shows only when EZ Binder is connected. (Claude)
- Client is optional at creation and required before the first send. Every client needs an email (Round 24). Clients come from the customer list, which syncs both ways with EZ Binder (Round 24).

### 02 · Import review

**Purpose:** Confirm walls, openings, rooms, cabinets and ceiling data detected from a Polycam scan, PDF or DXF before they become model data. Resolve conflicts between typed or laser measurements and the scan.

**Entry points:**

- New project wizard "Continue to review" after a file import.
- Upload of a new file to an existing project (scan, supplier PDF, DXF, revised architect DXF), or rooms sent from the phone (17b Field measure, source kind field\_measure).
- "N to review" pill in the editor header when an import has unreviewed items.
- Notification when an import job finishes (not in mockup).

**Permissions:**

- View projects: view the review in read-only.
- Edit model: required for every accept, fix, delete, typed measurement and Finish import. Also requires holding the edit lock.
- Manage users and settings: required to change the conflict threshold (link goes to Settings).
- Create projects: needed only when the import is part of creating a new project. Upload references: needed to upload a reference DXF or PDF, including a revised architect DXF.

**Layout:**

- Header card (differs from standard shell): wordmark, project name with source subtitle, 3-step progress (Upload, Review, Finish), Cancel import, Finish import. No Plan/3D/Sheets/Render tabs.
- Left panel 320px: detected items list with mode switch.
- Canvas: scan underlay with detected geometry, legend, zoom stack.
- Right panel 336px: selected item inspector with conflict resolution.
- Status bar: source, scan accuracy, input mode, zoom.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Progress steps (Upload, Review, Finish) | Header center | Display only | Upload done (green check), Review current (blue), Finish pending |
| Cancel import | Header | Asks to confirm, then discards detected items. Uploaded source files are kept | No model changes are made |
| Finish import | Header, primary | Writes accepted items to the model as a new model version; opens 03 Plan | Disabled while any item is unresolved (see Validation). Unconverted DXF content stays as reference |
| Mode: One by one | Left panel segmented control | Steps through every detected item in order; inspector shows Accept / Fix / Delete for each; Next/Previous | Chosen per import |
| Mode: Accept + fix | Left panel segmented control | Lists only low-confidence "To check" items; high-confidence items can be accepted in one click | Default shown in mockup |
| Mode: By room | Left panel segmented control | Groups items by detected room; accept or fix room by room |  |
| Summary line | Left panel header | Display: found, high confidence, to check counts | Updates as items are resolved |
| "To check" list row | Left panel | Selects the item; canvas highlights it in blue and zooms to it; inspector shows it | Row shows status dot (blue selected, amber to check) and confidence % |
| "Accepted" summary | Left panel | Display: counts of accepted walls, windows, doors, rooms, fixtures + cabinets | Clicking a count filters the canvas to that type (not in mockup) |
| Fix selected | Left panel footer | Enters edit mode on the selected item on the canvas (move endpoints, change size, swing, type) | Requires a selection |
| Delete | Left panel footer | Removes the detected item; it does not become model data | Undoable within the session |
| Accept N | Left panel footer, primary | Accepts all high-confidence items (N = count) | Label shows count |
| Click item on canvas | Canvas | Selects it; list and inspector sync | Smallest item under cursor first |
| Drag endpoint / edge (in Fix mode) | Canvas | Moves wall ends or opening edges with live dimensions | Snaps as in Plan editor |
| Hover item | Canvas | Shows item name and confidence |  |
| Scroll / pinch | Canvas | Zoom toward cursor |  |
| Right-drag or space-drag / two-finger drag | Canvas | Pan |  |
| Zoom in / Zoom out | Canvas, top right stack | Step zoom |  |
| Show 3D mesh | Canvas, zoom stack | Toggles the Polycam GLB mesh view to check cabinets, soffits and ceiling heights | Only when a GLB was uploaded |
| Typed or laser input | Inspector | Type or laser a length; it overrides the scan | Accepts 12'6", 12' 6 1/2", 150", 12.5'. Laser in keyboard mode types into the focused field |
| Scan reads | Inspector | Display only | Read-only |
| Conflict list ("Typed wins. This creates") | Inspector | Lists every conflict the typed value creates (room no longer closes, opening offsets change) | Red icon for errors, amber for warnings. Click a line to zoom to it (not in mockup) |
| Pick the wall that absorbs it | Inspector, Resolve the gap | Enters pick mode; click a wall on the canvas; that wall's length changes so the room closes | Only shown when a room no longer closes |
| Keep the room out of square | Inspector, Resolve the gap | Accepts the gap; room is kept out of square; warning overridden | Records an override (see Events) |
| Accept / Reject this item (One by one mode, not in mockup) | Inspector footer | Accepts or removes the item and advances to the next |  |
| Conflict threshold link "change in settings" | Inspector footer | Opens Settings at the threshold field | Requires Manage users and settings; link hidden otherwise (the value still shows) |
| Esc | Canvas | Cancels Fix or pick mode |  |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Global | Undo / redo review actions | Session only |

**Data shown:**

- Detected items from the import job: type, label (e.g. "North wall, east half", "Window W3 size", "Ceiling slope, east", "Door D2 swing"), status (existing), confidence %.
- Canvas: scan underlay (grey), accepted (green), to check (amber dashed), selected (blue), gap marker (red) with size, typed vs scan label.
- Inspector: item name, type, status, confidence, typed value, scan value, conflict list.
- Footer: source (e.g. "Polycam Space · DXF + GLB"), scan accuracy (±1/2" for Polycam), input mode ("type or laser (keyboard mode)"), zoom %.
- Tolerance from company settings under Defaults; one setting covers scan-vs-typed and field measurements (mockup: 1/2").

**States:**

- Loading / detecting: progress with item count so far; canvas shows underlay only.
- Empty: no items detected (e.g. scanned PDF): "Nothing detected. Trace over the underlay in the Plan editor" with a button to open the Plan editor with the underlay.
- Error: import job failed: message with file name and Retry; Cancel import stays available.
- All resolved: "To check" list empty; Finish import enabled.
- Room not closed: red gap marker and inspector section "Resolve the gap".
- Locked / view-only: another user holds the edit lock; all edit controls disabled; lock banner shows who and since when, with Request edit.
- Offline: review can continue on cached data; Finish import queues as an offline change and syncs later.
- Permission-denied: without Edit model, read-only with a note "You can view this import but not change it".
- Revised architect DXF: change highlights show what changed and which markups and model objects sit on changed areas (Round 22).
- Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check results shown per cabinet.

**Validation & warnings:**

- Confidence below the high-confidence cutoff goes to "To check".
- Typed vs scan difference greater than the tolerance (company setting under Defaults, shared with field measurements; mockup 1/2") creates a conflict.
- Room closure: typed lengths must add up; a gap is shown with its size; resolve by picking an absorbing wall or keeping the room out of square.
- Typed value change that moves an opening relative to a corner: warning with the change amount.
- Bearing walls detected or marked: flagged; later removal is blocked without engineer.
- Finish import blocked while any "To check" item is unresolved or any room has an unresolved gap.

**Events emitted:**

- import.completed (new): project id, source\_file ids, counts accepted/deleted, model\_version\_id.
- import.cancelled (new).
- room.closure\_overridden (new): room id, gap size, user.
- model.saved on Finish import.

**Decisions:**

- The high-confidence cutoff is a company setting under Defaults, entered by the owner (Round 24).
- Finish import requires every item to be resolved (accepted, fixed or deleted) and every room gap resolved. Nothing imports with a pending flag. (Claude)
- This screen is outside the editor shell. The header shows the progress steps instead of the Plan/3D/Sheets/Render tabs. (Claude)
- "Accept N" accepts only high-confidence items. Each "To check" item needs its own action. (Claude)
- There is no separate Finish page. Finish import writes the items, marks step 3 done and opens 03 Plan with a short notice of the counts imported. (Claude)
- "Pick the wall that absorbs it" accepts any wall of the room that does not close, adjacent to the gap or not. Walls of other rooms cannot be picked. (Claude)
- Ceiling slope items are fixed in the inspector with the same three inputs as Round 1: heights at points (low/high wall), pitch, or the value read from the mesh. (Claude)
- DXF layer selection (convert all, some layers, or none) happens in the upload step. This screen lists only items from the layers chosen for conversion. (Claude)

### 03 · Plan editor

**Purpose:** Draw and edit the one parametric model in plan: walls, openings, rooms, cabinets, countertops, fixtures, electrical, ceiling, dimensions and annotations. Every other output reads this model.

**Entry points:**

- Project card on 01 Projects.
- "Plan" tab in the header.
- Finish import on 02.
- Notification or "N to review" item that targets a plan object.
- Field conflict or field-verified measurement notifications.
- EZ Binder inbound link to a project.

**Permissions:**

- View projects: open the editor in view-only.
- Edit model: every drawing tool, inspector edit, move, delete, undo/redo, and Request edit. Also requires holding the edit lock.
- See company costs: cost fields in inspectors.
- Approve field measurements: approve or reject field measurements on the Field measurements review screen, opened from the review pill or the notification.
- Share (Send to client), Export, Issue set (Issue permit sets / Issue revisions): header buttons per standard shell.
- Run fast renders: Render tab per standard shell. Run code check: Check button on the rail. Controls the user lacks permission for are hidden.

**Layout:**

- Standard editor shell.
- Left rail: tool buttons (see Controls).
- Left panel 248px with tabs Layers, Rooms, Versions, Tasks (see Field tasks). Layers tab sections: Phase, Overlays, Rooms.
- Canvas: plan with grid; floating typed-dimension bar bottom center; zoom stack top right.
- Inspector 336px: properties of the selection, client selections, run totals, live 3D preview, primary action plus More.
- Status bar: View (Existing / Proposed), Scale, Snap, Cursor coordinates, Zoom.

**Controls — rail tools:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Select (V) | Rail | Click picks the smallest object under the cursor; repeated clicks at the same spot cycle outward (e.g. outlet → cabinet → wall) | Default tool. Esc returns here from any tool. Selection limited by layer filter |
| Move (M) | Rail | Drag the selection, or click base point then target point; type a distance in the dimension bar | Snaps apply. Walls follow wall move behavior below |
| Wall (W) | Rail | Single-wall mode: click start, type length, Enter, turn, continue; double-click or Enter twice to finish; click start point to close | Thickness, layers (stud, drywall, tile backer) and height from defaults, editable in inspector. Dimensions are to finished face. Status from phase switch |
| Room rectangle (R) (not in mockup) | Rail, or Wall tool option | Click corner, drag or type width and depth; creates four walls and a room | Plan doc Round 2 and older mockups list it; Studio mockup omits it |
| Door (D) | Rail | Hover a wall to preview; click to place; type offset from a corner, or drag along the wall with live distances to both sides | Must be hosted on a wall. Size and swing from library; swing flip with Space or inspector |
| Window (no key shown) | Rail | Same placement as Door | Attributes: size, rough opening, sill height, impact rating |
| Cabinets (C) | Rail | Switches the left panel to the cabinet library and opens the cabinet run workflow (screen 04) | Tooltip "Cabinets C" shown in mockup on hover |
| Countertops (K) (not in this mockup) | Rail | Opens countertop tools (screen 04b) | Present in 04b and later mockups but missing from 03 |
| Fixtures | Rail | Opens fixture library (plumbing fixtures, appliances, custom tile showers with curb, niche, bench, glass, pan slope and drain type, grab-bar blocking); click to place | Appliances carry utility points (electric, gas, water, drain) |
| Electrical (E) | Rail | Opens device library and circuit tools (Electrical screen) | Devices are the same objects on RCP and electrical plan |
| Ceiling | Rail | Opens ceiling tools (RCP screen) |  |
| Dimension (L) | Rail | Click two points or a wall face; place the dimension line; type to override text | Auto dimensions (overall, rooms) placed automatically, then adjustable |
| Text (T) | Rail | Click to place a note or label; leader optional | Prints at fixed paper size at any scale |
| Sketch | Rail | Freehand pen on a markup layer; strokes auto-clean to lines, arcs, circles, rectangles; hold to keep the raw stroke | Pencil-only or finger per user setting |
| Detail callout | Rail | Place a callout bubble linked to a detail; click an existing bubble to open the detail | Draw a section line to start a "cut from the model" detail |
| Revision cloud (not in mockup) | Rail | Draw a cloud and delta tag manually | Plan doc rail list includes "cloud". Automatic clouds are added on revision |
| Check | Rail, above Help (every editor tab) | Runs the code check on demand and opens the warning list; click a warning to zoom to the object | Requires Run code check; hidden otherwise. Warnings only, never auto-fixes |
| Help | Rail, bottom | Opens help and shortcut list |  |
| Hover rail button | Rail | Tooltip with tool name and shortcut |  |

**Controls — canvas interactions and shortcuts:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Click | Canvas, Select tool | Select smallest object; inspector shows it |  |
| Repeated click same spot | Canvas | Cycles selection outward to the next larger object | Cycle resets when the cursor moves |
| Shift+click | Canvas | Add/remove object from selection |  |
| Drag on empty space | Canvas, Select tool | Box select | Respects layer filter |
| Drag object | Canvas, Select or Move | Moves the object with live dimensions |  |
| Drag selection handle (corner circles) | Canvas | Resize the selected object | Typed size accepted during drag |
| Drag wall | Canvas | Connected walls stretch so corners stay joined; dimensions update live | Hosted doors, windows, cabinets and devices do not move with the wall |
| Double-click | Canvas | Edits the object in place (e.g. dimension text, text, wall length field) |  |
| Right-click / long-press | Canvas | Context menu: Copy, Paste, Duplicate, Mirror, Align, Group, Save as group, Set status (Existing / Demo / New), Delete (not in mockup) |  |
| Hover | Canvas | Highlights the object that a click would select |  |
| Scroll / pinch | Canvas | Zoom toward cursor |  |
| Space-drag, right-drag or two-finger drag | Canvas | Pan |  |
| Snap: endpoints, midpoints, 90/45°, wall faces | Canvas while drawing or moving | Snap marker shows snap type | Snap increment shown in status bar |
| Typed dimension bar | Canvas, bottom center | Shows active tool and field (e.g. "Length 6' 0""); type a size or use the laser | Formats: 12'6", 12' 6 1/2", 150", 12.5'. Enter commits |
| Tab | Typed dimension bar | Moves to the next field (e.g. Length → Angle, or offset left → offset right) | Shown as hint chip |
| Enter | Global while drawing | Commits typed value |  |
| Esc | Global | Cancels current operation; second Esc clears selection and returns to Select |  |
| Delete / Backspace | Global | Deletes selection | Bearing wall deletion blocked with engineer prompt |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | Global | Undo / redo | Session only; older changes come back through Versions |
| Ctrl/Cmd+C / V | Global | Copy / paste |  |
| Ctrl/Cmd+A | Global | Select all on visible, selectable layers (not in mockup) |  |
| Zoom in / Zoom out / Fit to screen | Canvas, top right stack | Step zoom; fit model to view |  |
| Live distance chips | Canvas | Display distances from selection to nearest walls while dragging (e.g. 3' 10 1/2", 4' 11 1/2") | Click a chip to type an exact distance |
| Red flag on hosted item | Canvas | Click selects the item; inspector shows "Not on a wall" | See hosted-item flags |

**Controls — left panel:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Layers | Left panel | Shows Phase, Overlays, Rooms sections | Default |
| Tab: Rooms | Left panel | Room list with area; select room; room properties (name, floor finish, ceiling type, photos) |  |
| Tab: Versions | Left panel | Version history: sent versions (Version N, Rev N), named snapshots and unnumbered working versions; Name snapshot, Revert. No visual compare in v1 (Claude) | Unsent working versions auto-delete at 30 days through the cleanup sheet (tick to keep; kept ones become named snapshots; unticked delete 7 days later). Sent versions and named snapshots are never deleted. Revert requires Edit model |
| Phase row: Existing (eye) | Layers > Phase | Show/hide existing objects | Grey dot |
| Phase row: Demo (eye) | Layers > Phase | Show/hide demo objects | Red dot |
| Phase row: New (eye) | Layers > Phase | Show/hide new objects | Blue dot |
| Overlay: Electrical (eye) | Layers > Overlays | Show/hide electrical objects | Hidden in mockup (greyed row) |
| Overlay: Ceiling (eye) | Layers > Overlays | Show/hide ceiling objects |  |
| Overlay: Dimensions (eye) | Layers > Overlays | Show/hide dimensions |  |
| Overlay: Architect DXF (REF, eye) | Layers > Overlays | Show/hide reference drawing; expand to show its own layers with show/hide and recolor (not in mockup) | Reference is locked under the model; snap and measure work on it |
| Layer lock / selectable toggle (not in mockup) | Each layer row | Limits what can be selected (layer filter) | Plan doc Round 11 |
| Room row | Layers > Rooms | Selects the room and zooms to it | Shows name and sf |

**Controls — inspector (selection: Island run, as in mockup):**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Title and subtitle | Inspector header | Object name and contents (e.g. "Island run · 2 boxes · 2 end panels") |  |
| Status pill (New) | Inspector header | Click to change status: Existing, Demo, New | Defaults from phase switch; per-object override |
| Width / Depth / Height | Inspector | Typed lengths; model updates | Length formats as above |
| Client selection tiles (Countertop, Cabinet finish) | Inspector | Opens catalog picker for that selection | Shows swatch and item name |
| Run total line | Inspector | Display: box list and total (e.g. "B36 + DB36 + 2 × 3/4" panel · 73 1/2"") |  |
| Live 3D preview | Inspector | Small live 3D of the selection |  |
| Open 3D | Live 3D preview | Opens the 3D tab focused on the selection |  |
| Cabinet schedule | Inspector footer | Opens cabinet schedule | Primary action changes by object type |
| More (…) | Inspector footer | Menu: Copy, Mirror, Align, Group, Save as group, Delete (not in mockup) |  |
| Bulk edit (multi-select, not in mockup) | Inspector | Shared fields editable for all selected; mixed values shown as "Mixed" |  |
| Wall inspector fields (not in mockup) | Inspector, wall selected | Length, thickness, layers, height, status, bearing flag | Bearing wall cannot be set to Demo without engineer prompt |
| Door/window inspector fields (not in mockup) | Inspector | Size, swing/hand, offset from corner, rough opening, sill height, impact rating, catalog item |  |

**Controls — status bar:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| View: Existing / Proposed | Status bar | Sets the phase for new objects and the plan display. Existing: draws new objects as existing. Proposed: new objects default to New | Individual objects can be overridden in the inspector |
| Scale | Status bar | Shows current plan scale (e.g. 1/2" = 1'-0"); click to change (not in mockup) | Sheet scale is set per viewport on Sheets |
| Snap | Status bar | Shows snap increment (e.g. 1/2"); click to open snap toggles: endpoints, midpoints, 90/45°, wall faces, increment (not in mockup) | Plan doc puts snap toggles in the bottom bar |
| Cursor | Status bar | Live cursor coordinates | Display only |
| Zoom % | Status bar | Shows zoom; click to type a zoom value (not in mockup) |  |

**Data shown:**

- Model objects of the current version: walls, openings, rooms with area, cabinets with codes, fixtures, devices, dimensions, annotations, reference drawings.
- Header subtitle: client, version label ("Working copy", or the last sent "Version N" / "Rev N"), save state ("Saved 2 min ago").
- Overall and room dimensions (auto) at 1/2" display precision.
- Inspector: dimensions, status, finish selections, catalog item, cost (only with See company costs).

**States:**

- Empty (blank project): grid only with a hint to pick a template or draw walls.
- Loading: canvas skeleton; tools disabled until model loads.
- Saving / saved: header subtitle shows "Saving…", "Saved just now", "Saved N min ago".
- Error saving: banner "Changes not saved" with Retry; edits kept locally.
- Offline: edits continue and save on the device; banner "Offline · changes will sync"; edit lock is held unless another user's Request edit times out.
- Locked / view-only: another user is editing: amber banner "\<Name> is editing since \<time>" with Request edit; all edit tools disabled. Turns green "Available to edit" when released; the first user to press Start editing gets the lock. The holder releases with Stop editing in the header or by closing the project; both save first.
- Request edit pending: editor gets release / keep prompt; auto release after 5 minutes with the editor's work saved first. The 5 minutes run even if the holder is offline; on reconnect the former holder gets a conflict notification listing clashes to resolve.
- Permission-denied: without Edit model, view-only without Request edit.
- Sent or issued version (Version N or Rev N): that version is frozen; editing continues on a working copy; changes are gathered for the next revision and will be clouded.
- Hosted item not on a wall: red flag.
- Room not closed: gap shown.

**Validation & warnings:**

- Wall move: hosted doors, windows, cabinets and devices stay in place. If one is left off any wall it is flagged red "Not on a wall" until fixed. Open flags appear in the issue check and block Issue set.
- Room closure: typed lengths must add up; gap shown; pick the wall that absorbs it or keep the room out of square.
- Bearing walls: removing or opening a wall marked bearing is blocked or flagged with "Engineer required".
- Typed measurement that conflicts with the scan by more than the threshold: lists every conflict it creates.
- Length input parse errors show accepted formats.
- Moving an appliance shows which utilities must move. Bath clearance checks warn when fixture clearances fall below the values in Defaults (Round 3).

**Events emitted:**

- model.saved: on save.
- takeoff.updated: when quantities change.
- lock.requested, lock.released.
- field.measurement\_approved / field.measurement\_rejected.

**Decisions:**

- The rail adds Room rectangle and Revision cloud from the plan doc, and Check from Round 24. (Claude)
- Sketch and Detail callout both stay on the rail on every editor tab. Detail callout uses the frame\_inspect icon. (Claude)
- Countertops (K) is on the rail on every editor tab. Fixtures uses the wash icon. (Claude)
- Keyboard shortcuts are company settings under Defaults (Round 24). The mockup letters (V, M, W, D, C, K, E, L, T) are kept; the other default keys are in the section 3 rail table; all are editable (Claude).
- Existing/Proposed sets the default status for new objects and the display. Existing shows existing objects and hides new ones. Proposed shows objects to remain plus new ones and hides demo. The Phase eye toggles override the display. (Claude)
- Demo is set per object, from the status pill or Set status in the context menu. Multi-select works for many objects at once. (Claude)
- The Versions tab lists sent versions (permanent), named snapshots and unnumbered working versions, with the 30-day cleanup sheet (Round 24).
- Scale and Snap in the status bar are clickable and open small popovers. Snap holds the snap toggles and increment; Scale holds the plan display scale. (Claude)
- Save as group is in the context menu and More. Saved groups appear in the Saved tab of the matching library and are dragged in to place. (Claude)
- The layer filter is a lock icon on each layer row in the Layers panel. The status bar has no filter control. (Claude)

### 04 · Cabinet run + elevation

**Purpose:** Build and edit a cabinet run from individual boxes, fillers, panels and trim, seeing the plan strip and the wall elevation with real door and drawer faces at the same time. Cabinets are never one block (Round 21).

**Entry points:**

- Cabinets (C) tool on the rail.
- Double-click a cabinet run on the 03 plan (not in mockup).
- "Cabinet schedule" in the 03 inspector, then a run row.
- Runs tab of this screen's left panel.
- Finish import of a supplier kitchen PDF, 2020 DXF or cabinet order report (cabinets arrive as real boxes).

**Permissions:**

- View projects: view runs, plan strip, elevation and schedule.
- Edit model: place, drag, resize, swap, delete boxes; Auto-fill run; inspector edits. Also requires the edit lock.
- See company costs: Cost row in the inspector Catalog section; costs in the schedule.
- Edit catalog: add or change vendor lines and SKUs in the catalog (the library here only reads them).
- Export: export the cabinet schedule (CSV/PDF) from the schedule view.

**Layout:**

- Standard editor shell, Cabinets tool active. Differences: status bar shows View "Plan + elevation A", Scale, Increment, Zoom and the Existing/Proposed toggle. The rail is the full standard rail, including Countertops (K), Detail callout and Check.
- Left panel 248px "Cabinet library": tabs Boxes / Runs / Saved; search; line section; Fillers, panels, trim section.
- Canvas: run header bar; plan strip of the run against its wall; Elevation A of the same run with uppers, countertop, toe kick, chain dimensions (widths) and height dimensions.
- Inspector 336px: selected box (title, position in run, status pill, size fields, Face section, Catalog section, Swap box, Cabinet schedule).

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Boxes | Left panel | Shows box library for the active line | Default |
| Tab: Runs | Left panel | Lists every run in the project (name, box count, fit status); click to open that run on the canvas |  |
| Tab: Saved | Left panel | Lists saved groups / runs from the company library; drag to place a copy | Copy is independent of the library version |
| Search "Code or size, e.g. B24" | Left panel | Filters library rows by code or size | Matches code prefix and width |
| Line label "Line: \[Supplier\] Shaker" | Left panel | Click opens a line picker: vendor lines and "Custom boxes" (not in mockup) | Lines come from the tenant catalog |
| Library row B9–B24 "Base, 1 door" | Left panel | Drag onto plan strip or elevation to insert a box; drop position sets order in the run | Width set by typing in the dimension bar on drop, in 3" steps within the range |
| Library row B27–B36 "Base, 2 doors" | Left panel | Same as above |  |
| Library row DB12–36 "Drawer base" | Left panel | Same |  |
| Library row SB30–36 "Sink base" | Left panel | Same |  |
| Library row BBC42 "Blind corner" | Left panel | Same | Corner/blind type |
| Library row W1230+ "Wall, 30" tall" | Left panel | Same; placed in the upper row |  |
| Library row T1884 "Tall pantry" | Left panel | Same; spans base and upper rows |  |
| Library row F3 "Filler, scribe" | Left panel | Drag to place a filler | Carries a scribe allowance |
| Library row EP "End panel 3/4"" | Left panel | Drag to place an end or decorative panel |  |
| Library row DWP "Dishwasher panel" | Left panel | Drag to place an appliance panel |  |
| Library row TK / LR / CM "Toe kick, light rail, crown" | Left panel | Drag or click to add trim along the run | Each is its own object |
| Drag handle icon on rows | Left panel | Indicates draggable | Cursor "grab" |
| Run name ("Back wall run") | Canvas header | Click to rename (not in mockup) |  |
| Run counts ("6 boxes · 2 fillers") | Canvas header | Display |  |
| Fit chip ("Run 117" fits wall 117 1/2" · 1/2" scribe") | Canvas header | Display; click zooms to the filler/scribe location (not in mockup) | Green when run + scribe matches the wall; flagged when it does not (Round 21) |
| Auto-fill run | Canvas header | Fills the selected wall run with real boxes in 3" increments plus fillers at walls and appliances; shows result for confirmation | Existing boxes are replaced only after confirm. Any box can be swapped after |
| Click box (plan strip or elevation) | Canvas | Selects that box; same box highlights in both views; inspector shows it | Selected box drawn blue |
| Shift+click box | Canvas | Adds to selection for bulk edit (finish, depth, height) |  |
| Drag box | Canvas | Reorders within the run; others shift | Run total recalculates live |
| Drag box side edge | Canvas | Resizes width in the run increment (3") | Code updates (e.g. B15 to B18) |
| Double-click box | Canvas | Focuses Width field |  |
| Right-click box | Canvas | Context menu: Swap box, Duplicate, Delete, Save as group (not in mockup) |  |
| Hover box | Canvas | Highlights the same box in both views |  |
| Chain dimension text | Elevation, bottom | Click to type an exact width for that box |  |
| Height dimension text (30", 18", 36") | Elevation, right | Click to type upper height, backsplash gap, base height (not in mockup) |  |
| Status pill (New) | Inspector header | Change status: Existing, Demo, New | Default from phase |
| Width | Inspector | Typed width | Length formats as in 03 |
| Depth | Inspector | Typed depth |  |
| Height | Inspector | Typed box height (34 1/2" for base) |  |
| Face > Layout select | Inspector | False drawer + 2 doors; 2 doors; Drawer + 2 doors | Options depend on box type; elevation redraws |
| Face > Hinges: Left / Pair / Right | Inspector | Sets hinge side |  |
| Face > Finished ends: None / Left / Right / Both | Inspector | Sets finished ends |  |
| Catalog > Item | Inspector | Display SKU; click opens catalog to pick another SKU (not in mockup) |  |
| Catalog > Finish | Inspector | Display; click opens finish picker | Finish selection can be a client selection |
| Catalog > Cost | Inspector | Display "$… · internal" | Hidden without See company costs |
| Swap box | Inspector footer | Lists compatible boxes (same width or same slot); pick to replace | Keeps position in run |
| Cabinet schedule | Inspector footer | Opens the schedule: code, qty, finish, notes | Used by sheets, takeoff and supplier order |
| Delete / Backspace | Global | Removes selected box(es); run total updates |  |
| Esc | Global | Clears selection / cancels drag |  |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Global | Undo / redo | Session only |
| Zoom (scroll / pinch), pan | Canvas | As in 03 | No zoom stack shown in this mockup |

**Data shown:**

- Box: code, width, depth, height, type (base, wall, tall, vanity, sink base, drawer base, corner/blind, appliance panel), door/drawer layout, hinge side, finished ends, catalog item (SKU), finish, cost, status, position ("Box 4 of 6").
- Run: name, box count, filler count, run total, wall length, scribe.
- Plan strip: wall, boxes with codes, fillers dashed.
- Elevation: door and drawer faces from layout, uppers, window, countertop, toe kick, chain widths, heights.

**States:**

- Empty wall: no boxes; prompt "Drag boxes or Auto-fill run".
- Run mismatch: fit chip turns to warning with the difference.
- Imported run: boxes from supplier import carry import confidence until reviewed in 02.
- Loading, error, offline, locked/view-only, permission-denied: as in 03.

**Validation & warnings:**

- Run total vs wall length mismatch flagged (Round 21).
- Box widths in standard 3" increments; custom boxes allowed outside increments (Round 3).
- Hosted cabinet left off a wall after a wall move: red "Not on a wall" flag (Round 11).

**Events emitted:**

- takeoff.updated (cabinet count by size).
- cabinet\_schedule.updated (new).

**Decisions:**

- The 04 status bar shows the Existing/Proposed toggle, same as 03. (Claude)
- The fit tolerance is a company setting under Defaults (Round 24). The chip is green when the wall length minus run total and fillers is within tolerance, amber otherwise, and shows the difference. (Claude)
- An elevation picker in the run header lists the elevations that include this run (A, B, ...). Base and upper rows always show together; there is no row switch. (Claude)
- The rail in 04 is the full standard rail: Countertops (K), Detail callout and Check included. (Claude)
- Auto-fill fills around appliances and openings already placed and leaves their openings. If none are placed, it fills the whole wall run, and the user swaps boxes for appliances afterward. (Claude)

### 04b · Countertops

**Purpose:** Create countertop pieces over the cabinets, set overhang per edge, place seams and cutouts, choose or offer the edge profile, and feed the countertop plan, edge detail and top schedule. These outputs are for internal and client use only and are not part of the permit drawings (Round 24).

**Entry points:**

- Countertops (K) tool on the rail.
- Countertop tile in the 03 inspector Client selections.
- Edge-profile choice made by the client (notification).
- Support notice links back from the detail.

**Permissions:**

- View projects: view pieces, overhangs, profiles.
- Edit model: Trace cabinets, Draw outline, Seam, Cutout, overhang and profile edits. Requires the edit lock.
- See sell prices: price differences in the offered list, shown as a total for this top.
- Send to client: "Edit offered edges" publishing to the client portal.
- Manage users and settings: "Change in company settings" for default overhangs and support limit.

**Layout:**

- Standard editor shell, Countertops (K) active. Status bar adds Exposed edge (lf) and Increment; no Existing/Proposed toggle in mockup.
- Left panel: tabs Pieces / Edges / Material; Pieces list; Material; Default overhangs; footer totals.
- Canvas: tool bar card (Trace cabinets, Draw outline, Seam, Cutout), hint text, edge-profile status pill; countertop plan over dashed cabinets; legend.
- Inspector: piece header; Overhang by side diagram; preset chips; support notice; seats; Edge profile; offered list; Edit offered edges; Top schedule.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Pieces | Left panel | Lists pieces | Default |
| Tab: Edges | Left panel | Lists edges by piece with overhang and exposed/wall/splash (not in mockup) |  |
| Tab: Material | Left panel | Material, thickness and backsplash settings (not in mockup) |  |
| Piece row (A Back wall, B Left return, C Island) | Left panel | Selects the piece; canvas and inspector sync | Shows label, name, size, "seating" tag |
| Material swatch row ("Quartz · 3 cm") | Left panel | Opens catalog picker (category counter) |  |
| Backsplash row ("4" · same") | Left panel | Edit height and material |  |
| Behind range row ("Full height") | Left panel | Edit behind-range splash |  |
| Default overhangs rows | Left panel | Display: Standard 1 1/2", Seating counter height 12", Seating bar 10", Against wall 0 + splash | From company settings |
| "Change in company settings" link | Left panel | Opens Settings at countertop defaults | Requires Manage users and settings |
| Footer totals | Left panel | Display: pieces, seams, total sq ft |  |
| Trace cabinets | Canvas tool bar | Creates tops automatically from cabinet runs with default overhangs | Disabled when no cabinets |
| Draw outline | Canvas tool bar | Click points to draw a custom top shape; typed lengths | Snaps as in 03 |
| Seam | Canvas tool bar | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C) |
| Cutout | Canvas tool bar | Place a sink or cooktop cutout; link to the fixture/appliance cutout size from catalog |  |
| Click edge | Canvas | Selects that edge; inspector highlights the side | Hint: "Click any edge, then pick its overhang" |
| Overhang chip on edge | Canvas | Click to type a value | Seating overhang shows as filled chip |
| Click piece | Canvas | Selects piece |  |
| Drag outline vertex (not in mockup) | Canvas | Reshape custom outline |  |
| Edge profile status pill ("Edge profile: client choosing") | Canvas header | Scrolls inspector to Edge profile | Shows Open, Chosen states |
| Overhang inputs Front / Left / Right / Back | Inspector diagram | Type value per side | Active side has blue border; label shows "seating" when seating overhang |
| Preset chip Flush 0 | Inspector | Sets selected edge to 0 |  |
| Preset chip Standard 1 1/2 | Inspector | Sets 1 1/2" |  |
| Preset chip Bar 10 | Inspector | Sets 10" |  |
| Preset chip Seating 12 | Inspector | Sets 12" |  |
| Preset chip Wall + splash | Inspector | Sets 0 with backsplash | Edge becomes wall edge, no profile |
| Support notice "Open detail" | Inspector | Opens the detail (e.g. D-3) in the detail editor | Shown when seating overhang exceeds limit |
| Seats row | Inspector | Display seat count and spacing |  |
| Edge profile card | Inspector | Pick profile from library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom | Applied to exposed edges only |
| Offered profile rows | Inspector | Display offered profiles with the price difference as a total for this top (price per lf × exposed edge length) | Price hidden without See sell prices |
| Edit offered edges | Inspector footer | Choose which profiles the client sees and enter the price difference per lf; the client sees the total | Requires Send to client; hidden otherwise |
| Top schedule | Inspector footer | Opens schedule: material, thickness, area, edge length. Internal and client only; not on permit sheets |  |
| Delete / Backspace | Global | Deletes selected piece, seam or cutout |  |
| Undo / redo, Esc | Global | As in 03 |  |

**Data shown:**

- Pieces: label, name, size, sq ft, material, thickness, overhangs per side, seams, cutouts, exposed edge length.
- Defaults from company settings; client profile choice and status.

**States:**

- No cabinets: Trace cabinets disabled with hint.
- Edge profile open (client choosing), chosen, or not offered.
- Support notice shown.
- Loading, error, offline, locked/view-only, permission-denied: as in 03.

**Validation & warnings:**

- Seating overhang past company limit: brackets added to a detail and notice shown.
- Seating typical 6"–12", regular 1"–2" (Round 23).

**Events emitted:**

- takeoff.updated (countertop lf and sf).
- edge\_profile.offered (new); edge\_profile.chosen (new) when the client chooses. Choosing is not approval: selection.approved fires only when the client signs.

**Decisions:**

- The seating-overhang support limit is a company setting under Defaults, entered by the owner (Round 24).
- The offered list shows only the profiles ticked in Edit offered edges. The full library (eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom) is available there. (Claude)
- The Edges tab lists every edge of each piece with its overhang, type (exposed, wall or splash) and length; clicking a row selects the edge. The Material tab holds material, thickness, backsplash height and material, and behind-range splash. (Claude)
- The rail in 04b is the full standard rail, with Sketch, Detail callout and Check included. (Claude)

### 05 · Ceiling plan / RCP

**Purpose:** Edit each room's ceiling (type, heights, slope) and the objects on it, and produce the reflected ceiling plan (RCP) for the permit set (sheet A6.0) and the crew. Not a client tool; client-facing ceiling choices go through options A/B/C and renders.

**Entry points:**

- Plan tab, then the Ceiling tool (roofing icon) in the standard tool rail. The rail switches to the ceiling tool rail shown in the mockup.
- Plan tab, left panel segment "Ceiling" or "Both".
- Callouts to sheet A6.0 from Sheets (13).
- Right-click a ceiling object (beam, light, fan, detector) in 3D (07) and choose "Edit in plan" (not in mockup).

**Permissions:**

- View the RCP: View projects.
- Place, edit, move or delete any ceiling object, change ceiling type and heights, auto-layout cans, draw switching zones, create options A/B/C: Edit model (and the project edit lock, see 06).
- Pick a catalog finish for a client selection: Edit model. Adding a new catalog item from the picker also needs Edit catalog.
- Option cost values (if shown from this screen): See company costs.

**Layout:** Standard editor shell, with these differences:

- Tool rail is the ceiling rail: Select, Ceiling type, Beam, Recessed light, Ceiling fan, Acoustical grid, HVAC diffuser or return, Smoke or CO detector, Speaker or low voltage, Access panel, Soffit/tray/coffer, Height and material tag, code Check, Help.
- Left panel (248px): Floor / Ceiling / Both segment; current room ceiling summary; Lighting actions; Fixture schedule.
- Canvas: RCP drawing, legend chip bottom left, zoom stack top right.
- Inspector (336px): selected object properties, Section A-A preview, Client selections, Make options A/B/C.
- Header and status bar follow the standard shell ("N to review" pill, Existing/Proposed toggle). Status bar adds View, Scale and Joists status. The mockup omits the pill and the toggle; build them.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Select (V) | Ceiling rail | Activates select tool. Click picks the smallest object under the cursor; repeated clicks cycle outward (e.g. can, beam, ceiling). | Always available, including view only. |
| Ceiling type | Ceiling rail | Click a room to set its ceiling type: flat, single slope, vaulted/cathedral, tray, coffered. Opens the ceiling type editor in the inspector. | Edit model. |
| Beam | Ceiling rail | Places faux beams on the selected ceiling surface. Beams follow the slope or sit level per Placement. | Edit model. Pressed state shown in mockup. |
| Recessed light | Ceiling rail | Click to place a can. Same object as on the electrical plan (06). | Edit model. Snaps to ceiling; in ACT areas, troffers snap into tiles. |
| Ceiling fan | Ceiling rail | Click to place a fan. | Edit model. Blade clearance to walls and beams checked (see Validation). |
| Acoustical grid | Ceiling rail | Places a 2x2 or 2x4 ACT grid in a room; set direction and start point. Grid auto-balances borders. | Edit model. |
| HVAC diffuser or return | Ceiling rail | Places supply diffuser, return or exhaust fan. In ACT, snaps into a tile. | Edit model. |
| Smoke or CO detector | Ceiling rail | Places a detector, status existing or proposed. Same object as electrical plan. | Edit model. |
| Speaker or low voltage | Ceiling rail | Places in-ceiling speaker, camera or Wi-Fi access point. | Edit model. |
| Access panel | Ceiling rail | Places an access panel or attic hatch. | Edit model. |
| Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown; edges get dimensions. | Edit model. |
| Height and material tag | Ceiling rail | Click an area to place a tag (e.g. "CLG 8' 0" · ACT 2x2"). Tag reads from the ceiling data. | Edit model. Tag text is generated, not free text. |
| Check (not in mockup) | Ceiling rail, above Help | Runs code checks on demand for the whole project (same check as 06). | Run code check. Hidden without it. Present on every editor tab. |
| Help | Ceiling rail, bottom | Opens help for the ceiling tools. | Always. |
| Sprinkler head tool (not in mockup) | Ceiling rail | Not built in v1. | Plan marks sprinklers as mainly commercial, v2 scope. Do not show in v1. |
| Floor / Ceiling / Both segment | Left panel, top | Floor: floor plan with the standard rail. Ceiling: RCP with the ceiling rail. Both: RCP over a greyed floor plan, ceiling rail. | Selected state "Ceiling" in mockup. Available in view only. |
| Room ceiling summary | Left panel | Shows type and ridge direction, wall heights, ridge height, pitch (e.g. "walls 8' 0" · ridge 13' 0" · 9.4/12"). | Read only. Updates when the active room changes. |
| Change ceiling | Left panel, under summary | Opens the ceiling type editor for the active room: type, heights per wall or per point, or pitch, or read from Polycam mesh. | Edit model. Heights accept typed formats (12'6", 12' 6 1/2", 150", 12.5'). |
| Read heights from scan (not in mockup) | Ceiling type editor | Fills heights and slope from the Polycam mesh. | Only when a GLB mesh exists for the project. |
| Auto-layout cans | Left panel, Lighting | Opens auto-layout: by count, by spacing, or by light-level target in foot-candles. Places cans in the room. | Edit model. Result shown for confirmation before it is committed (AI/auto results never applied silently). |
| Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed accent lines). | Edit model. Zones sync to switch legs on the electrical plan. |
| Fixture schedule rows | Left panel | One row per type tag (A, F, S, T): tag, description, count. Click selects all fixtures of that type on canvas. | Read only list. Full schedule (lumens, color temperature, trim, catalog link) appears on the sheet (not in mockup in the panel). |
| Fixture type tag edit (not in mockup) | Inspector, on a light | Set type tag, lumens, color temperature, trim, catalog item. | Edit model. Required by plan Round 16. |
| Canvas click | Canvas | Selects object (cycle outward on repeat click). | Allowed in view only. |
| Canvas shift-click | Canvas | Adds to selection. | Bulk edit of many objects in inspector. |
| Canvas box select | Canvas, drag on empty space | Selects all objects in box, limited by layer filter. |  |
| Canvas drag on object | Canvas | Moves the object; live dimensions show. | Edit model. Beams in a set move as a set unless one is selected alone. |
| Spacing dimension pill (e.g. "4' 0" o.c.") | Canvas, above selected beam set | Shows spacing. Click to type a new spacing. | Typed dimension on every edit. |
| Right-click on object | Canvas | Context menu (copy, paste, mirror, align, delete, save as group). | Same as Plan (03). |
| Zoom in / Zoom out / Fit to screen | Canvas, top right stack | Zoom by step; fit drawing to canvas. | Always. |
| Scroll / pinch | Canvas | Zoom toward cursor / pinch center. Two-finger drag pans on iPad. | Always. |
| Legend chip | Canvas, bottom left | Shows switch zone line style and ACT border sizes for the selected grid. | Read only. |
| Placement select | Inspector, beams | Level beams in vault / Follow slope / On flat ceiling. | Edit model. |
| Height AFF input | Inspector, beams | Bottom-of-beam height above finished floor. | Shown for "Level beams in vault". Disabled when Match = Adjoining room (value copied). |
| Match select | Inspector, beams | Adjoining room / Custom. Adjoining room sets Height AFF to the finished ceiling height of the adjoining room. | Level beams only. |
| Size W x H input | Inspector, beams | Beam width x height. | Typed format, fractions to 1/16". |
| Spacing input | Inspector, beams | On-center spacing across the span. | Mutually exclusive with Count. |
| Count input (not in mockup) | Inspector, beams | Number of beams across the span; spacing is computed. | Plan Round 13: spacing or count. |
| Length input (not in mockup) | Inspector, beams | Beam length. | Plan Round 13. Default is wall to wall span. |
| Direction select | Inspector, beams | Across ridge / With ridge. |  |
| End detail select | Inspector, beams | Square to slope / Corbel. |  |
| Section A-A preview | Inspector | Live section through the selected beams: adjoining height, beam height, ridge height. | Read only. |
| Beam finish (client selection) | Inspector, Client selections | Opens catalog picker filtered to beam finishes. Sets the finish as the selection item of the current option; it feeds the selections PDF and client approval. | Edit model. |
| Make options A / B / C | Inspector, bottom | Creates design options from the current ceiling (e.g. beam size, spacing, stain). Opens options in 3D (07). | Edit model. Maximum three options. |
| More (…) | Inspector, bottom | Menu: Duplicate, Save as group, Show in 3D, Delete. | Edit model for Duplicate, Save as group, Delete; hidden without it. |
| Framing known (not in mockup) | Inspector, when a ceiling is selected | Choose Unknown / New construction / Full demo / Enter locations. Enter locations: draw joist or beam lines with direction and spacing. Turns keep-clear checks on. | Edit model. Status bar text changes from "unknown · beam clash checks off". |
| Keyboard shortcuts | Global | V for Select; other ceiling tool shortcuts as set in company settings under Defaults. Undo/redo, copy/paste, delete, Esc as in the standard editor. | Undo within session only. |

**Data shown:**

- Room ceilings: type, ridge line and direction, heights per wall or point, pitch (model object: ceiling type per room).
- Ceiling objects: beams (size, length, spacing/count, direction, placement, height, finish, end detail), cans, fans, troffers, diffusers, returns, exhaust fans, detectors (existing/proposed), speakers, low voltage, access panels, soffits, trays, coffers, crown.
- ACT grid: module, direction, start point, border sizes.
- Height/material tags per area.
- Fixture schedule: tag, description, count; on sheet also lumens, color temperature, trim, catalog link.
- Switching zones and dimmers.
- Room name and area label (e.g. "FAMILY ROOM · 320 SF").
- Object status badge in inspector (Existing / Demo / New).
- Status bar: view name, sheet scale (1/4" = 1'-0"), joist status, zoom.
- Project header: project name, client, model version, last saved.

**States:**

- Empty: room has no ceiling set; default is flat at the wall height. Fixture schedule shows "No fixtures yet".
- Loading: canvas skeleton while the model version loads.
- Error: model failed to load or save; show retry; unsaved changes kept locally.
- Locked / view-only: another user holds the edit lock. Amber banner (see 06). Rail tools other than Select disabled; inspector fields read only; Make options disabled. Pan, zoom, select and measure allowed.
- Offline: editing continues if this user holds the lock; changes queue on device and sync on reconnect.
- Permission-denied: user without Edit model sees view-only state without Request edit.
- Joists unknown: keep-clear checks off; status bar says so.
- Joists known: keep-clear checks on.
- Ceiling slope changed: walls under a slope get their top edge cut to match in plan, elevations and 3D.

**Validation & warnings:**

- Keep-clear warning when a can lands on a joist or beam. Only where joist/beam locations are known (new construction, full demo, or user-entered). Otherwise no warning.
- ACT balanced borders: edge tiles at least half a tile (12" on a 2x2 module; 12" or 24" on 2x4 per direction). Balancing picks the start point that meets this; warn if the user overrides it. Minimum border is a company setting under Defaults.
- Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in company settings under Defaults.
- Level beams in a vault must sit below the ridge and at or above the wall plate; warn otherwise.
- Hosted ceiling item left off any ceiling surface: red flag, listed in the issue check.
- Typed heights: invalid format shows inline error, value not applied.

**Events emitted:**

- takeoff.updated (beam, fixture, ACT tile/main/cross tee/wall angle/hanger wire quantities change).
- model.saved on save.
- design\_option.created when Make options A/B/C runs.

**Decisions:**

1. The RCP and sheet A6.0 are v1. (Round 24)
2. The RCP uses the standard shell: "N to review" pill in the header and the Existing/Proposed toggle in the status bar. (Claude)
3. The half-tile rule stands. The mockup border values are placeholders. Balancing picks a start point that gives borders of at least half a tile; the minimum is a company setting under Defaults. (Claude)
4. The fan blade clearance is a company setting under Defaults, entered by the owner. (Round 24)
5. Joist/beam locations are entered through a "Framing known" section in the inspector of the selected ceiling: Unknown, New construction, Full demo or Enter locations (draw lines with direction and spacing). (Claude)
6. The light-level target is in foot-candles, using the lumen method with the fixture's catalog lumens. The default target per room type is a company setting. (Claude)
7. The More menu holds Duplicate, Save as group, Show in 3D and Delete. (Claude)
8. The Floor / Ceiling / Both segment switches rails: Floor shows the standard rail; Ceiling and Both show the ceiling rail. (Claude)
9. Keyboard shortcuts for ceiling tools are company settings under Defaults. V for Select stays. (Round 24)
10. Beam finish is the selection item of the current option. It feeds the selections PDF and client approval. (Claude)

### 06 · Electrical + edit lock

**Purpose:** Place electrical devices, assign circuits, review the NEC Article 220 residential load calc and the panel schedule, and run code checks on demand. This screen also specifies the project edit lock (banner, Request edit, 5-minute auto release), which applies to every editor screen.

**Entry points:**

- Plan tab, Electrical tool (E) in the standard rail.
- Left panel tabs Circuits / Devices / Panel once in electrical mode.
- Sheets (13): sheet E1.0 or E2.0 "Edit in plan" (not in mockup).
- Issue set: the code check runs and lists open warnings; clicking a warning opens this screen at the device.
- Notification or banner "Available to edit" (edit lock).

**Permissions:**

- View plan, circuits, load calc, panel schedule, code check results: View projects.
- Place/move/delete devices, assign circuits, create circuits, edit circuit attributes, edit load calc inputs (existing panel, appliances, method, case): Edit model, plus holding the edit lock.
- Run Check: Run code check.
- Accept a code warning with a note: Edit model (at issue time, Issue permit sets or Issue revisions).
- Add to E2.0: Edit model.
- Request edit: Edit model.
- Release lock / Keep editing (prompt to the lock holder) and Stop editing: the lock holder.
- Controls a user lacks permission for are hidden, not disabled.

**Layout:** Standard editor shell, with these differences:

- Header shows presence avatars (other users in the project) left of the "N to review" pill, and a Stop editing button for the lock holder.
- Tool rail adds the code Check button (on every editor tab).
- Left panel: Circuits / Devices / Panel tabs; panel header ("Panel A · 200A main", units AMPS · VA); circuit list; New circuit; Show chips; footer totals.
- Canvas column: edit-lock banner (top), floating device toolbar plus check status pill, electrical plan, "Available to edit" toast (bottom right, when shown).
- Inspector: Panel load calc (top), Selected circuit (middle), Panel schedule and Add to E2.0 (bottom).
- Status bar adds: Layer, Service, Code, and a "View only" lock indicator.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Electrical tool (E) | Standard rail | Enters electrical mode. | Pressed state. Shortcut E (company setting). |
| Check (not in mockup) | Left tool rail, on every editor tab | Runs code checks on demand. Results list in a panel: each warning with rule, NEC reference, device, and Go to. | Run code check; hidden without it. Not live while drawing. Never auto-fixes. Allowed in view only. |
| Circuits tab | Left panel segment | Lists circuits for the selected panel. | Default tab. |
| Devices tab | Left panel segment | Lists placed devices grouped by room: device type, circuit, GFCI/AFCI. Click selects the device on canvas. |  |
| Panel tab | Left panel segment | Compact panel schedule: two columns of spaces (odd/even) with circuit number, name, breaker; open spaces shown empty. Click a space selects its circuit. |  |
| Panel selector (not in mockup) | Left panel header ("Panel A · 200A main") | Switch between main panel and subpanels. | Needed for subpanel feeder case (Round 5). |
| Circuit row | Left panel list | Click selects the circuit: highlights its devices and home run on canvas, shows details in inspector. Row shows circuit number, name, breaker/type/count, VA. | Selected state (accent). Allowed in view only. |
| Circuit row double-click (not in mockup) | Left panel list | Rename circuit inline. | Edit model. |
| New circuit | Left panel, under list | Creates a new circuit in the next open space. | Edit model; hidden without it. Disabled in view only (mockup shows disabled). Disabled when no spaces left. |
| Show chips: Receptacles, Switch legs, Lighting, Home runs, Low voltage | Left panel | Toggle display of each layer on canvas. | Multiple on. Display only; allowed in view only. |
| Circuit/space footer | Left panel bottom | Shows "8 circuits · 11 spaces" and total connected VA. | Read only. |
| Device toolbar: Receptacle | Canvas, floating toolbar | Places receptacles. Attributes: circuit, GFCI/AFCI, type (duplex, 240V), optional height note (off by default). | Edit model. Paused (55% opacity, disabled) in view only with note "Editing tools paused while view only". |
| Device toolbar: Switch | Canvas toolbar | Places single, 3-way, dimmer switches. | Same. |
| Device toolbar: Light | Canvas toolbar | Places lights (same objects as RCP). | Same. |
| Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures (dashed). | Same. |
| Device toolbar: Circuit | Canvas toolbar | Assign circuit by clicking devices in turn. Circuit line drawn automatically. | Same. |
| Device toolbar: Low voltage (not in mockup) | Canvas toolbar | Places data, TV, doorbell, speakers. | Round 5. |
| Device toolbar: Smoke/CO, Fan (not in mockup) | Canvas toolbar | Places detectors and fans. | Same objects as RCP. |
| Device height note toggle (not in mockup) | Inspector, on a selected device | Shows a height note (e.g. "MW +66"") on the plan for that device. | Off by default. Edit model. |
| Check status pill ("Spacing checks pass") | Canvas, right of toolbar | Shows result of the last check. Click opens the check results list. | Green when no open warnings; amber with count when warnings exist; grey "Check not run" after changes since the last check. |
| Canvas click on device | Canvas | Selects device; inspector shows device and its circuit. Repeat click cycles outward. | Allowed in view only. |
| Canvas click on circuit tag | Canvas | Selects that circuit. | Allowed in view only. |
| Canvas drag device | Canvas | Moves device; live distances. | Edit model. |
| Canvas right-click | Canvas | Context menu: assign to circuit, set GFCI/AFCI, delete. | Edit model. |
| Measure (implied by banner) | Canvas | Measure between two points. | Allowed in view only. |
| Pan / zoom | Canvas | Drag empty space / scroll / pinch. | Allowed in view only. |
| Optional method toggle (not in mockup) | Inspector, load calc header | Off: NEC 220 standard method. On: optional method for existing dwellings. | Edit model. Available for every case. |
| Load calc case select (not in mockup) | Inspector, load calc header | Circuits added to existing panel / Service upgrade / Subpanel feeder / Large add (EV, heat pump) / Like-for-like panel replacement. | Edit model. Round 5. |
| Existing panel (not in mockup) | Inspector, load calc header button; opens a dialog | Service size, main breaker, panel label photo (AI reads brand, rating, spaces; user confirms), existing circuit list (typed or read from directory photo; user confirms), existing large appliances (range, dryer, AC, water heater). | Edit model. AI values shown for confirmation, never applied silently. |
| Load calc line rows | Inspector | Each line of the math with its basis (e.g. "2,450 sf x 3", "T220.55 col C"). | Read only. Appliance values from catalog item specs first, else standard defaults (editable). |
| Appliance rating override (not in mockup) | Inspector, click a load calc line | Edit the default rating for that appliance. | Edit model. Marked as overridden. |
| Service bar | Inspector, under total | Shows % of service used and spare amps. | Read only. Pill "200A OK" at top. Green below the warning threshold, amber at or above it, red above 100% of service. |
| Selected circuit block | Inspector | Circuit tag, name, location summary, breaker, wire, run length, voltage drop, per-circuit code check rows with NEC references. | Read only in view only. Fields editable with Edit model (breaker, wire, name). Voltage drop shows a warning above the threshold in settings. |
| Code info note | Inspector | "Permits applied after Dec 31, 2026 use FBC 9th ed. Load calc only; no structural calcs." | Text depends on project code edition setting. |
| Panel schedule | Inspector, bottom | Opens the generated panel schedule: space, circuit, breaker size, poles, wire size, AFCI/GFCI type, load; flags spaces left. | Read only in schedule; edits happen on circuits. |
| Add to E2.0 | Inspector, bottom | Places/updates panel schedule and load calc on sheet E2.0. | Edit model. If already placed, label reads "Update E2.0" (not in mockup). |
| Existing / Proposed toggle | Status bar | Switches phase view and default status for new devices. | Standard shell. |
| Edit-lock banner (amber) | Canvas column, top | "\[Name\] is editing since \[time\] · view only", "You can pan, zoom and measure". | Shown to every user who does not hold the lock. Live. |
| Request edit | Edit-lock banner | Sends a request to the lock holder. Button changes to "Requested \[time\]" with a cancel option (not in mockup). | Edit model; hidden without it. One pending request per user. No cooldown after a Keep. |
| Lock holder prompt (not in mockup) | Lock holder's screen, modal | "\[Requester\] wants to edit. Release / Keep editing". Shows a 5-minute countdown. | Release: saves holder's work, releases lock. Keep: lock stays; requester is notified. No answer in 5 minutes: work saved, lock released. The timer does not pause while the holder is offline. |
| Available to edit toast (green) | Canvas, bottom right | "Available to edit · \[Name\] left the plan". | Shown to everyone in the project the moment the lock is free. |
| Start editing | Green toast | Takes the lock. Banner and "View only" indicator clear; tools enable. | Edit model. First user to press it gets the lock; others see the amber banner with the new holder. |
| Stop editing (not in mockup) | Header, lock holder only | Saves, then releases the lock. Closing the project does the same. | Lock holder. |
| View only indicator | Status bar | Lock icon and "View only". | Shown while not holding the lock. |
| Presence avatars | Header | Users currently in the project. Hover shows name and whether editing. | Lock holder ring color amber. |
| Keyboard: E, V, M, W, D, C, K, L, T | Rail | Standard tool shortcuts; values are company settings under Defaults. | Drawing shortcuts inactive in view only. |

**Data shown:**

- Circuits (model object circuit): number (single or 2-pole e.g. "1-3"), name, breaker amps, poles, GFCI/AFCI/dual function, dedicated flag, device count, wire size and type, run length, VA.
- Devices (model object device): type, circuit, GFCI/AFCI, location; circuit tags on canvas.
- Panel: name, main breaker, service size, spaces total and used.
- Load calc (electrical\_calc for the current model\_version): method, case, inputs, every line of the math, total VA, amps at 240V, % of service, spare amps. Recomputed in the browser when an input changes while the load calc is on screen; stored when a set is issued.
- Code edition (project setting): "NEC 2023 · FBC 9th ed.".
- Check results: rule, NEC reference, pass/warning, device.
- Edit lock (edit\_lock): holder, since, release requests.
- Status bar: layer, scale (1/2" = 1'-0"), service and calculated amps, code edition.

**States:**

- Empty: no devices; circuit list empty with "Place devices or add a circuit"; load calc shows general lighting and required small appliance/laundry only, or prompts for square footage.
- Loading: list and canvas skeletons; load calc "Calculating".
- Error: calc failed (missing input) shows the missing input by name.
- Locked / view-only: amber banner, Request edit, tools paused, New circuit disabled, inspector read only, status bar "View only". Selecting, panning, zooming, measuring, commenting and running Check allowed.
- Request pending: Request edit shows pending state and countdown.
- Available: green toast with Start editing.
- Offline (lock holder): editing continues, lock holds, changes queue and sync on reconnect. If the lock auto-released while offline, on reconnect the former holder gets a conflict notification listing clashes to resolve.
- Offline (viewer): view of last loaded version; Request edit disabled.
- Permission-denied: controls the user lacks are hidden (no Request edit, no tools, no Check without Run code check).
- Check not run since last change: pill shows "Check not run".
- Service over capacity: pill turns amber or red (see Validation).
- No spaces left: New circuit disabled; panel schedule flags it.

**Validation & warnings:**

- Code checks (warnings only, never auto-fix), run by Check: countertop receptacle spacing (210.52(C): ≤ 48" apart, ≤ 24" from ends per mockup), GFCI locations (210.8), AFCI locations (210.12), required dedicated circuits (dishwasher, disposal, microwave, fridge, bath), two small-appliance circuits minimum (210.11(C)(1)), smoke/CO locations.
- Code checks are a project-edition rule set (default 2023 NEC).
- Issue set runs the check automatically and lists open warnings; each can be accepted with a note. A permit set cannot issue until the check is reviewed.
- Every electrical sheet carries the note that the electrical contractor of record verifies the design. The EC signature/seal block is optional per submittal profile; departments accept the GC's load calc.
- Load warning threshold (% of service) is a company setting under Defaults; amber at or above it, red above 100%.
- Voltage drop: warning above the threshold in company settings under Defaults.
- Panel spaces: schedule flags spaces left; zero spaces blocks New circuit.
- AI-read panel label and directory values must be confirmed before use.
- Edit lock: one editor per project; covers every change to model, sheets, options and markup; no silent idle timeout; auto release only after a Request edit goes unanswered for 5 minutes.

**Events emitted:**

- takeoff.updated (device counts, estimated wire runs).
- electrical\_calc.updated (new) on recompute.
- code\_check.completed (new) with warning count.
- code\_warning.accepted (new) with note.
- sheet.updated (new) on Add to E2.0.
- lock.acquired, lock.requested, lock.released (reason: stop\_editing, closed, request\_accepted), lock.auto\_released, lock.request\_declined (new), lock.conflict (new) on reconnect after an offline auto release.
- model.saved on save (unnumbered working version; a version number is assigned only on send).

**Decisions:**

1. Check is a button on the left tool rail on every editor tab and runs on demand. The pill shows the last result. (Round 24)
2. Device height notes are optional per device and off by default. (Round 24)
3. The 5-minute auto release does not pause while the holder is offline. On reconnect the former holder gets a conflict notification listing clashes to resolve. (Round 24)
4. After release the lock is free for anyone. The first user to press Start editing gets it. (Round 24)
5. After Keep editing, the requester is notified and can request again at once. Each request restarts the 5-minute timer. (Claude)
6. Running Check needs the Run code check permission. (Round 24)
7. The load warning threshold is a company setting under Defaults: amber at or above it, red above 100% of service. (Round 24 + Claude)
8. Voltage drop warns above a threshold set in company settings. (Round 24)
9. The Devices tab lists devices grouped by room. The Panel tab shows a compact two-column panel schedule. (Claude)
10. The optional method is a toggle in the load calc header, next to a case select. Existing panel inputs open in a dialog from an "Existing panel" button. (Round 24 + Claude)
11. The optional method toggle is available for every case. (Claude)
12. The holder releases with a Stop editing button in the header or by closing the project. Both save first. (Round 24)
13. The lock covers every change to model, sheets, options and markup on all tabs. Viewing, commenting and running renders do not need it. (Round 24)

### 07 · 3D view

**Purpose:** Show the live 3D model from the plan, let users orbit, walk, look up, cut sections, save camera views, and build design options A/B/C with internal cost for client comparison.

**Entry points:**

- 3D tab in the header.
- Make options A / B / C on the RCP inspector (05).
- Saved view links from Render setup (08).
- Phone: 3D viewer from the field pack or client view (phone layout not in mockup).

**Permissions:**

- View 3D, orbit, walk, section, measure: View projects.
- Save view, rename/delete saved views: Edit model. No edit lock needed.
- Toggle layers: View projects (display only, not saved to model).
- Create, duplicate, edit options; edit beam parameters; apply finishes: Edit model, plus the edit lock.
- See option cost deltas: See company costs. Without it, the cost value is hidden; the "Internal" label stays.
- Send options to client: Send to client.
- Render A/B/C: Run fast renders, Run standard renders or Run photoreal renders, by tier chosen.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell, with these differences:

- Tool rail: standard rail plus the code Check button. Drawing tools switch to the Plan tab with that tool active.
- Left panel: Saved views (count, thumbnail list), Layers (visibility, opacity), footer "Model synced with plan".
- Canvas: top toolbar (Orbit, Walk, Look up, Section, Save view) and display mode toggle (Shaded, Lines, X-ray); 3D viewport; view cube with Home and Fit (corner); control hint strip.
- Inspector: Design options (A/B/C cards), selected object details, actions (Send options to client, Copy link, Duplicate option, Render A/B/C).
- Status bar adds Camera, Target, Option, Ridge, frame rate.
- Phone: full-screen viewport with view cube, Measure button and saved views in a bottom sheet; no inspector.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Orbit | Canvas toolbar | Orbit mode (default). Free 360° in any direction, over the top and underneath, no locked angles. | Selected by default. |
| Walk | Canvas toolbar | Walk / look-around mode at eye height (default 5'-6", company setting; editable in the status bar). Drag to turn the head. Desktop: W/A/S/D or arrow keys move. iPad: on-screen joystick bottom left moves. | Movement keys are company settings under Defaults. |
| Look up | Canvas toolbar | Preset: walk camera at eye height aimed up at the ceiling. | Shortcut U. |
| Section | Canvas toolbar | Places a vertical section plane through the orbit target. Drag its arrow handle to move it; click a view cube face to align it; Flip reverses the kept side; press Section again to clear. | Display only. |
| Save view | Canvas toolbar | Saves current camera as a named camera\_view; prompts for a name. Appears in Saved views and in Render setup (08) and the client gallery. | Edit model. No edit lock needed. |
| Shaded / Lines / X-ray | Canvas, top right toggle | Display mode. | One active. Display only. |
| Left-drag | Viewport (mouse) | Orbit around target. | Same in render studio model view. |
| Right-drag or Shift-drag | Viewport (mouse) | Pan. |  |
| Scroll | Viewport (mouse) | Zoom toward cursor. |  |
| One-finger drag | Viewport (iPad) | Orbit. |  |
| Two-finger drag | Viewport (iPad) | Pan. |  |
| Pinch | Viewport (iPad) | Zoom. |  |
| Click object | Viewport | Selects object; inspector shows details (e.g. beam B2). Tag shown on canvas with bottom-of-beam height AFF, matching the inspector. | Allowed in view only. |
| Double-click object (not in mockup) | Viewport | Sets orbit target to that point. | Status bar Target updates. |
| Right-click object (not in mockup) | Viewport | Menu: Edit in plan, Apply finish, Hide. |  |
| View cube face or corner | Canvas corner | Click a face (TOP, FRONT, RIGHT) or corner to snap to top, front, side or isometric. Click again to return to free orbit. |  |
| Home (reset view) | Under view cube | Resets camera to default. |  |
| Fit to screen | Under view cube | Fits model in viewport. |  |
| Control hint strip | Canvas bottom | "Drag to orbit any direction · Shift-drag to pan · Look up U". | Read only. iPad shows touch gestures instead (not in mockup). |
| Saved view row | Left panel | Click moves camera to the view. Row shows thumbnail, name, mode (orbit/walk/ortho, angle or eye height). | Selected state. |
| Saved view rename / delete / update (not in mockup) | Left panel row menu or right-click | Rename, overwrite with current camera, delete. | Edit model. Warn if a render or client gallery uses the view. |
| Layer row visibility | Left panel, Layers | Show/hide: Walls + openings, Ceiling, Faux beams (option), Cabinets + tops, Furniture, Lighting, Demo. | Display only. |
| Layer opacity (e.g. Ceiling 50%) | Left panel, Layers | Click value to set opacity. | Display only. |
| Scan mesh layer (not in mockup) | Left panel, Layers | Show/hide Polycam GLB mesh as reference. | Plan section 1. Row shown only when a mesh exists. |
| Apply finish (not in mockup) | Viewport, click a surface with Select | Inspector shows a Finish picker; choosing a catalog item applies it as a texture. | Edit model, plus the edit lock. |
| Measure (not in mockup on desktop) | Canvas toolbar | Distance between two points. | Required on phone (Round 18). |
| Option card A / B / C | Inspector | Click selects option; viewport shows that option. Card shows label, name, spec, mini diagram, "Internal · not shown to client" and cost (Base or +$ delta). | Selected state. Cost hidden without See company costs. |
| Option name / spec edit (not in mockup) | Inspector, option card | Rename option, edit its parameters. | Edit model. |
| Option status pill ("Draft") | Inspector header | Shows options state: Draft, Sent (Version N), Approved, Archived (not in mockup for later states). | Approved options lock that version. |
| Selected object details | Inspector | For a beam: section, height bottom AFF, span, spacing, finish, attachment. | Editable with Edit model; values same as RCP inspector. |
| Option cost detail (not in mockup) | Inspector, click cost | Structured lines: option, item, qty, unit cost, total. | See company costs. Internal only. |
| Info note | Inspector | "Decorative, non-structural. Client sees layouts and renders only; cost deltas stay in your view." | Read only. |
| Send options to client | Inspector, primary | Emails the client a share link to options A/B/C (3D layout snapshot per option plus any client-ready renders). Cost data never included. Freezes the sent version as "Version N"; editing continues on a working copy. | Send to client. No edit lock needed. Renders not required. |
| Copy link (not in mockup) | Inspector, next to Send options to client | Copies the share link to the clipboard. | Send to client. |
| Duplicate option | Inspector | Copies selected option into the next free letter. | Edit model. Disabled when three options exist. |
| Render A/B/C | Inspector | Opens Render setup (08) with all options queued from the current angle. | Render permission for chosen tier. Angle required. No edit lock needed. |
| Existing / Proposed toggle | Status bar | Shows existing or proposed model. | Standard shell. |
| Check | Left tool rail | Runs code checks (see 06). | Run code check. |
| Rail drawing tools | Left tool rail | Switch to the Plan tab with that tool active. | Edit model. |
| Keyboard: U | Global in 3D | Look up. | Company setting. |

**Data shown:**

- Model geometry for the current model\_version, finishes as textures, ceiling slope, beams.
- Dimension labels in viewport (e.g. "4'-6" o.c.", "16'-0"", "18'-0" family room", "14'-0" ridge", "9'-0" plate").
- Saved camera views (camera\_view): name, mode, angle/eye height, thumbnail.
- Layers and their visibility/opacity.
- Options (design\_option, label A/B/C): name, spec, diagram, cost delta (option, item, qty, unit cost, total).
- Selected object attributes.
- Sync status: "Model synced with plan".
- Status bar: camera mode, projection, field of view, target, option, ridge/plate, frame rate.

**States:**

- Empty: model has no geometry; viewport shows "Draw walls in Plan to see 3D".
- Loading: progressive load; geometry first, textures after.
- Error: WebGL unavailable or out of memory (iPad Safari limits); show message and a lighter display mode.
- Model out of sync: footer shows "Updating from plan" until the current version loads.
- Locked / view-only: camera, layers, views list, Save view, Send and Render usable; option editing and Apply finish disabled.
- Offline: last loaded version viewable; Send options and Render disabled.
- Permission-denied: controls the user lacks are hidden (cost values, Send, Copy link, Render).
- Options sent: the sent version is frozen permanently; editing continues on a working copy; the next send creates a new version for a new signature.
- Option approved: that version is locked; non-selected options stay archived with it, read only.

**Validation & warnings:**

- Maximum three options (A/B/C).
- Option cost never leaves the internal view (not in share link, not in selections PDF unless allowance add-on is chosen there).
- Large scene on iPad: warn and offer lighter mode when memory is low.
- Renders labeled "for illustration; drawings govern".

**Events emitted:**

- camera\_view.saved (new), camera\_view.deleted (new).
- design\_option.created / design\_option.updated for options.
- version.sent on Send options to client.
- render.requested (new) per option on Render A/B/C.

**Decisions:**

1. Walk mode: drag to look; W/A/S/D or arrow keys move on desktop; on-screen joystick on iPad. Eye height defaults to 5'-6" (company setting) and is editable in the status bar. (Claude)
2. Section places a vertical plane through the orbit target with an arrow handle to move it, view-cube faces to align it, and a Flip control. Pressing Section again clears it. (Claude)
3. Rail drawing tools in 3D switch to the Plan tab with that tool active. (Claude)
4. Apply finish: click a surface with Select and pick a catalog finish in the inspector. It needs Edit model and the edit lock. (Claude)
5. A "Scan mesh" layer row appears when a Polycam mesh exists. (Claude)
6. Shaded / Lines / X-ray stay as display modes. (Claude)
7. The 3D tag shows bottom-of-beam height AFF, matching the inspector. The mockup values are placeholders. (Claude)
8. Phone 3D is a full-screen viewport with view cube, Measure and saved views in a bottom sheet, and no inspector. (Claude)
9. When the client signs an approval, the options not chosen are archived with that version, read only. Choosing alone archives nothing (Round 24 #32). (Claude)
10. Sending options does not require renders. The client sees a 3D layout snapshot per option plus any client-ready renders. Send is emailed, with Copy link beside it. (Round 24 + Claude)

### 08 · Render setup

**Purpose:** Set up and run an AI render. The user picks the camera angle first, then directs the render (style and changes), picks a tier, and generates. Results are compared, approved and marked client-ready before reaching the client.

**Entry points:**

- Render tab in the header.
- Render A/B/C on the 3D inspector (07).
- New render tile in the Render view filmstrip (08b).
- Renders list row "v3 · in setup".
- iPad on site: fast render button (not in mockup).

**Permissions:**

- View setup, saved renders and compare: View projects.
- Generate with Fast tier: Run fast renders.
- Generate with Standard tier: Run standard renders.
- Generate with Photoreal tier: Run photoreal renders.
- Upload a site photo: any of the three render permissions.
- Approve a render: Approve renders. Mark it client-ready: Mark client-ready. Who holds each is set per role.
- Keep / mark outdated / hide on a "Model changed" render: Mark client-ready.
- No edit lock is needed to run, approve or review renders.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell, with these differences:

- Tool rail: standard rail plus the code Check button.
- Left panel: "Angle · Pick the camera first"; Saved views grid (thumbnails); "Or use": Model view (orbit), Current 3D camera (Use), Site photo drop zone, previously uploaded photos; footer "Render spend this month" in dollars against the company allowance.
- Canvas: step bar (1 Angle, 2 Style, 3 Generate); preview area with before/after split (orbitable when the source is Model view); labels ("Before · site photo", "After · style preview", "For illustration; drawings govern"); Renders list for this angle (status pills).
- Inspector (Step 2): Style presets, the four ways to direct the render, Quality tiers, Selections (not visible in render), approval note, Generate button with estimated dollar cost.
- Status bar adds Angle (with lens), Style, Tier, Model version and option, render spend.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Step bar: Angle / Style / Generate | Canvas top | Shows progress. Click a done step to go back to it. | Step 1 shows check and chosen angle name when done. Steps 2 and 3 locked until an angle is chosen. |
| Saved view tile | Left panel, Saved views | Picks that camera\_view as the angle. Check mark on chosen tile. | Required first step. |
| Model view (orbit) (not in mockup) | Left panel, Or use | Makes the preview area an orbitable model view (same controls as 07). Orbit, then press Use this angle. | Round 17/18. |
| Save angle (not in mockup) | Preview area, in Model view | Saves the current orbit angle as a named view. | Edit model. |
| Current 3D camera · Use | Left panel, Or use | Uses the camera from the 3D tab as the angle (shows mode, angle, room). | No save prompt; use Save angle to keep it. |
| Site photo drop zone / browse | Left panel, Or use | Upload JPG or HEIC. The photo fixes the angle. | Any render permission. Stores a source\_file (photo). No alignment step required. |
| Uploaded photo row (e.g. IMG\_2041.HEIC) | Left panel | Pick an existing site photo as source. Shows date and use ("used as Before"). |  |
| Align to model (not in mockup) | Preview area, when the source is a site photo | Optional camera match: user drags 4 photo corners to model corners so geometry and placement stay exact. | Optional. Photo + text instruction renders without it. |
| Split handle | Preview | Drag left/right to compare Before (site photo or existing) and After (style preview). | Before side hidden when source is a model view with no photo. |
| Style preset tiles: Daylight, Golden, Airy, Evening | Inspector, Step 2 | Sets a lighting/mood preset, sent as a starting instruction. | One selected. Lighting does not need to match reality (Round 6). |
| Direct: From model (not in mockup) | Inspector, Step 2 | Render whatever is placed in the model (current option and finishes). | Default method. |
| Direct: Tap surface (not in mockup) | Inspector, Step 2; tap in preview | Tap a surface in the preview, pick a catalog finish. |  |
| Direct: Type instruction (not in mockup) | Inspector, Step 2 | Free-text instruction (e.g. "warm afternoon light"). | Asking for more images in the text may produce more than one image. |
| Direct: Paint mask (not in mockup) | Inspector, Step 2; paint in preview | Paint the area to change; brush size and erase. |  |
| Quality: Fast | Inspector, Quality | "Quick check · \~30 s", estimated $ cost. | Run fast renders. Mockup label "Draft". |
| Quality: Standard | Inspector, Quality | "Client review · 2K · \~2 min", estimated $ cost. | Run standard renders. Selected in mockup. |
| Quality: Photoreal | Inspector, Quality | "Sheets R1.0 · 4K · \~6 min", estimated $ cost. | Run photoreal renders. Mockup label "Presentation". Runs on the local GPU render worker when online, cloud API otherwise. |
| Selections list | Inspector | Shows selections not visible in render: countertop edge (with client choice date), cabinet finish, hardware, grout (open). | Read only. Listed in the box beside the rendering for client deliverables. |
| Approval note | Inspector | "Approve, then Mark client-ready, before it appears on the client page." | Read only. |
| Generate · \[$ estimate\] | Inspector, primary | Queues the render job with angle, model version, option, style, direction inputs, tier. One image per run unless the instruction asks for more. | Disabled until an angle is chosen. Hidden without the tier's permission. No spending block. |
| Renders list row | Canvas, Renders | Opens the render in Render view (08b). Row shows thumbnail, name, tier, date, status pill (Needs review, Approved, Rejected, Client-ready, Model changed, Outdated, Hidden). |  |
| "v3 · in setup" row | Canvas, Renders | Current setup draft. |  |
| Compare to previous (not in mockup) | Canvas or 08b | Side-by-side with the previous render of the same angle. | Round 12. |
| Rerun with tweak (not in mockup here) | Canvas or 08b | Copies settings into a new setup with an edited instruction. | Mockup 08b has "Regenerate". |
| "Model changed" badge (not in mockup) | Renders list row and 08b | Shown when an object or finish visible in the render's camera view changes after approval; also adds a review pill item. Choose per render: Keep as-is / Mark outdated / Hide from client until re-rendered. | Mark client-ready. Not a save-time prompt. |
| Render spend | Left panel footer, status bar | Dollars spent against the company allowance. | Read only. Allowance auto-refills when used up and notifies the owner. |
| Check | Left tool rail | Runs code checks (see 06). | Run code check. |
| Existing / Proposed toggle | Status bar | Standard shell. | Render uses Proposed. |

**Data shown:**

- Saved camera views (camera\_view) with thumbnails; current 3D camera; site photos (source\_file, type photo) with date and usage.
- Preview: before (site photo) and after (style preview) split.
- Renders for this angle: version, style, tier, date, status.
- Style presets; tiers with time, resolution, estimated dollar cost (per-tier price from settings).
- Selections not modeled in render (selection\_set items: edge profile, cabinet finish, hardware, grout) with source (client chose, open).
- Status bar: angle name and lens (35mm), style, tier and resolution, model version and option, render spend.
- Each render record (render): project, model\_version\_id, tier, inputs (angle, photo, alignment if any, style preset, instruction, mask, finishes), output path, cost in dollars.

**States:**

- No angle chosen: steps 2 and 3 locked, Generate disabled, left panel prompt "Pick the camera first".
- No saved views and no photos: left panel shows "Save a view in 3D or add a site photo".
- Photo uploading: progress; optional Align to model.
- Render pending (queued / running): row shows progress and estimated time; editor stays usable.
- Render finished: notification (in-app and email for photoreal); row status "Needs review".
- Render failed: row shows error and Retry; not counted against the allowance.
- Approved / client-ready / model changed / outdated / hidden: status pill on row.
- Locked / view-only: renders run normally; no edit lock needed.
- Offline: setup viewable; Generate disabled.
- Permission-denied: tiers and actions the user lacks are hidden.
- Allowance used up: allowance auto-refills and the owner is notified; Generate stays enabled.

**Validation & warnings:**

- Angle required before Generate.
- A site-photo render keeps the photo's angle; to change angle, switch source to a model view.
- Exact items must hold: room geometry, product look, placement and size. Model-view renders use the 3D guide image for placement. Site-photo renders hold exact placement only when aligned to the model; unaligned photo + text renders are approximate.
- Every render labeled "For illustration; drawings govern".
- Two-step approval: Approve, then Mark client-ready. Only client-ready renders reach the share link.
- AI never edits the drawing.

**Events emitted:**

- render.requested (new), render.completed (new), render.failed (new).
- render.approved (new), render.client\_ready (new).
- render.model\_changed (new), render.outdated (new), render.hidden\_from\_client (new).
- render\_allowance.refilled (new), with owner notification.
- camera\_view.saved (new) when saving an angle.
- Notification "photoreal render finished".

**Decisions:**

1. Tiers are Fast, Standard and Photoreal, costed in dollars. There is no hard limit: a company allowance in settings auto-refills when used up and notifies the owner. Mockup credits and the Draft/Presentation labels are replaced. (Round 24)
2. The Standard tier needs Run standard renders. (Round 24)
3. The four ways to direct a render (from model, tap surface, type, paint mask) live in Step 2. (Round 24)
4. Style presets stay in Step 2 and are sent as a starting instruction. (Claude)
5. Camera matching is optional. A photo plus text instruction renders with no alignment step; "Align to model" is available for exact placement. (Round 24)
6. "Model view (orbit)" in the left panel turns the preview into an orbitable view, with Use this angle and Save angle. (Claude)
7. Approval is two steps: Approve, then Mark client-ready. A Reject action is added in 08b. (Round 24 + Claude)
8. Approving needs Approve renders, and client-ready needs Mark client-ready; both are set per role. (Round 24)
9. A "Model changed" badge appears only when an object or finish visible in the render's camera view changes. It shows as a badge plus a review pill, not a save-time prompt. Keep, outdated or hide is chosen per render. (Round 24)
10. Running renders does not need the edit lock. (Round 24)
11. Failed renders are not counted against the allowance. (Claude)
12. Uploading a site photo needs any of the three render permissions. (Claude)

### 08b · Photoreal render view

**Purpose:** Review one finished render at full size, compare it with the before photo and the model, pin comments, mark areas to fix, and approve it for the client.

**Entry points:**

- Renders list row on Render setup (08).
- Filmstrip thumbnail on this screen.
- Notification "Photoreal render finished".
- "N to review" pill in the header (renders needing review).

**Permissions:**

- View render, metadata, comments: View projects.
- Add comment pin: View projects. No edit lock needed.
- Mark area to fix, Fix marked area, Regenerate: the render permission for the tier used (Run fast renders / Run standard renders / Run photoreal renders).
- Approve, Reject: Approve renders. Mark client-ready, Hide from client: Mark client-ready.
- Send image to client: Send to client.
- Download: Export.
- Cost value: See company costs.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell header only. Differences:

- No tool rail, no left panel, no status bar.
- Main area: large render card with overlays: view mode segment (top left), zoom and tools bar (top right), comment pins and popover, "AI rendering · For illustration; drawings govern" label, caption (render code, name, pixel size).
- Filmstrip under the render: thumbnails of renders in the project plus New render.
- Inspector (right): title, code, version and tier, status pill; metadata; Selections; Comments; client visibility note; Approve / Mark client-ready, Reject, Fix marked area, Regenerate, Send image with Copy link.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Render / Before / Split / Model segment | Render card, top left overlay | Render: the image. Before: the site photo. Split: draggable before/after slider. Model: the 3D model from the same camera. | Before and Split disabled if no site photo. |
| Split slider handle (in Split mode) | Render card | Drag to compare. | Same slider used in client deliverables. |
| Zoom out / Zoom in | Top right overlay | Zoom by step; percentage shown. |  |
| Zoom % | Top right overlay | Shows zoom level. Click resets to 100%. |  |
| Scroll / pinch / drag | Render card | Zoom and pan when zoomed in. |  |
| Add comment pin | Top right overlay | Next click on the image drops a numbered pin and opens a comment box. | Pins numbered in order. Internal pins are never shown to the client. |
| Comment pin | On image | Click opens popover: author, time, text. Client pins from the share link show in a second color with the client's name. |  |
| Mark area to fix | Top right overlay | Paint a mask on the image for a targeted fix. | Render permission. |
| Download | Top right overlay | Downloads the full-resolution image with the "For illustration; drawings govern" label burned in. | Export; hidden without it. |
| Full screen | Top right overlay | Shows the render full screen. Esc exits. |  |
| Filmstrip thumbnail | Under render | Opens that render. Label shows code and version (e.g. "K-01 · v3"). | Current render highlighted. |
| New render | Filmstrip, last tile | Opens Render setup (08) with a new setup. | Render permission. |
| Status pill ("Needs review") | Inspector header | Needs review, Approved, Client-ready, Rejected, Model changed, Outdated, Hidden. |  |
| Metadata rows | Inspector | Model version, option, style preset, instruction, generated (time, user), cost in dollars. | Read only. Cost hidden without See company costs. |
| Selections block | Inspector | Items not modeled in render: countertop edge with profile drawing and check, cabinets, quartz, hardware, grout. | Read only. Same list goes beside the render in client deliverables. |
| Comment list item | Inspector, Comments | Click highlights and scrolls to the pin. |  |
| Resolve / delete comment (not in mockup) | Inspector, comment item | Mark resolved or delete. | Author or Edit model. |
| Client visibility note | Inspector | "Hidden from client until client-ready". | Changes to "Visible to client" after Mark client-ready. |
| Approve (mockup "Approve for client") | Inspector, primary | Step 1: marks the render approved. The button then becomes Mark client-ready. | Approve renders. |
| Mark client-ready | Inspector, primary after Approve | Step 2: the render can appear on the share link and selections PDF. | Mark client-ready. Disabled while a "Model changed" choice is pending. |
| Reject (not in mockup) | Inspector | Marks the render rejected; stays hidden. | Approve renders. |
| Model changed choice (not in mockup) | Inspector banner, when the badge is set | Keep as-is / Mark outdated / Hide from client until re-rendered, for this render. | Mark client-ready. |
| Hide from client (not in mockup) | Inspector menu | Removes a client-ready render from the client page. | Mark client-ready. |
| Fix marked area | Inspector | Runs a targeted regenerate on the masked area with optional instruction. Creates a new version. Shows estimated $ cost. | Enabled only when a mask exists. |
| Regenerate | Inspector | Reruns with the same settings, or opens settings to tweak. New version. | Render permission. |
| Compare to previous (not in mockup) | Render card segment | Side-by-side with the previous version of the same render. | Round 12. |
| Send image (not in mockup) | Inspector | Emails the image to the client. | Send to client. Only for client-ready renders. |
| Copy link (not in mockup) | Inspector, next to Send image | Copies a link to the image. | Send to client. Only for client-ready renders. |
| Keyboard: Esc | Global | Exit full screen or cancel pin/mask mode. |  |

**Data shown:**

- Render image (render.output\_path), pixel size (2400 x 1600), render code and name (K-01, "Kitchen from family room"), version (3 of 3), tier.
- Render code: room letter plus a two-digit sequence per room (K-01, F-01, B-01), auto-assigned, editable, unique per project.
- Render record: model\_version\_id, option, style preset, instruction text, created by and at, cost in dollars.
- Before photo (source\_file) and model view from the same camera\_view.
- Selections from the approved/current selection\_set (edge profile, cabinets, quartz, hardware, grout).
- Comments: pin number, position, author, time, text, internal or client.
- Approval status (approved by, client-ready by) and client visibility.
- Filmstrip: other renders in the project grouped by code.

**States:**

- Loading: image placeholder with progress while full resolution loads.
- Render running: image area shows progress; actions disabled.
- Render failed: error with Retry.
- Needs review: hidden from client; Approve and Reject shown.
- Approved: hidden from client; Mark client-ready shown.
- Client-ready: visible to client; pill green.
- Rejected: hidden; Regenerate available.
- Model changed: an object or finish visible in this view changed; badge and banner with Keep as-is / Mark outdated / Hide from client.
- Locked / view-only: no effect; commenting, approving and rendering need no edit lock.
- Offline: cached image viewable; actions disabled.
- Permission-denied: controls the user lacks are hidden; cost hidden without See company costs.
- No site photo: Before and Split disabled.

**Validation & warnings:**

- Label "AI rendering · For illustration; drawings govern" always on the image and on downloads.
- Only approved, client-ready renders reach the share link.
- Comments flagged as geometry concerns (e.g. "Island reads too long. Plan is 75"") do not change the model; the drawing is the source of truth.
- Fix marked area requires a mask.

**Events emitted:**

- render.approved (new), render.rejected (new), render.client\_ready (new), render.hidden\_from\_client (new).
- render.comment\_created (new).
- render.requested (new) on Fix marked area or Regenerate.
- render.downloaded (new) on Download.
- render.sent (new) on Send image.

**Decisions:**

1. Cost shows in dollars from the render record's actual cost. The mockup credit values are placeholders. (Round 24)
2. A render record stores the Step 2 style preset and the instruction text. The inspector shows Style and Instruction rows; the separate "Light" row is dropped. (Claude)
3. Render code is the room letter plus a two-digit sequence per room. It is auto-assigned, editable and unique per project. (Claude)
4. Client pins from the share link show on the same render in a second color with the client's name. Internal pins are never shown to the client. (Claude)
5. Cost is shown only with See company costs, and hidden otherwise. (Round 24 + Claude)
6. Download needs Export, emits render.downloaded, and burns in the "For illustration; drawings govern" label. (Claude)
7. Send image (email) with Copy link beside it is on this screen, for client-ready renders only. (Round 24 + Claude)
8. Adding a comment pin needs only View projects and no edit lock. (Round 24 + Claude)
9. Approval is two steps: Approve, then Mark client-ready. (Round 24)

### 09 · Catalog + add product

**Purpose:** Browse the tenant's product catalog, place products on the plan, and add new products by link, pasted text or screenshot, with AI-filled fields the user confirms. Holds per-project price snapshots and the price refresh check.

**Entry points:**

- Left rail Catalog tool (P). The Catalog button (icon inventory\_2) sits on the standard rail (Plan, 3D, Render tabs) between Ceiling and Dimension and opens this drawer over the canvas (Claude).
- Plan doc: catalog drawer in the right panel; catalog opens on the main screen (Layout C decision).
- Add product card opens from the catalog drawer's "Add product" button.
- Round 20: supplier rendering AI suggestions open matching catalog items (see screen 12).

**Permissions:**

- View catalog drawer: View projects.
- Cost: See company costs. Sell price, markup and allowance amounts: See sell prices. Without the matching permission, those price fields and the "$\[ \]" values are hidden.
- Add product, edit fields, Save to company library, Refresh prices: Edit catalog.
- Drag a product onto the plan, Add and place: Edit model, plus holding the project edit lock.

**Layout:** Standard editor shell, with these differences: rail shows Catalog (P) active; status bar adds Catalog count and In project count.

- Catalog drawer (card over the left side of the canvas): header, category nav column, search + filter bar, product grid, footer line.
- Canvas: plan, dimmed behind the drawer.
- Add product card: floats over the right side of the canvas (replaces the inspector while open).
- Status bar: View Existing/Proposed toggle, Catalog count, In project count, Scale, zoom.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Catalog rail button (P) | Left rail | Opens/closes the catalog drawer. | Shortcut P. Pressed state while drawer open. |
| Add product | Drawer header | Opens the Add product card with Link mode selected. | Requires Edit catalog; hidden without it. |
| Close catalog (x) | Drawer header | Closes the drawer; canvas returns to normal brightness. | Esc also closes (not in mockup). |
| Category row (Cabinets, Plumbing fixtures, Lighting, Appliances, Tile, Hardware) | Drawer, category nav | Filters grid to that category; row shows item count. | One active at a time. Also Countertops, Paint, Windows and doors (not in mockup). |
| Collection row: In this project | Category nav | Shows items placed in or snapshotted to this project. | Count = items in project. |
| Collection row: Recently added | Category nav | Shows items added most recently. | Last 30 days; the window is a setting under Defaults (Decision 11). |
| Collection row: Standard spec | Category nav | Shows items flagged as company standard spec. | Flagged with a star toggle on the item detail (Edit catalog; Decision 11). |
| Search input | Grid header | Filters grid by text; result count shown at right ("8 results"). | Searches within the active category. |
| Filter chip: All | Grid header | Clears sub-filters. | Default on. |
| Filter chips: Sinks, Faucets, Disposals | Grid header | Filter by sub-category. | Chips change with the active category. |
| Filter chip: Lead time under 2 wk | Grid header | Shows items whose lead time is under 2 weeks. | Uses the lead time field. |
| Product card | Grid | Click: opens item detail/edit (not in mockup). Shows thumbnail, name, brand + finish, size, price or "In plan" tag. | Price shown only with See sell prices. "In plan" tag when item is placed in this project. |
| Product card drag | Grid to canvas | Drag onto plan places the item. Size snaps to the nearest cabinet or wall. | Requires Edit model and edit lock. New object takes the phase from the status-bar toggle. |
| Pending product card | Grid | Shows spinner, "Reading \[supplier\] page", and the product being read. | Appears while an AI read runs; replaced by the new card when saved. |
| Grid footer | Drawer bottom | Shows "\<category> · N of M shown" and "Prices internal · contractor only". | Static text. |
| Add product close (x) | Add product card header | Closes the card; discards unsaved fields. | Confirm before discard if fields were edited (not in mockup). |
| Mode toggle: Link | Add product card | Shows Product page URL field. | Default mode. |
| Mode toggle: Paste text | Add product card | Shows a text area for pasted page text (not in mockup); AI reads fields from it. | Fallback when the page cannot be read. |
| Mode toggle: Screenshot | Add product card | Shows upload / paste-image target (not in mockup); AI reads name, size, price from the image. | Plan doc: uploaded image or pasted image. |
| Product page URL field | Add product card | Paste URL; server fetches page; AI extracts fields. Status line shows "Reading page... done", fields filled count, elapsed time. | On block or failure, show error and the fallback chips (Round 7). |
| Image found on page | Add product card | Shows the found image; used as catalog thumbnail. | Note: "3D uses a generic \[type\] at these dimensions." |
| Field row: Name, Brand, Model, W x D x H, Finish, Price, Lead time, Category | Add product card | Each value is editable inline (not shown as inputs in mockup). | Every field must be confirmed by the user before save (plan doc). Confidence dot per field. |
| Confidence dot | End of each field row | Hover shows reason (e.g. "Check: depth read as spout reach", "Low confidence: from banner, not spec table"). | Green = read from spec table, amber = check, red = guess. Legend below the fields. |
| Field rows: SKU, Cost, Sell price, Markup, Supplier, Rough-in, Cutout size, Spec sheet PDF, Allowance category, Texture/photo for rendering, Source URL (not in mockup) | Add product card | Editable fields required by the plan doc (Round 7, data model). | Cost visible only with See company costs; sell and markup only with See sell prices. Spec sheet PDF is a file upload. |
| Field rows for appliances: electrical rating (volts, amps), gas, water, drain utility points (not in mockup) | Add product card, Appliances category | Feed load calc and utility scope. | Round 15: load calc reads ratings from catalog specs first, then standard defaults. |
| Chip: Paste text | "Page didn't read right?" row | Switches to Paste text mode, keeps the URL as source. | Fallback (Round 7). |
| Chip: Upload screenshot | "Page didn't read right?" row | Opens file picker for a screenshot; AI reads it. | Fallback (Round 7). |
| Checkbox: Save to company library | Add product card footer | When on, item saves to the tenant catalog. Default on. | When off, item is saved to this project only. |
| Add to catalog | Add product card footer | Saves the item; card closes; item appears in grid. | Disabled until all fields are confirmed. |
| Add and place | Add product card footer (primary) | Saves the item and starts placement on the plan at the cursor. | Requires Edit model and edit lock in addition to Edit catalog. |
| Refresh prices (not in mockup) | Item detail and "In this project" collection | Re-checks the product source; shows a change list (price change, discontinued) before anything updates. User accepts or rejects each change. | Round 15. Updates the project snapshot only after acceptance. |
| Price snapshot indicator (not in mockup) | Product card / item detail in project context | Shows the snapshotted project price and snapshot date. | Round 15: prices are snapshotted per project. |
| Existing / Proposed toggle | Status bar | Sets default status for newly placed objects. | Standard. |
| Zoom readout | Status bar right | Shows zoom (100%). | Standard. |

**Data shown:**

- catalog\_item (tenant): category, brand, sku/model, dims, finish, price, lead time, supplier, texture\_path, source\_url, ai\_confidence per field; thumbnail image.
- Counts per category and collection; total products (status bar "426 products"); items placed in this project ("23 placed").
- Library name and sharing ("Worth Properties library · shared with 4 users").
- AI read result: fields filled count, elapsed seconds, confidence per field.
- Project price snapshot per item (Round 15) (not in mockup).

**States:**

- Empty catalog: category list with zero counts; prompt to Add product (not in mockup).
- Empty search: "0 results" (not in mockup).
- Loading: pending card in grid; status line "Reading page..." in Add product card.
- Read error / blocked site: fallback chips Paste text and Upload screenshot (Round 7).
- View-only (another user holds the edit lock): browse only; drag-to-place and Add and place disabled. Amber lock banner per Round 13.
- Permission denied: no Edit catalog hides Add product; no See company costs hides cost fields and no See sell prices hides sell and markup fields.
- Offline: browsing cached catalog; Add product and Refresh prices disabled with a "Needs connection" note.
- Price refresh results pending review (not in mockup).

**Validation & warnings:**

- AI never saves silently: each field shown for confirmation; Add is blocked until confirmed.
- Low-confidence fields marked red; check fields amber with reason on hover.
- Dimension fields accept the plan doc length formats (12'6", 12' 6 1/2", 150", 12.5'); fractions to 1/16".
- DWG not applicable here. Large retail sites may block reads; show fallback.
- Refresh: shows "price changed" and "discontinued" before update.
- Placement: size snaps to nearest cabinet or wall.

**Events emitted:**

- catalog\_item.created (new)
- catalog\_item.updated (new)
- catalog\_price.refreshed (new): item, old price, new price, discontinued flag, project id
- takeoff.updated when a placed item changes project quantities

**Decisions:**

1. Categories, in this order: Cabinets, Countertops, Tile, Plumbing fixtures, Lighting, Appliances, Hardware, Paint, Windows and doors (plan doc list). (Claude)
2. Three add modes: Link, Paste text, Screenshot. Screenshot accepts a file upload or a clipboard paste. (Claude)
3. Green fields count as confirmed when the user presses Add. Amber and red fields each need a tap (or an edit) before Add to catalog and Add and place enable. (Claude)
4. AI reads the page price into Cost. Sell price = Cost x (1 + markup). Default markup per category is set in Settings → Catalog (15e); it can be changed per item. (Claude)
5. With Save to company library unticked, the item is saved to this project only. (Claude)
6. The project price snapshot is taken when the item is first placed in the project or added to an option. (Claude)
7. Refresh is manual only: per item on the item detail, and "Refresh all" on the In this project collection. No scheduled refresh. (Claude)
8. Item detail uses the Add product card layout, filled in, with Refresh prices and Delete (Edit catalog). (Claude)
9. The page image is the default thumbnail and texture. A Texture/photo field allows upload of a different one. With none, 3D uses a generic material at the item's size. (Claude)
10. Offline: Add product and Refresh prices are disabled with a "Needs connection" note; browsing the cached catalog and placing items still work. (Claude)
11. Standard spec is a star toggle on the item detail (Edit catalog). Recently added = last 30 days; the window is a setting under Defaults. (Claude)

### 10 · Detail editor

**Purpose:** Draw custom 2D detail drawings for one-off conditions (Round 19), with parts, hatches, line roles, keynotes, dimensions and steps, then place them on detail sheets or extrude a closed profile to 3D.

**Entry points:**

- Left rail Detail tool (icon frame\_inspect).
- Tapping a detail callout bubble on a plan, elevation or sheet opens the detail (also from the field pack plan, read-only).
- Countertop support check (Round 23): a seating overhang past the company limit adds support brackets to a detail and shows a notice that links here.
- New detail creation (not in mockup): from blank, cut from model (section line on a plan or elevation), reusable parts, photo or PDF underlay, or copy of a saved detail.
- Library tab in the left panel.

**Permissions:**

- View: View projects.
- Draw, edit, place on sheet, extrude: Edit model, plus project edit lock.
- Save to company library: Edit catalog.
- Print preview: View projects. Export of the detail: Export.

**Layout:** Standard editor shell, with these differences: rail shows Detail active and no Catalog button; status bar has no Existing/Proposed toggle and shows View, Scale, Line role, Parts, Warnings, zoom.

- Left panel: Parts / Layers / Library tabs; parts list; Line role list; Hatch swatches.
- Canvas: detail drawing; floating tool bar top left; NTS indicator card top right.
- Inspector: detail header, Title, Scale, Sheet, warning, Keynotes, Steps, action buttons.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Detail rail button | Left rail | Opens the detail editor. | Pressed while active. |
| Tab: Parts | Left panel | Shows parts list with quantity. | Default tab. |
| Tab: Layers | Left panel | Shows detail layers; toggling layers is one way to show steps (Round 19). | Content not in mockup. |
| Tab: Library | Left panel | Shows company detail library; copy a saved detail into the job. | Copy is edited in place; the library version does not change. |
| Part row | Parts list | Click selects the part on the canvas. Shows name, size note, qty. | Parts carry their own name and size; "ex." qty means existing. |
| Add part (not in mockup) | Parts list | Inserts a reusable part (studs, blocking, anchors, threaded rod, mesh sleeve, LED channel, brackets, fasteners). | Round 19 starting point. |
| Line role row: Cut, Beyond, Hidden, Center | Left panel | Sets role of selected or next lines. Shows pen width (0.50, 0.18, 0.25, 0.18 mm). | Users pick role, not pen width. Hidden is dashed. Dims and leaders use the thinnest weight automatically. |
| Hatch swatch: Wood, Steel, Gypsum, CMU | Left panel | Applies hatch to the selected closed region. | Plan doc standard set also includes plywood, MDF, concrete, insulation, tile, epoxy/grout (not in mockup), plus custom hatches saved to the company library. |
| Tool: Line | Canvas tool bar | Draws lines with snap, typed length and angle. |  |
| Tools: Polyline, Rectangle, Circle, Arc (not in mockup) | Canvas tool bar | Draw shapes. | Round 19. |
| Tool: Freehand pen (not in mockup) | Canvas tool bar | Strokes auto-clean to lines, arcs, circles, rectangles. Hold, or toggle, to keep the raw stroke. | Round 19. |
| Tool: Hatch | Canvas tool bar | Click a closed region to fill with the active hatch. |  |
| Tool: Keynote | Canvas tool bar | Places a numbered keynote bubble with leader; adds a row to Keynotes. | Shown active in mockup. |
| Tool: Leader | Canvas tool bar | Draws a leader attached to an object; it follows the object when moved. Free arrows also allowed. | Label text typed, filled from the part, or a keynote number. |
| Tool: Text (not in mockup in tool bar) | Canvas tool bar | Free text. | Fixed print sizes. |
| Tool: Dimension | Canvas tool bar | Linear and angular dims, thickness and spacing ("16" o.c."), typed override. | Fractions to 1/16". Typed overrides on NTS details are underlined. |
| Tool: Break | Canvas tool bar | Places a break line symbol. | Kept in v1. |
| Mirror, copy, align (not in mockup) | Canvas / context menu | Same as plan editor. | Round 19. |
| NTS indicator card | Canvas top right | Shows "NTS" with a toggle. | Indicator only; mirrors the inspector Scale. NTS details are stamped "NTS" automatically. |
| Canvas click | Canvas | Selects the smallest object; repeat clicks cycle outward (plan editor rule). |  |
| Canvas drag | Canvas | Moves selection; attached leaders follow. |  |
| Keynote bubble click | Canvas | Selects the keynote and highlights its row. |  |
| Callout bubble (3 / A5.0) | Canvas bottom | Detail title bubble: number, sheet, title, scale. | Generated. |
| Warning marker (triangle) | Canvas | Marks a problem location. Click opens the warning in the inspector. |  |
| Title input | Inspector | Edits detail title ("D-3 Floating shelf at range wall"). | Required. |
| Scale toggle: 1 1/2", 3", NTS | Inspector | Sets detail scale. | Set at creation; can be changed later. Options list is a setting under Defaults. |
| Sheet select (A5.0, A4.0) | Inspector | Chooses the sheet the detail is placed on. | Default A5.0. |
| Warning row with fix link ("Snap to blocking") | Inspector | Fix link applies the suggested change. | Mockup warning: leader points to empty space. |
| Keynotes "+ Add" | Inspector | Adds a keynote row. | Numbers sequential. |
| Keynote row | Inspector | Edit keynote text inline. | Listed beside the detail on the sheet. |
| Steps list row | Inspector | Edit step text. "Prints with detail". | Addition to side-by-side and layer steps. |
| Add step (not in mockup) | Inspector | Adds a step. |  |
| Place on sheet | Inspector footer | Opens print preview at actual size on 24x36, 11x17 and phone (not in mockup), then places the detail on the selected sheet and creates the callout. | Round 19: preview before placing. |
| Extrude to 3D | Inspector footer (primary) | Extrudes a closed section profile into a simple 3D piece the crew can rotate. | Disabled unless a closed profile is selected or present. Annotations, freehand marks, open lines stay 2D. |
| Save to company library (not in mockup) | Inspector or Library tab | Saves the detail to the company library. |  |
| Status bar fields | Status bar | View (Detail D-3 · section), Scale, Line role, Parts (8 · 3 hatches), Warnings count, zoom 200%. | Warnings count opens the warning. |
| Keyboard: Esc, Delete, Undo/redo (implied) | Canvas | Cancel tool, delete selection, undo/redo within session. | Round 11: undo within session. |

**Data shown:**

- detail: id, number (D-3), title, scale or NTS, sheet, linework with roles, hatches, parts (name, size, qty), keynotes, steps/layers, library link, references (e.g. "Referenced from Elev 2/A4.0 · 3D"), source badge ("Custom").
- Warnings list from legibility checks.

**States:**

- Empty (blank start): empty canvas, no parts (not in mockup).
- Loading: as in 03 (canvas skeleton).
- Error: as in 03 (banner with Retry; edits kept locally).
- View-only (edit lock held by another user, or field pack): tools disabled; tap bubble opens detail read-only.
- Permission denied: no Edit model gives view-only.
- Offline: editing continues; saved on device and synced (Round 13).
- Library copy: shows that the detail is a project copy of a library item.
- Warnings present: count in status bar and inspector.

**Validation & warnings:**

- Text prints at fixed sizes regardless of detail scale: minimum 3/32" on a 24x36 sheet; labels and dims one size up from notes.
- Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders thinnest.
- Warning when leaders cross each other.
- Warning when labels sit on linework.
- Mockup warning: "Leader N points to empty space" with a snap fix.
- NTS details stamped "NTS" automatically; typed-override dims underlined.
- Extrude requires a closed profile.
- Print preview at actual size before placing on a sheet.

**Events emitted:**

- detail.created (new)
- detail.updated (new)
- detail.placed (new): detail id, sheet number, callout locations
- detail.extruded (new)
- detail\_library.saved (new)

**Decisions:**

1. Scale can be changed after creation. Switching to or from NTS re-checks typed-override dimensions and their underlines. (Claude)
2. Scales offered: 3/4", 1", 1 1/2", 3", 6" = 1'-0", full size, and NTS. The list is a company setting under Defaults. (Claude)
3. The NTS card on the canvas is an indicator only; it mirrors the inspector Scale control. (Claude)
4. The numbered steps text list is an addition. Steps can also be shown as details side by side or as layers toggled on and off; the text list prints beside the detail. (Claude)
5. Keep the Center line role. (Claude)
6. Keep the Break tool. (Claude)
7. Tool bar order: Line, Polyline, Rectangle, Circle, Arc, Pen, Hatch, Text, Keynote, Leader, Dimension, Break. (Claude)
8. "Leader points to empty space" is a v1 warning: the leader end is not on any object or linework within the snap tolerance (a setting under Defaults). (Claude)
9. Saving to the company detail library needs Edit catalog. (Claude)
10. New detail opens a dialog with five start tiles (Blank, Cut from model, Parts, Underlay, Copy saved detail), plus Title and Scale, and a Create button. (Claude)
11. The canonical reference is the callout form "3 / A5.0" (detail number / sheet). "D-3" is shown only as the editor label. (Claude)

### 11 · Architect DXF reference + markup

**Purpose:** Show an uploaded architect DXF at full fidelity as a read-only reference, convert chosen layers into model objects, mark it up on a separate layer, compare reference versions, and send markup back.

**Entry points:**

- Left rail Reference tool (Shift+R) (icon layers).
- Left rail Markup tool (icon ink\_highlighter).
- Upload of a DXF on import (screen 02) or from the Files tab.
- New reference version received ("New rev" badge; "N to review" pill).

**Permissions:**

- View: View projects.
- Upload reference, upload new version, Accept/Keep revision: Upload references.
- Convert layer: Edit model; conversion goes through Import review.
- Add clouds, arrows, dims, text: Add markup, plus edit lock. Comments: Add markup, no lock needed.
- Show/hide and recolor layers, opacity: View projects (view state only).
- Export markup: Export.

**Layout:** Standard editor shell, with these differences: rail shows Reference (Shift+R) active and adds Markup; rail omits Text; status bar adds File, Units, Layers, Aligned.

- Left panel: Layers / Markup / Files tabs; "This project" layers; DXF layer list; selected-layer action box with Convert, options, opacity.
- Canvas: reference drawing in gray with model and markup over it; tool bar (Pick, Cloud, Comment, Convert); "Show Arch rev C changes" chip; read-only notice.
- Inspector: Reference version; Current vs Compared selects; change summary; Changes list; Keep / Accept buttons; Send markup back; Export markup.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Reference rail button (Shift+R) | Left rail | Opens reference mode. | Shortcut Shift+R. |
| Markup rail button | Left rail | Opens markup tools / Markup tab. |  |
| Tab: Layers | Left panel | Layer list. | Default. |
| Tab: Markup | Left panel | List of clouds, comments, pins (not in mockup). |  |
| Tab: Files | Left panel | Reference files and versions; upload (not in mockup). |  |
| Layer row: EZ model | Left panel, This project | Eye toggles model visibility. Count of objects (62). |  |
| Layer row: Markup | Left panel, This project | Eye toggles markup layer. Shows "2 clouds · 3 pins". |  |
| DXF layer row | Left panel | Click selects the layer and shows the action box. Shows name, count, or "Converted" badge. | Header shows "24 · 9 shown". |
| Layer eye icon | DXF layer row | Shows / hides the layer. | Hidden rows dimmed with visibility\_off icon. |
| Layer swatch | DXF layer row | Recolors the layer (color picker not in mockup). | Display only; original file unchanged. |
| Convert layer | Action box | Sends recognized objects on the layer (walls, openings, rooms, cabinets) to Import review. Original layer stays as reference. | Converted layers show "Converted". Text explains result ("Converts to furniture blocks."). |
| Layer options (...) | Action box | Opens layer menu: Isolate layer, Show all, Reset color, Snap on/off. |  |
| Reference opacity slider | Action box | Sets reference opacity (60%). |  |
| Convert all / Convert none (not in mockup) | Action box or Files tab | Converts all recognized layers or none. | Round 22. |
| Tool: Pick | Canvas tool bar | Selects reference entities and markup. | Reference entities are read-only. |
| Tool: Cloud | Canvas tool bar | Draws a revision cloud on the markup layer. |  |
| Tool: Comment | Canvas tool bar | Places a numbered pin with a comment bubble (author, number, text). |  |
| Tool: Convert | Canvas tool bar | Click or box-select reference entities to convert. | Goes through Import review. |
| Markup tools: Arrow, Text, Dimension (not in mockup in tool bar) | Canvas tool bar | Markup on the markup layer. | Round 22. Dimension rail tool snaps to reference. |
| Measure (not in mockup) | Canvas | Measure on the reference. | Round 22. |
| Snap to reference | Canvas | Snap, measure and dimension on reference geometry. |  |
| Place objects on top | Canvas, with model tools | Cabinets, devices, details placed over the reference. | Requires Edit model. |
| Cut section / callout from reference (not in mockup) | Canvas | Starts a section or callout from reference linework. | Round 22. |
| Paper-space layout selector (not in mockup) | Canvas or Files tab | Shows DXF layouts (sheets) as drawn. | Round 22. |
| Chip: Show Arch rev C changes | Canvas top | Toggles change highlights (tags such as "MOVED 2"", "+ W4 ADDED", "− LAV"). | Label uses the current revision letter. |
| Comment pin | Canvas | Click opens the comment bubble. |  |
| Current select | Inspector | Picks the current reference version (Arch rev C · Oct 11). |  |
| Compared to select | Inspector | Picks the version to compare (Arch rev B · Sep 22). |  |
| Change summary | Inspector | "14 changes · 2 touch your markups · 1 touches a cabinet"; tags 5 added / 3 removed / 6 changed. |  |
| Change row | Inspector, Changes list | Click zooms to the change on canvas (not stated in mockup). Tag shows affected item (e.g. "Cabinet run B21–B24", "Markup 1"). | Sorted "Affects you first". |
| Show N more (text and dims) | Inspector | Expands remaining changes. |  |
| Keep Arch rev B | Inspector | Keeps the previous version as current. | New version is stored; change list stays available to accept later. |
| Accept Arch rev C | Inspector | Makes the new version current. | Markups and model objects on changed areas stay flagged. |
| Send markup back toggle: PDF overlay / DXF layer | Inspector | Chooses export format. | DXF exports to layer Z-MARKUP-WP. PDF overlay: red markups with a revision legend. |
| Export markup | Inspector footer (primary) | Runs export job; produces file for download or send. | Requires Export. |
| Upload new version (not in mockup) | Files tab | Uploads revised DXF as a new version of the same reference. | DWG upload prompts for a DXF (Round 21). |
| Existing / Proposed toggle | Status bar | Standard. |  |
| Aligned readout | Status bar | Shows alignment ("grid A1 · 0" offset"). | Set by two-point align in the Files tab; new versions inherit it. |
| Zoom | Canvas | Scroll / pinch zoom; readout 100%. |  |

**Data shown:**

- reference\_drawing: file name, source (architect), received date/time, versions (Rev letter, date), layer state (name, visible, color, count, converted), convert status, units ("inches · 1 unit = 1""), alignment.
- markup: clouds, comment pins (author, number, text), arrows, dims, text.
- Change list between two versions with affected markups and model objects.
- Title block text from the DXF displays as drawn.

**States:**

- Empty: no reference uploaded; prompt to upload DXF (not in mockup).
- Loading: GPU rendering with layer loading for large files (Round 22); progress not specified.
- Error: DWG uploaded, prompt for DXF. Unreadable file: error message with Upload again.
- New version received: "New rev" badge; changes listed.
- Read-only reference: "Reference is read only. Convert a layer to edit it."
- View-only (edit lock elsewhere): markup and convert disabled; comments still allowed.
- Permission denied: controls the user lacks are hidden (no Export hides Export markup).
- Offline: edits saved on device and synced (Round 13); upload and export need network.

**Validation & warnings:**

- Nothing in the reference is simplified or deleted.
- DWG: prompt for DXF in v1.
- On a new version: highlight what changed and which markups and model objects sit on changed areas.

**Events emitted:**

- reference.uploaded (new)
- reference.version\_uploaded
- reference.version\_accepted (new)
- reference.layer\_converted (new)
- markup.exported (new)

**Decisions:**

1. Keep Arch rev B stores the new version but leaves Arch rev B current; the change list stays available to accept later. Accept Arch rev C makes it current. Neither changes model objects; affected markups and objects are flagged for review. Reference DXF diff is v1 (Round 24). (Claude)
2. Alignment: on first upload the user picks two points on the reference and the matching two points on the model (or a grid point plus rotation). Offset and rotation fields sit in the Files tab. New versions inherit the alignment. (Claude)
3. A layout selector at the top of the canvas lists Model and each paper-space layout. (Claude)
4. Markup tool bar: Pick, Cloud, Comment, Arrow, Text, Dimension, Convert. (Claude)
5. Permissions (Round 24): uploading references, new versions and Keep/Accept need Upload references; markup needs Add markup; Convert needs Edit model.
6. Clouds, arrows, text and dimensions need the edit lock; comments do not (Round 24 item 16).
7. Layer options menu: Isolate layer, Show all, Reset color, Snap on/off. (Claude)
8. The PDF overlay includes the reference drawing in light gray under the red markup. (Claude)
9. A change is an entity added or removed, geometry moved more than the tolerance (a setting under Defaults), or a text or dimension value changed. Architect versions are labeled "Arch rev" plus the architect's letter (reference\_drawing.rev\_label) so they never read like permit "Rev N". (Claude)

### 12 · Supplier rendering markup

**Purpose:** Tie a supplier's kitchen rendering, PDF drawings and 2020 order report to the plan's cabinet boxes: tag each cabinet in the rendering with its code, link it to a box, compare against the order report, and resolve mismatches. Also covers supplier PDF and 2020 order-report import.

**Entry points:**

- Left rail Supplier markup tool (icon photo\_library).
- Import of supplier files (Round 20) from the import flow (screen 02) or the Upload button here.
- Mismatch count in the "N to review" pill.

**Permissions:**

- View: View projects.
- Upload: Upload references. Tag, link, Read codes: Add markup, plus edit lock.
- Update plan to match: Edit model, plus edit lock.
- Keep plan, flag to supplier: Flag to supplier.
- Order line prices, if shown: See company costs.

**Layout:** Standard editor shell, with these differences: rail shows Supplier markup active and omits Fixtures; status bar has no Existing/Proposed toggle and shows View, Source, Tags, Phase (read-only), zoom.

- Left panel: Supplier files list with Upload; source note; tag filter; tag list; linked/flagged counts.
- Canvas split: tool bar and hint; rendering card (left); plan card with linked boxes (right).
- Inspector: tag header; linked box card; 2020 report vs plan comparison; mismatches list; info note; mismatch actions.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Supplier markup rail button | Left rail | Opens this screen. |  |
| Upload | Left panel header | Uploads supplier files: rendering images, PDF plans/elevations, DXF, order report. | DWG prompts for DXF. 3D DWG needs the converter (deferred). |
| File row | Left panel | Click opens the file: image in the rendering card; DXF elevations; order report summary. Shows name, type, summary (e.g. "15 tags", "22 lines read", "Elevations A–D · 4 layers"). | Active file highlighted. |
| Source note | Left panel | "\[Supplier\] · received \<date>. Codes read from the order report, positions from the rendering." | Static. |
| Tag filter chip: All / Flagged (n) | Left panel | Filters tag list. |  |
| Tag row | Left panel | Click selects the tag in rendering, plan box, and inspector. Shows code, location, link or error icon. | Flagged rows amber. |
| Linked / flagged counts | Left panel footer | "13 linked · 2 flagged". |  |
| Tool: Tag | Canvas tool bar | Click a cabinet in the rendering, type its code or size; tag created. | Hint: "Click a cabinet, type its code, then click its box in the plan". |
| Tool: Link | Canvas tool bar | Click a tag, then a box in the plan to link. |  |
| Tool: Read codes | Canvas tool bar | AI reads codes and positions; results shown as suggested tags to confirm. | AI never edits silently. |
| Tool: Compare | Canvas tool bar | Shows tag vs order report vs plan differences. |  |
| Tags on / Off | Rendering card header | Shows or hides tags on the image. |  |
| Fit | Rendering card header | Fits image to card. |  |
| Rendering canvas: click tag | Rendering card | Selects tag. |  |
| Rendering canvas: click untagged cabinet (Tag tool) | Rendering card | Opens code entry at that point. |  |
| Amber "Not in plan" tag | Rendering card | Marks a code with no plan box. | Selecting it shows a dashed ghost box in the plan. |
| View chips: Persp 1, Persp 2, Persp 3, Elev A, Elev B | Rendering card footer | Switch the view within the supplier file. |  |
| Opacity | Rendering card footer | Image opacity (100%). | Slider 0–100%, rendering image only. |
| Plan card box click | Plan card | Selects box; with Link tool, completes a link. | Linked boxes tinted; mismatch amber; ghost dashed. |
| Mismatch callout on plan | Plan card | Shows "2020: B21 / plan: B18 + F3". |  |
| Plan legend | Plan card footer | Linked to a tag; Mismatch or missing; Wall cabinet above; Appliance, not tagged. | Static. |
| Linked box card open (open\_in\_new) | Inspector | Opens the box in the plan editor / cabinet inspector. |  |
| Comparison table: Code, Width, Face, Finish, Order line | Inspector | 2020 report vs Plan with check per row. | Mismatch rows marked. |
| Mismatch row | Inspector, Mismatches list | Selects the mismatch. | Selected state highlighted. |
| Update plan to match | Inspector (primary) | Replaces plan box(es) with the supplier code and size. | Requires edit lock. Recompute run total vs wall length. |
| Keep plan, flag to supplier | Inspector | Keeps plan; sends a note to the supplier with the plan box and field measure. | Emailed to the supplier contact on the supplier file, with a Copy link button. |
| Suggested catalog matches (not in mockup) | Inspector or panel | AI suggests catalog items from the rendering (door style, color, counter, hardware) to confirm. | Round 20: rendering is a style and finish reference, not geometry. |
| Supplier PDF import (not in mockup) | Upload flow | Vector PDF parsed for walls, cabinet runs, dims; cabinet labels set size and type; plan and elevations cross-checked; result goes to Import review with confidence colors. | Scanned PDF: trace-assist only, lower confidence. |
| Order report import (not in mockup as a flow) | Upload flow | Reads codes, sizes, finishes and order line numbers; lines become the reference for tags. | Round 20: most reliable input. |

**Data shown:**

- Supplier files: name, type, received date, supplier name, summary counts, resolution (2400 x 2400), file views.
- Tags: code, location, linked box id, status (linked/flagged), file view.
- Order report lines: line no, code, width, face, finish.
- Plan boxes: run, box index, code, W x D x H, finish, face, fillers, scribe; model version.
- Field measure (e.g. 117 1/2") and scribe note.

**States:**

- Empty: no supplier files; prompt to upload (not in mockup).
- Loading: progress bar with lines read while reading the order report or codes.
- Error: DWG uploaded, prompt for DXF; proprietary 2020 file uploaded, prompt for DXF/DWG, 3D export and order report (Round 20).
- Mismatch present: amber tags and boxes.
- Not in plan: amber tag, dashed ghost.
- All linked: no flags.
- View-only (lock elsewhere): tagging and Update plan disabled.
- Offline: Read codes and Flag disabled with a "Needs connection" note.

**Validation & warnings:**

- Tag code must match a cabinet code in the library or a typed size (W x H x D).
- Rendering alone gives no reliable dimensions; sizes come from codes or order report.
- Plan vs report compare on code, width, face, finish.
- Run width vs wall length mismatch flagged (Round 21).
- Scribe note when a filler is used.

**Events emitted:**

- supplier\_file.imported (new)
- supplier\_tag.linked (new)
- supplier\_mismatch.flagged (new)
- takeoff.updated when Update plan to match changes boxes

**Decisions:**

1. Flag to supplier sends an email to the supplier contact stored on the supplier file (source\_file.supplier\_name and supplier\_contact\_email), with a Copy link button; the flag is logged on the tag. (Claude)
2. Order report accepted as PDF, CSV or plain text. Lines are read by text extraction plus AI and shown in Import review for the user to confirm. Waiting on: a sample 2020 order report from the supplier to confirm the parser.
3. Read codes: AI proposes tags from labels in the rendering matched to order report lines; they show as dashed suggested tags and each needs Confirm. (Claude)
4. A click is enough to place a tag; dragging an outline is optional. (Claude)
5. With no tag selected, the inspector shows "Suggested finishes": AI-matched catalog items (door style, color, counter, hardware), each with Confirm or Skip. (Claude)
6. Flagging needs the Flag to supplier permission (Round 24).
7. Opacity is a 0–100% slider for the rendering image only; no overlay on the 3D view. (Claude)
8. Waiting on: a sample 2020 export (DXF plan/elevations and order report) from the supplier.
9. Neither source wins automatically. A difference shows as a mismatch until the user picks Update plan to match or Keep plan, flag to supplier. (Claude)

### 13 · Sheets, key + issue

**Purpose:** Review the auto-built plan set, edit sheet annotations, check the issue gates, choose output settings and submittal profile, and issue the permit set or a numbered revision.

**Entry points:**

- Header tab Sheets.
- Header Issue set button (opens this screen with the issue checklist).
- Checklist links from other screens; notifications.

**Permissions:**

- View: View projects.
- Edit sheets (viewports, clouds, keynotes, text, callouts, title block): Edit model, plus edit lock.
- Issue Rev 0 permit set: Issue permit sets.
- Issue Rev 1+: Issue revisions.
- Send set to client: Send to client.
- PDF export: Export.
- Title block company fields: Manage users and settings (tenant title block).
- Property appraiser import: Edit model. Check: Run code check.

**Layout:** Standard editor shell header; rail is replaced by Sheet tools; status bar has no Existing/Proposed toggle and shows Sheet, Size, Scale, Revision, zoom. Sheet rail adds Check.

- Left panel: set selector; sheet list grouped Architectural / Electrical / Renderings; Add sheet; legend.
- Canvas: tool bar (Sheet, Clouds); sheet label and position; prev/next + zoom; sheet preview; thumbnail strip at bottom.
- Inspector: Issue checklist; output settings; Revision log; Issue button.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Rail: Select (V) | Sheet rail | Select sheet objects. | Default. |
| Rail: Pan (H) | Sheet rail | Pan the sheet. |  |
| Rail: Viewport | Sheet rail | Add or edit a viewport; set scale per viewport. | Plans 1/4", elevations 1/2" default (plan doc); mockup sheet shows 3/4". |
| Rail: Revision cloud | Sheet rail | Manual cloud. | Clouds on changed objects are automatic. |
| Rail: Keynote | Sheet rail | Places keynote. |  |
| Rail: Text (T) | Sheet rail | Places text. |  |
| Rail: Callout | Sheet rail | Places a section / elevation / detail callout. |  |
| Rail: Title block | Sheet rail | Opens title block fields. | Fields per Round 4, plus code edition and scope of work. |
| Rail: Symbol key | Sheet rail | Places the auto key and sets placement for the set: On every sheet / On cover only. | Round 24 item 8. |
| Rail: Check (not in mockup) | Sheet rail | Runs the code check; results list opens in the inspector. | Round 24 item 35. Run code check permission. |
| Set selector | Left panel header | Switches between Permit set and Client set (sheet\_set records). Shows sheet count, size, revision. |  |
| Sheet row | Left panel | Opens sheet. Shows status dot, number, title, Δ tag, open items ("2 open"). | Dot: ready to issue / needs approval. |
| Add sheet | Left panel | Adds a sheet from a type picker (plan, elevation, details, schedule, renders, blank). |  |
| Tool: Sheet | Canvas tool bar | Sheet view. | Default. |
| Tool: Clouds (n) | Canvas tool bar | Highlights / lists clouds on this sheet. | Count shown. |
| Previous / Next sheet | Canvas top right | Moves through the set. | Zoom readout between (38%). |
| Sheet canvas | Canvas | Shows sheet at print layout with watermark "REV n DRAFT · NOT FOR CONSTRUCTION" while draft. | English only. |
| Thumbnail | Thumbnail strip | Opens sheet. | Active outlined; sheets with open items in amber. |
| Issue checklist row | Inspector | Shows gate or warning status with detail; link (Review / Open) to fix. | Green check, amber warning, red gate. |
| Sheet size toggle 24x36 / 11x17 | Inspector | Sets PDF sheet size. | Stamped permit sets export 24x36 (ARCH D); 11x17 is for client and field copies (Round 25). Paper sets print from the same PDF. |
| Title block readout | Inspector | "Company standard"; Edit link opens title block fields. |  |
| Output readout | Inspector | "PDF, 1 file per set". | Round 24 item 6. A Download one page at a time option is also offered (Round 25). |
| Submittal profile select (not in mockup) | Inspector | Picks department preset (every 15c field: file split, naming, revision naming, size, flatten, stamp box, resubmittal mode, minimum scale, who signs). | Rounds 4, 5. |
| Revision log row | Inspector | Rev (or Version), date, description or sheets, status (Issued/Draft). | Note line under draft rev. |
| Draft change order checkbox (not in mockup) | Inspector, above Issue | When ticked, screen 14 opens after issue so the CO can be sent with the revision. | Shown only with Create change orders. |
| Issue Rev n | Inspector footer (primary) | Runs the code check, generates the PDF, freezes the version, numbers the revision, updates revision blocks. Result shows the PDF link with Copy link. | Disabled while a gate is open. Hidden without Issue permit sets (Rev 0) or Issue revisions (Rev 1+). |
| Property appraiser import (not in mockup) | Title block tool or checklist row | Paste PAO link; app reads parcel number, owner, legal description, year built, living area for user to confirm. | Fallback: paste page text or screenshot. Year built sets pre-1978 lead flag. Edit model. |
| Code check accept-with-note (not in mockup) | Issue checklist | Lists open code warnings; each can be accepted with a note. | Round 5. |
| Send to client | Header Share | Sends the set to the client; numbered Version N before Rev 0, Rev N after. Email plus Copy link. | Send to client permission. Round 24 items 15, 26. |
| Keyboard V, H, T | Sheet rail | Tool shortcuts. | Editable under Defaults. |

**Data shown:**

- sheet: number, title, viewports, scale, status, Δ marks, open items.
- Sheet content: model views, symbol key ("SYMBOLS USED ON THIS SHEET"), general notes, keynotes, title block.
- Title block: logo, company, license CGC1541042, project, address, owner, PCN ("From property appraiser link"), revisions table (no, date, description), seal / signature box (3" x 3" clear), separate blank department approval stamp area, signature and date, drawn, checked, date, scale, sheet title, sheet number, revision, sheet x of y.
- permit\_revision: rev\_no, issued\_at, description, delta objects, status.
- Checklist results: property record, dimension status, load calc (NEC edition, service), renders pending, translations pending.

**States:**

- Draft: watermark; Draft badge.
- Ready to issue: all gates pass.
- Blocked: gate open; Issue disabled with reason.
- Issued: set locked as Rev 0; later changes gather into the next revision.
- Generating PDF: background job; Issue button shows progress until the PDF link appears.
- View-only (lock elsewhere): annotation tools disabled; viewing and printing preview allowed.
- Permission denied: controls the user lacks are hidden (no Issue permit sets / Issue revisions hides Issue).
- Offline: Issue disabled with a "Needs connection" note.
- Empty: default set listed with blank viewports and a note to draw or import first.

**Validation & warnings:**

- Issue gates (Round 12): code check reviewed (warnings fixed or noted), no red/orphan flags (e.g. "not on a wall"), title block complete.
- Issuing runs the code check automatically and lists open warnings.
- Non-blocking warnings: "All dimensions typed" (Round 24 item 10); renders awaiting approval; Spanish notes unreviewed (does not hold issue unless the company hold setting is on).
- PDF rules (Round 4, Round 24): one PDF file per set; supporting documents separate; not password-locked; markup and stamping allowed; file name from address + description (e.g. "336 Golfview Rd buildingplans"), with the version kept in the file name by default (a submittal profile can switch to same-name, Round 25); Download one page at a time also offered (Round 25); one bookmark per sheet; two blank areas on each sheet (seal box and department approval stamp); stamped permit sets 24x36 (ARCH D), 11x17 for client and field copies (Round 25).
- Every sheet gets a scale bar and a printed check dimension (not in mockup).
- Text and symbols print at fixed paper size at any scale.
- Permit sheets are English only.
- Electrical sheets note that the electrical contractor of record verifies the design; optional EC signature block kept.
- Numbering: pre-permit client sends are "Version N"; Rev 0 at permit issue; changes after that are gathered and numbered Rev 1, 2... when next sent to client or department; no cap. Changed objects clouded with delta tag automatically; revision block and log update on each sheet. A sent version is frozen.
- Key: only symbols and abbreviations actually used; updates when objects are added or removed; placement per set.
- Sheet numbering: decimal (A1.0 style), default set per Round 24.
- Countertop plan, edge detail and top schedule never appear in the Permit set.
- Title block: address, parcel number, owner, code edition, scope of work, revision block, seal box; logo, license, contact on/off.

**Events emitted:**

- plan\_set.issued: project id, rev no, PDF url, sheet list
- revision.created: rev no, changed objects, before/after images, quantity changes
- property\_record.imported (new)
- model.exported is not emitted here (PDF only)

**Decisions:**

1. Default set (Round 24): A0.0 Cover, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Elevations, A5.0 Details, A6.0 RCP, E1.0 Electrical, E2.0 Panel + load calc, R1.0 Finish schedule + renders. The mockup order is corrected to this.
2. Countertop plan, edge detail and top schedule are not in the permit set; they go in the Client set and internal documents only (Round 24 item 5).
3. "All dimensions typed" is a warning in the checklist, not a gate (Round 24 item 10). It dismisses with one click and clears when the set is issued (Round 25).
4. One PDF file per set (Round 24 item 6).
5. Two blank areas on every sheet: the seal box and a separate department approval stamp area (Round 24 item 7).
6. Code edition and scope of work print in the title block project box, under the address. (Claude)
7. Permit sheets are English only (Round 24 item 9). The language chip is removed from this screen.
8. Symbol key placement is chosen per set: "On every sheet" or "On cover only" (Round 24 item 8).
9. Property appraiser import needs Edit model. (Claude)
10. Two sets: Permit set and Client set (renders, finish schedule, countertop plan and top schedule, no stamp areas). (Claude)
11. A change order is user-initiated. The Issue step has a "Draft change order" option that opens screen 14 after the revision is issued; the CO can be sent together with the revision (Round 24 items 24, 25).
12. Issue (to department) and Send to client (Share) use the same send step. Before Rev 0 a client send is numbered "Version N"; Rev 0 and later sends are "Rev N" (Round 24 item 26). Every emailed send also shows Copy link.

### 14 · Change order hand-off

**Purpose:** Build a change order draft from a revision's changes (before/after images, scope text, line items, schedule impact) and send it to EZ Binder, where the client approves and signs.

**Entry points:**

- Issuing a revision with "Draft change order" ticked (screen 13).
- Revision log or revision history "Create CO" (plan doc Revisions screen).
- Dialog opens over the plan editor; background shows the changed run with "Changed since Rev 1" chip.

**Permissions:**

- Open, edit, Save draft, Send: Create change orders.
- Cost delta column: See company costs. Total, overhead and profit: See sell prices.
- Approve images: Create change orders.

**Layout:** Modal dialog over the standard editor shell (cabinet tool active in the background; background inspector shows the changed run with Rev badge and Length / Depth / To run inputs). Status bar shows View, Phase (read-only), Scale, zoom; no Existing/Proposed toggle.

- Dialog header: icon, title, CO draft source line, Draft badge, Close.
- Left column: Before and after images, image actions, Scope of change text.
- Right column: Line items with total; Schedule impact; Linked job; Triggered by revision.
- Footer: info line, Save draft, Send to EZ Binder.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Close (x) | Dialog header | Closes dialog; unsaved edits prompt (not in mockup). |  |
| Before image (Rev n, Issued date) | Left column | Shows plan of the issued revision. "Needs approval" badge. |  |
| After image (Rev n+1, Draft) | Left column | Shows changed plan; removed items red dashed, new position highlighted. "Needs approval" badge. |  |
| Per-image approve (not in mockup) | Each image | Approves one image for inclusion. | Round 9: each image must be approved before it is included. |
| Use a render instead | Image actions | Replaces an image with an approved render (picker not in mockup). | Only approved renders. |
| Approve images | Image actions | Approves images for inclusion; badges clear. | Send blocked until images are approved or removed. |
| Scope of change text area | Left column | AI-drafted scope; fully editable. | "Client sees this text in EZ Binder." |
| Add line | Line items header | Adds a line item row. |  |
| Line item row: Item, Qty, Unit, Cost delta | Line items | Editable fields. Units: ea, sf, ls, hr, %. | Quantities prefilled from the model change; every cost delta typed by the user. |
| Total change | Line items footer | Sum of cost deltas. | See company costs. |
| Schedule impact (days + text) with edit | Right column | Typed by user; shows completion date change. | Round 9: typed by you. |
| Linked job (open\_in\_new) | Right column | Opens the EZ Binder job. | Uses project.ezbinder\_job\_id. |
| Triggered by revision (chevron) | Right column | Opens the revision with changed sheets (e.g. A2.0, A4.0, A6.0, E1.0). |  |
| Save draft | Footer | Saves CO draft locally. |  |
| Send to EZ Binder | Footer (primary) | Sends the CO draft to EZ Binder; sets change\_order\_draft status Sent and stores ezbinder\_co\_id. The only way a CO reaches EZ Binder. | Disabled until images approved; needs network. |

**Data shown:**

- permit\_revision (from and to), changed objects, changed sheets.
- Before/after images.
- Scope text (AI draft).
- Line items: item, qty, unit, cost delta; total.
- Schedule impact: days, reason, completion date before and after.
- EZ Binder job name and number.
- change\_order\_draft status (Draft).

**States:**

- Draft (new).
- Images awaiting approval.
- Sending / sent (not in mockup).
- Error sending (not in mockup).
- Approved in EZ Binder: inbound API marks CO approved and locks the matching revision (not in mockup).
- Permission denied: no Create change orders hides entry points; no See company costs hides the cost column and no See sell prices hides overhead, profit and the total.
- Offline: Save draft works; Send disabled with a "Needs connection" note.

**Validation & warnings:**

- Every image must be approved before inclusion.
- All text stays editable.
- Info line: "Sends as a CO draft. Client approval and signature happen in EZ Binder."

**Events emitted:**

- revision.created (records the revision only; does not create a CO)
- change\_order.sent (new): co draft, revision ids, images, scope, line items, schedule impact
- Inbound: change order approved (EZ Binder) -> revision locked

**Decisions:**

1. A CO reaches EZ Binder only when Send to EZ Binder is pressed; revision.created does not create a CO (Round 24 item 25).
2. A CO can be drafted and sent together with its revision (Round 24 item 24). When opened before the revision is sent, the After image is labeled with the revision that will be issued.
3. Each image has its own Approve; "Approve images" approves both at once. (Claude)
4. Cost deltas, overhead and profit, and schedule impact are typed by the user (Round 24 item 25). Quantities are prefilled from the model change and stay editable.
5. Client approval and signature happen in EZ Binder; the CO draft carries no client approval. When EZ Binder marks the CO approved, the matching revision locks. (Claude)
6. Save draft stores the CO in EZ Draft only; nothing goes to EZ Binder until Send. (Claude)

### Takeoff (not in mockup)

**Purpose:** Quantities from the model by room and trade, with waste factors, for CSV export and later push to EZ Binder. (not in mockup)

**Entry points:** Takeoff screen in the plan doc screen list; header Export (CSV). Entry control not in any mockup. (not in mockup)

**Permissions:** View: View projects. Unit costs and totals: See company costs. Edit project waste factors: Edit model (defaults set by owner under Defaults). CSV: Export. (not in mockup)

**Layout:** Standard editor shell; left panel group by Room / Trade; main table; inspector with waste factors and line source. (not in mockup; layout proposed, needs design)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Group by Room / Trade (not in mockup) | Top of table | Regroups lines. | Plan doc §8. |
| Line row (not in mockup) | Table | Shows item, qty, unit, waste, total qty; click highlights source objects on plan. |  |
| Waste factor input per material (not in mockup) | Inspector | Default per material; adjusted by pattern (straight, diagonal, herringbone); editable per project. | Round 7. |
| Tile pattern select (not in mockup) | Inspector | Straight / diagonal / herringbone. | Affects waste. |
| Export CSV (not in mockup) | Header or table | Material list CSV. | Export permission. |
| Push to EZ Binder estimate (not in mockup) | Table | v2 only. | Plan doc scope: v2. |

**Data shown:** (not in mockup) floor and wall tile SF and boxes; drywall sheets; paint SF; LF trim and countertop; countertop area and exposed edge LF (Round 23); cabinet count by size and cabinet schedule (Round 21); fixture and device counts; estimated wire runs; ACT tiles, mains, cross tees, wall angle, hanger wire (Round 16); cost per option as structured data (option, item, qty, unit cost, total), internal only (Round 6).

**States:** (not in mockup) empty model; recomputing after change; stale vs current model version; offline.

**Validation & warnings:** (not in mockup) waste factor required per material; no separate cut list in v1.

**Events emitted:** takeoff.updated (line items by room and trade).

**Decisions:**

1. Takeoff opens from a Takeoff item in the header Export menu and a Takeoff tab in the left panel on the Plan view; layout as above (left: Room / Trade grouping, main: table, inspector: waste factors and line source). Needs a mockup before build. (Claude)
2. Company waste factor defaults are set by the owner under Defaults (Round 24); per-project overrides need Edit model and the edit lock. (Claude)
3. Takeoff recomputes in the browser from the working copy while the Takeoff panel is open; a snapshot is stored with every sent version (Version N or Rev N). (Claude)
4. The CSV includes cost columns only when the exporting user has See company costs; otherwise quantities only. (Claude)

### Revisions / version history (not in mockup)

**Purpose:** Working versions, named snapshots, sent versions (Version N before permit, Rev N after), revert, the version cleanup sheet, revision log and change-order creation. (not in mockup)

**Entry points:** Versions tab in the Plan left panel (03); clicking the header version text ("Working copy · Saved just now"); Revision log on Sheets; cleanup notification (in-app and email with Copy link). (not in mockup)

**Permissions:** View: View projects. Revert, name snapshot, keep/delete in cleanup: Edit model, plus edit lock. Issue: Issue permit sets / Issue revisions. Send to client: Send to client. Create CO: Create change orders. Controls the user lacks are hidden. (not in mockup)

**Layout:** Left panel list in three groups (Sent, Named snapshots, Working versions); canvas shows the selected version read-only; inspector with version details and actions. Cleanup sheet is a modal over the editor. (not in mockup; needs a mockup before build)

**Version rules (Round 24 items 4, 16, 26):**

- Internal saves are unnumbered working versions, one per checkpoint (Stop editing, closing the project, Finish import, Revert), not one per autosave.
- Numbers apply only to what is sent to another party (client, department, EZ Binder). Pre-permit client sends are "Version N"; permit issues are "Rev N"; no cap.
- A send freezes that version permanently; editing continues on a working copy; the next send is a new version needing a new signature.
- Sent versions and named snapshots are never deleted.
- Unsent working versions auto-delete at 30 days, through the cleanup sheet below.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Version row (not in mockup) | Left panel | Opens the version read-only on the canvas. Shows label (Version N, Rev N, snapshot name, or date/time), author, preview. | Versions are immutable. |
| Name snapshot (not in mockup) | Version row menu / inspector | Names a working version; it becomes a named snapshot and is never offered for deletion. | Edit model. |
| Revert (not in mockup) | Inspector | Creates a new working version from the selected one. | Edit lock. Sent versions stay unchanged. |
| Issue / Send (not in mockup) | Inspector | Opens screen 13 Issue or the Share send. |  |
| Revision log (not in mockup) | Left panel, Sent group | Rev or Version, date, recipient, description, delta objects. |  |
| Create CO (not in mockup) | Sent revision row | Opens screen 14 for that revision. | Create change orders. |
| Cleanup sheet: version row (not in mockup) | Cleanup sheet | Shows a preview image, date and time, author and a one-line change summary for each unsent working version that reached 30 days. | Round 24 item 4. |
| Cleanup sheet: Keep checkbox (not in mockup) | Each row | Ticked rows are kept. | Default unticked. |
| Cleanup sheet: Name field (not in mockup) | Each ticked row | Name for the kept version; defaults to its date and time. | Kept versions become named snapshots. (Claude) |
| Cleanup sheet: Select all / none (not in mockup) | Sheet header | Ticks or clears every row. | (Claude) |
| Cleanup sheet: Save choices (not in mockup) | Sheet footer (primary) | Kept rows become named snapshots; unticked rows delete now. | Edit model. |
| Cleanup sheet: Later (not in mockup) | Sheet footer | Closes the sheet. | If ignored, unticked versions delete 7 days after the sheet first appeared; the footer shows the delete date. |

**Data shown:** (not in mockup) model\_version (label, is\_snapshot, sent\_to, sent\_at, number, created\_by, parent, preview image), permit\_revision (rev\_no, issued\_at, delta\_object\_ids, description), approvals that lock a version (selection approval, CO approval), edit lock holder, cleanup due date.

**States:** (not in mockup) pre-permit; issued (Rev 0 frozen); working copy after a send; locked by client approval; cleanup due (sheet shown, countdown); offline changes pending sync; view-only when another user holds the lock.

**Validation & warnings:** (not in mockup) undo is session-only, older changes via history (Round 11); a version number is assigned only on send; changed objects clouded with delta tag; approved selection set locks its version; a deleted working version cannot be restored.

**Events emitted:** revision.created; plan\_set.issued; version.sent (new); version.snapshot\_named (new); version.reverted (new); cleanup.due; cleanup.deleted.

**Decisions:**

1. Auto-delete applies only to unsent working versions at 30 days, through the cleanup sheet, with a 7-day grace if ignored; sent versions and named snapshots are kept forever (Round 24 item 4).
2. Entry is the Versions tab in the Plan left panel (one name everywhere) and a click on the header version text. Needs a mockup before build. (Claude)
3. Keeping or deleting in the cleanup sheet needs Edit model. (Claude)
4. Opening an old version shows it read-only on the canvas with its own sheets; no visual diff in v1 (auto-diff stays v2). (Claude)

### Field measurements review (not in mockup)

**Purpose:** Office reviews field-verified measurements sent by the Foreman and approves or rejects each before it changes the model (Round 24 item 29). (not in mockup)

**Entry points:** Notification when a measurement arrives (in-app and email with Copy link); "N to review" pill; Field measurements item in the left panel on the Plan view. (not in mockup)

**Permissions:** View the list: View projects. Approve or reject: Approve field measurements, plus edit lock (approving changes the model). Controls the user lacks are hidden. (not in mockup)

**Layout:** Left panel list of pending measurements; canvas shows the plan with the measured object highlighted and both values dimensioned; inspector with detail, photo and actions. (not in mockup; needs a mockup before build)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Measurement row (not in mockup) | Left panel | Selects it; plan zooms to the object. Shows room, object, field value, model value, difference, Foreman, time. | Within tolerance: green; outside: amber. |
| Filter: Pending / Approved / Rejected (not in mockup) | Left panel top | Filters the list. | Default Pending. (Claude) |
| Photo (not in mockup) | Inspector | Opens the attached photo full size. |  |
| Approve (not in mockup) | Inspector (primary) | Updates the model with the field value; then lists every conflict the change creates (Round 12) for the user to resolve. | Edit lock. |
| Reject with note (not in mockup) | Inspector | Keeps the model value; note goes back to the Foreman's field pack. | Note required. (Claude) |
| Open in plan (not in mockup) | Inspector | Opens the object in the plan editor. |  |

**Data shown:** (not in mockup) measurement value as sent, model value, difference, object and room, Foreman, time sent, photo, note, the version the phone was viewing when it was taken.

**States:** (not in mockup) empty ("No measurements to review"); pending; approved; rejected; stale (taken against an older revision, flagged as a conflict on reconnect, Round 24 item 31).

**Validation & warnings:** (not in mockup) one tolerance setting (under Defaults) covers field measurements and scan-vs-typed conflicts (Round 24 item 30); stale measurements show a warning and still allow Approve or Reject; field conflicts (Flag conflict) are a separate list, not measurements (Round 24 item 28).

**Events emitted:** field.measurement\_submitted; field.measurement\_approved; field.measurement\_rejected.

**Decisions:**

1. One row per measurement; approving several at once is not offered, so each model change is checked for conflicts on its own. (Claude)
2. Rejected measurements notify the Foreman with the note. (Claude)
3. Needs a mockup before build. (Claude)

### Field tasks (not in mockup)

**Purpose:** Office drafts the crew task list from the model with AI, using the company trade-sequence template per room, edits it, and issues the field pack to the crew (Round 14). (not in mockup)

**Entry points:** Tasks tab in the Plan left panel (beside Layers, Rooms, Versions); "Issue field pack" in the header Share menu; the review pill when a published task was edited on a phone. (not in mockup)

**Permissions:** View: View projects. Draft, edit, reorder, delete, publish tasks and Issue field pack: Edit field tasks. No edit lock needed; tasks are not model edits (Round 24 #16). Controls the user lacks are hidden.

**Layout:** Left panel: rooms, each with its phases from the template (demo → rough-in → inspection → drywall → finish). Canvas: plan with the selected task's objects highlighted. Inspector: task text in English and Spanish (with translation status), linked objects, photos, Publish state. Footer: Issue field pack. (not in mockup; needs a mockup before build)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Draft tasks with AI | Left panel header | Builds draft tasks per room and phase from the model's Demo and New objects and the room's template (15h). Shown as drafts for review. | Never published without review (AI never applies silently). Needs a connection. |
| Task row | Left panel | Selects the task; canvas highlights its linked objects. | Draft rows grey; published rows normal; done rows checked with user and time. |
| Add task / Delete / drag to reorder | Left panel | Manual edits within a phase. | Edit field tasks. |
| Task text (EN) | Inspector | Editable English text. Spanish is drafted and enters the translation queue (16). | Spanish users always see Spanish (Round 24 #40). |
| Linked objects | Inspector | Pick objects on the canvas to tie to the task. | Optional. |
| Publish selected / Publish all | Inspector footer | Marks drafts as published tasks. | Published tasks show in the field pack after the next issue. |
| Issue field pack | Footer (primary) | Freezes the current sheets, published tasks and finishes into a field\_pack\_issue tied to the current version; notifies the assigned crew "New field pack issued" (in-app and email with Copy link). | Needs at least one published task or a sent version. Offline: disabled with a "Needs connection" note. |

**Data shown:** field\_task (room, phase, text\_en, text\_es, status, photos, done\_by, linked objects), template per room type, last field\_pack\_issue (date, by, version).

**States:** empty ("Draft tasks with AI or add a task"); drafting (progress); drafts pending review; published; issued (date and version on the header badge); offline (read-only); permission-denied (hidden controls).

**Validation & warnings:** a task needs text; tasks tied to deleted objects are flagged for review; issuing with unpublished drafts asks to confirm.

**Events emitted:** field\_task.completed (from phones); field\_pack.issued (new).

**Decisions:**

1. Field tasks live in a Tasks tab in the Plan left panel and are issued with an "Issue field pack" action; the phone pack updates only on issue, so crews never see half-edited lists (Claude).
2. AI drafts per room and phase from the template in 15h and the model's Demo and New objects; the office reviews before publishing (Round 14).
3. Editing and issuing need Edit field tasks and no edit lock (Round 24 #16, Claude).
4. Issue notifies only users assigned to the project (membership scope) (Claude).
5. Needs a mockup before build (Claude).

### 15 · Settings: Users + permissions

**Purpose:** Company-level administration. This section manages who can use EZ Draft, what each person may do (per-user permission checklist), each person's role, and each person's language. The same settings shell hosts the other company settings sections (15a to 15h) and the Translations queue (screen 16).

**Entry points:**

- Avatar menu → Company settings, or the Settings link on Projects (S01).
- "Change in settings" / "Change in company settings" links on other screens (S02 tolerance, S04b default overhangs) open 15d Defaults.
- Direct URL `ezdraft.ezcontractorbinder.com/settings/users`.
- Settings nav badge "Translations" opens screen 16.

**Permissions:**

- View and edit any company settings section: Manage users and settings.
- Translations section: Approve translations (see 16).
- Users without the permission do not see the Company settings link or nav items (controls a user lacks are hidden, Round 24).
- Every user can open My profile from the avatar menu to change their own language and iPad input mode.

**Layout:** Not the standard editor shell. Settings shell:

- Header card (60px): "ezdraft" wordmark, divider, "Settings" title, "Projects" back link, spacer, company name, current-user avatar.
- Left nav card 248px, label "Company settings": Company, Users + permissions (count badge), Title block, Sheet presets, Defaults (badge "ft-in"), Catalog (item count badge), Render models, Code edition, Libraries, Translations (unreviewed count badge, amber). No seats meter and no Billing item in v1.
- Main card: page title, subtitle, search, Invite user button; users table; Roles row (presets and custom roles); costs info note.
- Right inspector card 336px: selected user detail with role, language, grouped permission switches, footer with Save.
- Status bar: Company, Users, Languages, Sync, current location "Settings · Users".

**Permission list (Round 10 + Round 24, 28 switches, grouped in the inspector):**

- Projects: View projects; Create projects; Edit model; Delete projects; Upload references; Add markup; Run code check.
- Renders: Run fast renders; Run standard renders; Run photoreal renders; Approve renders; Mark client-ready.
- Money: See company costs; See sell prices; Edit catalog; Create change orders; Flag to supplier.
- Issue + send: Issue permit sets; Issue revisions; Send to client; Export (PDF / DXF / GLB / CSV).
- Field: Edit field tasks; Check off tasks; Photo notes; Flag conflict; Send field measurement; Approve field measurements.
- Admin: Approve translations; Manage users and settings.

**Preset defaults (Round 24):**

| Preset | Ticked |
| --- | --- |
| Owner | All 28. |
| Designer | All except Delete projects, Issue permit sets, Issue revisions, Manage users and settings (24). |
| Foreman | View projects (own jobs), Run fast renders, Export, Approve translations, Add markup, Edit field tasks, Check off tasks, Photo notes, Flag conflict, Send field measurement (10). |
| Crew | View projects (own jobs), Check off tasks, Photo notes, Flag conflict (4). |
| Custom roles | Unlimited; created from any user's current switches. |

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Projects back link | Header | Returns to Projects list (S01). | If the inspector has unsaved edits, prompt Save / Discard / Cancel. |
| Avatar | Header right | Menu: My profile (language, iPad input mode), Company settings (only with Manage users and settings), Sign out. |  |
| Nav: Company | Left nav | Opens 15a (includes EZ Binder connection, user sync, customer sync). | Same unsaved-edits prompt on leave. |
| Nav: Users + permissions | Left nav | Opens this section. Badge = active user count. | Highlighted when current (`aria-current="page"`). |
| Nav: Title block | Left nav | Opens 15b. |  |
| Nav: Sheet presets | Left nav | Opens 15c (submittal profiles). |  |
| Nav: Defaults | Left nav | Opens 15d (all thresholds, tolerances, limits, waste factors and keyboard shortcuts). Badge "ft-in". | Imperial only in v1. |
| Nav: Catalog | Left nav | Opens 15e. Badge = catalog item count. |  |
| Nav: Render models | Left nav | Opens 15f (tier models, render allowance in dollars with auto-refill). |  |
| Nav: Code edition | Left nav | Opens 15g. |  |
| Nav: Libraries | Left nav | Opens 15h (notes, symbols, details, hatches, parts, field task templates). |  |
| Nav: Translations | Left nav | Opens screen 16. Badge = unreviewed count, amber when > 0. | Shown to users with Approve translations; for them it is the only nav item if they lack Manage users and settings. |
| Search users | Main header | Filters rows by name or email as typed. | Case-insensitive; empty result shows "No users match". |
| Invite user | Main header, primary | Opens invite dialog: email (required), name, role, language, project access (All projects / Listed projects). Send emails a magic-link invite; dialog then shows the invite link with "Copy link". Adds an "Invite pending" row. | No user limit in v1. Clients are not invited here; they are customers (15a) and receive share links (S18). |
| User row | Users table | Click selects the user and loads the inspector. Selected row: tint + 3px left accent bar, `aria-selected="true"`. | One selection at a time. |
| Row: Name cell | Users table | Avatar initials, name, email. | Every user has an email (Round 24). |
| Row: Role pill | Users table | Role name; colored per preset (Owner black, Designer blue, Foreman green, Crew gray, custom roles outlined). "Modified" suffix when switches differ from the role. | Pending invite shows dashed pill. |
| Row: Language tag | Users table | EN or ES. |  |
| Row: Permissions count | Users table | "n / 28" granted. |  |
| Row: Last active | Users table | Relative time ("Now", "12 min ago", "Yesterday"). | Pending invite row shows "Resend" and "Copy link". |
| Row: Resend (pending invite) | Users table | Re-sends the invite email; updates "sent \<date>". | Pending rows only. |
| Row: Copy link (pending invite) | Users table | Copies the invite link to the clipboard; toast "Link copied". | Pending rows only (Round 24: every emailed item has Copy link). |
| Row: More (…) menu | Users table | Edit, Resend invite, Copy invite link, Cancel invite (pending), Deactivate, Remove. | The last user holding Manage users and settings cannot be deactivated, removed or have that switch turned off. |
| Role card (presets + custom) | Roles row | Shows name and a one-line summary; click opens the role's switch list for editing (custom roles) or viewing (presets). | Presets: Owner "Everything"; Designer "Draw, render, export; no issuing, no deleting, no admin"; Foreman "Field pack, tasks, flags, measurements, markup, fast renders"; Crew "Field pack, tasks, photos, flags". Preset definitions are fixed; custom roles are editable and deletable when no user holds them. |
| New role | Roles row end | Creates a custom role from scratch or from a preset; name required. | Unlimited (Round 24). |
| Inspector close (X) | Inspector header | Clears selection. | Unsaved-edits prompt. |
| Role select | Inspector | Options: Owner, Designer, Foreman, Crew, then custom roles. Choosing a role re-ticks all switches to that role. When switches differ, the value reads "\<Role> (modified)". | Presets only pre-tick boxes; any box can change per person. |
| Save as new role | Inspector, under Role select | Saves the current switches as a custom role and assigns it to this user. | Shown only when the user is "(modified)". |
| Language toggle (English / Español) | Inspector | Sets the user's language. Helper text: "Field pack, tasks and notes open in Spanish for this user. Permit sheets stay in English." | Spanish users always see Spanish, reviewed or not (Round 24). |
| Permission switch (x29) | Inspector, grouped list | Toggles one permission. Names and groups as in the Permission list above. | Subtext on See company costs: "What the company pays: catalog cost, option cost lines, CO cost, render cost". Subtext on See sell prices: "What the client is charged: sell price, markup, allowances, CO total". Subtext on Create change orders: "Draft and send to EZ Binder". |
| Group header count | Inspector | "n of m" per group. |  |
| Permissions counter | Inspector, above list | "n of 28". Updates live. |  |
| Unsaved indicator | Inspector footer | Amber dot + "Unsaved changes". | Only when edits are pending. Preset drift is shown by "(modified)" in the Role select, not here (Claude). |
| Reset to role | Inspector footer | Re-ticks switches to the selected role's definition. | Does not save until Save. |
| Save | Inspector footer, primary | Saves role, language and switches; writes user\_permission and event\_log. | Disabled with no pending edits. Applies on the user's next request. |
| Keyboard: Up / Down | Users table | Moves selection. | Bindings editable in 15d. |
| Keyboard: Ctrl/Cmd+S | Inspector | Save. | Bindings editable in 15d. |

**Data shown:**

- tenant: name, user count.
- user / membership: name, email, avatar initials, role, modified flag, since date, last active, invite status and sent date.
- user\_permission: 28 booleans; user: language (EN/ES), iPad input mode; membership: project access.
- role: presets (fixed) and custom roles (name, switches).
- EZ Binder user sync status and last sync time ("EZ Binder · 2 min ago") when connected (15a).
- Status bar: Users "n active · n invited"; Languages "EN n · ES n".
- Info note: "Company costs (catalog cost, option cost lines, CO cost, render cost) are hidden everywhere for users without See company costs, and sell prices, markup and totals for users without See sell prices, including exports and the field pack."

**States:**

- Empty: only the owner exists; one row plus an "Invite your team" prompt.
- Loading: table skeleton rows; inspector skeleton.
- Error: save fails; inspector keeps edits, shows inline error and Retry.
- No selection: inspector shows "Select a user".
- Pending invite selected: inspector shows invite details, Resend, Copy link and Cancel invite; switches editable before acceptance.
- EZ Binder not connected: Sync item hidden from the status bar.
- EZ Binder sync failure: Sync value shows an error with last success time.
- Offline: settings are read-only; Save disabled with "Offline" note.
- No permission: the section is not reachable (link hidden); a typed URL redirects to Projects with "You don't have access to company settings."

**Validation & warnings:**

- Invite email required, valid, and not already a member of the tenant.
- At least one user must keep Manage users and settings.
- Custom role names are unique within the tenant.
- Unsaved-edits prompt on leaving the section or changing selection.
- Turning off See company costs or See sell prices hides those numbers in every view, export and field pack for that user.

**Events emitted:**

- user.invited (new), user.invite\_resent (new), user.joined (new), user.deactivated (new), user.removed (new)
- user\_permission.updated (new): user id, changed permissions, role, actor.
- role.created (new), role.updated (new), role.deleted (new)
- user.language\_changed (new)
- All of the above also write event\_log (actor, action, object, at).

**Decisions:**

1. Permission list is the 28 switches above: Round 10 plus the Round 24 additions; mockup names are replaced by plan names (Round 24).
2. Approve renders and Mark client-ready are separate permissions; Edit field tasks is included (Round 24).
3. Presets are Owner, Designer, Foreman, Crew; Client is not a preset (clients are customers with share links); unlimited custom roles (Round 24).
4. Preset defaults match the permission table in section 9 (Permissions and settings), which is authoritative; Foreman and Crew see their own jobs only.
5. Field actions have their own permissions: Check off tasks, Photo notes, Flag conflict, Send field measurement (Round 24).
6. Preset definitions are fixed; tenants add custom roles from the Roles row or with "Save as new role" (Claude).
7. "(modified)" in the Role select shows preset drift; the footer indicator shows only unsaved edits (Claude).
8. No user limit and no seats meter in v1; Billing is not in the v1 nav (Round 24 for no limit; Billing hidden (Claude)).
9. Every user must have an email; phone-only users are not allowed (Round 24).
10. Users are invited in EZ Draft; when EZ Binder is connected, optional user sync is set in 15a; the apps stay separate (Round 24).
11. Every user can change their own language and iPad input mode in My profile; admins can change it here too (Claude).
12. Avatar menu: My profile, Company settings (permission-gated), Sign out (Claude).
13. Field task templates live in 15h Libraries; EZ Binder connection lives in 15a Company; notifications have no settings section in v1 and always go in-app and by email (Claude). Project access: the inspector has a Project access control (All projects, or Listed projects with a project picker) and the invite dialog has the same field; Foreman and Crew default to Listed projects; it writes membership.scope (Claude; ticket EZD-129).

### 15a · Settings: Company

**Purpose:** Company identity used by the title block, client pages, selections PDF and email, plus the optional EZ Binder connection (user sync and customer sync).

**Entry points:** Settings nav "Company".

**Permissions:** Manage users and settings (view and edit). Section hidden without it.

**Layout:** Settings shell (see 15). Main card: Identity, Contact, EZ Binder connection, Customers. No inspector.

**Controls:** (Section not in mockup; the mockup shows only the nav item.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Company name input | Identity | Edits tenant.name. Used in header, client pages ("WORTH PROPERTIES"), status bar. | Required. |
| Logo upload / replace / remove | Identity | Uploads company logo (title block, client view, selections PDF). | PNG, JPG or SVG, up to 5 MB (Claude); preview shown. |
| License number input | Identity | tenant.license\_no (e.g. CGC license). | Shown in title block when "Company logo, license and contact" is on (15b). |
| Contact: phone, email, website, address | Contact | Company contact block. | Same on/off rule as license. |
| EZ Binder: Connect / Disconnect | EZ Binder connection | Connects the tenant to its EZ Binder company (shared sign-on, webhooks). Shows status and last sync. | Apps stay separate; EZ Draft works without the connection (Round 24). |
| Sync users (switch) | EZ Binder connection | On: EZ Binder users can be imported and matched to EZ Draft users by email; deactivation in either app is mirrored. | Optional; off by default (Claude). Shown only when connected. |
| Sync customers (switch) | EZ Binder connection | On: customer list syncs both ways with EZ Binder (name, email, phone, address). | Round 24. Shown only when connected. |
| Sync now | EZ Binder connection | Runs user and customer sync immediately. | Shown only when connected. |
| Customers list | Customers | Lists customers (name, email, projects). Add, edit, archive. | Customer email is what a client enters to verify before signing (S18). Hidden fields: none. |
| Save | Footer | Saves company fields and switches. | Disabled with no edits. |

**Data shown:** tenant name, logo, license\_no, contact fields, EZ Binder link status and last sync, customer records.

**States:** loading, error on save, offline read-only, EZ Binder not connected (sync switches hidden), sync error (message with last success time).

**Validation & warnings:**

- Company name required.
- Logo: PNG, JPG or SVG, at most 5 MB.
- Customer email required and unique within the tenant (needed for client verification).
- Sync conflict (same customer edited in both apps since last sync): latest edit wins and the change is logged (Claude).

**Events emitted:** tenant.updated (new); ezbinder.connected (new); ezbinder.disconnected (new); customer.created (new); customer.updated (new); customer.synced (new).

**Decisions:**

1. Field list is as above (identity, contact, EZ Binder connection, customers); logo limit PNG, JPG or SVG up to 5 MB (Claude).
2. Logo and license changes apply only to future sends; sent versions are permanent and never change (Round 24).

### 15b · Settings: Title block

**Purpose:** Edit the tenant title block used on every sheet.

**Entry points:** Settings nav "Title block". Sheets screen (S13) "Title block: Company standard" links here.

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: title block field toggles; live preview at 24x36 and 11x17. (Not in mockup.)

**Controls:** (Section not in mockup; content from plan Rounds 4 and 5, Feature spec 4 and Round 24.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Show company logo, license and contact (switch) | Main | Toggles the company block on the title block. | Plan Round 4: on/off option. |
| Project fields (display) | Main | Auto-filled fields: project address, parcel number, owner, code edition, scope of work, sheet number, sheet title, date. | Filled per project from project and property\_record. |
| Revision block (display) | Main | Columns: number, date, description. Pre-permit sends show "Version N"; permit issues show "Rev N". | Always on (Round 24 numbering). |
| Seal box (display) | Main | Blank seal/signature box for a design professional or electrical contractor. | Always present on permit sheets (Round 24: two blank areas). |
| Department approval stamp area (display) | Main | Blank area reserved on each sheet for the department's stamp. | Always present (Round 24). |
| Preview size toggle (24x36 / 11x17) | Main | Switches preview size. |  |
| Preview | Main | Renders the title block with sample project values. | Updates on change. |
| Save | Main footer | Saves tenant.title\_block. | Disabled with no edits. |

**Data shown:** tenant.title\_block config, logo, license, contact; sample project values in preview.

**States:** loading, error, offline read-only.

**Validation & warnings:** A permit set cannot issue until the title block is complete (plan Round 12). Missing tenant-level fields (company name, license) are listed here as warnings.

**Events emitted:** tenant.title\_block\_updated (new).

**Decisions:**

1. Layout is fixed; the user controls the company-block toggle only. All other fields fill from company and project data (Claude).
2. "Title block complete" = company name, license number, project address, parcel number, owner, scope of work and code edition all filled (Claude).
3. Seal box and department stamp area are always on every permit sheet; the submittal profile only records who signs (Round 24, Claude).

### 15c · Settings: Sheet presets (submittal profiles)

**Purpose:** Saved presets per building department for anything that differs between departments, so a new rule is a setting, not code.

**Entry points:** Settings nav "Sheet presets". Project settings "Submittal profile" select links here.

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: list of profiles (one per department). Inspector: selected profile fields. (Not in mockup.)

**Controls:** (Section not in mockup; content from plan Rounds 4 and 5 and Round 24.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Profile list row | Main | Selects profile (e.g. Palm Beach County, PBC municipality, Broward). | One profile marked Default. |
| Set as default (row menu) | Main | Makes the profile the company default for new projects. |  |
| New profile | Main header | Creates a profile copied from the default. | Name required, unique. |
| Duplicate / Delete (row menu) | Main | Copies or removes a profile. | A profile used by a sent set cannot be deleted; it can be archived. |
| Department name input | Inspector | Profile name. | Required. |
| Submittal type select | Inspector | Electronic, Paper. | Plan Round 4. |
| Permit sheet size | Inspector | 24x36 (ARCH D) for stamped permit sets. | Round 25. 11x17 is offered only for client and field sets, never on a permit profile (Claude). |
| File split select | Inspector | Combined set (default) / per discipline or consultant / one PDF per sheet. | Round 25; section 7. |
| Max file size (MB) | Inspector | Per-file size limit; a file over it is split further, or issue warns when it cannot be. | Empty = no limit. PBC 10 MB. |
| File naming pattern input | Inspector | Tokens: {address}, {description}, {rev}, {date}, {sheet}, {discipline}. Default "{address} {description}" e.g. "336 Golfview Rd buildingplans" with the version kept in the name. | Characters / ? < > \\ : \* \| " , # and double or trailing spaces are stripped; length limit per profile (PBC 80, West Palm Beach ALL CAPS 30). |
| Revision naming select | Inspector | Version in file name (default) / Same name as original (revision ID only in the title and revision blocks). | Round 25. |
| Flatten on export (switch) | Inspector | Single layer, no annotations; runs before signing. | Off by default; on for Boca Raton, Fort Lauderdale, Coral Springs. |
| Stamp box size and position | Inspector | Size and position of the reserved department stamp area. | Default 3" x 3", bottom right above the title block (Claude). Fort Lauderdale 6" x 2" top left. |
| Bookmarks / TOC sheet | Inspector | One bookmark per sheet in combined files (on); optional TOC sheet. | Fort Lauderdale needs the TOC. |
| Resubmittal mode select | Inspector | Changed sheets only / Full discipline set plus narrative (errata) PDF; transmittal on or off. | Section 7. |
| Minimum scale check | Inspector | Smallest plan scale the department accepts (e.g. 3/16" = 1'-0"). | The issue checklist warns when a viewport is below it. |
| Export unsigned (switch) | Inspector | Leaves the seal box empty so the professional signs last with a third-party certificate. | On by default when the signer is not None (Claude). |
| Output (display) | Inspector | "Vector PDF, not password-locked; markup and stamping allowed." | Round 24; section 7. |
| Required notes (multi-select from notes library) | Inspector | Notes added to sets for this department. | Links to 15h. |
| Electrical signature requirement select | Inspector | None, Electrical contractor, Architect. | Plan Round 5. Departments accept the GC load calc; the optional EC signature block stays (Round 24). |
| Save | Inspector footer | Saves submittal\_profile. | Disabled with no edits. |

**Data shown:** submittal\_profile: every field in the controls table above (department, submittal type, permit size, file split, max file size, naming pattern, revision naming, flatten, stamp box, bookmarks/TOC, resubmittal mode, minimum scale, export unsigned, signature requirement, required notes).

**States:** empty (only the default profile), loading, error, offline read-only.

**Validation & warnings:** File name pattern must produce a valid file name and must include {address}; warning if it omits {rev} while the profile is not set to same-name-as-original.

**Events emitted:** submittal\_profile.created (new), submittal\_profile.updated (new), submittal\_profile.deleted (new).

**Decisions:**

1. "Sheet presets" holds submittal profiles only; viewport and scale presets are not part of v1 (Claude).
2. Each project picks a profile in project settings (defaults to the company default); it can be changed at issue on the Sheets screen (Claude).
3. Naming tokens are {address}, {description}, {rev}, {date}, {sheet}, {discipline} (Claude). Permit profiles are fixed at 24x36; 11x17 is for client and field sets only (Round 25, Claude).

### 15d · Settings: Defaults

**Purpose:** Every threshold, tolerance, limit, waste factor and keyboard shortcut the app uses, entered by the owner as company settings (Round 24). Drawing, takeoff, field, electrical and history tools read these values.

**Entry points:** Settings nav "Defaults" (badge "ft-in"). "Change in settings" beside the tolerance on Import review (S02). "Change in company settings" under Default overhangs on Countertops (S04b). "Set in Defaults" links shown wherever a needed value is still empty.

**Permissions:** Manage users and settings. Section hidden without it. Per-project overrides are made on the project, not here.

**Layout:** Settings shell. Main card: groups Units, Increments, Tolerances, Countertops, Ceilings, Electrical, Baths, 3D, Details, Waste factors, Catalog, History + collaboration, Client, Integrations, Keyboard shortcuts. Each group is a form; Keyboard shortcuts is a table. (Not in mockup.)

**Controls:** (Section not in mockup; values cited from plan and other mockups. Values shown are the mockup or plan figures; the owner confirms or changes each.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Units (display) | Units | Imperial ft-in; fractions to 1/16". | Fixed in v1. |
| Dimension display: plans | Units | 1/2". | Plan Round 13. |
| Dimension display: details | Units | 1/16". | Plan Round 13. |
| iPad input mode (company default) | Units | Pencil-only or finger drawing. | Plan Round 3. Each user can override in My profile (Claude). |
| Cabinet auto-fill increment | Increments | 3". | Plan Round 21. |
| Countertop increment | Increments | 1/2". | S04b status bar; a setting (Claude). |
| Measurement tolerance | Tolerances | One value used for scan-vs-typed conflicts (S02 shows 1/2"), field measurements (S17 shows 1/8") and the 17b closure check. | Round 24: one tolerance setting. Owner sets the single value. |
| High-confidence cutoff (%) | Tolerances | Import items below it go to "To check" (S02). | Owner enters (Round 24). |
| Cabinet fit tolerance | Tolerances | Run total vs wall length after fillers and scribe (S04 fit chip). | Owner enters (Round 24). |
| Reference change tolerance | Tolerances | Geometry moved more than this counts as a change in the reference diff (S11). | Owner enters. |
| Leader snap tolerance | Tolerances | Leader end farther than this from linework triggers "Leader points to empty space" (S10). | Owner enters. |
| Field measure sanity range | Tolerances | Values outside it ask to confirm on 17b. | Default 0 to 200 ft (Claude). |
| Default overhang: Standard | Countertops | 1 1/2". | Plan Round 23; S04b. |
| Default overhang: Seating, counter height | Countertops | 12". | S04b. |
| Default overhang: Seating, bar | Countertops | 10". | S04b. |
| Default overhang: Against wall | Countertops | 0 + splash. | S04b. |
| Seating overhang support limit | Countertops | Overhang beyond this adds support brackets to a detail and shows a notice. | Owner enters (Round 24). Empty = support check off, with a "Set in Defaults" notice on S04b. |
| ACT minimum border | Ceilings | Smallest edge tile; balancing keeps borders at or above it (S05). | Default half a tile (plan Round 16). |
| Fan blade clearance | Ceilings | Minimum blade clearance to walls and beams (S05). | Owner enters (Round 24). |
| Light-level target per room type | Ceilings | Foot-candle target used by Auto-layout cans (S05). | Owner enters (Claude). |
| Load warning threshold (% of service) | Electrical | Service bar amber at or above it, red above 100% (S06). | Owner enters (Round 24). |
| Voltage-drop warning threshold (%) | Electrical | Electrical check warns when a circuit's estimated drop exceeds it. | Round 24 #37. Owner enters. |
| Device height notes default | Electrical | Off. | Round 24 #36: optional per device, off by default. |
| Bath clearances | Baths | Minimum clearances for toilet, lavatory, tub and shower and minimum shower size used by the bath clearance check. | Round 3. Owner enters. |
| Walk eye height | 3D | 5'-6". | S07 (Claude). |
| Detail scales offered | Details | 3/4", 1", 1 1/2", 3", 6" = 1'-0", full size, NTS. | S10 (Claude). |
| Waste factor per material | Waste factors, table | Row per material (tile, LVP, drywall, paint, trim, countertop) with % input. | Plan Round 7. Owner enters. Editable per project. |
| Pattern adjustment | Waste factors, table | Extra % per pattern: straight, diagonal, herringbone. | Plan Round 7. Owner enters. |
| Recently added window | Catalog | Items added within it show under Recently added (S09). | Default 30 days (Claude). |
| Working version auto-delete | History + collaboration | Unsent working versions auto-delete at 30 days; cleanup sheet first; unticked versions delete after 7 more days. | Round 24 #4. Values editable. |
| Edit lock auto-release | History + collaboration | 5 minutes after a Request edit with no answer. | Round 24 #17; does not pause offline. |
| Share link expiry | Client | 30 days; renewable. | Plan Round 14. |
| Share link reminder lead time | Client | Days before expiry for the share\_link.expiring reminder and the client banner. | Default 7 days (Claude). |
| Webhook retries and backoff | Integrations | Retry count and backoff for outbound webhooks. | Default 5 retries, exponential backoff (Claude). |
| Keyboard shortcuts table | Keyboard shortcuts | One row per command: every rail tool in the section 3 table, Pan, Look up, Walk movement (W/A/S/D and arrows, 3D only), Undo, Redo, Copy, Paste, Mirror, Align, Save, Plan / 3D / Sheets / Render tabs. Click a key cell, press the new key. | Countertop = K (Round 23). Defaults below; all editable (Round 24). |
| Reset to default map | Keyboard shortcuts header | Fills empty rows with the default map: V Select, M Move, W Wall, R Room rectangle, D Door, N Window, C Cabinets, K Countertops, F Fixtures, E Electrical, G Ceiling, P Catalog, L Dimension, T Text, S Sketch, X Detail callout, Q Revision cloud, Shift+R Reference, Shift+M Markup, Shift+S Supplier markup, Shift+L Measure, Shift+C Check, ? Help, H Pan, U Look up, 1 to 4 tabs, Ctrl/Cmd+Z Undo, Ctrl/Cmd+Shift+Z Redo, Ctrl/Cmd+C / V Copy / Paste, Ctrl/Cmd+S Save. | (Claude). Never overwrites a key already set. Keys are checked for collisions within the same view (Walk keys only apply in 3D Walk mode). |
| Reset shortcut (row) | Keyboard shortcuts | Clears that binding. |  |
| Save | Footer | Saves all defaults. | Disabled with no edits. |

**Data shown:** tenant default values listed above; shortcut bindings.

**States:** loading, error, offline read-only, empty value (row shows "Not set" and features that need it show "Set in Defaults").

**Validation & warnings:**

- Length inputs accept 12'6", 12' 6 1/2", 150", 12.5' (plan Round 3).
- Percent inputs 0 to 100.
- Seating support limit must be greater than the Standard overhang.
- A key already bound to another command shows "Already used by \<command>" and is not saved until one is changed.
- Browser-reserved keys (Ctrl/Cmd+W, Ctrl/Cmd+T, Ctrl/Cmd+N) are refused.

**Events emitted:** tenant.defaults\_updated (new).

**Decisions:**

1. One tolerance setting covers field measurements and scan-vs-typed conflicts (Round 24).
2. The seating overhang support limit is entered by the owner; until set, the support check is off and S04b shows "Set in Defaults" (Round 24, Claude).
3. Countertop increment is a setting (Claude).
4. Changed defaults apply to new projects; existing projects keep their values unless changed on the project (Claude).
5. iPad input mode has a company default here and a per-user override in My profile (Claude).
6. Waste factors are entered by the owner per material and pattern; empty values show "Set in Defaults" in takeoff (Round 24, Claude). This page holds every threshold, tolerance and limit other screens name, and the default key map matches the section 3 rail table with no collisions in the same view (Claude).

### 15e · Settings: Catalog

**Purpose:** Company catalog setup: categories, allowance categories, markup, suppliers and appliance rating defaults. The item list itself is the Catalog screen (S09).

**Entry points:** Settings nav "Catalog" (badge = item count).

**Permissions:** Manage users and settings for this section. Edit catalog to add or change items on S09. See sell prices to see markup fields and See company costs to see cost fields; without the permission those rows are hidden.

**Layout:** Settings shell. Main card: "Open catalog" link, then Categories, Allowance categories, Pricing, Suppliers, Appliance rating defaults. (Not in mockup.)

**Controls:** (Section not in mockup.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Open catalog | Main header | Opens the Catalog screen (S09) at tenant scope. | Shown with Edit catalog or View projects. |
| Categories list | Categories | Standard set: tile, cabinet, counter, plumbing fixture, lighting, appliance, hardware, paint, window/door. Add custom category. | Standard categories cannot be removed; custom ones can when unused (Claude). |
| Allowance categories | Allowance categories | Add, rename, remove allowance categories used by items and the selections PDF allowance add-on. | Plan Rounds 7, 14. |
| Default markup % | Pricing | One markup % per category (Claude). Sell price = cost x (1 + markup). | Plan Round 7. Hidden without See sell prices. |
| Suppliers list | Suppliers | Supplier name, contact, default lead time. Add, edit, archive. | Plan Round 7. |
| Appliance rating defaults | Appliance rating defaults | Fallback ratings (volts, amps or VA) per appliance type when a catalog item lacks specs. | Plan Round 15. Owner enters (Round 24). |
| Save | Footer | Saves catalog settings. | Disabled with no edits. |

**Data shown:** catalog\_item count, categories, allowance categories, suppliers, markup, appliance rating defaults.

**States:** loading, error, offline read-only. Cost rows hidden without See company costs; markup rows hidden without See sell prices.

**Validation & warnings:** Markup must be a number of 0 or more. Category and supplier names unique.

**Events emitted:** catalog.settings\_updated (new).

**Decisions:**

1. Settings → Catalog is a configuration page; the item list is S09, linked from here (Claude).
2. Standard categories are fixed; tenants may add custom categories (Claude).
3. Appliance rating defaults live in this section and are entered by the owner (Round 24, Claude). The edge profile library (eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom: name and section drawing) is managed here; the price per LF is entered per top in 04b Edit offered edges (Claude). Default markup is one % per category under Pricing; 09 reads it (Claude).

### 15f · Settings: Render models

**Purpose:** Choose which AI model serves each render tier, set the company render allowance in dollars, and connect the local GPU render worker.

**Entry points:** Settings nav "Render models". Owner notification "Render allowance refilled" links here.

**Permissions:** Manage users and settings. Dollar figures also need See company costs; without it they are hidden. Running renders is gated per tier by Run fast renders, Run standard renders and Run photoreal renders (on the Render screens).

**Layout:** Settings shell. Main card: Tiers (one row each), Render allowance, Local render worker.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tier row: Fast | Tiers | Model select; approx. cost per image in dollars. | Plan examples: Reve Edit Fast, Gemini 3.1 Flash Lite Image, GPT Image 2 low; about $0.01 to $0.04. Target under $0.25. |
| Tier row: Standard | Tiers | Model select; cost. | Gemini 3.1 Flash Image 1K, Flux Kontext pro; about $0.04 to $0.07. |
| Tier row: Photoreal | Tiers | Model select; cost. | Gemini 3.1 Flash Image 4K, Flux Kontext max, GPT Image 2 high; about $0.08 to $0.15+. Photoreal is v1 (Round 24). |
| Allowance amount ($) | Render allowance | Company render budget in dollars. | Round 24 #18. |
| Used this period ($) | Render allowance | Display: spent / allowance, progress bar. |  |
| Auto-refill amount ($) | Render allowance | Amount added when the allowance is used up. | No hard limit: renders never stop; the allowance refills and the owner is notified (Round 24). |
| Refill notification (display) | Render allowance | "Owner is notified by in-app and email on each refill." |  |
| Local worker status | Local render worker | Connected / offline, last job time. | Local GPU worker preferred; cloud API fallback when offline (Round 24 #50). |
| Use local worker first (switch) | Local render worker | On: jobs go to the worker first. | Default on (Round 24). |
| Connect worker | Local render worker | Shows a one-time worker token with Copy. |  |
| Save | Footer | Saves tiers and allowance. | Disabled with no edits. |

**Data shown:** tier → model mapping, cost per image, allowance, spend, refill amount, worker status. Render costs always in dollars.

**States:** loading, error, offline read-only, worker offline (fallback note), allowance refilled (banner with date).

**Validation & warnings:** Each tier must have a model selected. Allowance and refill amounts are positive dollar values.

**Events emitted:** render.model\_config\_updated (new); render\_allowance.refilled: amount, date, notifies owner.

**Decisions:**

1. Tiers are Fast, Standard, Photoreal; costs show in dollars, not credits (Round 24).
2. Company allowance in dollars, no hard limit, auto-refills when used up and notifies the owner; allowance and refill amount set here (Round 24).
3. Run standard renders gates the Standard tier (Round 24).
4. Waiting on: the render test (3 past jobs through 3 to 4 models) before default models per tier are chosen.

### 15g · Settings: Code edition

**Purpose:** Set the default code edition for new projects; each project also has its own code edition setting.

**Entry points:** Settings nav "Code edition".

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: default edition select, available rule sets, electrical options.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Default code edition select | Main | Sets tenant.code\_edition for new projects. v1 option: FBC 9th ed. (2026) with NEC 2023. | Plan: FBC 9th Edition effective Dec 31, 2026, adopts 2023 NEC. |
| Available editions list | Main | Display of supported rule sets. | v1: one. |
| Optional load-calc method (switch, default for new projects) | Main | Allows the NEC 220 optional method for existing dwellings alongside the standard method. | Round 24 #38: a toggle; per project on Electrical. |
| Save | Footer | Saves defaults. | Existing projects keep their own edition. |

**Data shown:** tenant.code\_edition and electrical defaults.

**States:** loading, error, offline read-only.

**Validation & warnings:** Note on page: "Changing the default does not change existing projects."

**Events emitted:** tenant.code\_edition\_updated (new).

**Decisions:**

1. v1 ships FBC 9th ed. / NEC 2023 only; other editions are added as rule sets later (Claude).
2. The per-project edition is edited in project settings and shown in the title block and on the Electrical screen (Claude).

### 15h · Settings: Libraries

**Purpose:** Company libraries reused across projects: notes, symbols and abbreviations, details, hatches, reusable parts, and field task templates.

**Entry points:** Settings nav "Libraries". "Save to company library" on the Catalog and Detail screens adds items here.

**Permissions:** Manage users and settings to edit libraries. Edit field tasks may also edit field task templates. Without either, the section is hidden. Library content placed in projects is visible with View projects.

**Layout:** Settings shell. Main card with tabs: Notes, Symbols + abbreviations, Details, Hatches, Parts, Saved groups, Field task templates. Inspector for the selected item. Saved groups made in the Plan editor (Save as group) are listed here to rename or delete (Claude).

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Notes | Main | General notes and code notes, grouped by project type (kitchen, bath, whole-home). | Plan Feature spec 4. |
| Add note / Edit / Delete | Notes tab | Manage note text. | Permit sheets are English only; English notes also enter the translation queue (16) for field pack use. |
| Tab: Symbols + abbreviations | Main | Full symbol and abbreviation library (walls by status, doors, windows, plumbing, electrical, low voltage, HVAC, ceiling items, markers, revision delta, keynotes, material hatches). | Read-only system set; abbreviations may be added (Claude). |
| Tab: Details | Main | Company detail library; starter set (shower pan / curb / niche, tile transitions and thresholds, cabinet and countertop sections, wall types). | Plan Rounds 4, 19. Open launches the Detail editor (S10). |
| Detail row: Open / Duplicate / Delete | Details tab |  | Editing a library detail does not change copies already placed in projects. |
| Tab: Hatches | Main | Standard material set plus custom hatches. | Standard set read-only; custom editable. |
| Tab: Parts | Main | Reusable parts (studs, blocking, anchors, threaded rod, mesh sleeve, LED channel, brackets, fasteners) with name and size. | Plan Round 19. Editable. |
| Tab: Field task templates | Main | One template per room type (kitchen, bath, laundry, other) built from a default trade sequence: demo → rough-in → inspection → drywall → finish. Add, rename, delete, reorder phases. | Plan Round 14. |
| Drag handle on phase row | Field task templates | Reorders phases. |  |
| Search | Main header | Filters the current tab. |  |

**Data shown:** notes library, symbol and abbreviation library, detail records (scale/NTS, library link), hatches, parts, task templates.

**States:** empty per tab, loading, error, offline read-only.

**Validation & warnings:** Deleting a library item used in projects shows how many projects hold copies; copies stay unchanged.

**Events emitted:** library.item\_created (new), library.item\_updated (new), library.item\_deleted (new).

**Decisions:**

1. Tabs as listed. Symbols and standard hatches are a read-only system set; notes, details, custom hatches, parts, abbreviations and task templates are editable (Claude).
2. Field task templates are per room type, each starting from one default trade sequence (Claude).

### 16 · Translation review

**Purpose:** Review queue for AI-drafted Spanish translations of sheet notes, keynotes and field tasks across all projects. Spanish is for in-app viewing and the field pack; permit sheets are English only. Approving or editing a phrase updates it everywhere it is used, except in sets already sent.

**Entry points:**

- Settings nav "Translations" (badge = unreviewed count).
- Sheets screen (S13) issue checklist "Spanish notes review pending · Open".
- In-app and email notification to the reviewer when new phrases arrive (Claude).

**Permissions:**

- View and act (Approve, Edit, Reject, Approve all, Glossary edits): Approve translations. Without it the section is hidden.
- Translation settings card (Hold issue switch, Reviewer select): Manage users and settings; hidden without it.

**Layout:** Settings shell (see 15) with Translations active in the nav; nav footer card "How Spanish sets work". Main card: title, status segmented control, type chips, project filter, Glossary button, table, footer with count and bulk approve. Right column 360px: selected translation card (top), translation settings card (bottom). Status bar: Pair, Unreviewed, Approved, Glossary, Hold issue, location.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Segmented: Unreviewed (count) | Main header | Shows unreviewed phrases. | Default tab. |
| Segmented: Approved (count) | Main header | Shows approved phrases. | Approved phrases can be edited; an edit saves as approved. |
| Chip: All types | Filter row | Clears type filter. | Default on. |
| Chip: Sheet notes (count) | Filter row | Filters to sheet notes. | Counts reflect the current status tab. |
| Chip: Keynotes (count) | Filter row | Filters to keynotes. |  |
| Chip: Field tasks (count) | Filter row | Filters to field tasks. |  |
| Project filter button | Filter row | Opens project picker; first option "All projects" (default). Shows current filter ("Kitchen remodel · Hendricks"). |  |
| Glossary button | Filter row | Opens the glossary dialog: EN → ES term pairs (186 terms) with search, add, edit, delete, and "keep in English" flag (e.g. GFCI). | Approve translations. Changes apply to future drafts and warnings. |
| Table row | Table | Click selects and loads the right card. Selected: tint + left accent bar. | Columns: Type (label + where used), English source, Spanish draft, Status. |
| Row Type cell | Table | Type label (Keynote 12, Sheet note, Field task) and location (sheet numbers, detail id, or field pack tab). |  |
| Row warning "Not in glossary: \<term>" | Spanish draft cell | Amber: a construction term in the source has no glossary entry; term highlighted. Click "Add to glossary" adds the pair from the draft. | Excludes the row from "Approve all with no warnings". |
| Row warning "Glossary mismatch: \<term>" | Spanish draft cell | Amber: the source term has a glossary entry but the draft uses a different word. | Same exclusion. |
| Row warning "Numbers differ" | Spanish draft cell | Amber: a number, dimension or unit in the source (34 1/2", 2700K, 120V 15A) is missing or changed in the draft. | Same exclusion. |
| Row Status pill | Table | Unreviewed (amber) or Approved (green). The row open in the card also shows a blue "Reviewing" marker. | Stored statuses: Unreviewed, Approved. |
| Showing n of m | Footer | Display. | List loads more on scroll, 50 rows per page (Claude). |
| Approve all with no warnings (count) | Footer | Confirm dialog "Approve n phrases?"; then approves every unreviewed phrase in the current filter with no warnings. |  |
| Previous / Next (chevrons) | Card header | Moves to the previous / next row in the current filter. | Disabled at ends. Keys Up / Down. |
| Card header | Card | Phrase label ("Keynote 12") and usage ("Used on E1.0, A4.0 · 2 places"); each usage links to the sheet or field pack spot. |  |
| EN source box | Card | Read-only source with glossary terms highlighted. |  |
| ES draft box | Card | Spanish text with glossary terms highlighted; editable after Edit or Reject. |  |
| Glossary terms list | Card | Each matched term: EN → ES with check, or "kept" for terms left in English. | Display. |
| Drafted / Reviewer meta | Card | "Drafted: EZ Draft · Oct 11, 9:14 AM"; "Reviewer: \[Name\] · Foreman"; after approval "Approved by \[Name\] · \<time>". |  |
| Reject | Card footer | Clears the AI draft and opens the ES box empty for manual entry; Save approves the typed text. | Round 24 #39. |
| Edit | Card footer | Makes the ES box editable with the draft; Save approves the edited text. | Editing = approving (Round 24 #41). |
| Approve | Card footer, primary | Sets status Approved, records approver and time, updates every unsent use, advances to the next row. | Key A. |
| Hold issue until translations are approved (switch) | Settings card | On: a set cannot issue while any phrase used in it is unreviewed. Off: sets issue now. Helper: "Spanish users always see Spanish, reviewed or not." | Default off. Only holds set issue (Round 24 #40). |
| Reviewer select | Settings card | Chooses who is notified of new phrases. | Any user with Approve translations can review (Claude). |
| Keyboard: Up / Down, A (approve), E (edit), R (reject) | Table / card | As named. | Bindings editable in 15d (Claude). |

**Data shown:**

- translation: phrase (EN), Spanish text, status (Unreviewed / Approved), approver and time, drafted time, type, usage list (sheet numbers, detail ids, field pack location), glossary matches, warnings.
- Counts per status and type; glossary term count.
- Hold issue setting state.

**States:**

- Empty (Unreviewed): "All translations reviewed."
- Loading: table skeleton.
- Error: save fails; card keeps edits with Retry.
- Editing / manual entry: ES box has focus border and caret; footer shows Cancel and Save.
- Offline: read-only.
- No permission: section hidden; a typed URL redirects to Projects.

**Validation & warnings:**

- Glossary and number checks as in the warning rows above.
- Spanish text cannot be empty on Save or Approve.

**Events emitted:**

- translation.approved (new): phrase id, text, approver, uses updated.
- translation.edited (new) (also approves)
- translation.rejected (new)
- translation.bulk\_approved (new)
- glossary.updated (new)
- translation.settings\_updated (new)
- Approval writes event\_log.

**Decisions:**

1. Stored statuses are Unreviewed and Approved; "Reviewing" is only the selected-row marker; mockup "Draft" pills read "Unreviewed" (Claude).
2. Reject clears the AI draft and opens manual entry; saving approves the typed text (Round 24).
3. Spanish users always see Spanish, reviewed or not, never English or blanks; the switch only holds set issue (Round 24).
4. The Reviewer select only picks who is notified; anyone with Approve translations can review (Claude).
5. The glossary is edited in the Glossary dialog by users with Approve translations. "Not in glossary" means a source term has no entry; "Glossary mismatch" means the entry exists but the draft differs (Claude).
6. Editing an approved phrase keeps it Approved and updates unsent uses; sets already sent do not change (Round 24).
7. Translation changes never create a revision; permit sheets are English only (Round 24).
8. Permit sheets are English only; Spanish is for in-app viewing, the field pack and field pack PDFs (Round 24).
9. Numbers, dimensions and units are checked; a difference is a warning, not a block (Claude).

### 17 · Field pack (phone)

**Purpose:** Room-by-room field view for crews on a phone: dimensioned plan, 3D, measuring, task list in build order and photo notes, in the user's language, usable offline.

**Entry points:**

- EZ Binder job tab opens the job's field pack directly, already signed in (shared sign-on, plan Round 8).
- Magic link email for crew, with "Copy link" on the sender's side (Round 24).
- Notification "New field pack issued" (in-app and email).

**Permissions:**

- View field pack, all tabs, measure, Save PDF: View projects (scoped to assigned projects).
- Check off tasks: Check off tasks. Photo + note: Photo notes. Flag conflict to office: Flag conflict. Send measurement: Send field measurement. Edit task text: Edit field tasks.
- Controls the user lacks are hidden (Round 24).
- Company costs never shown without See company costs, nor sell prices without See sell prices.
- Field actions do not need the edit lock; they are not model edits (Round 24 #16).
- Approving measurements into the model: Approve field measurements, on the office Field measurements review screen.

**Layout:** Phone 390x844. Not the editor shell.

- Header: "EZ Binder" back link, offline status icon, revision badge ("Rev 1" after permit; "Version N" before); project title; subtitle (issue date, current sheet); room chips row.
- Main canvas (per tab): plan, 3D, measure, tasks or photo content; layers button top right; zoom control bottom right; hint bottom left.
- Bottom sheet (Measure tab): result, comparison, tolerance notice, actions.
- Tab bar: Plan, 3D, Measure, Tasks (count of open tasks), Photo.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back to EZ Binder | Header left | Returns to the same job in EZ Binder. | Persistent on every tab (plan Round 8). Offline: shows "EZ Binder needs a connection". |
| Offline status icon | Header | Green "offline\_pin" = pack cached; spinner while caching; amber with count = offline with n queued actions. |  |
| Revision badge | Header | Shows the sent version ("Rev 1" or "Version 3"). Tap shows the revision note and date. | Round 24 #26 numbering. |
| Project title / subtitle | Header | "Kitchen remodel · Hendricks"; "Field pack · issued Oct 8 · A3.0 Proposed plan". | Display. |
| Room chips | Header, below subtitle | One chip per room plus "All"; selects the room page. | Plan Feature spec 9 (Claude: chips as in the earlier field pack mockup). |
| Tab: Plan | Tab bar | Dimensioned room plan (A3.0 Proposed by default), elevations, selected finishes, detail callouts. | Tapping a detail bubble opens the detail. |
| Tab: 3D | Tab bar | Full 3D view with orbit; measure between two points. | One finger orbit, two-finger pan, pinch zoom. |
| Tab: Measure | Tab bar | Measure tool (shown). A Field measure button at the top of the tab opens 17b for room shapes (Round 25). |  |
| Tab: Tasks | Tab bar | Task list grouped by trade phase (demo → rough-in → inspection → drywall → finish); badge = open tasks. |  |
| Tab: Photo | Tab bar | Camera capture, then tap the plan to pin, then add a note. | Hidden without Photo notes. |
| Layers button | Canvas top right | Sheet with toggles: Existing, Demo, New, Electrical, Dimensions, Photo pins. |  |
| Plan canvas: tap point | Measure tab | Sets point A, then B; snaps to walls, corners and cabinets. A third tap starts a new measurement. |  |
| Plan canvas: drag point | Measure tab | Moves a placed point; value updates live. |  |
| Plan canvas: pinch / two-finger drag | Canvas | Zoom / pan. |  |
| Measured value field (laser input) | Bottom sheet | Focused after A and B are set; a Bluetooth laser in keyboard mode types its reading here, replacing the tapped distance. Typed entry works the same way. | Round 24 #47. No connection or battery labels (Round 24 #27). |
| Zoom + / − | Canvas bottom right | Zoom in / out. |  |
| Highlighted object | Canvas | Measured object (SB36) outlined in blue dashed. |  |
| Measurement labels | Canvas | Measured value pill ("36 1/4"") and drawing value ("dwg 36""). |  |
| Bottom sheet grabber | Bottom sheet | Drag to expand / collapse. |  |
| Measurement readout | Bottom sheet | Label "Sink base opening · SB36 · A to B", value 36 1/4", Drawing 36", delta pill "+1/4"". | Delta amber when over tolerance. |
| Tolerance notice | Bottom sheet | "Over the 1/8" tolerance. Add a filler or confirm with office before ordering." | Tolerance = the one company tolerance in 15d. Shown only when exceeded. |
| Save PDF | Bottom sheet | Downloads the field pack PDF (in the user's language) to the phone. | Works offline from the cached pack. |
| Send measurement | Bottom sheet | Sends the field-verified measurement (object, points, value, drawing value, optional photo and note) to the office. Toast "Sent to office for approval". | Separate from Flag conflict (Round 24 #28). Model changes only after office approval. Queued offline. |
| Flag conflict to office | Bottom sheet, primary | Creates a conflict flag (field differs from drawing) with location, measurement, optional photo and note; notifies office. | Queued offline. |
| Task row checkbox | Tasks tab | Marks task done; records user and time. | Hidden without Check off tasks. Queued offline. |
| Task row: add photo | Tasks tab | Attaches a photo to the task. | Photo notes. |
| Task row: edit text | Tasks tab | Edits the task text. | Edit field tasks; online only. |
| Photo pin | Plan canvas | Tap opens photo + note. |  |

**Data shown:**

- Project, sent version or revision and date, current sheet name.
- Model objects for the room: walls, openings, cabinet boxes with codes (F, B15, DW24, SB36, B18, B21, DB18, R30, B24, DB24), appliances (REF), island, overall dimensions (13'-0" x 13'-0").
- Measurement: target object, points A/B, measured value, drawing value, delta, tolerance.
- field\_task: text in the user's language (text\_en / text\_es), status, photos.
- Selected finishes (no prices).
- Language from the user's setting; Spanish users always see Spanish, reviewed or not.

**States:**

- First load: downloads and caches the pack; offline icon shows progress.
- Offline: fully usable after first load; tasks, photos, flags and measurements queue as offline\_change and sync on reconnect.
- Revision conflict on reconnect: queued actions made against an older revision are flagged; a sheet lists them with "Resend against Rev N" or "Discard" per item, and the office sees them as conflicts.
- Within tolerance: delta pill neutral, no notice.
- Over tolerance: amber delta and notice.
- No permission for an action: that control is hidden.
- Signed out: SSO fails → magic-link sign-in prompt.
- Error: PDF or sync failure with Retry.
- No set sent yet: "No field pack issued yet."

**Validation & warnings:**

- Measured vs drawing delta compared to the company tolerance.
- Typed lengths accept 12'6", 12' 6 1/2", 150", 12.5'.
- Field measurements never change the model until approved by a user with Approve field measurements.
- Company costs never displayed for users without See company costs, nor sell prices without See sell prices.

**Events emitted:**

- field\_task.completed
- field.conflict\_flagged: project, room, object, measured, drawing, delta, photo, note, user.
- field.measurement\_submitted; field.measurement\_approved and field.measurement\_rejected from the office review screen.
- field\_photo.added (new)
- field\_pack.pdf\_saved (new)
- offline\_change.synced (new); offline\_change.conflicted (new)

**Decisions:**

1. "Laser connected" and battery labels are removed; a keyboard-mode laser types into the measured value field (Round 24).
2. Send measurement and Flag conflict to office are separate buttons (Round 24).
3. The office is notified when measurements arrive and approves them on the Field measurements review screen (Round 24).
4. One company tolerance (15d) covers field measurements and scan-vs-typed checks (Round 24).
5. Field actions use the permissions Check off tasks, Photo notes, Flag conflict, Send field measurement; the Foreman preset ticks all four; Crew ticks all but Send field measurement (section 9 permission table).
6. Save PDF needs only View projects, because crews must be able to save the pack (plan Round 8); Export covers model and set exports (Claude).
7. Queued actions against an older revision are flagged as conflicts on reconnect, with Resend or Discard per item (Round 24, Claude for the controls).
8. Room chips, phase-grouped Tasks, Photo capture-then-pin and a full 3D tab with measure follow the earlier field pack mockup (Claude).
9. Plan tab opens A3.0 Proposed by default; the mockup subtitle "A2.0 proposed plan" is corrected (Round 24 sheet set).

### 17b · Field measure (phone)

**Purpose:** Capture basic room and building shapes and their measurements on site from a phone. Anything more detailed is measured with pen and paper and added on desktop later (Round 25).

**Entry points:** Field pack → Measure tab → Field measure; EZ Binder job → Field measure; New project wizard → input source Field measure (01 step 2).

**Permissions:** *Send field measurement* to create and send; *View projects* to view. Shapes arrive on desktop as draft existing-condition rooms; turning them into model objects needs *Edit model*.

**Layout:** header (Back to EZ Binder, Saved on phone status, project), room chips (Building outline plus each room, + Room), shape picker, shape canvas with lettered walls, active wall field and ceiling height field, hint line with walls done, measurement keypad.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back to EZ Binder | Header | Returns to the same job | Shared sign-on |
| Room chips | Header | Switch room; Building edits the outside outline | Active chip cobalt |
| + Room | Header | Adds a room; name typed or picked (Kitchen, Bath, Bedroom, Family, Laundry, Other) | — |
| Shape picker | Top | Rectangle, L-shape, T-shape, U-shape, Walls (free outline) | Changing shape after measuring asks to confirm and keeps matching walls |
| Walls mode | Shape picker | Tap to add corners; each new wall is lettered; tap the first corner to close | Angles snap to 90° unless held |
| Wall letter (tap) | Canvas | Selects that wall; its value goes to the active field | Selected wall cobalt |
| Active wall field | Below canvas | Shows the value being typed for the selected wall | Accepts feet, inches, fractions to 1/16" |
| Ceiling field | Below canvas | Ceiling height for the room | Optional |
| Keypad digits, ', ", 1/2, 1/4, 1/8, 1/16, space, backspace | Bottom | Type the measurement | Laser keyboard mode types here too |
| Next wall | Keypad | Saves the value and moves to the next wall | On the last wall, moves to the next unmeasured wall |
| Auto-fill wall | Canvas | The last wall of a closed shape fills itself when the others are known | Shown grey until computed |
| Closure check | Canvas badge | Shows "Closes" or "Off by X" when every wall is entered | Off by more than the company tolerance turns amber; the office resolves it on desktop |
| Send to office | Menu | Sends rooms to the project; office notified | Works offline, queued until online |

**Data shown:** rooms, shape, wall letters and lengths, ceiling height, closure result, saved and sent state.

**States:** empty room (pick a shape); measuring; closed; off by X; offline (saved on phone); sent (read-only until reopened by office).

**Validation & warnings:** a value outside 0–200 ft asks to confirm; closure difference above the tolerance setting shows amber.

**Events emitted:** `field.measure_sent` (new): project, rooms, shapes, values, by, at.

**Desktop side:** sent rooms appear in Import review as Field measure items with high confidence; accepting them creates existing walls and rooms. Openings, fixtures and details are added on desktop.

**Decisions:** shapes limited to rectangle, L, T, U and free walls; no doors, windows or fixtures on phone (Round 25).

### 18 · Client approval (phone)

**Purpose:** Client-facing share link page where the homeowner views renderings and plans, compares options, pins comments, makes selections, verifies, signs and approves. Approval covers the sent version, which is frozen permanently.

**Entry points:**

- Share link emailed by the contractor (Send to client); the send dialog also shows "Copy link" (Round 24). No SMS in v1.
- Later: inside the EZ Binder client portal (v2).

**Permissions:**

- Contractor side: Send to client creates, sends and renews the link. Only renders that are Approved and then Marked client-ready (two-step) appear here.
- Client: anyone with the link can view, comment and choose options; signing requires email verification against the customer profile (Round 24). No editing. Clients never see internal costs.

**Layout:** Phone 390x844. Not the editor shell.

- Header: company name ("WORTH PROPERTIES"), project name ("Hendricks kitchen"), right: "Design approval", "Version 3 · Oct 11" (pre-permit) or "Rev N · date" (after permit); menu button.
- Page tabs: Design, Plans.
- Render card: image with before/after slider and comment pins; Compare button; comment list below.
- Selections card.
- Option group ("Ceiling beams · Choose one") with A/B/C cards.
- Disclaimer line.
- Signature card: email verification, printed name, signature pad, open-items note.
- Footer: Comment, Approve.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Menu button | Header right | Download selections PDF; Help ("Contact \[Company\]"). |  |
| Page tab: Design | Below header | Renders, selections, options, signature (shown). | Default. |
| Page tab: Plans | Below header | Read-only viewer of the sheets the contractor shared in this send; pinch zoom; tap to pin a comment. | (Claude). |
| Render gallery swipe / dots | Render | Switches between client-ready renders (one per room or angle). |  |
| Before/after slider handle | Render | Drag left/right to reveal before (site photo) vs after (render). | Labels "Before" and "After". |
| Render image: tap (comment mode) | Render | Drops a numbered pin and opens a comment input. | Plan Round 8. |
| Compare | Render card | Opens side-by-side view of options A/B/C on the same angle; tap one to select it. | Plan Feature spec 10 (Claude: button placement). |
| Comment pin (numbered) | Render | Tap scrolls to and highlights its comment. |  |
| Comment list item | Below render | Pin number, author ("You", "Josh"), text; Reply. | Clients can reply in a thread (Claude). |
| Selections row: Countertop edge | Selections card | Opens edge choice (S18b). | Card note "Not all shown in render". |
| Selections row: Cabinet / Hardware / others | Selections card | Opens that selection's choice page (same pattern as S18b). | Open rows show "Choose"; chosen rows show the choice. |
| Option card A / B / C | Ceiling beams | Selects one option; border + check badge, `aria-pressed`. Render switches to that option's client-ready render; if none, shows the option thumbnail with "No rendering for this option". |  |
| "For illustration; drawings govern." | Below options | Display. | Always visible. |
| Verify email input + Verify | Signature card | Client enters the email on their customer profile; match unlocks the signature pad. | Round 24 #32. Mismatch: "That email doesn't match our records. Contact \[Company\]." |
| Printed name input | Signature card | Client types full name. | Required (Round 24 #34). |
| Signature pad | Signature card | Finger signature. Caption: "\[Client name\] · Oct 11, 2026 · approving Version 3 with option B". | Locked until email verified. |
| Clear | Signature card | Clears the signature. |  |
| Open items note | Signature card | "Still open: Hardware" when some selections are not chosen; "You can approve now and choose these later." | Client may sign with some selections open (Round 24). |
| Comment | Footer | Enters comment mode (next tap on image or plan drops a pin). |  |
| Approve | Footer, primary | Records approval (verified email, signature, printed name, date, IP, chosen options), freezes the version, emits selection.approved, shows confirmation with Download selections PDF. | Enabled when email verified, printed name and signature present, and at least one selection chosen. Choosing alone is never approval (Round 24). |

**Data shown:**

- share\_link: project, scope, expires\_at.
- Client-ready renders, before photo, sent version label.
- design\_option choices (A/B/C) and selection items; chosen and open items.
- Shared sheets (Plans tab).
- Comments with pin positions and replies.
- Approval record after signing.

**States:**

- Active link: normal.
- Expiring soon (7 days or less): banner "This link expires in n days." (Claude).
- Expired: "This link has expired. Ask \[Company\] to renew it." Contractor renews for 30 days.
- Not verified: signature pad locked.
- Approved: read-only; shows signer, date, approved options and still-open items; Approve hidden; selections PDF available.
- New version sent: link shows the new version for a new signature; the earlier approval stays on record.
- Render outdated or hidden: hidden renders are removed until re-rendered.
- Loading, error, offline ("Connect to approve").

**Validation & warnings:**

- Email must match the customer profile (case-insensitive).
- Printed name and signature required.
- One option per option group.
- No prices except the edge profile price difference shown as a total (S18b).

**Events emitted:**

- selection.approved (includes chosen and open items)
- client.commented: pin location, text, render or sheet id.
- client.verified (new)
- selection.option\_chosen (new)
- share\_link.viewed (new); share\_link.expired (new); share\_link.renewed (new)
- Notifications to contractor: client approval or comment (in-app and email).

**Decisions:**

1. Client may approve with some selections still open (listed on the signature card and in the approval record); Approve needs verification, printed name, signature and at least one choice; Choose alone is not approval (Round 24, Claude for the one-choice minimum).
2. Printed name is required with the signature (Round 24).
3. Viewing needs only the link; signing needs the client to enter the email on their customer profile (Round 24).
4. Pre-permit sends are labeled "Version N"; permit issues "Rev N" (Round 24).
5. Selecting an option swaps to its client-ready render; Compare opens a side-by-side view (Claude).
6. Selections PDF downloads from the header menu and from the approval confirmation (Claude).
7. Clients can reply to comments in a thread (Claude).
8. Plans is a second page tab showing the shared sheets read-only, with comment pins (Claude).

### 18b · Client edge choice (phone)

**Purpose:** Client picks a countertop edge profile from the profiles the contractor offers; the choice flows back to the plan, top schedule and internal/client drawings (countertop sheets are not in permit drawings, Round 24).

**Entry points:** Client approval page (S18) Selections row "Countertop edge"; one step of the client selections flow.

**Permissions:** Client via share link (no verification needed to choose). Offered profiles and prices are set by a contractor user with Send to client (S04b "Edit offered edges"), under the edit lock (Claude).

**Layout:** Phone 390x844.

- Header: back arrow, "Your kitchen selections", "Worth Properties · Hendricks kitchen", step "2 of 4".
- Title "Choose your countertop edge"; material line "Quartz · \[Color\] · 3 cm thick".
- Large cross-section card with dimensions and profile name/description.
- Option list (radio rows).
- Mini plan of edges it applies to.
- Note on renders.
- Footer: Ask, Choose.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Back arrow | Header | Returns to S18 or the previous step. | A radio pick not confirmed with Choose is discarded (Claude). |
| Step indicator "n of m" | Header | Position in the flow; m = number of selection groups in this send. | Order set by the contractor (Claude). |
| Cross-section drawing | Card | Large section of the selected profile on the top over a cabinet; dims 1 1/2" (overhang) and 3 cm (thickness); name and one-line description. | Updates on option change. |
| Option row: Eased | Option list | Selects; "Included". | Radio. |
| Option row: Half bullnose | Option list | Selects; price difference as a total, e.g. `+$[ ]`. | Total = per-LF price x exposed LF (Round 24 #33). |
| Option row: Ogee | Option list | Selects; total price difference `+$[ ]`. |  |
| Mini plan | Below list | Blue edges show where the profile applies; "about 33 linear ft". | Exposed edges only (plan Round 23). |
| Render note | Below plan | "Your renderings show a square edge. The edge you pick is listed beside each rendering and on the drawings." | Renders do not model edges. |
| Ask | Footer | Opens a comment to the contractor tied to this selection. | Same notification as comments. |
| Choose \<profile> | Footer, primary | Saves the choice; label follows the selection ("Choose Half bullnose"); goes to the next step or back to S18 after the last. | Disabled with nothing selected. Not an approval (Round 24). |

**Data shown:** offered edge profiles (subset of eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom), total price difference, top material and thickness, exposed edge LF, edge plan.

**States:** loading, chosen (check on the chosen row, button reads "Chosen"), locked after S18 approval (read-only), expired link, error, offline.

**Validation & warnings:** One profile required to continue.

**Events emitted:** selection.option\_chosen (new) with item "countertop edge", profile, price delta total; S04b "Edge profile: client choosing" updates to the chosen profile and the top schedule updates.

**Decisions:**

1. Price difference shows as a total (per-LF rate x exposed LF); the contractor enters the rate per LF on S04b (Round 24).
2. Clients see this sell-price difference only; costs and markup stay internal (Round 24, Claude).
3. The flow has one step per selection group in the send, in the order the contractor sets; the mockup's 4 steps are an example (Claude).
4. Choose saves a choice only; approval happens on S18 with verification and signature (Round 24).
5. Client pages use the project name as set in EZ Draft ("Hendricks kitchen") on every screen (Claude).

## Workflows

A project moves Draft → Client review → Permit submitted → Approved → In build. Design loops with the client until approval; after the first permit set issues, every change is gathered into a numbered revision and can produce a change order.

**W1 · New project**

1. Projects → New project → choose: From an EZ Binder job, Standalone, or Start from a file.
2. From EZ Binder: pick the job; client, address and job number fill in. Standalone: pick a customer (or add one; the customer list syncs both ways with EZ Binder when connected), then type name, address, type.
3. Optional: paste the property appraiser link. The app reads parcel, owner, legal description, year built and living area for you to confirm. Year built before 1978 sets the lead flag. If the site blocks the read, paste the page text or a screenshot.
4. Pick the submittal profile (department) and code edition (defaults from settings).
5. Pick the input: Polycam scan, PDF, DXF, supplier kitchen PDF, field measure from the phone (17b; the Foreman gets the link), or blank with a template (galley kitchen, L-kitchen, 5×8 bath, primary bath).
6. The project opens on the Plan tab (or Import review if a file was chosen).

**W2 · Import**

1. Upload the file(s). Polycam: layered DXF + GLB mesh. PDF: set scale by clicking two points and typing the distance. DXF: kept as a full-fidelity reference first. Field measure: rooms sent from 17b arrive as high-confidence existing walls and rooms (source kind field\_measure).
2. Choose a review mode: one item at a time, accept all and fix low-confidence items, or room by room.
3. Detected walls, openings, rooms and cabinets show with confidence colors. Accept, fix or reject each. Nothing becomes model data until accepted.
4. Typed or laser values override scanned ones; each override lists the conflicts it creates.
5. Finish: accepted items become model objects with status Existing. The mesh stays as a toggleable 3D underlay; the reference stays under the model.

**W3 · Draw the existing conditions and the new design**

1. Status bar on Existing: draw or fix walls, openings, rooms, ceilings, existing devices, panel, appliances with utility points, plumbing, gas, HVAC, pins (damage, protect).
2. Switch to Proposed: mark demo items, add new walls, cabinets, countertops, fixtures, devices, ceiling items.
3. Rooms must close: if typed lengths leave a gap, pick the wall that absorbs it or override and keep the room out of square.
4. Bearing walls flagged: removing or opening one is blocked until an engineer note is attached.

**W4 · Cabinets**

1. Cabinet tool → pick a wall run → Auto-fill run places real boxes in 3" increments plus fillers at walls and appliances.
2. The run total shows against the wall length; a mismatch is flagged.
3. Swap any box; set face layout, hinges, finished ends, catalog item.
4. Elevations show actual door and drawer faces. The cabinet schedule (code, qty, finish, notes) feeds sheets, takeoff and the supplier order.

**W5 · Countertops**

1. Countertop tool → Trace cabinets creates pieces from the runs; or Draw outline.
2. Add seams and cutouts (sink, cooktop). Pieces are labeled A, B, C with size and area.
3. Click an edge → pick Flush 0, Standard 1 1/2", Bar 10", Seating 12", Wall + backsplash, or type a value. The inspector's four-side diagram edits all sides at once.
4. A seating overhang past the support limit adds brackets to a detail and shows a notice.
5. Pick the edge profile, or choose which profiles to offer the client with price per linear foot. Send the choice to the client (W10).

**W6 · Ceiling (RCP)**

1. Ceiling tool switches to the reflected ceiling plan.
2. Set ceiling type and heights per room (typed at points, by pitch, or read from the mesh).
3. Place beams (size, spacing or count, direction, follow slope or level at a set height), soffits, trays, coffers, crown.
4. Auto-layout cans by count, spacing or light-level target; draw switching zones and dimmers; the fixture schedule (A, B, C…) builds.
5. ACT rooms: set 2×2 or 2×4, direction, start point; borders balance to at least half tiles; troffers and diffusers snap into tiles.
6. Add diffusers, returns, exhaust fans, detectors, speakers, access panels. Lights placed here are the same objects as on the electrical plan.

**W7 · Electrical**

1. Enter the existing panel: service size, main breaker, label photo (AI reads brand, rating, spaces), existing circuit list (typed or from a directory photo), existing large appliances.
2. Place devices; click devices to assign circuits; homeruns and switch legs draw automatically.
3. Pick the load-calc case (circuits added, service upgrade, subpanel feeder, large add, like-for-like panel). The worksheet shows every line of math.
4. Press Check on the tool rail to run code warnings for the whole project. The optional load-calc method is a toggle; voltage drop is warned above the company threshold. Fix or accept each with a note.

**W8 · 3D and design options**

1. 3D tab: orbit, walk, look up, section. Save named camera views.
2. Create option groups (e.g. Beams: A Ridge only, B Three beams, C Coffered) with internal cost lines.
3. Send options to the client link (W10).

**W9 · Render**

1. Render tab → Step 1 Angle (required): a saved view, the current 3D camera, or a site photo (photo fixes the angle; aligning the model to the photo is optional and used only when exact placement matters).
2. Step 2 Style: tap a surface and pick a finish, type an instruction, paint a mask, or render what is in the model. Pick tier (Fast, Standard, Photoreal); cost shows in dollars against the company render allowance.
3. Step 3 Generate: one image per run unless asked for more. The result opens in the render view.
4. Compare with the previous render, mark an area to fix, rerun, or regenerate.
5. Approve, then Mark client-ready (two steps); only then does it appear on the share link. If an object or finish visible in it changes later, the render gets a Model changed badge; choose keep, mark outdated, or hide, per render.

**W10 · Client review and approval**

1. Share → create or renew the link (30-day expiry). The email goes out and a Copy link button gives the same link to text.
2. Client opens on phone: renders (before/after), selections box, comment pins, option choice, edge profile choice.
3. Client verifies by typing the email on their customer profile, selects items, types a printed name and signs with a finger; name, date and IP are logged. They may sign with some selections still open; Choose alone is not approval. The approval locks that model version and emits `selection.approved`.
4. Generate the branded selections PDF: approved render per room, product list with photos (no prices), signature page; optional allowance summary with prices.

**W11 · Sheets and issue**

1. Sheets tab: review the auto-built set; adjust viewports and scales.
2. Issue set → checklist must pass: code check reviewed, no red/orphan flags, title block complete. The key lists only symbols used.
3. Issue → one PDF per set (countertop plan and schedule excluded), named from address + description with the version kept in the name, bookmarks per sheet, stamp area blank; stamped permit sets are 24×36 and a one-page-at-a-time download is offered (Round 25). First issue is Rev 0 and locks.
4. Emits `plan_set.issued` to EZ Binder.

**W12 · Revisions and change orders**

1. Edits after Rev 0 are gathered. When the set is next sent to the client or department, they become Rev N with clouds and delta tags on changed objects, and the revision block and log update.
2. Create change order → draft with before/after images (each approved before inclusion), AI-drafted scope text (editable), quantity and cost delta, schedule impact (all typed by you). It can be sent together with the revision.
3. Send to EZ Binder (manual only) → `change_order.sent`. When EZ Binder marks the CO approved, the matching revision locks.

**W13 · Field use**

1. Crew taps the field pack tab in EZ Binder → opens already signed in, in their language. Back to EZ Binder returns to the same job.
2. Plan, 3D, Measure, Tasks, Photo tabs. Works offline after first load; PDF download.
3. Foreman checks off tasks, pins photos and notes, flags conflicts (notifies office) and sends field-verified measurements with separate buttons. The office is notified and approves measurements on the Field measurements review screen. A measurement changes the model only after someone with *Approve field measurements* accepts it. For room shapes the Foreman uses Field measure (17b); the office accepts the rooms in Import review.

**W14 · Translations**

1. AI translates tasks and notes to Spanish; each phrase enters the review queue as Unreviewed.
2. A reviewer with *Approve translations* approves, edits or rejects. Edits update every use; the cache reuses it across jobs.
3. Setting "Hold issue until translations are approved" is off by default and only holds set issue. Spanish users always see the Spanish text, reviewed or not. Reject opens the phrase for manual edit; editing a phrase approves it.

**W15 · Version cleanup**

1. Unsent working versions older than 30 days come up for cleanup. A cleanup sheet lists them, each with a preview image; tick the ones to keep (they become named snapshots).
2. Unticked versions are deleted; if the sheet is ignored, they delete after 7 more days. Named snapshots and every sent version are never offered.

## Hooks, events and integrations

EZ Draft publishes events; EZ Binder subscribes by signed, retried webhook and calls EZ Draft's inbound API. Neither app writes to the other's database.

**Outbound webhooks to EZ Binder**

| Event | Fired when | Payload | EZ Binder action |
| --- | --- | --- | --- |
| `plan_set.issued` | A set issues (Rev 0 or Rev N) | project id, EZ Binder job id, rev no, PDF urls, sheet list, issued by, sent to | Attach the set to the job documents |
| `selection.approved` | Client verifies and signs a selection set (choosing alone does not fire it) | selection set, items, chosen options and edges, approver name, timestamp, IP, model version | Record approval; update selections |
| `revision.created` | Rev N is assigned | rev no, changed object ids, before/after image urls, quantity changes | Record the revision on the job (no CO draft; COs come only from change\_order.sent) |
| `change_order.sent` *(new)* | Send to EZ Binder pressed on a CO draft | approved images, scope text, lines (qty, unit, cost delta), schedule days, rev no | Create / update the CO record |
| `takeoff.updated` | A version is sent (the takeoff snapshot stored with it); never on working saves | lines by room and trade | Update estimate or material list (v2 push) |
| `model.exported` | GLB/USDZ export finishes | GLB and USDZ urls, version | Show the model in the job viewer |
| `field_task.completed` | A task is checked off | task, room, photos, by, at | Log progress |
| `field.conflict_flagged` *(new)* | Foreman flags a conflict | pin, photo, note, object id | Add to job feed |
| `client.commented` *(new)* | Client pins a comment | render or plan id, pin, text | Add to job feed |

Delivery rules: HMAC-signed body, idempotency key per event, retries with backoff, event log entry on every send and failure. Retry count and backoff are company settings. Added in Round 24: customer.synced (two-way customer sync), user.synced (optional user sync), render\_allowance.refilled (owner notice).

**Inbound API (called by EZ Binder)**

| Call | Result |
| --- | --- |
| Create design project from job | New EZ Draft project with client, address, job number |
| Open project / field pack with shared sign-on | Returns a signed URL; user lands signed in |
| Read latest approved version, renders, plan set, takeoff | Read-only data for the job |
| Mark change order approved | Locks the matching revision |

**Calls EZ Draft makes to EZ Binder** (added Oct 11; each needs matching work in the EZ Binder repo, fixed in the contract from EZD-019)

| Call | Used by |
| --- | --- |
| Search and read jobs the user can see | New project wizard job picker |
| List and upsert customers | Two-way customer sync |
| List users | Optional user sync |
| Verify a shared sign-on token | Opening EZ Draft from EZ Binder and Back to EZ Binder |
| Post a webhook (all outbound events above) | Webhook delivery |

Until the EZ Binder side exists, these run against the stub server from EZD-019.

**Internal app events (drive UI, notifications and recompute)**

| Event | Triggers |
| --- | --- |
| `model.saved` | Working copy saved (changed objects only; no new version row). The server recomputes nothing: schedules, symbol key, electrical calc and takeoff update in the browser for what is on screen. A background job compares the changed object ids with each approved or client-ready render's visible\_object\_ids and sets Model changed on renders that show a changed object or finish (badge + review pill, no save-time prompt; keep / outdated / hide per render) |
| `lock.acquired` / `lock.released` / `lock.requested` / `lock.auto_released` | Banner updates for viewers; prompt to holder; 5-minute timer |
| `import.completed` | Fired by Finish import: accepted items are in the model and Plan opens with the counts notice. Detection finishing is import.ready (new): Import review can open and the uploader is notified |
| `reference.version_uploaded` | Build diff; flag affected markups and objects |
| `render.completed` / `render.failed` | Notification; review pill count |
| `render.approved` | Render moves to Approved; Mark client-ready is the separate second step (render.client\_ready) |
| `translation.created` / `translation.approved` | Review queue; propagate edits to every use |
| `field.measurement_submitted` | Review pill; approval updates model |
| `share_link.expiring` | Reminder before 30-day expiry (lead time is a company setting) |
| `cleanup.due` | Cleanup sheet for unsent versions older than 30 days |
| `code_check.completed` | Warning list on Electrical and in the issue checklist |
| lock.request\_declined / lock.conflict | Requester told the holder kept editing; former holder gets the conflict list after an offline auto release |
| field.measurement\_approved / field.measurement\_rejected | Model update and conflict list; or the note goes back to the Foreman |
| field.measure\_sent | Import review items (source kind field\_measure); office notified |
| field\_pack.issued (new) | "New field pack issued" notification to assigned crew; phones refresh the cached pack |
| design\_option.created / design\_option.updated | Options panel and 3D; takeoff cost per option |
| version.sent / version.snapshot\_named / version.reverted / cleanup.deleted | Versions list; Version N / Rev N label; takeoff snapshot on send |
| render.client\_ready / render.rejected / render.model\_changed / render.outdated / render.hidden\_from\_client | Share link contents; review pill |

Canonical names: the event names in this section (outbound webhooks, Round 24 additions and internal events) are the only names for these events; every screen section uses them. Other screen events marked (new), such as catalog\_item.created or detail.placed, write the event log only and are not webhooks (Claude).

**External services**

| Service | Used for | Fallback |
| --- | --- | --- |
| Image-edit model APIs (configurable per tier) | Renders | The local GPU render worker runs first when online; these APIs are the fallback when it is off (Round 24 #50). Browser path tracer optional |
| Claude | Catalog extraction from URL, image or pasted text; Spanish translation; task drafts; CO scope text; panel label and directory photo reading; property appraiser page reading | User types the fields |
| Property appraiser sites (PBC, Broward) | Parcel, owner, legal, year built, living area | Paste page text or screenshot |
| Retail and supplier product pages | Catalog fields | Paste text or screenshot |
| Email provider | Share links, notifications, magic links | — |
| Polycam | Manual upload in v1 (DXF + GLB) | API pull evaluated in v2 |

AI never edits the drawing silently: every AI result is shown for confirmation before it is saved.

## Import and export

Originals are always stored unchanged; imports only create model objects after you accept them in Import review, and DXF references keep 100% of the source drawing.

**Imports**

| Source | Format | What the app does | Fidelity and limits |
| --- | --- | --- | --- |
| Polycam Space scan | Layered DXF floor plan | Walls, openings, rooms detected by layer → Import review | About 0.5" tolerance; needs Polycam Business |
| Polycam mesh | GLB / GLTF | Toggleable 3D underlay; ceiling heights can be read from it | Reference only, never model data |
| Existing plan | Vector PDF | Scale by two points + typed distance; wall lines auto-detected → Import review | Trace-assist for anything not detected |
| Existing plan | Scanned PDF / image | Underlay for tracing | Trace only |
| Supplier kitchen drawings | Vector PDF | Walls, runs, dimensions; cabinet labels (W3030, B24…) set size and type; plan and elevations cross-checked → Import review | Scanned PDFs: trace-assist, lower confidence |
| Supplier 2020 order report | PDF / CSV / text | Exact SKUs and sizes; most reliable cabinet input | Format to confirm with a real sample |
| Supplier 2020 drawings | DXF | Full-fidelity reference, convert runs | DWG prompts for a DXF in v1 |
| Supplier rendering | PNG / JPG | Style and finish reference; cabinet tags linked to plan boxes (rendering markup); AI suggests catalog matches | Never a geometry source |
| Architect drawings | DXF (model and paper space) | Full-fidelity reference: all linework, layers, blocks, hatches, text, dims, layouts; convert all, some layers or none | GPU rendering with layer loading for large files |
| Revised architect DXF | DXF | New version of the same reference; diff of changes and affected markups/objects | — |
| Any DWG | DWG | Not opened in v1: the app asks for a DXF re-save | Paid ODA converter deferred |
| Product page | URL | Server reads page; AI fills name, brand, model, dims, finish, price, lead time, category | Retail sites may block; fallback below |
| Product fallback | Pasted text, image, screenshot | AI reads fields | User confirms every field |
| Property appraiser | URL / pasted text / screenshot | Parcel, owner, legal, year built, living area | User confirms |
| Panel label / directory | Photo | AI reads brand, rating, spaces, circuit list | User confirms |
| Site photos | JPG / HEIC | Attached to rooms; render source; field pins | — |
| Laser | Keyboard-mode text | Types into the focused length field | Laser model must support keyboard mode |

**Exports**

| Output | Format | Contents and rules | Permission |
| --- | --- | --- | --- |
| Permit set | One vector PDF per set; supporting docs separate | True scale; stamped permit sets 24×36 (ARCH D), 11×17 for client and field copies (Round 25); one bookmark per sheet; blank stamp area; not password-locked; markup allowed in Bluebeam and Acrobat; scale bar and check dimension on each sheet | Issue permit sets / Issue revisions |
| File name | — | Address + description, e.g. "336 Golfview Rd buildingplans"; the version stays in the file name by default (Round 25), and a profile can switch to same-name-as-original; naming template, file split and flattening set per submittal profile | — |
| CAD | DXF | Model and sheets as DXF | Export |
| Markup back to architect | PDF overlay or DXF layer | Markup layer only | Export |
| 3D for EZ Binder | GLB (compressed) | Lightweight for `<model-viewer>` | Export |
| iPhone AR | USDZ | AR Quick Look | Export |
| Takeoff | CSV | Lines by room and trade with waste | Export; prices only with See company costs |
| Cabinet schedule / order | CSV and on sheets | Code, qty, finish, notes | Export |
| Countertop schedule | On sheets, CSV | Piece, material, thickness, area, edge profile, edge length. Internal and client documents only, never in permit sets | Export |
| Selections PDF | PDF, branded | Approved render per room, product list with photos (no prices), signature page; optional allowance summary with prices | Send to client |
| Field pack | PDF + offline cache | Per-room pages, tasks, in user's language | View projects |
| Single render | PNG / JPG | With "For illustration; drawings govern" label | Export |
| Detail | On sheet A5.0 and as PDF | Print preview at 24×36, 11×17, phone | Export |

### Department submittal rules (checked Oct 11, 2026)

One combined PDF per set stays the default (Round 24), but it only works as-is for Broward County BCD and, with changes, Fort Lauderdale, West Palm Beach and Coral Springs. Palm Beach County and Boca Raton require one PDF per sheet, and every department that addresses resubmittals requires the corrected file to keep its original name. EZ Draft therefore makes file split, naming, flattening, stamp box and resubmittal mode settings of each submittal profile (decided by Claude from this research).

| Department | Portal | Key PDF rules | Differs from EZ Draft default | Source |
| --- | --- | --- | --- | --- |
| Palm Beach County Building Division | ePZB Building portal | Drawings one file per page; 10 MB max per file; name 80 characters max; digitally signed with trusted CA if applicable; resubmittals keep the original file name | One file per sheet; 10 MB limit; no rev suffix. Stamp space, sheet size, flattening: not stated | [EPZB Building Portal FAQs](https://pbc.gov/iPZB.Building/Docs/EPZB%20Building%20Portal%20FAQs.pdf) |
| West Palm Beach | EPL / Civic Access | One digitally signed PDF per consultant; not locked; drawing names ALL CAPS \~30 characters, description + responsible person; resubmittal keeps original name, extension allowed; revisions upload changed sheets only | Per-consultant file; different naming; suffix only appended to the original name; changed sheets only | [EPL File Preparation](https://www.wpb.org/files/assets/city/v/1/development-services/documents/epl/epl-file-preparation.pdf) |
| Boca Raton | Boca ePlans | Vector PDF required; layers must be flattened; multi-page drawing files rejected; names by sheet number (A-101); corrections use the exact same name; revised areas clouded; transmittal on resubmittal | One file per sheet; flattened; sheet-number naming; no rev suffix | [Boca ePlans Applicant User Guide](https://www.myboca.us/DocumentCenter/View/34304/Boca-ePlans-Applicant-User-Guide), [Naming Conventions](https://www.myboca.us/DocumentCenter/View/39849/Naming-Conventions) |
| Broward County BCD (unincorporated) | Broward ePermits OneStop | Signed and sealed each page with verifiable e-signature; one file per trade labeled by trade; 99 MB max; no password protection; plans at least 3/16" = 1' (electrical 1/4" = 1' under 5,000 sf) | Closest to default; trade-label naming; revision naming rule not confirmed; minimum scale may fail on 11x17 | [BCD ePermit User Guide](https://www.broward.org/Building/Documents/Building%20Code%20Division%20Building%20Permitting%20ePermit%20User%20Guide.pdf) |
| Fort Lauderdale | LauderBuild Plan Room | No encryption; all layers flattened incl. seals; annotations removed; max 24x36; 6"w × 2"h stamp space top-left on every sheet; multi-page PDFs need TOC and bookmarks; names like BLD-PLANS-A; resubmittals same name, changed sheets only; third-party CA signature, any change after signing voids it | Fixed stamp box size and place; flatten; different naming; no rev suffix; changed sheets only | [LauderBuild](https://www.fortlauderdale.gov/Government/Departments/Development-Services/LauderBuild), [Naming Standards](https://www.fortlauderdale.gov/files/assets/public/v/1/development-services/documents/lpr_naming_v21.pdf), [Digital Signature Policy](https://www.fortlauderdale.gov/files/assets/public/v/2/development-services/documents/lpr_dsp_v42.pdf) |
| Coral Springs | eTrakit | One layer, no embedded objects; not locked; separate PDF per discipline named by type; corrections are a full discipline set with the same name; delta clouds; narrative/errata file; first page signed with third-party CA | Flatten; per-discipline naming; no rev suffix; narrative file needed | [Naming Requirements](https://www.coralsprings.gov/Government/Departments/Building/Online-Permitting-eTrakit/Naming-Requirements) |

**Submittal profile settings added**

1. File split: combined set (default) / per discipline or consultant / one PDF per sheet, with a per-file size limit (PBC 10 MB).
2. Download options: one PDF per set (default) or one page at a time. File names keep the version by default (Round 25); users rename locally when a department wants the original name. A profile can switch to same-name-as-original with the revision ID only in the title and revision blocks.
3. Naming template per profile (address + description default; Fort Lauderdale `BLD-PLANS-A`, Boca sheet number, West Palm Beach ALL CAPS ≤ 30 characters, Coral Springs discipline name, PBC ≤ 80 characters). Characters / ? < > \\ : \* | " , # and double or trailing spaces are stripped.
4. Flatten on export (single layer, no annotations), run before signing.
5. Stamp box position and size per profile (Fort Lauderdale 6" × 2" top-left); default stays the current reserved area.
6. Not password-locked; markup allowed (all departments agree).
7. Bookmarks for combined files; optional TOC sheet (Fort Lauderdale).
8. Resubmittal mode: changed sheets only, or full discipline set plus a narrative/errata PDF; transmittal option (Boca).
9. Minimum-scale check per profile (Broward 3/16" = 1'); flags 11x17 layouts below it.
10. Export unsigned, leaving the seal box, so the professional signs last with a third-party certificate.

Full-size sheets: stamped permit sets export at 24×36 (ARCH D), the standard full-size blueprint sheet for residential work. It fits every department checked (Fort Lauderdale max 24×36, Boca Raton max 36×42). 11×17 stays available for client and field copies. Larger sizes (30×42, 36×48) are not needed for remodels (Round 25).

Not confirmed: PBC stamp space, sheet size, flattening and bookmarks; West Palm Beach naming reference sheet (image-only); Broward BCD revision naming. No department requires a scale bar or check dimension; EZ Draft keeps them.

## Calculations and rules

Code checks are warnings to a licensed person, never automatic fixes or a guarantee. Rules are built against the 2023 NEC (adopted by Florida's 9th Edition building code, effective December 31, 2026) and against the Florida Building Code, Residential. The code edition is a per-project setting; permits applied for before that date use the 8th Edition (2023) with the 2020 NEC. Code section numbers below must be verified against the code text during build. The full rule list (receptacles, GFCI/AFCI, circuits, lighting, panel, load calc lines, smoke and CO, company rules) is in the Code check rules tab.

**Electrical load calculation**

- Methods: NEC Article 220 standard method, and the optional method for existing dwellings (220.83), turned on or off per calc with a toggle.
- Five cases: circuits added to an existing panel (does the service hold); service upgrade; subpanel feeder sizing; large adds (EV charger, heat pump); like-for-like panel replacement with no service change.
- Inputs: square footage (from rooms), small-appliance and laundry circuits, fixed appliances from catalog ratings (fallback to editable standard defaults), existing panel data and circuits, existing large appliances.
- Standard method lines: general lighting by area, small-appliance circuits, laundry, demand factors, fixed appliances, dryer, ranges, larger of heating or cooling, total VA, amps at 240 V, compare to service rating.
- Output: every line of math printed on E2.0 with the panel schedule. Stored with the model version when a set issues.
- Every electrical sheet notes that the electrical contractor of record verifies the design. Signature block per submittal profile (none, EC, architect).

**Electrical code warnings (run by Check, and automatically at issue)**

- Countertop receptacle spacing; GFCI locations; AFCI locations.
- Required dedicated circuits: dishwasher, disposal, microwave, refrigerator, bathroom.
- Smoke and CO detector locations.
- Voltage drop above the company threshold. Each warning: fix it, or accept with a note. Accepted notes print in the issue log. Check runs from the tool rail on any editor tab.

**Code check engine** (Round 26)

Check flags conflicts with every building code that applies to what is drawn, not only electrical. It is built as a registry of rule sets, one per code volume and edition, so a new code or edition is added as data plus check functions without touching the engine. The rules themselves are the Code rules catalog (Round 26 R34): the file ezdraft-code-rules.json, 1,248 rules, browsable as the EZ Draft Code Rules page. It covers the Florida Building Code, Residential (building planning, construction, mechanical, fuel gas, plumbing), the Existing Building and Energy Conservation volumes, and the NEC from Article 100 through the equipment articles, limited to what an interior remodel of an existing dwelling can trigger. Each rule has its section for both editions (8th Edition with the 2020 NEC, in force now; 9th Edition with the 2023 NEC, for permits applied for after December 31, 2026), the check in our own words, what it applies to, when a remodel triggers it, its type and how it was sourced. Three types: Automatic (277), checked from the drawing; Needs data (276), checked once the user enters the value the rule names; Reminder (695), shown as a checklist item when the triggering object exists, because it cannot be checked from a drawing. Sourcing: 756 rules were read from the published code text (all Florida volumes), 312 come from published summaries of the NEC and 180 were written from knowledge with no source opened; the last two groups carry the not-yet-verified tag until checked against the NEC itself. The two tables below were the first sample and are superseded by the catalog where they differ.

- A rule has: rule id, code and edition, section number, a plain-language title written for this app, the object types it applies to, a test condition, the warning text, and a severity (warning or note). The rule text in the app is always our own wording with the section number; the code books' text is not copied into the app. Each warning links to the section in the publisher's free online viewer.
- A rule runs only when the model holds what it needs: a bath rule runs when a room is a bathroom, a stair rule only if a stair is drawn. A check that cannot run for lack of data says so ("Ceiling height not set in Bath 2") instead of passing.
- Alterations: a rule applies to new work and to rooms that contain new or demolished objects. Existing conditions that are not altered show as notes, not warnings, except smoke alarms, which a permitted interior alteration triggers for the whole dwelling. An interior remodel is governed by the Florida Building Code, Existing Building, which applies new-construction rules to new and altered elements only.
- Every rule has verified\_by and verified\_at. Until a licensed person has checked a rule against the adopted code text, its warnings carry the tag "not yet verified" and Settings 15g lists it as unverified. The building rules below were checked on Oct 11, 2026 against the code text in the official online viewer, for both the 8th Edition (2023) and the 9th Edition (2026, for permits applied for after December 31, 2026). The 9th Edition keeps the 8th Edition section numbers for these rules; only R303.1 splits into R303.1.1 and R303.1.2, and the smoke alarm distances change. The electrical rules were checked against published summaries of the 2023 NEC, not the code book, because the NEC text could not be opened. Each rule still stores its section per edition, and a licensed person marks it verified.
- Local amendments and manufacturer instructions are outside the rule sets. Check is a warning to a licensed person, never a guarantee.

**Electrical rules (2023 NEC): first sample, superseded by the catalog**

| Rule | Applies to | Check | Section |
| --- | --- | --- | --- |
| E-01 Countertop receptacles | Each wall countertop space 12" or wider | No point along the wall line is more than 24" from a receptacle (48" at most between receptacles) | 210.52(C)(1) |
| E-02 Countertop receptacle height | Receptacles serving a countertop | Not more than 20" above the countertop | 210.52(C)(3) |
| E-03 Island and peninsula | Each island or peninsula top | 2023 NEC: a receptacle is optional; if none is drawn, the plan carries the note for a future receptacle. 2020 NEC: one receptacle for the first 9 sq ft plus one per further 18 sq ft | 210.52(C)(2) |
| E-04 Small-appliance circuits | Kitchen, pantry, dining room | At least two 20 A circuits serve the countertop and wall receptacles, with no other outlets on them except the refrigerator | 210.11(C)(1), 210.52(B) |
| E-05 GFCI | Receptacles in kitchens, bathrooms, laundry areas, garages, outdoors, within 6 ft of a sink, tub or shower. 2023 NEC: every kitchen receptacle, and the outlets for the dishwasher, range, wall oven, cooktop, dryer and microwave, cord-connected or hardwired. 2020 NEC: kitchen countertop receptacles and the dishwasher | Each is GFCI protected (device or breaker) | 210.8(A), 210.8(D) |
| E-06 Bathroom receptacle | Each lavatory basin | A receptacle within 3 ft of the outside edge of the basin; bathroom receptacles on a 20 A circuit | 210.52(D), 210.11(C)(3) |
| E-07 Wall receptacle spacing | Habitable rooms | No point along the floor line of a wall space 2 ft or wider is more than 6 ft from a receptacle | 210.52(A) |
| E-08 Hallways and foyers | Hallways 10 ft or longer; foyers over 60 sq ft | At least one receptacle in the hallway; one in each foyer wall space 3 ft or wider | 210.52(H), 210.52(I) |
| E-09 Laundry | Laundry area | At least one receptacle on a 20 A laundry circuit | 210.52(F), 210.11(C)(2) |
| E-10 AFCI | 120 V, 15 and 20 A circuits serving kitchens, family, dining and living rooms, bedrooms, closets, hallways, laundry areas and similar rooms (bathrooms and garages are not on the list); a circuit that is modified, replaced or extended more than 6 ft | The circuit is AFCI protected. 2023 NEC: 210.12(B) and (E); 2020 NEC: 210.12(A) and (D) | 210.12 |
| E-11 Dedicated circuits | Dishwasher, disposal, built-in microwave, range, cooktop, oven, refrigerator, bath heater-fan, hydromassage tub | Each is alone on its circuit. The list is a company setting in Defaults; the tub is a code requirement | 210.23, 422.10, 680.71; manufacturer instructions |
| E-12 Lighting outlets | Every habitable room, kitchen, bathroom, laundry area (2023 NEC), hallway and stairway | At least one lighting outlet controlled by a listed wall-mounted control | 210.70(A) |
| E-13 Tamper-resistant receptacles | All 15 and 20 A receptacles in the dwelling | Marked tamper-resistant in the device schedule | 406.12 |
| E-14 Tub and shower zone | The space 3 ft out from and 8 ft above a tub rim or shower threshold | No receptacle in the zone (the 2023 NEC allows one receptacle for an electronic bidet seat); no cord-connected, hanging or pendant fixture, no track light, and no ceiling fan with a light kit or metal parts in the zone; fixtures within the footprint of the tub or shower are damp rated, or wet rated where spray reaches them | 406.9(C), 410.10(D), 422.18(B) |
| E-15 Closet lights | Lights in clothes closets | 12" clear to the storage space for a surface incandescent or enclosed LED fixture; 6" for a surface fluorescent fixture and for any recessed fixture; a fixture identified for use inside the storage space may be there; no open-lamp or pendant fixtures | 410.16 |
| E-16 Panel location | Each panel | Clear working space 30" wide, 36" deep and 6'6" high; not in a bathroom, shower room or clothes closet | 110.26(A), 240.24(D), 240.24(E) |
| E-17 Voltage drop | Each circuit with a run length | Warning above the company threshold (default 3%). The NEC only recommends 3% on a branch and 5% overall | 210.19 and 215.2 informational notes (not enforceable) |

**Voltage drop formula** (Round 26, Claude)

Single-phase drop in volts = 2 x K x I x L / CM, and percent = volts / circuit voltage x 100. K is 12.9 for copper and 21.2 for aluminum. I is 80% of the breaker rating for a general circuit (16 A on a 20 A breaker) or the nameplate amps for a dedicated appliance circuit. L is the one-way run length in feet. CM is the conductor area in circular mils: 14 AWG 4,110; 12 AWG 6,530; 10 AWG 10,380; 8 AWG 16,510; 6 AWG 26,240. Circuit voltage is 120 or 240. Test value: 20 A breaker, 12 AWG copper, 58 ft, 120 V gives 2 x 12.9 x 16 x 58 / 6,530 = 3.67 V = 3.1%.

**Load calculation: worked example** (Round 26, Claude; the house on mockup 06)

This is the fixture the load calc engine must reproduce line by line. Section numbers are 2023 NEC. Josh's own hand calc for a real house stays the field check.

| Line | Input | VA |
| --- | --- | --- |
| General lighting, 220.41 | 2,450 sq ft x 3 VA | 7,350 |
| Small-appliance circuits, 220.52(A) | 2 x 1,500 | 3,000 |
| Laundry circuit, 220.52(B) | 1 x 1,500 | 1,500 |
| Subtotal |  | 11,850 |
| After demand, Table 220.45 | first 3,000 at 100% + 8,850 at 35% | 6,098 |
| Fixed appliances, 220.53 | dishwasher 1,200, disposal 960, microwave 1,500, water heater 4,500 = 8,160; four or more appliances fastened in place, each 500 W or more, so 75%. The refrigerator is covered by the small-appliance circuits and is not listed | 6,120 |
| Dryer, 220.54 | 5,000 minimum | 5,000 |
| Range 12 kW, Table 220.55 column C | one range not over 12 kW | 8,000 |
| Heating or cooling, larger of, 220.60 | heat strips 9,600 against cooling 4,200 | 9,600 |
| Largest motor at 25% | 4,200 VA motor | 1,050 |
| Total |  | 35,868 |
| Amps at 240 V | 35,868 / 240 | 149.5 A |
| Result | 200 A service | 75%, 50.5 A spare, OK |

Demand steps in Table 220.45: first 3,000 VA at 100%, the next 117,000 at 35%, the rest at 25%. Fixed appliances take 75% only when there are four or more fastened in place, each rated 1/4 hp or 500 W or more (2023 NEC); cooking equipment, dryers, space heating, air conditioning and EV chargers are never in that group. Largest motor: the example adds 25% of the air-conditioning compressor even though cooling is the smaller, omitted load. That is the conservative reading; the code text on this case is read two ways in practice, so the engine exposes the largest-motor choice as an editable line. Checked Oct 11 against published 2023 NEC summaries and worksheets, not the code book itself. The optional method for an existing dwelling (220.83) takes the first 8,000 VA of all other load at 100% and the rest at 40%, with new heating or cooling added at 100%.

**Load calculation: the five cases** (Round 26, Claude)

| Case | Inputs | Method | Output |
| --- | --- | --- | --- |
| 1. Circuits added to an existing panel | Existing panel data and circuits, existing large appliances, the new circuits | Existing load by 220.83, plus the new loads | Calculated amps against the service rating; open breaker spaces against the spaces needed; pass or fail |
| 2. Service upgrade | The whole dwelling as proposed | Standard method as in the worked example | Calculated amps and the next standard service size at or above it (100, 125, 150, 200, 225, 300, 400 A) |
| 3. Subpanel feeder | Only the loads served by the subpanel | Standard method on those loads | Feeder amps and the next standard breaker size |
| 4. Large add (EV charger, heat pump) | Existing dwelling plus the new load | 220.83 with the new heating or cooling at 100%; an EV charger at its nameplate or 7,200 VA, whichever is larger | Calculated amps against the service rating; pass or fail |
| 5. Like-for-like panel replacement | Existing circuits | No load calculation; states "No change in load; service unchanged" | Panel schedule and a check that the new panel has enough spaces |

**Building rules (Florida Building Code, Residential): first sample, superseded by the catalog**

| Rule | Applies to | Check | Section |
| --- | --- | --- | --- |
| B-01 Ceiling height | Habitable rooms and hallways; bathrooms, toilet rooms and laundry rooms | 7'0" in habitable rooms and hallways; 6'8" in bathrooms, toilet and laundry rooms; beams and girders spaced at least 36" apart may come down to 6'6" (6'4" only in a basement); under a sloped ceiling at least half the required floor area is at 7'0" and none of it under 5'0" | R305.1 |
| B-02 Ceiling height at shower | Showers and tubs with a showerhead | 6'8" over a 30" x 30" area at the showerhead | R305.1 |
| B-03 Room size | Habitable rooms other than kitchens | At least 70 sq ft and 7 ft in every horizontal direction; floor under a ceiling lower than 5 ft is not counted | R304 |
| B-04 Light and ventilation | Habitable rooms | Window glass at least 8% of the floor area and openable area at least 4%, unless the room is marked as mechanically ventilated and lit (9th Edition: R303.1.1 and R303.1.2) | R303.1 |
| B-05 Bathroom ventilation | Bathrooms and toilet rooms | A window of 3 sq ft with half openable, or an exhaust fan to the outdoors of 50 cfm (20 cfm if it runs continuously) | R303.3, Table M1507.4 |
| B-06 Kitchen exhaust | Kitchens | Where the kitchen relies on exhaust instead of 4% openable window area: 100 cfm (25 cfm continuous). A hood over 400 cfm needs makeup air; in a single-family house Florida allows up to 800 cfm without it when no gravity-vented appliance is in the conditioned space | R303.1, Table M1507.4, M1503.4 |
| B-07 Toilet clearances | Each toilet and bidet | Centerline at least 15" from a side wall, partition, vanity or tub, and 30" center to center from the next fixture; at least 21" clear in front | R307.1, P2705.1 |
| B-08 Lavatory clearances | Each lavatory | Centerline at least 15" from a side wall, partition or vanity and 30" center to center from the next fixture; at least 21" clear in front. The code gives no front clearance for a tub; the Defaults value applies there | R307.1 |
| B-09 Shower size and access | Each shower | At least 900 sq in inside with 30" in every direction; an access opening at least 22" clear; 24" clear in front of the opening | P2708.1, R307.1 |
| B-10 Shower and tub walls | Walls of showers and of tubs with a showerhead | A nonabsorbent finish to at least 6 ft above the floor | R307.2 |
| B-11 Safety glass in doors | Glass in swinging, sliding and bifold doors | Marked as safety glazing | R308.4.1 |
| B-12 Safety glass beside doors | Glass within 24" of either side of a closed door in the same plane, or on a wall at less than 180 degrees to it within 24" of the hinge side of an in-swinging door, with its bottom lower than 60" above the floor | Marked as safety glazing | R308.4.2 |
| B-13 Safety glass, large panes | Panes over 9 sq ft with the bottom lower than 18", the top higher than 36" and a walking surface within 36" | Marked as safety glazing | R308.4.3 |
| B-14 Safety glass in wet areas | Glass in or facing a tub or shower, bottom lower than 60" above the standing surface and within 60" of the water's edge | Marked as safety glazing | R308.4.5 |
| B-15 Emergency escape opening | Each sleeping room | An opening of at least 5.7 sq ft net clear (5.0 at grade), 24" high and 20" wide, with its sill no higher than 44" above the floor. A replacement window in an existing opening is exempt when it is the largest standard size that fits. Florida also lets the opening face a screen enclosure that has a screen door | R310.1, R310.2.1 to R310.2.3, R310.2.6 |
| B-16 Egress door | The dwelling | One side-hinged exit door with 32" clear width and 78" clear height | R311.2 |
| B-17 Hallway width | Hallways | At least 36" | R311.6 |
| B-18 Bathroom door, Florida | New dwellings only: a bathroom on the habitable grade level | A door with a 29" clear opening to at least one such bathroom | R320.1.1 |
| B-19 Smoke alarms | The dwelling, triggered by any permitted alteration | One in each sleeping room, one outside each sleeping area and one on each story; at least 3 ft from a bathroom door; clear of cooking appliances (8th Edition: 20 ft ionization, 10 ft with a silence switch, 6 ft photoelectric; 9th Edition: 10 ft for every type, 6 ft where needed to place a required alarm). The 9th Edition adds an attached garage and a room open to a sleeping loft. Exterior-only, plumbing and mechanical work do not trigger it. Ten-year sealed-battery alarms are allowed for a repair or Level 1 alteration | R314.2.2, R314.3, R314.3.1, R314.6 |
| B-20 Carbon monoxide alarms | New buildings and additions with a fuel-fired appliance, a fireplace or an attached garage (an interior alteration alone does not trigger it) | One within 10 ft of each sleeping room | R315; Florida Statutes 553.885 |
| B-21 Garage separation | Walls and doors between a garage and the dwelling | Door of 1-3/8" solid wood or steel, or 20-minute rated; no opening from a garage into a sleeping room; 1/2" gypsum board on the garage side | R302.5, R302.6 |
| B-22 Clearance above a cooktop | Cabinets and combustibles above a range or cooktop | At least 30" to unprotected combustibles, or less where the listing of the hood or appliance allows; over gas, 24" with the protection the code specifies | M1901.1, G2447.5 |
| B-23 Dryer exhaust | Dryer duct, when drawn | Not over 35 ft less the deduction for each bend | M1502.4.5.1 |
| B-24 Stairs | Stairs, when drawn | Width 36", headroom 6'8", riser no more than 7-3/4", tread at least 10" | R311.7 |
| B-25 Lighting efficacy | Permanently installed light fixtures | Every fixture, except lights inside kitchen appliances, is at least 45 lumens per watt or uses lamps of at least 65 lumens per watt (from the fixture schedule) | FBC Energy Conservation R404.1 |

The bath clearance values that Round 3 put in Defaults now start at these code minimums; the owner can raise them but a value below the code minimum is refused. Bearing-wall removal (engineer note) and the pre-1978 lead flag stay as separate rules. Not covered in v1, because the model does not hold the data: structural and wind design, plumbing pipe sizing and venting, gas piping, mechanical duct sizing, energy envelope calculations and flood requirements. Check lists these as "not checked by EZ Draft".

**Geometry and drafting rules**

- Dimensions to finished face (drywall to drywall).
- Moving a wall stretches connected walls so corners stay joined; dimensions update live. Hosted items (doors, windows, cabinets, devices) do not move with it.
- Room closure: typed lengths must add up. A gap is shown; you pick the wall that absorbs it or override.
- One tolerance setting covers scan-vs-typed conflicts and field measurements.
- Display precision: 1/2" on plans, 1/16" on details.
- Bearing walls: removing or opening is blocked until an engineer note is attached.
- Sloped ceilings cut the tops of walls under them in plan, elevations and 3D. Bath clearance checks (Round 3, warnings only): toilet, lavatory, tub and shower clearances and shower size, with values set by the owner under Defaults and checked by Check.

**Cabinet rules**

- Auto-fill uses 3" increments plus fillers at walls and appliances.
- Run total vs wall length: fits when the difference after fillers and scribe is within the fit tolerance in Defaults; otherwise flagged.

**Countertop rules**

- Area per piece and total in square feet; exposed edge length in linear feet (status bar).
- Presets: Flush 0, Standard 1 1/2", Bar 10", Seating 12", Wall + backsplash. Typical ranges: seating 6"–12", regular 1"–2".
- Seating overhang beyond the support limit adds brackets to a detail and shows a notice. The limit is a company setting. Countertop documents are internal and client only, never in permit sets.
- Edge profile applies to exposed edges only; wall edges take backsplash.

**Ceiling and lighting rules**

- Can auto-layout by count, spacing, or light-level target.
- Keep-clear warning when a can lands on a joist or beam, only where joist or beam locations are known.
- ACT borders balanced: edge tiles at least half a tile.
- Fan blade clearance to walls and beams checked.

**Sheet set rules**

- Auto-built set, decimal numbering. Plan doc numbering: A0.0 Cover + index + key, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Interior elevations, A5.0 Details, A6.0 Reflected ceiling plan, E1.0 Electrical plan, E2.0 Panel schedule + load calc, R1.0 Finish schedule + renderings. Decided Oct 11: this plan doc set is the default; the Sheets mockup order is to be corrected.
- Scales per viewport: 1/4" = 1'-0" plans, 1/2" = 1'-0" elevations; details true scale or NTS.
- Text prints at fixed paper sizes at any scale: minimum 3/32" on 24×36; labels and dims one size up from notes.
- Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders thinnest.
- Key: the full symbol and abbreviation library is held in the system; each set shows only the symbols and abbreviations used, updated as objects are added or removed. The user chooses per set whether the key goes on every sheet or on the cover only.
- Title block: project address, parcel, owner, code edition, scope of work, revision block, a blank seal box and a separate blank department approval stamp area; logo, license and contact on/off. Permit sheets are English only.
- Issue gate: code check reviewed (fixed or noted), no red/orphan flags, title block complete.
- NTS details stamped "NTS"; typed-override dimensions underlined.
- Detail legibility warnings: leaders crossing each other, labels on linework.

**Revision rules**

- Before permit, each send to the client is "Version N". Rev 0 = first issued permit set, locked; later issues are Rev 1, 2… with no cap. Every sent version is frozen; editing continues on a working copy.
- Changes are gathered and numbered only when the set is next sent to the client or department.
- Changed objects get clouds and a delta tag automatically; revision block and log update on every sheet.

**Takeoff rules**

Formulas (Round 26, Claude). Every number named here is a Defaults value the owner can change; quantities round up to whole units.

| Quantity | Formula | Defaults used |
| --- | --- | --- |
| Floor tile | Room floor area less the footprint of base cabinets and tubs, x (1 + waste). Boxes = SF / the catalog item's coverage per box | Waste by pattern; 10 SF per box when the item has none |
| Wall tile | Area of each wall face marked for tile to its set height, less openings, x (1 + waste). A tile shower adds its walls, niche faces, bench and curb | Waste by pattern |
| Drywall | (Both faces of new walls + new ceiling area + patches marked on existing walls) x (1 + waste) / sheet area | Sheet 4 x 8 (32 SF); waste 10% |
| Paint | Wall area of rooms with new work, less openings over 20 SF, plus ceilings marked for paint. Gallons = SF x coats / coverage | 2 coats; 350 SF per gallon |
| Base trim | Room perimeter less door widths, x (1 + waste) | Waste 10% |
| Casing | Per opening: 2 x height + width, each side that is trimmed | none |
| Countertops | SF per piece and exposed edge LF, as on screen 04b | none |
| Cabinets, fixtures, devices | Counts by code or size, by type and by device type | none |
| Wire | Per circuit: the path along walls from the panel to the first device and on to each next device, plus the rise from each device height to the ceiling and back down, x (1 + slack) | Slack 15% |
| ACT tile | Count of grid cells in the laid-out grid, full and cut, x (1 + waste) | Waste 5% |
| ACT mains | Room dimension across the mains / main spacing, rounded up, x run length / 12 ft pieces | Mains at 4 ft |
| ACT cross tees | 4 ft tees at 2 ft on center between mains; for a 2 x 2 grid, one 2 ft tee per 4 ft tee | none |
| ACT wall angle | Room perimeter / 12 ft pieces | none |
| Hanger wire | One per 4 ft along each main | 4 ft spacing |

- Quantities: floor and wall tile SF with waste, drywall sheets, paint SF, trim LF, countertop SF and edge LF, cabinet count by size, fixture and device counts, estimated wire runs, ACT tiles, mains, cross tees, wall angle, hanger wire.
- Waste factor default per material, adjusted by pattern (straight, diagonal, herringbone), editable per project.
- Tile: layout preview (pattern, start point, visible cuts on elevations and 3D) and quantities in SF and boxes; no cut list in v1.

## Permissions and settings

Permissions are per user from day one: Settings → Users → each user has a checklist. Role presets only pre-tick boxes; any box can be changed per person. Every control in section 4 names the permission that gates it. A control the user lacks is hidden (decided Oct 11).

**Permission checklist and preset defaults**

✓ = ticked by the preset, — = not ticked. Clients are not a preset; they act through the share link. Foreman and Crew defaults for Add markup, Edit field tasks, Check off tasks, Photo notes and Flag conflict were set by Claude (Round 24).

| Permission | Owner | Designer | Foreman | Crew |
| --- | --- | --- | --- | --- |
| View projects | ✓ | ✓ | ✓ (own jobs) | ✓ (own jobs) |
| Create projects | ✓ | ✓ | — | — |
| Edit model | ✓ | ✓ | — | — |
| Delete projects | ✓ | — | — | — |
| Run fast renders | ✓ | ✓ | ✓ | — |
| Run standard renders | ✓ | ✓ | — | — |
| Run photoreal renders | ✓ | ✓ | — | — |
| Approve renders | ✓ | ✓ | — | — |
| Mark client-ready | ✓ | ✓ | — | — |
| See company costs | ✓ | ✓ | ✓ | ✓ |
| See sell prices | ✓ | ✓ | — | — |
| Edit catalog | ✓ | ✓ | — | — |
| Issue permit sets | ✓ | — | — | — |
| Issue revisions | ✓ | — | — | — |
| Send to client | ✓ | ✓ | — | — |
| Create change orders | ✓ | ✓ | — | — |
| Approve field measurements | ✓ | ✓ | — | — |
| Export (PDF / DXF / GLB / CSV) | ✓ | ✓ | ✓ | — |
| Approve translations | ✓ | ✓ | ✓ | — |
| Run code check | ✓ | ✓ | — | — |
| Upload references | ✓ | ✓ | — | — |
| Add markup | ✓ | ✓ | ✓ | — |
| Flag to supplier | ✓ | ✓ | — | — |
| Edit field tasks | ✓ | ✓ | ✓ | — |
| Check off tasks | ✓ | ✓ | ✓ | ✓ |
| Photo notes | ✓ | ✓ | ✓ | ✓ |
| Flag conflict | ✓ | ✓ | ✓ | ✓ |
| Send field measurement | ✓ | ✓ | ✓ | — |
| Manage users and settings | ✓ | — | — | — |

Owners can add unlimited custom roles, each with its own default checklist. No user limit in v1.

**Company settings**

| Area | Settings |
| --- | --- |
| Company | Name, logo, license number, contact, address |
| Users + permissions | Invite, role preset, permission checklist, language (English / Español), project scope, deactivate |
| Title block | Fields, logo/license/contact on/off, seal box, revision block layout |
| Sheet presets / submittal profiles | Per department: file naming, permit sheet size 24×36 (11×17 only for client and field sets), required notes, who signs (none, EC, architect), file split, naming template, flatten, stamp box size and position, resubmittal mode, minimum scale |
| Defaults | Everything on 15d: units display, precision, increments, the one measurement tolerance, high-confidence cutoff, fit, reference and leader tolerances, overhang presets and support limit, ACT border, fan clearance, light-level targets, load and voltage-drop thresholds, bath clearances, walk eye height, detail scales, waste factors, recently-added window, version cleanup, lock release, share-link expiry and reminder, webhook retries, keyboard shortcuts |
| Code | Default code edition (2023 NEC / FBC 9th ed.) |
| Catalog | Categories, allowance categories, markup per category, edge profile library (price per LF is entered per top in 04b) |
| Libraries | Symbols and abbreviations, notes (general and code notes per project type), details, hatches, reusable parts, saved groups |
| Render | Model per tier (Fast, Standard, Photoreal), cost per render in dollars, render allowance with auto-refill, local GPU worker (preferred) on/off |
| Translations | Reviewer, "Hold issue until translations are approved" (off by default) |
| Field | Trade-sequence template per room (demo → rough-in → inspection → drywall → finish) |
| Input | iPad drawing: Pencil only or finger |
| Notifications | In-app and email for everyone, each email with a Copy link; no per-user notification settings in v1 |
| Billing | Hidden for tenant 1 in v1 (v2) |

## Non-functional requirements

The app must stay responsive on Josh's iPad with dense architect DXFs, keep working offline on site, and run for about $80–$110 a month for Worth Properties alone.

**Performance**

The app must feel instant: every tool, drag, pan, zoom and tab switch responds in the same frame, and saving never makes the user wait. These rules apply to every ticket from Phase 0 and are checked automatically by the performance check (EZD-017); they are not left to the hardening phase. In CI the gate is on countable things that do not depend on a GPU: React commits during a pan, draw calls per frame, buffers rebuilt per edit, long tasks, rows written per save and download size. Frame times are recorded as a trend, and the real frame-time test is the benchmark page (EZD-237) Josh runs on the iPad at each field check (Round 26). The budgets are starting values (Claude, Oct 11 performance audit) and are tuned against the real iPad.

**Budgets**

Measured on the benchmark project: a whole-home model of 3,000 objects, a 150,000-entity reference DXF and 40 renders.

| What | Budget |
| --- | --- |
| Pan, zoom, drag, draw | A frame every 16 ms on desktop (60 fps) and every 33 ms on the iPad (30 fps); no frame over 100 ms |
| Tool pick, selection, typed length commit | On screen within 50 ms |
| Switch Plan / 3D / Sheets / Render | Within 150 ms once that view has been opened; first open of 3D within 1 second |
| Open a project | Within 1 second when it is cached on the device; within 2.5 seconds cold on broadband |
| Projects page | First cards within 1 second |
| Save | Never blocks editing; an autosave of a normal edit completes within 300 ms |
| Download size (compressed JavaScript) | Projects and Settings 200 KB; editor before its lazy parts 500 KB; client link and field pack 200 KB each, with no editor or 3D code in them |

**Rules**

1. Edit locally first. The open model lives in memory in the browser. Every edit applies there at once and the screen updates from it. The network is used only by autosave, which sends just the changed objects a few seconds after the last edit (see Data model, Working copy and saves). Undo keeps patches, not copies of the model.
2. Recompute only what changed, and only what is on screen. Dimensions, room areas and run totals update for the objects touched. Schedules, the symbol key, the load calc, takeoff and the code check are computed in the browser when their panel, sheet or Check is opened, and at send or issue. The server recomputes nothing on a save.
3. Keep heavy work off the main thread. Clipper booleans, DXF parsing, takeoff, load calc, sheet SVG building, PDF and GLB writing and thumbnails run in Web Workers or background jobs.
4. Draw in batches. One persistent WebGL canvas and renderer for the whole editor: Plan, 3D, the Render model view and the inspector preview are scenes drawn into it, and a tab switch never creates or destroys a WebGL context (Round 26). It is drawn only when something changes (no idle animation loop). Geometry is merged per layer and type, repeated symbols are instanced, and text uses one glyph atlas. There is no React component per wall, device or DXF entity. A drag changes vertex buffers directly, with no React render per pointer move. Picking and snapping use a spatial index, not a scan of every object.
5. Reference DXFs are static. Each layer is parsed once in a worker into merged line buffers, cached on the device and loaded only when the layer is visible. Text and hatches are hidden below a zoom threshold.
6. 3D is built on the first open of the 3D tab and then updated per changed object. Wall openings are made by extruding the wall face with holes; three-bvh-csg is used only where that cannot express the shape, and its result is cached per wall. Textures are at most 1024 px on the iPad. The inspector's live 3D preview redraws on selection change only and shares the main renderer; there is no second WebGL context.
7. Load code on first use. The 3D scene, path tracer, pdf.js, DXF parser and writer, Detail editor, Sheets, Settings and the catalog drawer are separate chunks. The phone field pack and the client link are separate entry points; the phone loads Three.js only when its 3D tab is opened.
8. Fonts and icons are self-hosted: subsets of Instrument Sans and DM Mono, and an SVG sprite of the icons actually used instead of the Material Symbols font file.
9. Lists never load everything. Any list that can pass 50 rows is paged or virtualized (projects, catalog, translations, versions, notifications, event log, DXF entity lists). List queries never select model data. Counts on cards and pills come from stored counters, not from counting across tables on each load.
10. Database: an index on tenant\_id and on project\_id on every table that has them. Row-level security reads the tenant from the session claim once per query instead of joining membership on every row.
11. Push, not poll. Lock state, presence, job progress, notifications and review counts arrive over Supabase Realtime.
12. Images are made once and served small. Plan thumbnails are made at checkpoints, not on every edit. Each render is stored at full size plus 400 px and 1600 px copies; lists, the gallery, the client link and the field pack load the copies.
13. Open from the device first. A project opened before is shown from the local copy and then brought up to date; static files are cached by the service worker.

**Also**

- Test on the actual iPad early: Safari memory limits can crash large 3D scenes; keep models light.
- Exports, imports, renders and AI reads run in the background queue and never block the editor.
- DXF size limits are set after testing real architect files.

**Where each output is produced** (Round 26)

"Nothing is recomputed on the server when the model saves" stays true for saves. At a send or an issue the server does run the calculations, so a stored result never depends on one person's browser.

| Output | While editing | At send or issue |
| --- | --- | --- |
| Schedules, symbol key, takeoff, load calc, code check | Browser (worker), from the geometry package, for what is on screen | Re-run on the server from the checkpoint by the same geometry package, then stored |
| Sheets | Browser, from the drawing list, as SVG | PDF written on the server from the drawing list with PDFKit |
| GLB and USDZ, render guide images, thumbnails | Browser (they need WebGL), then uploaded | The job only stores and resizes what was uploaded |
| Sheets and renders on the client link | not applicable | Page images and PDFs made at send; the client link loads no editor or 3D code for sheets |
| Render "model changed" comparison | Not on autosave | Runs at each checkpoint |

**Operations** (Round 26)

- Environments: local (agents and tests), dev (cloud, preview deploys) and production. Preview deploys use the dev database.
- Releases: production is updated only by promoting a tagged build at a phase gate or on Josh's approval. A script takes a database dump before each promotion.
- Migrations add before they remove: a release never drops or renames something the previous release still reads, so the previous deploy can be restored at any time.
- Rollback is Vercel's previous deployment.
- Errors in the browser, the functions and the render worker go to Sentry; a new error, a failed job or a failed webhook emails the owner.
- A System status page in Settings shows recent job failures, webhook failures, the last backup and the last restore drill.
- The job queue claims each job with a row lock and a lease that expires, so a job is never run twice at once and a dead run is picked up again. Job handlers can be run twice safely. Job inputs and outputs are Storage paths, never request bodies; browser uploads go straight to Storage with resumable signed uploads.
- Row-level security reads the active tenant from a claim set by a token hook; deactivating a user or changing their project scope ends their sessions. A CI test fails when any table lacks a policy or its tenant and project indexes.

**Offline**

- Field pack and the current project are cached by the service worker after first load.
- The lock holder can keep editing offline; changes queue on the device (`offline_change`) and sync on reconnect the same way as an autosave, followed by one checkpoint. If the lock was released while the holder was offline, sync detects conflicts with later changes and shows the holder a conflict list to resolve; nothing is overwritten silently.
- Status shows queued change count. If a device is lost before sync, its queued changes are lost; the last synced version remains (Claude).

**Security and audit**

- Supabase Auth; row-level security on every table by `tenant_id`; clients and crew limited to their projects.
- Magic links for crew (link plus 6-digit code), each with a Copy link fallback; clients use the share link; shared sign-on with EZ Binder. Clients verify by typing their customer-profile email before signing.
- Share links: random token, 30-day expiry, renewable, revocable.
- Webhooks HMAC-signed; inbound API authenticated per tenant.
- Event log for approvals, issues, lock changes, permission changes, deletes: actor, action, object, time, IP.
- *Company costs are never sent to client views. Other users get company costs only with See company costs and sell prices, markup and totals only with See sell prices (Round 26 R2)*.
- Terms of service state the app does not certify code compliance; responsibility stays with the licensed user.

**Data retention**

- Unsent working versions auto-delete at 30 days unless ticked to keep on the cleanup sheet (preview image per version; 7-day grace if ignored). Sent versions and named snapshots are permanent.
- Source files kept unchanged for the life of the project.
- Backups: Supabase Pro daily database backups (kept 7 days; they do not include stored files), plus a nightly copy of new stored files and a weekly database dump to a second provider (EZD-025). A restore drill runs before the first real job is entered and again in Phase 17; point-in-time recovery can be added when other companies use the app (Claude).

**Accessibility and input**

- Mouse, trackpad, Apple Pencil and touch. iPad touch targets at least 44 px.
- All icon buttons have labels and tooltips; keyboard shortcuts for rail tools.

**Running cost (Worth Properties only, estimate)**

| Item | Monthly |
| --- | --- |
| Supabase Pro | $25 |
| Vercel Pro | \~$20 |
| AI renders (e.g. 300 fast at \~$0.03 + 40 photoreal at \~$0.15) | \~$15 |
| AI text (catalog, translation, CO drafts) | \~$10 |
| Extra storage | $0–$10 |
| Email | $0 |
| **Total** | **\~$80–$110** |

One-time or occasional: domain \~$15/yr; Polycam Business if not already held; a keyboard-mode laser if needed; DWG via ODA $7,500 first year and $4,500/yr after (deferred). Prices as of Sep–Oct 2026; recheck before build. The rows above add up to about $70 to $80; a second Supabase project for development, CI minutes, error reporting and off-site file backup are not listed and are confirmed at the cost check in the Phase 17 field check (Round 26).

## Build phases and acceptance tests

There is no schedule. The build is split into phases and tickets in the Phases and tickets tab (Phases and tickets); each phase ends with a gate. The acceptance tests below apply across phases.

**Acceptance tests (minimum per area)**

| Area | Test |
| --- | --- |
| Measurement entry | Each of `12'6"`, `12' 6 1/2"`, `150"`, `12.5'` stores the same value as its inch equivalent to 1/16"; laser keyboard input fills the focused field |
| Room closure | A room typed 1/2" short shows the gap; choosing a wall closes it; override keeps it open and logged |
| Wall move | Dragging a wall keeps corners joined and leaves hosted items in place, flagged red when off a wall |
| Selection | Repeated clicks on an outlet over a cabinet over a wall cycle outlet → cabinet → wall |
| Edit lock | Second user sees amber banner with holder and time; Request edit prompts holder; no answer for 5 min saves and releases; banner turns green |
| Offline | Holder edits offline, reconnects; all queued changes sync as autosaves and one checkpoint version follows, with no loss; if another user changed the same object meanwhile, the holder gets a conflict notification and chooses Keep mine or Keep theirs per object |
| Import | Low-confidence items highlighted; nothing enters the model before accept; typed override lists conflicts |
| Cabinets | Auto-fill of a 117 1/2" wall yields boxes in 3" increments plus filler, total shown vs wall |
| Countertops | Trace creates pieces; 12" seating side adds brackets notice; exposed LF matches hand count |
| Electrical | Load calc reproduces a hand calc for a sample house within rounding; Check lists missing GFCI and dedicated circuits |
| RCP | ACT grid borders never below half tile; lights on RCP appear on E1.0 with the same circuit |
| Sheets | Key shows only used symbols; issue blocked by an orphan flag; PDF prints to scale (check dimension measures true) |
| Revisions | Edit after Rev 0, send to client → Rev 1 with clouds on exactly the changed objects |
| Render | Render button disabled until an angle is chosen; unapproved renders never reach the share link |
| Client | Signature logs name, date, IP; approval locks the version; link expires at 30 days and renews |
| Field | Field measurement changes the model only after approval; conflict notifies office. In 17b a room with one wall left blank auto-fills it, a closure error over tolerance shows amber, and sent rooms appear in Import review and become existing walls and a room on accept |
| Translations | Editing an approved phrase updates every use; Spanish users see Spanish whether reviewed or not; the hold setting only blocks set issue |
| Permissions | Unticking *See co*mpany costs removes every company cost, and unticking See sell prices removes every sell price, markup and total, from that user's views and exports |
| Webhooks | Each outbound event is signed, retried on failure, and logged |
| Performance | On the benchmark project every budget in section 10 holds in the automated check: frame times while panning, zooming and dragging a wall, project open, tab switch, autosave time and download size per entry point; a save writes only changed objects and triggers no server recompute |

## Decisions and remaining items

All cross-cutting questions were answered on Oct 11, 2026 (Round 24). Josh answered the product decisions; Claude made the small ones at Josh's request (marked *Claude*). Screen-level details in section 4 are resolved the same way. These decisions override anything earlier in this spec.

**Scope, naming, hosting**

| # | Decision |
| --- | --- |
| 1 | Name: EZ Draft. Address: ezdraft.ezcontractorbinder.com (a subdomain added in DNS, pointing to the hosting provider). |
| 2 | RCP is v1. |
| 3 | Photoreal render and reference DXF revision diff are v1. |
| 4 | Version cleanup: unsent working versions auto-delete at 30 days. Before deleting, a cleanup sheet lists them with a preview image of each; the user ticks what to keep. Kept versions become named snapshots. If the sheet is ignored, unticked versions delete after 7 more days. |
| 4a | Version numbers belong only to what is sent to another party (client, department, EZ Binder). Internal saves are working versions, not numbered. Sent versions are permanent. |
| 50 | Local GPU render worker is preferred over cloud rendering; cloud is the fallback when the worker is off. |
| 51 | No schedule. The build is split into phases and tickets, worked as time allows (section 11). |

**Sheets and issue**

| # | Decision |
| --- | --- |
| 5 | Countertop plan, edge detail and top schedule are internal and client documents only. They are not in permit drawings. |
| 6 | One PDF file per set. |
| 7 | Two blank areas: seal box and department approval stamp. |
| 8 | Symbol key placement is chosen by the user per set (every sheet or cover only). |
| 9 | Permit sheets are English only. |
| 10 | "All dimensions typed" is a warning in the issue checklist, not a gate. It means some dimensions still come from a scan or scaled PDF rather than typed or laser entry. The user can dismiss it with one click, and it clears when the set is issued (Round 25). |
| 26 | Client sends before permit are labeled "Version N"; permit issues are "Rev N". Both count up with no cap. |
| 42 | Worth Properties prepares and submits its own drawings under its license. The terms-of-service disclaimer stays for other tenants. |
| 43 | Departments accept the GC load calc. Keep the optional EC signature block. |
| 48 | Checked: see Department submittal rules in section 7. One PDF per set stays the default, with a Download one page at a time option. The version stays in the file name by default; users rename locally when a department wants the original name. Stamped permit sets export full size, 24×36 (ARCH D) (Round 25). |

**Permissions and users**

| # | Decision |
| --- | --- |
| 11 | All proposed permissions are added: Approve renders, Mark client-ready, Edit field tasks, Run code check, Upload references, Add markup, Flag to supplier, Check off tasks, Photo notes, Flag conflict, Send field measurement, Run standard renders. |
| 12 | Designer preset ticks every permission except Delete projects, Issue permit sets, Issue revisions and Manage users and settings. |
| 13 | "Field lead" is renamed **Foreman**. Foreman preset also ticks fast renders, export and approve translations. |
| — | Presets: Owner, Designer, Foreman, Crew. Unlimited custom roles. No user limit until a paywall. Controls a user lacks are hidden. |
| 14 | Users are invited in EZ Draft. If EZ Binder is connected, an option syncs users. The apps stay separate. |
| 15 | Every user must have an email. Everything sent by email also shows a Copy link button, because email from the new domain may land in spam. |
| 20 | Who can approve renders and mark them client-ready is set per role. |

**Edit lock and versions**

| # | Decision |
| --- | --- |
| 16 | Two separate things. (a) The edit lock covers every change to the model, sheets, options and markup; viewing, commenting and running renders do not need it. (b) A send freezes that version permanently; users keep editing a working copy without losing the sent one, and the next send creates a new version for a new signature. |
| 17 | The lock holder releases with a **Stop editing** button in the header, or by closing the project. Both save first. |
| — | Auto-release after 5 minutes does not pause offline. On reconnect the former holder gets a conflict notification listing every clash to resolve. |
| — | After release the lock is free for anyone; first to press Start editing gets it. |

**Render**

| # | Decision |
| --- | --- |
| 18 | Costs show in dollars, not credits. No hard limit: the company sets an allowance in settings that auto-refills when used up and notifies the owner. Real per-render costs to be measured during testing. |
| 19 | New permission: Run standard renders. |
| — | Tiers: Fast, Standard, Photoreal. Two-step approval: Approve, then Mark client-ready. |
| 21 | The four ways to direct a render (tap surface, type, paint mask, from model) are in Step 2. |
| 22 | A render is marked "model changed" only when an object or finish visible in its camera view changes. It shows as a badge on the render and in the review pill, not as a prompt at save; keep / outdated / hide is chosen per render. |
| 23 | Camera matching is optional. A site photo plus a text instruction renders with no alignment step. Alignment is offered only when exact placement matters. |
| 49 | Model choice per tier is tested as real jobs come in. |

**Revisions and change orders**

| # | Decision |
| --- | --- |
| 24 | A change order can be drafted and sent together with its revision. |
| 25 | Cost and schedule data on a change order are typed by the user. Import from EZ Binder may come later. |
| — | COs reach EZ Binder only when Send is pressed. |

**Field**

| # | Decision |
| --- | --- |
| 27 | Remove "Laser connected" and battery labels. |
| 28 | Send measurement and Flag conflict are separate buttons. |
| 29 | Office is notified when field measurements arrive and approves them on a Field measurements review screen. |
| 30 | One tolerance setting covers field measurements and scan-vs-typed conflicts. |
| 31 | Queued phone actions against an older revision are flagged as conflicts when the phone reconnects. |
| 47 | Build laser keyboard-mode input in v1. |

**Client**

| # | Decision |
| --- | --- |
| 32 | Before signing, the client verifies by entering the email on their customer profile. Customer list syncs both ways with EZ Binder. |
| 33 | Edge profile price shows as a total. |
| 34 | Printed name is required with the signature. |
| — | Approval requires selecting items and signing. The client may sign with some selections still open. |

**Electrical**

| # | Decision |
| --- | --- |
| 35 | Check (code check) is a button on the left tool rail, available on every editor tab, not only Electrical. |
| 36 | Device height notes are an option per device, off by default. |
| 37 | Voltage-drop warning included; threshold is a company setting. |
| 38 | Optional load-calc method is a toggle per calc. |

**Translations**

| # | Decision |
| --- | --- |
| 39 | Reject opens the phrase for manual entry or edit. |
| 40 | Spanish users always see Spanish, reviewed or not; never English or blanks. The hold setting only holds set issue. |
| 41 | Editing a phrase is approving it. Issued sets do not change. |

**Values**

Every threshold, tolerance, limit, waste factor and shortcut is a company setting under Defaults, entered by the owner.

**Performance and build method (Oct 11, second audit)**

| # | Decision |
| --- | --- |
| P1 | The app is built to feel instant from Phase 0. The budgets and rules in section 10 (Performance) apply to every ticket and are checked automatically on every commit. Priority set by Josh; budgets and rules by Claude. |
| P2 | Saves: the working copy is stored one row per object and autosaved as changed objects only. Whole-model versions are written only at checkpoints (Stop editing, close, send, issue, snapshot, Revert, Finish import). This replaces one version row per save. (Claude) |
| P3 | Nothing is recomputed on the server when the model saves. Schedules, key, load calc, takeoff and code check are computed in the browser for what is on screen and stored only when a version is sent or issued. (Claude) |
| P4 | Background jobs run from a Postgres job table as Vercel Functions; progress reaches the browser over Supabase Realtime. (Claude) |
| P5 | Every phase gate has an automated build gate and a separate field check by Josh. The field check does not block the next phase. (Claude) |
| P6 | The EZ Binder integration is built and tested against a written contract and a stub server. The EZ Binder side is separate work in its own repo. (Claude) |

**Round 26: build-readiness audit (Oct 11)**

Josh's answers are marked Josh; the rest were decided by Claude at Josh's direction to resolve every audit item. These override anything earlier in this spec.

| # | Decision |
| --- | --- |
| R1 | The browser never reads or writes tables directly; all access goes through server routes that check permissions, with row-level security as the backstop. Money fields are kept separate so who sees them is one setting. See Data model, Architecture rules 1 and 2. (Claude) |
| R2 | Money has two permissions (Josh): See company costs covers what the company pays (catalog cost, takeoff and order-line costs, option cost lines, change-order cost deltas, render cost and allowance dollars); See sell prices covers what the client is charged (sell price, markup, allowance amounts, edge-profile price differences, change-order overhead, profit and total). Owner and Designer have both; Foreman and Crew have See company costs only. This replaces the single See costs and prices permission everywhere. |
| R3 | Everything that prints on a sheet or is in a signed package is versioned with the model in v1: sheets, viewports, countertops, panel and circuits, detail instances, option changes. (Josh) |
| R4 | The model schema is defined once, versioned, validated on every save and upgraded on read. (Josh: build it) |
| R5 | Saves carry a lock generation and checkpoints are built on the server, so a sleeping device cannot save over the next editor. A non-holder may send from a server checkpoint with a notice. (Claude) |
| R6 | One device outbox from Phase 1; offline is the same save path. When synced changes conflict with what another user did to the same object, the user gets a notification and resolves each with Keep mine or Keep theirs. (Josh) |
| R7 | One drawing list feeds the plan canvas, the on-screen sheet and the PDF; PDFs are written with PDFKit. Proven by a Phase 0 spike before any sheet work. (Claude, at Josh's direction) |
| R8 | Calculations run in the browser while editing and are re-run on the server at send or issue. See Where each output is produced. (Claude) |
| R9 | Five throwaway spikes run right after Phase 0 (EZD-027 to EZD-031): the plan canvas with a 150,000-entity drawing on the iPad, the PDF path, the DXF parser on a real architect file, wall openings with a sloped ceiling, and a render trial. Each ends in a go or no-go note. (Claude) |
| R10 | CI gates on counts that need no GPU; Josh runs the benchmark page on the iPad at each field check. (Claude) |
| R11 | Named tools and a conventions file (EZD-000) that every build session reads. (Claude) |
| R12 | Environments, promotion-only production releases, add-before-remove migrations, Sentry, a System status page. (Claude) |
| R13 | Stored files are backed up nightly to a second provider; the restore drill runs before the first real job. (Claude) |
| R14 | Client link: server routes with a field list, private files, hashed tokens, rate limits. The signer check stays as Round 24 #32 with an attempt limit. A 6-digit emailed code at signing remains an option if stronger proof is wanted. (Claude) |
| R15 | Crew sign-in email carries a link and a 6-digit code, because a link opened from email does not sign in the installed app on iPad or iPhone. The EZ Binder sign-on exchange is a single-use 60-second code swapped on the server for a session, defined in the contract. (Claude) |
| R16 | DXF: one parser for imports and references, chosen in the spike; unsupported entity types are counted and shown per reference as "N entities of type X not drawn". The promise is all supported entity types, not 100% of every file. (Claude) |
| R17 | Interface language: the field pack and the other phone screens for crew are available in Spanish, buttons and messages included; the office editor and the client link are English in v1. Every interface string goes through one message helper from Phase 0. (Claude) |
| R18 | The cloud render API is the primary path until the GPU test passes; the local worker protocol is still built in Phase 11, with its own revocable key. This narrows Round 24 #50, which stays the goal. (Claude) |
| R19 | Code check covers every building code relevant to what is drawn: the 2023 NEC and the Florida Building Code, Residential, as rule sets in Calculations, with more volumes added the same way. Rules are written in our own words with section numbers and links to the publishers' free viewers; code text is not copied. Every rule is unverified until a licensed person checks it. (Josh for the scope; Claude for the method and the rule list) |
| R20 | Voltage-drop formula, the load calc worked example, the five load calc cases and the takeoff formulas are in Calculations. (Claude) |
| R21 | First image-model adapter: Google's Gemini image-editing API; a second adapter (OpenAI image edits) is a follow-up ticket. Model per tier is still chosen by test (Round 24 #49). (Claude) |
| R22 | Option cost lines are typed by the user, as for change orders (Round 24 #25). Option A is the current design; B and C start as copies. (Claude) |
| R23 | Cabinet seed line until a real vendor line is entered: B, DB, SB and W in 3" steps from 9" to 36", fillers 3" and 6". (Claude) |
| R24 | Interior elevations are generated for every wall that hosts a cabinet, fixture or tile shower; any other wall is added with Add elevation. (Claude) |
| R25 | A non-Polycam DXF layer is converted with the same detector as Polycam imports, after the user maps layers to walls, doors and windows. (Claude) |
| R26 | Saved groups other than cabinets are placed from a Saved section in the Fixtures panel. (Claude) |
| R27 | The job-feed ticket is removed; EZ Binder gets notifications through the existing events. (Claude) |
| R28 | Scope of work is a project field entered in the New project wizard and Project settings; it prints in the title block. (Claude) |
| R29 | The client allowance summary moves to Phase 16, where allowance categories exist. (Claude) |
| R30 | A browser path-traced image is saved as a Photoreal render at cost $0 that needs review. (Claude) |
| R31 | The architect's revision letter is typed at upload, prefilled with the next letter. The Foreman who gets a field-measure link is picked in the wizard. (Claude) |
| R32 | The EZ Binder webhook address, signing secret and inbound key are entered at Connect in Settings. (Claude) |
| R33 | A dependency on a split ticket's base number (EZD-120) means all of its lettered parts. (Claude) |
| R34 | The code check uses the full Code rules catalog, not a short list: 1,248 rules across the Florida Building Code volumes and the NEC, each Automatic, Needs data or Reminder, with sections for both editions. The catalog file in the repo is the source of truth; tickets EZD-611b to EZD-639 build it, and EZD-620 adds the project and object values the rules need. (Josh for the scope; Claude for the catalog) |

**Still open (waiting on things outside the software)**

- [ ] Round 26 R2 is answered (two permissions); nothing open.
- [ ] Mark each code rule verified in Settings 15g (EZD-1710 prints the list). Building rules were checked against the official code text on Oct 11; electrical rules against published summaries only, so those need the NEC book.
- [ ] Terms of service text from Josh or the attorney (EZD-1707 ships a placeholder).
- [ ] A real vendor cabinet line to replace the seed line (R23).
- [ ] Confirm the first image-model provider at the render trial spike (R21).

* [ ] Supplier 2020 sample export (DXF + cabinet order report): when available.
* [ ] 2–3 architect DXFs for performance testing: when available.
* [ ] Real per-render costs, and the default model per tier: measured during testing.
* [ ] Confirm unverified department items (PBC stamp space and sheet size, West Palm Beach naming sheet, Broward BCD revision naming) when submitting a first job there.
* [ ] Is Josh's computer GPU suited to the local render worker? Test before relying on it; the cloud API covers until then.
* [ ] Mockups needed before build: New project wizard (01), Takeoff, Versions / revision history and the cleanup sheet, Field measurements review, Field tasks, Settings 15a to 15h, phone 3D viewer.

**Resolved from the plan doc's open list (Oct 11)**

- Polycam Business: Josh has it, so DXF floor-plan export is available.
- Bluetooth laser: none owned today. Keyboard-mode laser input is built in v1 anyway (Round 24 #47).
- Visual direction: the Studio mockups are final and approved.
- Who signs, and the GC load calc: decided in #42 and #43.
