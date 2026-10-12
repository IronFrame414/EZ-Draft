# Non-functional requirements

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 10: Non-functional requirements. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

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
