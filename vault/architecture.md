# EZ Draft architecture conventions

Written by EZD-000 (vault/plans/EZD-000.md). Every build session reads this file (R26 R11). It does not repeat CLAUDE.md; the build rules stay there (Q-0005). Sources are cited in short form: `02` = vault/spec/sections/02-product-overview.md, `03` = 03-data-model.md, `11` = 11-non-functional-requirements.md, `R24 #n` / `R26 Rn` = vault/spec/decisions/13a, 13b, `Q-nnnn` = vault/questions/QUESTIONS.md. The vault copy is `vault/architecture.md`, re-made by the orchestrator on every merge that changes this file (Q-0012 (b)).

## Runtime

- Node.js 22, the major `.github/workflows/ci.yml` installs (ci.yml is changed only by Josh). Vercel Functions use the same major (EZD-003 sets it). The root `package.json` `engines.node` is `22.x`.
- pnpm: the version in the `pnpm` row of Dependencies, pinned again in the root `package.json` `packageManager` field (check C1 keeps the two equal). pnpm reads that field and runs the pinned version, so the machine's installed pnpm (CI: `npm install -g pnpm`) does not matter.

## Named tools

One choice per job (02 Named tools; R26 R11). The `Packages` cell holds only npm package names, each in backticks; `—` means the choice is not an npm package.

