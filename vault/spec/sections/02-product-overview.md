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