| Job | Choice | Packages |
| --- | --- | --- |
| Next.js mode | App Router; the editor is a client-only shell so it can open offline (02) | `next`, `react`, `react-dom` |
| Package manager and layout | pnpm workspace: app, packages/geometry, worker, spikes (02; ticket Scope) | `pnpm` |
| State store for the open model | Zustand, holding the patch store of EZD-120b (02) | `zustand` |
| Schema and validation | Zod, one file per model object type (02; 03 rule 5) | `zod` |
| Unit tests / browser tests | Vitest / Playwright (02) | `vitest`, `@playwright/test` |
| Styling and UI primitives | CSS modules on the design tokens (built into Next.js, no package); Radix primitives for dialogs, menus, popovers, from the combined `radix-ui` package so every primitive is at one version (02) | `radix-ui` |
| Device storage | IndexedDB through `idb`; service worker built with Workbox: `workbox-build` generates the worker, `workbox-window` registers it, `workbox-precaching`, `workbox-routing` and `workbox-strategies` run inside it, all at one version (02) | `idb`, `workbox-build`, `workbox-window`, `workbox-precaching`, `workbox-routing`, `workbox-strategies` |
| Polygon math | Clipper2, WebAssembly build (`clipper2-wasm`), run in a Web Worker (02; 11 rule 3) | `clipper2-wasm` |
| PDF writer | PDFKit, in the job only (02; R26 R7) | `pdfkit` |
| DXF | `dxf-parser` to read; `@tarikjabiri/dxf` to write; both provisional until EZD-029 confirms or replaces them (02 Stack DXF in/out; EZD-029) | `dxf-parser`, `@tarikjabiri/dxf` |
| Email | Resend (02; R24 #15: every email also has a Copy link button, EZD-008) | `resend` |
| CI and repository | GitHub with GitHub Actions; workflow `.github/workflows/ci.yml` uses `actions/checkout@v4`, `actions/setup-node@v4`, Node 22 (02; ci.yml) | — |
| Error reporting | Sentry in browser and functions (`@sentry/nextjs`) and in the render worker (`@sentry/node`), both at one version, emailing the owner on new errors (02; 11 Operations; EZD-024) | `@sentry/nextjs`, `@sentry/node` |
| Database migrations | Supabase CLI migrations, timestamp-named, with generated TypeScript types; the CLI is the `supabase` devDependency (02) | `supabase` |

## Stack

One row per layer of 02 Stack. Same cell format as Named tools.

| Layer | Choice | Packages |
| --- | --- | --- |
| App shell | Next.js + React + TypeScript, PWA (02) | `next`, `react`, `react-dom`, `typescript` |
| Geometry core | Own package `@ezdraft/geometry` in `packages/geometry`, pure functions, no UI code (02) | — |
| 2D + 3D | Three.js via React Three Fiber, one persistent canvas, drawn on demand (02; 11 rule 4) | `three`, `@react-three/fiber` |
| Polygon math | Clipper2 for booleans; wall openings by extruding the wall face with holes; three-bvh-csg only where that cannot express the shape (02; 11 rule 6) | `clipper2-wasm`, `three-bvh-csg` |
| Browser path tracing | three-gpu-pathtracer (02) | `three-gpu-pathtracer` |
| PDF in | pdf.js (02) | `pdfjs-dist` |
| PDF out | Drawing list from the geometry package; PDF written with PDFKit in a background job with embedded fonts (02; R26 R7) | `pdfkit` |
| DXF in/out | As Named tools DXF (02; R26 R16) | `dxf-parser`, `@tarikjabiri/dxf` |
| GLB / USDZ | Three.js exporters (`three/examples/jsm/exporters`), no extra package (02) | `three` |
| Database, auth, files | Supabase: Postgres with RLS, Auth, Storage, Realtime (02). `@supabase/supabase-js` is the client; `@supabase/ssr` builds the per-request server client from the session cookie; `supabase` is the CLI | `@supabase/supabase-js`, `@supabase/ssr`, `supabase` |
| Background jobs | Postgres `job` table; workers are Vercel Functions started on enqueue and by a once-a-minute sweep (02; P4; EZD-009) | — |
| AI | Claude for text and image reading; Google Gemini image-editing API as the first image adapter, OpenAI image edits later (02; R26 R21). Model ids, and whether an SDK or plain HTTP is used, are recorded here by EZD-021 and EZD-1103 | — |
| Offline | Service worker cache (Workbox) + local change queue; working copy in IndexedDB (`idb`) (02; 03 rules 9–10) | `workbox-build`, `workbox-window`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `idb` |
| Hosting | Vercel (app at ezdraft.ezcontractorbinder.com) + Supabase; local GPU render worker preferred, paid API fallback (02; R24 #1, #50; R26 R18) | — |

## Dependencies

Machine-read by check C1. One row per npm package; `Version` is one exact version, no range. `Used in` is one or more of `root`, `app`, `geometry`, `worker`, `spikes`. Versions are the newest stable releases on 2026-10-19 whose peer ranges fit each other, read from the npm registry: `react` 19.3.1 satisfies `next` (`^19.0.0`) and `@react-three/fiber` (`>=19 <19.4`); `three` 0.186.1 satisfies `@react-three/fiber` (`>=0.156`), `three-bvh-csg` (`>=0.179.0`) and `three-gpu-pathtracer` (`>=0.185.0`); `@sentry/nextjs` 11.x accepts `next` `^16`; `@supabase/ssr` 0.12.7 needs `@supabase/supabase-js` `^2.114.0`. `typescript` stays on the 5.x line: 7.0.2 shipped on 2026-10-18 with a new compiler and no registry evidence that `next` 16.4.2 builds with it; the ticket that moves to 7 edits this row. Most rows are installed by later tickets (EZD-001 and on); they are pinned here first (02 Named tools).

| Package | Version | Used in | Why | Added by |
| --- | --- | --- | --- | --- |
| `pnpm` | `12.14.0` | root | Named tools: Package manager and layout | EZD-000 |
| `next` | `16.4.2` | app | Named tools: Next.js mode; Stack: App shell | EZD-000 |
| `react` | `19.3.1` | app | Stack: App shell | EZD-000 |
| `react-dom` | `19.3.1` | app | Stack: App shell | EZD-000 |
| `typescript` | `5.9.3` | root, app, geometry, worker | Stack: App shell | EZD-000 |
| `zustand` | `5.0.15` | app | Named tools: State store for the open model | EZD-000 |
| `zod` | `4.6.7` | geometry, app, worker | Named tools: Schema and validation | EZD-000 |
| `vitest` | `5.0.5` | app, geometry, worker | Named tools: Unit tests | EZD-000 |
| `@playwright/test` | `1.64.1` | app | Named tools: browser tests | EZD-000 |
| `radix-ui` | `1.8.1` | app | Named tools: Styling and UI primitives | EZD-000 |
| `idb` | `8.0.4` | app | Named tools: Device storage; Stack: Offline | EZD-000 |
| `workbox-build` | `7.4.1` | app | Named tools: Device storage (builds the service worker) | EZD-000 |
| `workbox-window` | `7.4.1` | app | Named tools: Device storage (registers the service worker) | EZD-000 |
| `workbox-precaching` | `7.4.1` | app | Named tools: Device storage; Stack: Offline | EZD-000 |
| `workbox-routing` | `7.4.1` | app | Named tools: Device storage; Stack: Offline | EZD-000 |
| `workbox-strategies` | `7.4.1` | app | Named tools: Device storage; Stack: Offline | EZD-000 |
| `clipper2-wasm` | `0.4.0` | geometry, app | Named tools: Polygon math (Clipper2 WebAssembly build) | EZD-000 |
| `three-bvh-csg` | `0.0.18` | app | Stack: Polygon math | EZD-000 |
| `pdfkit` | `0.20.2` | app | Named tools: PDF writer; Stack: PDF out | EZD-000 |
| `dxf-parser` | `1.1.2` | app | Named tools: DXF (read); provisional until EZD-029 | EZD-000 |
| `@tarikjabiri/dxf` | `2.9.0` | app | Named tools: DXF (write); provisional until EZD-029 | EZD-000 |
| `resend` | `6.34.1` | app | Named tools: Email | EZD-000 |
| `@sentry/nextjs` | `11.8.0` | app | Named tools: Error reporting (browser and functions) | EZD-000 |
| `@sentry/node` | `11.8.0` | worker | Named tools: Error reporting (render worker) | EZD-000 |
| `supabase` | `2.121.0` | root | Named tools: Database migrations (CLI); Stack: Database, auth, files | EZD-000 |
| `@supabase/supabase-js` | `2.118.0` | app, worker | Stack: Database, auth, files | EZD-000 |
| `@supabase/ssr` | `0.12.7` | app | Stack: Database, auth, files (server client per request) | EZD-000 |
| `three` | `0.186.1` | app | Stack: 2D + 3D; GLB / USDZ | EZD-000 |
| `@react-three/fiber` | `9.8.2` | app | Stack: 2D + 3D | EZD-000 |
| `three-gpu-pathtracer` | `0.0.27` | app | Stack: Browser path tracing | EZD-000 |
| `pdfjs-dist` | `6.4.299` | app | Stack: PDF in | EZD-000 |

## Adding a dependency

CLAUDE.md rule 7 and 02 Named tools. A commit that adds or upgrades a package in any workspace `package.json` adds or edits its Dependencies row in the same commit. One version per package across the repo. Use an already listed package for a job before adding another. Internal packages are referenced as `workspace:*` and are not listed. Install with `pnpm add` (the workspace file sets `saveExact`, so the specifier is written exact). Check C1 enforces the row and the exact version; the code-reviewer fails a ticket without the row (CLAUDE.md rule 7).

## Folder layout

Ticket Scope; 02 Named tools; vault/tickets/README.md spike rule; vault/spikes/README.md.

```
/                         workspace root: package.json (fan-out scripts), pnpm-workspace.yaml, .npmrc, docs/, scripts/, supabase/ (EZD-004), .github/
app/                      @ezdraft/app — the Next.js App Router app (EZD-001)
  src/app/                routes; entry points per EZD-020; route handlers under src/app/api/**
  src/server/             server-only code: db clients, can(), route helpers, money serializers
  src/server/jobs/        background job handlers (EZD-009); the only place PDFKit is imported
  src/components/         shared UI (shell EZD-011/012, states EZD-015)
  src/lib/                code used by browser and server (fetch helper, t() from EZD-026)
  src/workers/            Web Workers, files named *.worker.ts (11 rule 3)
packages/geometry/        @ezdraft/geometry — pure TypeScript, no UI; model schema in src/schema/<object-type>.ts (03 rule 5); drawing list (02 PDF out); calculations re-run on the server (11 Where each output is produced)
worker/                   @ezdraft/worker — the local GPU render worker (02 Named tools; EZD-1104). Not Web Workers, not job handlers
spikes/EZD-0nn-<slug>/    throwaway spike code and its test file (vault/spikes/TEMPLATE.md); never imported by app, packages or worker; excluded from the root gate's typecheck, lint and test (PROCESS.md Special tickets); run with `pnpm --filter ./spikes/<dir> <script>`
supabase/                 Supabase CLI folder (CLI default): migrations/, seed, config (EZD-004)
docs/architecture.md      this file; vault copy at vault/architecture.md, made by the orchestrator after EZD-000 and re-made on every merge that changes this file (PROCESS.md; Q-0012 (b))
```

Every workspace `package.json` is `"private": true` and named `@ezdraft/<name>` (`app`, `geometry`, `worker`, `spike-<dir>` in lowercase). The root scripts `typecheck`, `lint`, `test` and `build` fan out to every workspace package except `spikes/*` with `pnpm -r --if-present --filter "!./spikes/**"`; `lint` runs check C1–C8 first and `test` runs the repo scripts' `node:test` files first. EZD-001 extends these files; it does not replace them. The geometry package runs in the browser, in Web Workers and in Node (02 Geometry core; 11 Where each output is produced), so it uses no DOM or React.

## Server-only data access and can()

03 rules 1–2, 11; R26 R1, R2, R14. Documented here; implemented by EZD-133 (helper, server-route pattern, browser-query lint rule) and EZD-102 (enforcement, UI hook).

- Browser code never queries tables. It calls the app's own HTTP routes (Route Handlers under `app/src/app/api/**`) through one fetch helper in `app/src/lib/` that adds the app version to every request (03 rule 12; EZD-134). Reads and writes use Route Handlers, not Server Actions, because the outbox (03 rule 9) and the EZ Binder inbound API need plain HTTP endpoints.
- The two exceptions (03 rule 1): Realtime subscriptions authorized per project scope (EZD-018) and signed uploads straight to Storage (EZD-132).
- Every route: read the session → load the user's membership and permissions in one indexed query per request (EZD-102) → `can()` → query with a Supabase client carrying the user's session, so RLS stays the backstop (03 rule 1; 11 rule 10) → return an explicit field list.
- Contract: `can(ctx, permission, target?) → boolean`. `ctx` is the per-request context: user, active tenant from the token-hook claim, membership status and scope, permission set. `permission` is a typed key from the EZD-101 list (key spelling is EZD-101's). `target` is `{ projectId }` when the action is on a project: scoped users pass only for their listed projects; deactivated users always get false (03 Tables membership; EZD-006). A `requirePermission(...)` wrapper turns false into a 403 (EZD-102). The browser `can()` hook (EZD-102) only hides controls; it is never the security check.
- Money (03 rule 2; R26 R2): cost fields are added to a response only when `can(ctx, <See company costs>)`, and sell, markup and total fields only when `can(ctx, <See sell prices>)`, through one serializer per resource in `app/src/server/`. Client-link routes never touch money tables (03 rule 11).
- The service-role key is used only in job handlers, migrations, seeds and admin scripts, never in request-path routes and never in browser bundles. The render worker uses its own revocable key (03 render_worker).

## Migrations

02 Named tools; 11 Operations; vault/tickets/README.md; EZD-023.

- Folder `supabase/migrations/`. File name `<YYYYMMDDHHMMSS>_<snake_case_description>.sql`: a 14-digit UTC timestamp as `supabase migration new` writes it, then a description in lowercase letters, digits and underscores, e.g. `20261012093000_create_tenant.sql`. Timestamps are unique (check C5).
- One concern per file.
- Add before remove: never drop or rename what the previous release reads (11 Operations; check by EZD-023).
- A migration that creates a table also adds `tenant_id`, its RLS policy, the `tenant_id` and `project_id` indexes and the tenant-isolation test (tickets README; 11 rule 10; EZD-006).
- TypeScript types are generated from the local database by the Supabase CLI into `app/src/server/db/database.types.ts` and committed (02 Named tools; EZD-004 adds the script).

## Errors and logging

11 Operations, Security and audit; R26 R12, R16, R17; EZD-015, EZD-024, EZD-026, EZD-120b.

- Route error body: `{ "error": { "code": "<stable_snake_code>", "message_key": "<t() key>" } }`. Status: 400 invalid input (Zod failure), 401 not signed in, 403 permission missing (EZD-102), 404 row not found or outside the user's tenant or scope (the response does not reveal that it exists), 409 stale `lock_epoch` or sequence conflict (03 rules 6, 9), 500 unexpected. The browser shows `message_key` through `t()` (R26 R17); no raw server text reaches the UI.
- Browser: a failed load uses the inline error with Retry (EZD-015); a failed save keeps the edits and shows the save banner (EZD-120b). Nothing fails silently: anything skipped is counted and shown (R26 R16 pattern).
- Jobs: a failure writes `job.error` and `attempts` (03 job table); retry with backoff (EZD-009); a final failure goes to Sentry and the owner email (11 Operations; EZD-024).
- Logging: one structured JSON line per event from one logger module (`logger.ts`) on the server and in the worker: level, message, route or job kind, tenant_id, project_id, request or job id, duration. Never logged: tokens (share-link, magic-link, 6-digit code, EZ Binder sign-on code), keys and secrets, request bodies, email addresses, money values (03 rules 2, 11; CLAUDE.md rule 8). No `console.*` outside `logger.ts` and tests (check C8). Unexpected errors go to Sentry (EZD-024).

## Storage buckets and paths

03 rules 1, 11; 03 source_file, render, catalog_item, job; 11 rule 12, Operations, Data retention; EZD-025, EZD-132. Rules from the sources: every bucket is private; files are served through short-lived signed links; browser uploads go straight to Storage with resumable signed uploads; job inputs and outputs are Storage paths; originals are never changed; renders are stored full size plus 400 px and 1600 px copies; deletes of sent-package files are soft deletes. Layout (EZD-132 creates the buckets):

- Every path starts `<tenant_id>/` so Storage policies use the same tenant claim as table RLS (EZD-006). Project files continue `<project_id>/`; tenant-level files use `<tenant_id>/tenant/`.
- Buckets: `sources` (uploaded originals, every `source_file` kind; written once, never overwritten), `renders` (`<tenant_id>/<project_id>/<render_id>/full|1600|400.<ext>`), `exports` (PDF sets, DXF, GLB, USDZ, CSV, selections PDF, markup PDF/DXF; sent-package files soft-deleted), `media` (plan thumbnails and version previews, logo, catalog images 256 px, spec sheets, textures, camera-view thumbs), `jobs` (`<tenant_id>/<project_id or tenant>/<job_id>/in|out/...` scratch).
- Object names use ids, not user file names; the original file name is kept on the row (03 source_file).
- Signed-link lifetimes are values set by EZD-132 from its own sources, not here.

## Tests

02 Named tools; CLAUDE.md rules 5–6; vault/tickets/README.md rule 4.

- Unit tests: Vitest, `*.test.ts` / `*.test.tsx`, next to the code they test.
- Browser tests: Playwright, `*.spec.ts`, in the folder EZD-016a creates.
- Repo scripts: `node:test`, `scripts/**/*.test.mjs`, run by the root `test` script.
- Shared helpers live in `test-utils/` or `test-harness/` folders (`.claude/hooks/guard-paths.mjs`).
- The test that closes a ticket has the ticket id in its title, e.g. `EZD-005 done when: seed creates Worth Properties as tenant 1`, so reviewers can find it.
- Tests never call live AI, email, render providers or EZ Binder; they use the stubs of EZD-008, EZD-016, EZD-019 and EZD-021.
- Spike tests live with the spike under `spikes/` and are not run by the root gate (vault/spikes/TEMPLATE.md; PROCESS.md).
- Check C7 enforces the file names.

## Handoff

Path `vault/handoff/CURRENT.md`, format `vault/handoff/TEMPLATE.md`, overwritten at session end; previous ones in `vault/handoff/log/` (CLAUDE.md Directory; PROCESS.md Ledgers).

## Machine checks

`node scripts/conventions/check.mjs [rootDir]` runs C1–C8 (plain Node, no dependencies). The root `lint` script runs it, so `scripts/gate.mjs` and CI fail on any violation. Rules with no machine check are marked "review".

| ID | Rule | Check | Built by |
| --- | --- | --- | --- |
| C1 | Every dependency in a workspace `package.json` has a Dependencies row with the same exact version; root `packageManager` equals the pnpm row; no duplicate or non-exact rows | `scripts/conventions/check.mjs` | EZD-000 |
| C2 | `pnpm-workspace.yaml` packages are exactly `app`, `packages/*`, `worker`, `spikes/*`; every workspace package is private and named `@ezdraft/*` | same | EZD-000 |
| C3 | `packages/geometry` depends on no UI package and holds no `.tsx`, `.jsx`, `.css`, `.scss` file | same | EZD-000 |
| C4 | No non-test source in `app/`, `packages/`, `worker/` imports from `spikes/` or an `@ezdraft/spike*` package; no non-spike package depends on one | same | EZD-000 |
| C5 | Migration file names match `<14 digits>_<snake_case>.sql`; timestamps unique | same | EZD-000 |
| C6 | `pdfkit` is imported only under `app/src/server/jobs/` | same | EZD-000 |
| C7 | A file importing `vitest` is `*.test.ts(x)`; a file importing `@playwright/test` is `*.spec.ts` (config, setup, `test-utils/`, `test-harness/`, `fixtures/` exempt) | same | EZD-000 |
| C8 | No `console.*` in non-test files under `app/src/`, `packages/*/src/`, `worker/src/` except `logger.ts` | same | EZD-000 |
| — | Browser table query lint; RLS-policy CI test | lint rule and CI test | EZD-133 |
| — | RLS policy and tenant/project index on every table | CI test | EZD-006 |
| — | Static imports of heavy libraries; bundle report | lint rule and build report | EZD-020 |
| — | Literal interface strings in phone components | lint rule | EZD-026 |
| — | Unknown event names | CI test | EZD-022 |
| — | Destructive migrations (drop or rename) | CI check | EZD-023 |
| — | Performance counts and download size | perf script | EZD-017 |
| — | A test reaching a live provider fails | test harness | EZD-021 |
| — | TypeScript, lint and test discovery exclude `.claude/worktrees/`, `vault/`, `spikes/` | tool configs | EZD-001 (PROCESS.md) |
| — | A stored sample of every schema version loads | CI test | the ticket that adds the schema (03 rule 5) |
| — | One Zod file per object type; Clipper only in a worker; error body shape; log redaction | review | — |
