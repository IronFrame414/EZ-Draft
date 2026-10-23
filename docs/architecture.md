# EZ Draft architecture conventions

Written by EZD-000 (vault/plans/EZD-000.md). Every build session reads this file (R26 R11). It does not repeat CLAUDE.md; the build rules stay there (Q-0005). Sources are cited in short form: `02` = vault/spec/sections/02-product-overview.md, `03` = 03-data-model.md, `11` = 11-non-functional-requirements.md, `R24 #n` / `R26 Rn` = vault/spec/decisions/13a, 13b, `Q-nnnn` = vault/questions/QUESTIONS.md. The vault copy is `vault/architecture.md`, re-made by the orchestrator on every merge that changes this file (Q-0012 (b)).

## Runtime

- Node.js 22, the major `.github/workflows/ci.yml` installs (ci.yml is changed only by Josh). Vercel Functions use the same major (EZD-003 sets it). The root `package.json` `engines.node` is `22.x`.
- Browser floor: Safari and iOS Safari 16.4+, Chrome and Edge 111+, Firefox 113+ (Q-0013 (a), vault/spec/decisions/02-product-overview.md; EZD-010 relies on Firefox 113 for `oklch()`, Q-0026 (a)). No polyfills and no `browserslist` override.
- pnpm: the version in the `pnpm` row of Dependencies, pinned again in the root `package.json` `packageManager` field (check C1 keeps the two equal). pnpm reads that field and runs the pinned version, so the machine's installed pnpm (CI: `npm install -g pnpm`) does not matter.

### Hosting

R24 #1; 02 Stack Hosting; Q-0113; Q-0116 (a); Q-0123 (b); Q-0106; EZD-003.

- Vercel project `ezdraft`, Root Directory `app`. Config is `app/vercel.json` (framework `nextjs`, function region `iad1`). Node `22.x` comes from `app/package.json` `engines`. pnpm runs through Corepack (`ENABLE_EXPERIMENTAL_COREPACK=1`) and the root `packageManager` pin.
- Production branch `main`: production changes only after Josh merges a phase PR. A build goes live only when EZD-023b's release workflow promotes it.
- Previews only for the phase PR (develop to main), through the Ignored Build Step in the Vercel project. A plain `develop` push builds no preview; the gate's empty `chore: preview` commit after the PR opens gives the PR its preview. Previews use the dev database once EZD-023b enters its values.
- Domain `ezdraft.ezcontractorbinder.com`. DNS is at Spaceship; Vercel provides the HTTPS certificate and the HTTP to HTTPS redirect. "Auto-assign Custom Production Domains" is off and stays off, so the address shows only a build the release workflow promotes.
- Rollback is Vercel's previous deployment.
- The live check `scripts/hosting/check-live.mjs` is never run by the gate. EZD-023b's release workflow runs its checks after every release; anyone may run it by hand (read-only).
- Agents never change Vercel or DNS settings; those steps are in `docs/runbook.md` for Josh.

### Environment variables

R24 #1; Q-0106; Q-0113; 11 Operations; EZD-004b.

Values never go in the repo; names go in `.env.example`; the app reads them per call, so `next build` needs none.

| Name | Reaches the browser | Local value | Dev / prod value | Used by |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes (Realtime and signed uploads later, 03 rule 1) | `pnpm db:env` | that project's API URL | `app/src/server/db/env.ts` now; EZD-018, EZD-132 later |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes (RLS applies) | `pnpm db:env` | that project's publishable key | `app/src/server/db/env.ts` now; EZD-018, EZD-132 later |
| `SUPABASE_SECRET_KEY` | never | `pnpm db:env` | that project's secret key | job handlers, migrations, seeds and admin scripts only; in `app/src` only `app/src/server/jobs/db.ts` (job runner, EZD-009) |
| `SUPABASE_API_GATE_SECRET` | never | `pnpm db:env` | a different secret per cloud project, made with `node scripts/db/api-gate.mjs generate` and entered in Vercel by Josh (`docs/runbook.md` Supabase cloud projects step 10; EZD-023b for the release environment) | `app/src/server/db/env.ts` (`serverGateSecret()`), `app/src/server/auth/supabase-server.ts` |
| `SUPABASE_DEV_DB_URL` | never | none (the local stack needs none) | the dev project's Session pooler connection string, an environment secret of the GitHub environment `dev` (`develop` only); production has no counterpart (EZD-023b's `release` environment) | `.github/workflows/supabase-dev.yml` only |
| `EMAIL_TRANSPORT` | never | `stub` in unit tests (`app/vitest.config.ts`) and browser tests (EZD-016d's web server); empty in `.env.example`, so a plain `pnpm dev` fails every send with `email_transport_not_set` and still returns the link | Preview `stub` by default, `resend` allowed (Q-0041; EZD-023b enters it); Production `resend` (the stub is refused when `VERCEL_ENV` is `production`) | `app/src/server/email/transport.ts` |
| `EMAIL_FROM` | never | `EZ Draft Test <test@example.test>` in tests | `EZ Draft <no-reply@ezcontractorbinder.com>` (Q-0035; Q-0036); company emails keep its address and show "<Company> via EZ Draft" | `app/src/server/email/transport.ts`, `send.ts`; `scripts/email/send-test.mjs` |
| `RESEND_API_KEY` | never | none (tests never send, CLAUDE.md rule 6) | Production: the sending-only key `ezdraft-production` (runbook `## Email (EZD-008)` step 3); Preview only if Josh switches a preview to `resend` (Q-0041) | `app/src/server/email/resend-transport.ts` through `transport.ts`; `scripts/email/send-test.mjs` |
| `EMAIL_STUB_DIR` | never | browser tests only (EZD-016d); not in `.env.example` | never set on Vercel | `app/src/server/email/transport.ts` |
| `CRON_SECRET` | never | none (tests stub it) | Production only, entered by Josh (`docs/runbook.md` `## Background jobs (EZD-009)`); Vercel sends it as `Authorization: Bearer <CRON_SECRET>` on cron requests | `app/src/app/api/jobs/sweep/route.ts` |
| `SENTRY_TRANSPORT` | never | unset (Sentry off); `stub` in unit tests (`app/vitest.config.ts`) and browser tests (EZD-016d's web server) | `sentry` for Preview and Production, entered by Josh (`docs/runbook.md` `## Error reporting (EZD-024)`); unset or empty turns Sentry off, `stub` is refused when `VERCEL_ENV` is `production` | `app/src/server/errors/sentry-options.ts` |
| `SENTRY_DSN` | never | none | the DSN of Josh's Sentry project `ezdraft` (Q-0070 (a)), Preview and Production | `app/src/server/errors/sentry-options.ts` |
| `SENTRY_STUB_DIR` | never | browser tests only (`app/.e2e/sentry-outbox`, EZD-016d's web server); not in `.env.example` | never set on Vercel | `app/src/server/errors/sentry-options.ts` (the stub transport's file sink) |
| `ALERT_EMAIL_TO` | never | `owner@example.test` in unit and browser tests | Josh's operator address, which gets every alert of every company (Q-0067 (b)); Preview and Production; never in the repo (Q-0033 (a)) | `app/src/server/errors/alert-recipients.ts` |
| `SENTRY_ISSUES_URL` | never | none | optional: the Issues page of the Sentry project; error alert emails link there with `?query=<event id>` (Q-0069 (a)) | `app/src/server/errors/alert-email.ts` |

Which project's values go where: local is the local stack; preview is the dev project; production is the production project once Josh sets it up from the Before-launch checklist (11 Operations: preview deploys use the dev database; Q-0113). Entering values in Vercel is EZD-023b's (Q-0106).

### Email (EZD-008)

Q-0035; Q-0036; Q-0041; R24 #15; EZD-008a; EZD-008b.

- Resend through `app/src/server/email/` (`sendEmail`, EZD-008a); one recipient per call; server-only, never imported by browser code (11 Budgets, 200 KB; Server-only data access and can()).
- Transport by `EMAIL_TRANSPORT` (`stub` or `resend`), no default; both selectable per environment (Q-0041); the stub is refused in production; unit tests read `readStubOutbox()`, browser tests read `EMAIL_STUB_DIR` (EZD-008a).
- **Sender (Q-0036):** emails sent for a company pass `company: { name: tenant.name, replyTo: tenant.contact.email ?? null }`; the From shows "<Company> via EZ Draft" and replies go to the company email from company settings (S15a Contact), never to the person who pressed Send. Emails no company sends omit `company` and show `EMAIL_FROM` as is.
- **Copy link (Q-0035; R24 #15):** every feature that sends an email shows the person who sent it the link from `SendEmailResult.link`, with a Copy link button, whether the send succeeded or failed, because emails land in spam. Each sending ticket's plan names where its Copy link appears and tests it. **Exception: sign-in emails** (EZD-007) never show their link on screen, since anyone who typed an email address would get in; the sign-in page tells the user to check spam and accepts the 6-digit code (Q-0035 orchestrator note; R26 R15). Emails no person sends from a screen (EZD-024's alert emails, Q-0067 (b)) have no sender screen; EZD-024's plan records how it meets the rule.
- Sign-in emails are sent by Supabase Auth through Resend SMTP (runbook `## Email (EZD-008)` step 6), not through `sendEmail`.
- Live check `scripts/email/send-test.mjs`, run by Josh by hand only, refused under `CI`, never by the gate (Q-0153).
- Agents never change Resend, DNS, Vercel or Supabase settings; those steps are in `docs/runbook.md` (CLAUDE.md rule 3; Q-0003: the Resend account is shared with EZ Binder).

### Background jobs (EZD-009)

EZD-009 (vault/plans/EZD-009.md Steps 1-9); 02 Stack Background jobs; 03 Tables job; 11 Operations, rules 3, 10, 11; P4; Q-0027 (a); Q-0059 (a); Q-0031 (a).

- **Table `public.job`** (`<ts>_create_job.sql`): `tenant_id`, `project_id` (null = a tenant-level job), `kind` (`import`, `export`, `render`, `ai_read`, `thumbnail`, `diff`, `cleanup`, `test`; `JOB_KINDS` in `app/src/lib/jobs/kinds.ts` holds the same list), `payload`, `status` (`queued`, `running`, `done`, `failed`), `progress` (whole percent), `attempts`, `max_attempts` (1-5), `error`, `run_after`, the lease `run_id` and `lease_expires_at`, the split cursor `state`, `result`, `created_by`, timestamps. `payload`, `state` and `result` are JSON objects of at most 16,384 bytes. One select policy (EZD-006 template; a tenant-level job is visible to all-projects members only); `authenticated` has `select` only, `service_role` all four.
- **No money in job rows:** every member who can see the project can select its jobs, so `payload`, `state` and `result` hold ids, small values and Storage paths only, never money or secrets (03 rule 2; R26 R2). A handler writes money to its own tables and puts ids or paths in the result. `error` holds a stable code (`^[a-z][a-z0-9_]{0,63}$`), never a message, stack or provider text.
- **Enqueue:** a server route calls `enqueueJob(sessionClient, { kind, projectId, payload, runAfter? })` (`app/src/server/jobs/index.ts`), which checks the payload with the kind's schema, its size and its Storage paths, calls `public.enqueue_job` under the user's session (security definer, `authenticated` only; tenant from the claim; project scope or all-projects for a tenant-level job, else `42501`) and then `kickJobRunner()`, which registers `after(() => runJobs())` from `next/server`, so the run starts after the response is sent. The route checks permissions with `can()` first. Enqueuing routes keep the default `maxDuration`, because the kicked run lives in that function.
- **Sweep:** the Vercel Cron entry in `app/vercel.json` calls `GET /api/jobs/sweep` once a minute with `Authorization: Bearer <CRON_SECRET>` (`401 not_authorized` otherwise, compared in constant time); it runs `runJobs()` and answers `{ ran }`. Crons run on production deployments only, so previews pick up retries and dead runs only when another enqueue starts a run.
- **Claim, lease, fencing:** `public.job_claim(run_id, lease_seconds)` takes one due job with `for update skip locked`, sets `status` `running`, a new `run_id`, `lease_expires_at = now() + lease` and `attempts + 1`; it also takes a `running` job whose lease expired while `attempts < max_attempts` (error `lease_expired`). `job_fail_expired` fails expired jobs with no tries left. `job_progress`, `job_complete`, `job_continue` and `job_fail` write only where `run_id` still matches and return false otherwise; a run that gets false stops touching the job. The six `job_*` functions are invoker functions executable by `service_role` only, called through the secret-key client `createJobsDbClient()` (`app/src/server/jobs/db.ts`). All times come from the database clock.
- **Attempts, retry, backoff (Q-0059 (a)):** `attempts` goes up at claim, so a run that dies still counts. A handler error is retried while `attempts < max_attempts`, waiting `min(baseMs x 2^(attempts - 1), capMs)`: up to 5 tries, waiting 1, 2, 4 and 8 minutes (`baseMs` 60,000, `capMs` 480,000); a handler may set a lower `maxAttempts`. Nothing starts a run at `run_after`, so a wait rounds up to the next sweep. Never retried: `invalid_payload`, `invalid_result`, `no_handler`, a `JobError` with `retry: false`; a plain throw is `handler_failed` (retried); a dead run is `lease_expired`. `onJobFailed(job)` is called once per job that reaches `failed` (EZD-024 hooks in there).
- **Split rule:** a handler reads `ctx.timeLeft()` and returns `{ continue: <state> }` when the next unit will not fit; the job goes back to `queued` with its cursor and `attempts` 0, and the next run carries on. A handler always does at least one unit per slice.
- **Time values** (`app/src/server/jobs/config.ts`): `JOB_FUNCTION_MAX_SECONDS` 300 (Vercel Pro default, Q-0027 (a); the sweep route's literal `maxDuration`), `JOB_LEASE_SECONDS` 360 (limit + 60), `JOB_RUN_BUDGET_MS` 270,000 ((limit - 30) x 1000), `JOB_MIN_CLAIM_MS` 10,000.
- **Handler contract** (`app/src/server/jobs/registry.ts`; handlers registered in `getHandlers()`, `handlers.ts`): handlers are safe to run twice. Output paths are fixed by job id (`<tenant_id>/<project_id or tenant>/<job_id>/out/...` in the `jobs` bucket); an outside call that costs money or sends something carries an idempotency key made from the job id and the cursor. A handler runs with the secret key, which bypasses RLS, so it filters every query by `ctx.job.tenant_id` (and `project_id`). Every registered kind has an `expectSafeToRunTwice('<kind>', ...)` test (`app/test-harness/jobs/run-twice.ts`). The `test` kind is registered only outside production.
- **Progress:** the trigger `job_broadcast` pushes `job.progress` `{ jobId, kind, status, progress, attempts }` on `project:<project_id>` on each insert and each status or progress change (a failed send never rolls back the job write); tenant-level jobs push nothing. In the browser, `watchJob({ channel, jobId, fetchJob, onChange })` (`app/src/lib/jobs/watch-job.ts`) passes on every event for the job and fetches `GET /api/jobs/<id>` once when the job first finishes and once per resync; no timers, no polling (11 rule 11).
- **Read route:** `GET /api/jobs/<id>` returns `{ job: { id, projectId, kind, status, progress, attempts, error, result, createdAt, updatedAt, finishedAt } }` through the session client; not a UUID or not visible is `404 job_not_found`.
- **Tests:** every test that calls `runJobs` against the database passes `onlyTenantId` = its own fresh tenant. Every test file that inserts or enqueues `job` rows holds `holdJobQueueShared()` (`app/test-harness/jobs/queue-lock.ts`) from the start of its `beforeAll` to the end of its `afterAll`, after deleting its jobs; the unscoped sweep tests hold `holdJobQueueExclusive()`. The test page is `/dev/jobs` (not found in production).

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

Machine-read by check C1. One row per npm package; `Version` is one exact version, no range. `Used in` is one or more of `root`, `app`, `geometry`, `worker`, `spikes`. Versions are the newest stable releases on 2026-10-19 whose peer ranges fit each other, read from the npm registry: `react` 19.3.1 satisfies `next` (`^19.0.0`) and `@react-three/fiber` (`>=19 <19.4`); `three` 0.186.1 satisfies `@react-three/fiber` (`>=0.156`), `three-bvh-csg` (`>=0.179.0`) and `three-gpu-pathtracer` (`>=0.185.0`); `@sentry/nextjs` 11.x accepts `next` `^16`; `@supabase/ssr` 0.12.7 needs `@supabase/supabase-js` `^2.114.0`. `typescript` stays on the 5.x line: 7.0.2 shipped on 2026-10-18 with a new compiler and no registry evidence that `next` 16.4.2 builds with it; the ticket that moves to 7 edits this row. Most rows are installed by later tickets (EZD-001 and on); they are pinned here first (02 Named tools). EZD-001 (2026-10-19): `eslint` stays on 9.x because `eslint-config-next` 16.4.2 depends on `eslint-plugin-import`, `eslint-plugin-react` and `eslint-plugin-jsx-a11y`, whose peer ranges end at ESLint 9; `@eslint/js` matches the `eslint` major; `@types/node` is the newest 22.x so the types match the Node 22 runtime above (vitest 5.0.5 peers `^22.0.0 || >=24.0.0`).

| Package | Version | Used in | Why | Added by |
| --- | --- | --- | --- | --- |
| `pnpm` | `12.14.0` | root | Named tools: Package manager and layout | EZD-000 |
| `next` | `16.4.2` | app | Named tools: Next.js mode; Stack: App shell | EZD-000 |
| `react` | `19.3.1` | app | Stack: App shell | EZD-000 |
| `react-dom` | `19.3.1` | app | Stack: App shell | EZD-000 |
| `typescript` | `5.9.3` | root, app, geometry, worker | Stack: App shell | EZD-000 |
| `zustand` | `5.0.15` | app | Named tools: State store for the open model | EZD-000 |
| `zod` | `4.6.7` | geometry, app, worker | Named tools: Schema and validation | EZD-000 |
| `vitest` | `5.0.5` | root, app, geometry, worker | Named tools: Unit tests | EZD-000 |
| `@playwright/test` | `1.64.1` | root, app | Named tools: browser tests | EZD-000 |
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
| `dxf-parser` | `1.1.2` | root, app | Named tools: DXF (read); provisional until EZD-029 | EZD-000 |
| `@tarikjabiri/dxf` | `2.9.0` | app | Named tools: DXF (write); provisional until EZD-029 | EZD-000 |
| `resend` | `6.34.1` | app | Named tools: Email | EZD-000 |
| `@sentry/nextjs` | `11.8.0` | app | Named tools: Error reporting (browser and functions) | EZD-000 |
| `@sentry/core` | `11.8.0` | app | Named tools: Error reporting (envelope parse for the tunnel route; not exported by `@sentry/nextjs`) | EZD-024 |
| `@sentry/browser` | `11.8.0` | app | Named tools: Error reporting (browser init and integrations; `@sentry/nextjs` on Node does not export the browser integrations) | EZD-024 |
| `@sentry/node` | `11.8.0` | worker | Named tools: Error reporting (render worker) | EZD-000 |
| `supabase` | `2.121.0` | root | Named tools: Database migrations (CLI); Stack: Database, auth, files | EZD-000 |
| `@supabase/supabase-js` | `2.118.0` | app, worker | Stack: Database, auth, files | EZD-000 |
| `@supabase/ssr` | `0.12.7` | app | Stack: Database, auth, files (server client per request) | EZD-000 |
| `three` | `0.186.1` | root, app | Stack: 2D + 3D; GLB / USDZ | EZD-000 |
| `@react-three/fiber` | `9.8.2` | app | Stack: 2D + 3D | EZD-000 |
| `three-gpu-pathtracer` | `0.0.27` | app | Stack: Browser path tracing | EZD-000 |
| `pdfjs-dist` | `6.4.299` | root, app | Stack: PDF in | EZD-000 |
| `eslint` | `9.39.5` | root, app, geometry | Machine checks: lint runner for the root flat config (EZD-020, EZD-026a and EZD-133 add rules) | EZD-001 |
| `@eslint/js` | `9.39.5` | root | Machine checks: ESLint recommended rules for all TS/JS | EZD-001 |
| `typescript-eslint` | `8.71.2` | root | Machine checks: TypeScript parser and recommended rules | EZD-001 |
| `eslint-config-next` | `16.4.2` | root, app | Machine checks: Next.js lint rules for `app/**` only | EZD-001 |
| `prettier` | `3.9.10` | root | Formatting (review, not gated): `format`, `format:check` | EZD-001 |
| `@types/node` | `22.20.5` | app | Stack: App shell (Node types for `next.config.ts` and route handlers) | EZD-001 |
| `@types/react` | `19.3.0` | app | Stack: App shell | EZD-001 |
| `@types/react-dom` | `19.3.0` | app | Stack: App shell | EZD-001 |
| `postgres` | `3.4.9` | app | Test harness: catalog queries and SQL-as-user for RLS tests (EZD-006); dev dependency, never imported by app code; ships its own types | EZD-006 |
| `@aws-sdk/client-s3` | `3.1153.0` | root | Off-site bucket, S3-compatible API (release dumps EZD-023d; backups EZD-025) | EZD-023d |
| `@supabase/realtime-js` | `2.118.0` | app | Browser Realtime client (EZD-018); no table-query API in the browser | EZD-018 |

## Adding a dependency

CLAUDE.md rule 7 and 02 Named tools. A commit that adds or upgrades a package in any workspace `package.json` adds or edits its Dependencies row in the same commit. One version per package across the repo. Use an already listed package for a job before adding another. Internal packages are referenced as `workspace:*` and are not listed. Install with `pnpm add` (the workspace file sets `saveExact`, so the specifier is written exact). Check C1 enforces the row and the exact version; the code-reviewer fails a ticket without the row (CLAUDE.md rule 7).

Dependency build scripts (Q-0140 (a)): pnpm 12 refuses to install while any dependency's install script is unsettled. Every reported script is denied in `pnpm-workspace.yaml` `allowBuilds` (map form, `<package>: false`); no entry is set to allow and no allow-all setting is used. Denied so far: `unrs-resolver` (pulled in by `eslint-config-next` through `eslint-import-resolver-typescript`; added by EZD-001). A new build script a ticket's install reports is denied the same way; if the build or tests need it, the builder stops and raises a question naming the package, what the script does, what fails without it and the effect on EZD-023b T17. No agent allows one on its own.

## Folder layout

Ticket Scope; 02 Named tools; vault/tickets/README.md spike rule; vault/spikes/README.md.

```
/                         workspace root: package.json (fan-out scripts), pnpm-workspace.yaml, .npmrc, docs/, scripts/, supabase/ (EZD-004a), eslint-rules/ (the repo's own lint rules, plugin `ezdraft`; EZD-026a), .github/
playwright.config.ts      root re-export of app/playwright.config.ts, so CI's browser install finds a root config (EZD-016d)
app/                      @ezdraft/app — the Next.js App Router app (EZD-001)
  src/app/                routes; entry points per EZD-020; route handlers under src/app/api/**
  src/app/dev/<name>/      developer test pages; notFound() when VERCEL_ENV is production (EZD-010c)
  src/app/dev/perf-probe/  perf check probe page: ?inject=pan-commit adds one React commit per canvas pointer move (EZD-017)
  src/server/             server-only code: db clients, can(), route helpers, money serializers
  src/server/jobs/        background job handlers (EZD-009); the only place PDFKit is imported
  src/server/jobs/handlers/  one file per job kind's handler, registered in handlers.ts (EZD-009)
  src/server/errors/       error reporting: Sentry options, capture, fingerprints, alert store and emails (EZD-024)
  src/lib/jobs/           job kinds and statuses, watchJob (browser and server; EZD-009)
  src/lib/errors/         scrubbing, browser Sentry options, captureBrowserError (EZD-024)
  src/components/         shared UI (shell EZD-011/012, states EZD-015)
  src/styles/              design tokens: tokens.css (the only CSS with literal colors, check C10), tokens.ts (typed copy, TOKENS) (EZD-010a); globals.css (body font), fonts.ts (next/font/local), fonts/ (committed latin woff2 + OFL licences) (EZD-010c)
  src/lib/                code used by browser and server (fetch helper, t() from EZD-026c)
  src/workers/            Web Workers, files named *.worker.ts (11 rule 3)
  src/lib/realtime/       browser Realtime hub; adapter.ts is the only importer of @supabase/realtime-js (EZD-018)
  src/components/icon/    Icon.tsx, icons.json (sorted list of icons used), svg/ (committed sources + LICENSE), icon-names.generated.ts (EZD-010b)
  public/icons/sprite.svg the generated icon sprite, served at /icons/sprite.svg (EZD-010b)
  src/lib/pwa/            app name and colour, service worker registration (EZD-013)
  src/components/pwa/     the registration component (EZD-013)
  src/pwa/                icon master page app-icon.html (EZD-013)
  public/sw.js            the service worker (EZD-013)
  public/app-icons/       manifest icons (EZD-013)
  scripts/                icons-build.mjs, icons-fetch.mjs: the icon pipeline, run by hand (EZD-010b; not the root scripts/)
  e2e/                    Playwright browser specs, *.spec.ts (EZD-007f)
  test-harness/jobs/      job queue test helpers: fake-clock.ts, run-twice.ts, queue-lock.ts (EZD-009)
  test-harness/e2e/       browser test harness: devices.ts (DEVICE_PROJECTS, projectGrep), global-setup.ts (EZD-016d)
  playwright.config.ts    the Playwright config (EZD-007f; EZD-016d extends it)
packages/geometry/        @ezdraft/geometry — pure TypeScript, no UI; model schema in src/schema/<object-type>.ts (03 rule 5); drawing list (02 PDF out); calculations re-run on the server (11 Where each output is produced)
worker/                   @ezdraft/worker — the local GPU render worker (02 Named tools; EZD-1104). Not Web Workers, not job handlers
spikes/EZD-0nn-<slug>/    throwaway spike code and its test file (vault/spikes/TEMPLATE.md); never imported by app, packages or worker; excluded from the root gate's typecheck, lint and test (PROCESS.md Special tickets); run with `pnpm --filter ./spikes/<dir> <script>`
scripts/db/               local stack and types scripts: local.mjs (`db:up`, `db:env`), gen-types.mjs (`db:types`) (EZD-004a)
scripts/email/            send-test.mjs: the live email check Josh runs by hand; never run by the gate (EZD-008b)
scripts/errors/           live-check.mjs: the live Sentry and alert check Josh runs by hand; never run by the gate (EZD-024)
scripts/fixtures/         generate-synthetic.mjs (`fixtures:generate`) and its writers, Node built-ins only; tests in __tests__/ (EZD-016b)
scripts/perf/             performance check: run.mjs (`pnpm perf`), budgets, registry, config, collectors; tests in __tests__/ (EZD-017)
perf-results/             git-ignored perf check results: latest.json, history.jsonl (EZD-017)
fixtures/                 shared test data: README.md, manifest.json, synthetic/ (generated files + *.expected.json), real/<id>/ (Josh's files, once supplied) (EZD-016b)
supabase/                 Supabase CLI folder: config.toml, seed.sql, migrations/ (EZD-004a)
docs/architecture.md      this file; vault copy at vault/architecture.md, made by the orchestrator after EZD-000 and re-made on every merge that changes this file (PROCESS.md; Q-0012 (b))
```

Every workspace `package.json` is `"private": true` and named `@ezdraft/<name>` (`app`, `geometry`, `worker`, `spike-<dir>` in lowercase). The root scripts `typecheck`, `lint`, `test` and `build` fan out to every workspace package except `spikes/*` with `pnpm -r --if-present --filter "!./spikes/**"`; `lint` runs check C1–C10 first and `test` runs the repo scripts' `node:test` files first. EZD-001 extends these files; it does not replace them. The geometry package runs in the browser, in Web Workers and in Node (02 Geometry core; 11 Where each output is produced), so it uses no DOM or React.

### Root config files

EZD-001 (vault/plans/EZD-001.md Step 3). There is no root `tsconfig.json`, so a root `tsc` compiles nothing under `vault/`, `spikes/` or `.claude/worktrees/`; every package sets `types` explicitly because default `@types` discovery walks up into the main checkout from a worktree.

- `tsconfig.base.json`: shared compiler options only (`strict`, `target` ES2022, `module` ESNext, `moduleResolution` Bundler, `isolatedModules`, `skipLibCheck`, `noEmit`, `esModuleInterop`, `resolveJsonModule`); no `include` or `files`. `app/tsconfig.json` and `packages/geometry/tsconfig.json` extend it. The geometry config has `lib: ["ES2023"]` and `types: []`: no DOM, no Node.
- `eslint.config.mjs`: one flat config. Ignores `node_modules`, `.next`, `dist`, `coverage`, Playwright output, `app/next-env.d.ts`, `.claude/**`, `vault/**`, `spikes/**`. All TS/JS gets `@eslint/js` recommended and `typescript-eslint` recommended (not type-checked); `app/**` alone adds the `eslint-config-next` flat configs (core-web-vitals, typescript). Each package's `lint` script is `eslint .`.
- `.prettierrc.json` (`singleQuote`, `printWidth` 100) and `.prettierignore` (`vault/`, `spikes/`, `.claude/`, `.github/`, `CLAUDE.md`, `docs/`, every `*.md`, `pnpm-lock.yaml`, build outputs, and all of `scripts/` except `scripts/conventions/check.mjs`). Root scripts `format` and `format:check`.
- `vitest.config.ts` (root): `test.projects` = `app/vitest.config.ts` and `packages/*/vitest.config.ts`, so a root `vitest` run reaches only the package projects.
- `pnpm-workspace.yaml`: `packages`, `saveExact: true`, `workspaceConcurrency: 1` (Q-0139 (a); pnpm 12 ignores `.npmrc` for these) and the `allowBuilds` map (Adding a dependency). Added keys are scalars or maps, never `- ` list lines (EZD-000 T26 reads every `- ` line as a package glob).

Internal packages are TypeScript source with no build step: `packages/geometry/package.json` has `"type": "module"` and `exports["."] = "./src/index.ts"`, and consumers compile it. The first ticket that imports it adds `"@ezdraft/geometry": "workspace:*"` to its `package.json` and, in the app, `transpilePackages: ['@ezdraft/geometry']` in `app/next.config.ts`. `app/next.config.ts` pins `outputFileTracingRoot` and `turbopack.root` to the workspace root because worktrees sit inside the main checkout and Next.js otherwise infers the root from the nearest lockfile upward.


### Design tokens, fonts and icons

EZD-010a (vault/plans/EZD-010a.md Step 4); 04 Frame and visual system (Studio); Q-0026 (a); Q-0040 (c); Q-0057 (b); Q-0013 (a).

- Names use the `--ez-` prefix; radii are named by value.
- `app/src/styles/tokens.css` holds every literal color and shadow, `tokens.ts` (`TOKENS`) mirrors it entry for entry. Values come from 04 Frame and visual system or a cited Studio board (vault/tickets/README.md rule 5). A ticket that adds a token appends it to both files with its board and Q-ID in a comment. Components use `var(--ez-*)` only (check C10).
- Measurements, code and numbers use DM Mono (`var(--ez-font-mono)`, EZD-010c) (04 Type).
- Colors: the spec's `oklch()` values ship as written with no sRGB fallback; browser floor Firefox 113+, Safari/iOS 16.4+, Chrome/Edge 111+ (Q-0026 (a); Q-0013 (a)).
- Board-cited exception radii approved by Josh: `--ez-radius-6` for tooltips (Q-0040 (c), added by EZD-012) and `--ez-radius-14` for dialogs (Q-0057 (b), added by EZD-015). Any other radius that conflicts with 04's list becomes a question.
- `tokens.css` is excluded from Prettier, because Prettier rewrites `rgba(20,30,50,.05)` to `rgba(20, 30, 50, 0.05)` and the values must stay the spec text (`.prettierignore`).
- Icons (EZD-010b; vault/plans/EZD-010b.md): source `github.com/google/material-design-icons`, folder `symbols/web/<name>/materialsymbolsoutlined/`, pinned commit `49d4db35df873165d6bd6ba09b063c7dafbac2f4` (`ICON_COMMIT` in `app/scripts/icons-fetch.mjs`), Apache-2.0.
- Icon style: Outlined, weight 400, grade 0, optical size 20; FILL 0, with `<name>-fill` for FILL 1.
- To add an icon: run `pnpm --filter @ezdraft/app icons:fetch <name>`, add the name to `icons.json` in sorted order, run `pnpm --filter @ezdraft/app icons:build`, then commit the SVG, the sprite and the names file. `icons.test.ts` (T8) fails otherwise.
- `Icon` is decorative, so the button around it carries the label and tooltip (11 Accessibility).
- Never load the icon font, and never write the words "Material Symbols" in `app/src/` or `app/public/` (EZD-010c T7).
- Fonts (EZD-010c; vault/plans/EZD-010c.md): the files in `app/src/styles/fonts/` are copied unchanged from `@fontsource/instrument-sans` and `@fontsource/dm-mono` 5.3.0 (not installed as packages), OFL-1.1, licences next to them. Instrument Sans 400/500/600 for UI; DM Mono 400/500 for measurements, code and numbers.
- Latin subset only (11 rule 8): it covers ASCII, Spanish accents and punctuation, and the measurement marks `'` `"` `×` `°` `…`.
- Loaded with `next/font/local` in `app/src/styles/fonts.ts` as `--ez-font-sans` and `--ez-font-mono`, set on `<html>` by the root layout. Never load Google Fonts (`next/font/google`, `fonts.googleapis.com`, `fonts.gstatic.com`) or the icon font.

### Events

EZD-022 (vault/plans/EZD-022.md Step 4); 07 Hooks, events and integrations.

- The registry is `app/src/lib/events/registry.ts` (`EVENTS`, `EventName`, `EventPayloads`); `emit` is in `app/src/server/events/`. Call `emit` by its bare name through a relative import, never aliased (no app file uses the `@/*` alias yet and `app/vitest.config.ts` sets no alias).
- A new name goes into `EVENTS` in the same commit as its first emitter; screen events not named in 07 are added as `log_only`.
- Payload types are narrowed in `EventPayloads` by the emitting ticket.
- Sinks are added to `defaultSinks` in `app/src/server/events/index.ts` (EZD-109 event log, EZD-1301 webhooks).
- `user.joined` (`log_only`) is emitted by `completeSignIn` when a sign-in accepts an invite (`via: 'sign_in'`, EZD-007d) and later by EZD-105's invite link (`via: 'invite_link'`).

### Messages and language (t())

EZD-026c, EZD-026d, EZD-026a (vault/plans/EZD-026a.md Steps 1-5); R26 R17; R24 #40; 03 Tables user; Q-0028; Q-0030 (a); Q-0163.

- **Files.** `app/src/lib/messages/` (browser and server): `types.ts` (`Language`, `Surface`, `Message`, `MessageParams`), `language.ts` (`languageFor`, `NAMESPACES`, `SPANISH_NAMESPACES`, `KEY_PATTERN`), `t.ts` (`createT`, `T`, `MissingMessageError`, `MissingMessageParamError`), `MessagesProvider.tsx` (`MessagesProvider`, `useT`), `index.ts` re-exporting them. `app/src/server/messages/` (server-only, never in a client bundle): `catalogs/en.ts` (`en`, `MessageKey`), `catalogs/es.ts` (`es`, `SpanishKey`), `catalog.ts` (`catalogFor`), `get-t.ts` (`getT`, for server components). `app/src/app/dev/messages/` holds the test-page components `SampleText` and `MessagesSample`.
- **Surfaces and language.** Surfaces are `office`, `field`, `client`, `dev` and `sign_in`. The office editor and the client link are English in v1; the field pack and the other crew phone screens show the user's language (`app_user.language`, `en` or `es`), never a browser locale or a cookie (R26 R17; 03 user). `languageFor(surface, user)` returns it; its parameter excludes `sign_in`. `sign_in` is the signed-out pages `/sign-in` and `/auth/confirm` (EZD-007f), whose language is the device's choice from `getSignInLanguage()` (EZD-007d; Q-0047 (a)). Spanish users always see Spanish, never English or blanks (R24 #40), so there is no English fallback on a Spanish surface.
- **Namespaces per surface.** `office`: every namespace except `dev`. `field`: `common`, `field`, `error`. `client`: `common`, `client`, `error`. `dev`: `common`, `field`, `error`, `dev`. `sign_in`: `common`, `error`. `SPANISH_NAMESPACES` (`common`, `field`, `error`, `dev`) need Spanish text for every key; `client` and `office` are English only. `catalogFor('office' | 'client', 'es')` throws; `catalogFor('sign_in', 'es')` is allowed.
- **Key format.** `KEY_PATTERN`: `<namespace>.<lower_snake>[.<lower_snake>...]`, for example `error.db_unavailable`.
- **Text syntax.** `{name}` placeholders (a missing param throws `MissingMessageParamError`); a plural message is `{ one, other }` and needs a numeric `count`, chosen with `Intl.PluralRules` for the language. Numbers are inserted as given, with no locale grouping or decimal comma.
- **Use.** A server layout or page resolves the language, calls `catalogFor(surface, language)` and passes the result to `MessagesProvider` unchanged (no cast of its own); client components call `useT()`. The hook result is always named `t`, because the lint relies on that name. `useT()` and `getT` are typed over every `MessageKey`, but the provider holds only the surface's namespaces, so typecheck does not catch a key from another surface; such a key throws `MissingMessageError` at run time (`app/src/lib/messages/t.ts`), the lint's `keyNamespace` check catches a literal one in the phone and test-page folders, and office components are checked by review.
- **Adding a string.** Add the `en` entry; for a Spanish namespace add the `es` entry in the same commit. The ticket's builder writes the Spanish text in that commit, and a Spanish-speaking crew member checks it at the field checks and in Phase 15 (Q-0030 (a)). Shell and office strings use `office.` keys, English only.
- **Route error keys.** A route that returns a `message_key` adds it to `en`, and to `es` when its namespace needs Spanish, in the same commit. Route error `message_key` values live in the `error` namespace. `message-keys.test.ts` checks every literal `message_key` in `app/src`; a key built at run time is checked by review.
- **Lint.** `ezdraft/no-literal-ui-string` (`eslint-rules/no-literal-ui-string.mjs`, registered by `eslint-rules/index.mjs`; blocks in `eslint.config.mjs`) reports JSX text with a letter, a text expression as a JSX child, a text attribute (`alt`, `title`, `placeholder`, `label`, `aria-label`, names ending in `Label`, `Title`, `Text`, `Message` and similar) and, with `allowedKeyPrefixes`, a `t('<literal>')` key outside the folder's namespaces. Test files are exempt. Folders: field and crew phone `app/src/app/(field)/`, `app/src/components/field/`, `app/src/components/phone/`, `app/src/components/states/` (prefixes `common.`, `field.`, `error.`); client link `app/src/app/(client)/`, `app/src/components/client/` (`common.`, `client.`, `error.`); test page `app/src/app/dev/messages/` (adds `dev.`); sign-in pages `app/src/app/sign-in/`, `app/src/app/auth/confirm/`, `app/src/components/auth/` (`common.`, `error.`; EZD-007e). `(field)` and `(client)` are App Router route groups and add no URL segment. A ticket that adds a phone folder (EZD-015's states, EZD-020's entry points, EZD-007's sign-in) changes the block's `files` in its own commit. Office components are not linted by the rule.

- **Request language** (EZD-026b, vault/plans/EZD-026b.md Step 3; Q-0029 (a); Q-0087): `getRequestLanguage(surface)` in `app/src/server/messages/request-language.ts` is the only way a page resolves the language. Office and client return `en` with no query. Field and dev read `app_user.language` for `session.appUserId` once per request through `createSessionClient()` (the gated server path), and throw `NotSignedInError` with no session. There is no claim or cookie. A user record always has a language; a new user gets the column default `en`, and the inviter or the user switches to Spanish in settings. The test page is `/dev/messages` (not found in production).

### Shell header (EZD-011)

EZD-011a (vault/plans/EZD-011a.md Step 7); 04 Frame and visual system (Studio); S03 `.card`, `.b`, `.bp`.

- `app/src/components/shell/` holds the shell parts. `card.module.css` is the one card surface (background, border, radius 12, card shadow); other parts compose it with `composes`, never copy it.
- `HeaderCard` (`HeaderCard.tsx`, `HeaderCard.module.css`) is the 60 px header card. It owns its height and its 16 px top and side margin, so the frame adds none. It is server-safe and renders one `<header>`.
- `HeaderButton` (`HeaderButton.tsx`, `HeaderButton.module.css`) is the secondary and primary header button: `variant` is `secondary` (default) or `primary`; every other prop, including `ref`, passes through to the `<button>`.
- `index.ts` re-exports the shell parts.
- The body margin reset lives in `app/src/styles/globals.css`.

EZD-011b (vault/plans/EZD-011b.md Step 6); 04 Header card.

- `EditorHeader` (`EditorHeader.tsx`) is the editor header content inside `HeaderCard`. `EditorHeaderProps` slots render in this order after the view tabs: `reviewPill`, `share`, `export`, `issueSet`. An empty slot renders nothing; slot owners hide their own control with `can()`.
- Board positions reserved for later tickets, each added as its own optional prop: presence avatars before the review pill (S06), Stop editing between the pill and Share (S21), the field-pack chip between the title block and the tabs (S22).
- `EditorView` and `EDITOR_VIEWS` (`editor-views.ts`) are the one view type; EZD-120b imports them.
- Header strings are `office.header.*` keys in `en` only (office is English in v1).
- `EditorHeader` is `memo`, so callers pass stable callbacks (`useCallback`) and no per-frame props.

### Editor shell (EZD-012)

EZD-012a, EZD-012b (vault/plans/EZD-012b.md Step 6); 04 Frame and visual system (Studio), Tool rail, Status bar.

- Files in `app/src/components/shell/`: `EditorFrame` (`EditorFrame.tsx`, `EditorFrame.module.css`, type `EditorFrameProps`), `StatusBar` and `StatusItem` (`StatusBar.tsx`), `EmptyEditor` (`EmptyEditor.tsx`), and EZD-012a's `ToolRail` (`ToolRail.tsx`) with its entry types in `rail-types.ts`. All are client components that read text through `useT()` with `office.` keys (English only).
- `EditorFrame` renders, in order: the header slot, the body (rail, left panel, canvas, inspector), the status bar. Regions carry `data-shell-region`: `frame`, `body`, `rail`, `left-panel`, `canvas`, `inspector`, `status-bar`. Status bar parts carry `data-status` (`start`, `end`), `data-status-item`, `data-status-label`, `data-status-value`. Do not rename them; EZD-012c, EZD-014 and EZD-032 select on them.
- The header slot is unwrapped: `HeaderCard` owns its height and margin, so the frame adds none.
- Sizes are the 04 sizes, border-box, taken from the frame tokens in `tokens.css` (left panel 248, inspector 336, status bar 30, grid 32, body padding and gap 16).
- The grid is CSS on the frame root until EZD-207 decides how its WebGL grid meets it.
- Rail entries are props. EZD-230 owns the tool list, the "More tools" flyout and the per-user order (Q-0038 (b), Q-0122 (a)); a tool appears only when its feature exists. The tooltip is CSS only (EZD-012a).
- Status bar readouts that change per pointer move write through a ref, never React state (11 rule 4). The disclaimer line goes in the status bar (EZD-136, Q-0229).
- The shell adds no pointer, scroll or resize listener.

### Device layouts (EZD-014)

EZD-014a, EZD-014b, EZD-014c (vault/plans/EZD-014a.md, EZD-014b.md, EZD-014c.md); 02 Platform; 11 Accessibility and input; Q-0053; Q-0054 (a); Q-0055 (a); Q-0056 (a); Q-0088; Q-0098 (a); Q-0245.

- Desktop, Surface and iPad landscape show the full editor; a phone shows the simple layout. Browser tests route by the tags `@ipad`, `@surface` and `@phone` (see `### Browser tests (EZD-016a)`).
- `app/src/lib/device/device-layout.ts` holds `FULL_SHELL_MIN_WIDTH` (1024), `DESKTOP_REFERENCE_WIDTH` (1600), `PHONE_LAYOUT_QUERY`, `COMPACT_HEADER_QUERY` and `COARSE_POINTER_QUERY`. The CSS files that repeat 1024 and 1600 have tests that keep them equal.
- `DeviceLayout` renders one tree at a time with one `change` listener and no resize listener; the server markup is the full shell. `EmptyEditor` takes a `phone` default.
- `app/src/components/phone/` holds three phone components, covered by the lint, importing nothing from `components/shell/` or `components/device/`. EZD-1404, EZD-1013 and EZD-1202 fill them. Pages pass the field catalog (`/dev/device` uses `?lang=es` until EZD-026b).
- 44 px targets: `--ez-touch-target` applies under `@media (any-pointer: coarse)`; `touch.module.css` `.target` and `.hitArea` serve later controls; `:hover` styles sit only under `@media (hover: hover)`, except the rail pressed rule; the rail tooltip also shows on focus (Q-0245). `expectTouchTargets(page, root)` in `app/test-harness/touch-targets.ts` measures them.
- Header: only the title block shrinks. Below 1600 px `HeaderButton` with `icon` shows the icon (Share `share`, Export `download`, EZD-126 `edit`); Issue set keeps its text.
- The test page is `/dev/device` (`?lang=es` shows the phone notice in Spanish; not found in production).

### State components (EZD-015)

EZD-015a, EZD-015b, EZD-015c (vault/plans/EZD-015a.md, EZD-015b.md, EZD-015c.md); S01 States; 11 Accessibility and input; Q-0030 (a); Q-0057 (b); Q-0058 (a).

- `app/src/components/states/` exports `Skeleton`, `SkeletonGroup`, `AsyncView`, `useAsync`, `InlineError`, `OfflineBanner`, `OfflineBannerView`, `StateHost`, `ToastProvider`, `useToast`, `ConfirmProvider`, `useConfirm`, `TOAST_DEFAULT_MS`; `app/src/lib/network/` exports `createOnlineSource`, `useOnline`.
- S01 States pattern: loading is `AsyncView` with a `SkeletonGroup`; an error is `InlineError` with the screen's own key and Retry; offline is `OfflineBanner` (default `common.offline`); toasts go through `useToast().show`; confirmations go through `useConfirm()`, which answers `'confirm'` or `'cancel'`, and the caller supplies `confirmLabel`.
- `StateHost` is mounted once per entry point, inside `MessagesProvider`.
- `AsyncView`'s `load` is stable (`useCallback`); a new identity starts a new load.
- Offline means `navigator.onLine` is false; read it with `useOnline` and add no `online` or `offline` listener.
- Plain toasts clear after `TOAST_DEFAULT_MS` (5000 ms) or their own duration; action toasts stay until used or closed; one one-shot `setTimeout` per toast.
- The confirm dialog is Radix `AlertDialog` from `radix-ui`, imported only in `ConfirmDialog.tsx`; Esc is Cancel, focus starts on Cancel, and the content carries the provider's `lang`; z-index: overlay 100, dialog 101, toast viewport 102.
- Strings `common.retry`, `common.offline`, `common.cancel` and `common.close` exist in `en` and `es`; buttons are `StateButton` with `touch.target` (44 px on coarse pointers).
- The folder imports nothing from `components/shell/`, `components/phone/`, `components/device/` or 3D code, and is in the field lint block.
- EZD-126 extends the toast `tone`.
- The test page is `/dev/states` (`?lang=es` shows Spanish; not found in production).

### Entry points and lazy modules (EZD-020)

EZD-020 (vault/plans/EZD-020.md Steps 1-4); 11 Performance (Budgets Download size, rules 3 and 7); 04 ("the only separate pages are Projects, Settings, the phone field pack and the client link").

- **Entry points are route groups**, each with its own `layout.tsx` (a server component rendering `<div data-entry="<name>" style={{ display: 'contents' }}>`); code imported only by one group's layout and pages reaches only that group's pages.

| Group | `data-entry` | Entry (11 Budgets) | Placeholder (404 in production) | Real pages from |
| --- | --- | --- | --- | --- |
| `app/src/app/(office)/` | `office` | Projects and Settings, 200 KB | `/dev/entry/office` | EZD-117a (`/`), EZD-103 (`/settings/...`) |
| `app/src/app/(editor)/` | `editor` | Editor before its lazy parts, 500 KB | `/dev/entry/editor` | EZD-120b |
| `app/src/app/(field)/` | `field` | Field pack, 200 KB | `/dev/entry/field` | EZD-1404 |
| `app/src/app/(client)/` | `client` | Client link, 200 KB | `/dev/entry/client` | EZD-1202 |

- The placeholders carry what every page of the entry will carry (`MessagesProvider`, `StateHost`, and `EmptyEditor` or `PhoneFrame`), so the perf check measures something now; each owner ticket adds its real pages in the group and repoints the measurements (`### Entry contents and bundle report (EZD-020)`).
- **One root layout.** `app/src/app/layout.tsx` stays the only root layout and carries only what every entry needs; anything else goes in a group layout.
- `/` stays EZD-007's `app/src/app/page.tsx` until EZD-117a creates `(office)/page.tsx` for Projects and deletes the old file in the same commit (two pages cannot both resolve to `/`).
- The client link adds its path to `isPublicPath` (EZD-007 Step 4; EZD-1202).
- **`app/src/editor/`** is reserved for editor-only code that is not a shell component (store, canvas, tools; EZD-120b, EZD-207). `three` and `@react-three/*` may be imported statically there (the plan canvas, 02 Stack 2D + 3D), never in Projects, Settings, the field pack, the client link or shared code.
- **Lazy modules.** A lazy module is a folder `app/src/lazy/<name>/` with an `index.ts` or `index.tsx`; only files inside it import its heavy library statically. Code outside the folder reaches it only by `import()`: plain modules through `lazyModule(() => import('.../lazy/<name>'))` (`app/src/lib/lazy/lazy-module.ts`: `load()`, `preload()`, `peek()`; one promise in flight, a rejected load is tried again on the next `load()`); React components through `next/dynamic(() => import('.../lazy/<name>'), { ssr: false })`, rendered only when the user opens the feature (a dynamic component mounted at load downloads at load). `import type` from a lazy module is allowed (types are erased).
- Lazy-only libraries: the GLB and USDZ exporters (`three/examples/jsm/exporters/`, `three/addons/exporters/`), `three-bvh-csg`, `three-gpu-pathtracer`, `pdfjs-dist`, `dxf-parser` and the DXF writer. Allowed statically only in `app/src/lazy/`, Web Workers (`app/src/workers/`) and, for pdf.js and the DXF libraries, job handlers (`app/src/server/jobs/`).
- `<Link>`s from the office, field and client entries into the editor use `prefetch={false}`; the contents check reports editor code that a prefetch pulls in.
- Reserved lazy-module names (each folder is created by its owner ticket):

| Folder | Holds | Owner |
| --- | --- | --- |
| `scene-3d/` | perspective 3D scene and meshes | EZD-1001a; EZD-1013 (phone viewer) reuses it or adds `phone-3d/` |
| `pathtracer/` | three-gpu-pathtracer | EZD-1105 |
| `pdf/` | pdf.js underlay | EZD-304 |
| `dxf-writer/` | DXF writer (browser use only, if any) | EZD-913 |
| `exporters/` | GLB and USDZ (or a worker in `app/src/workers/`) | EZD-1014 |
| `sheets/` | sheet renderer | EZD-702b |
| `detail-editor/` | Detail editor | EZD-801 |
| `catalog-drawer/` | catalog drawer | EZD-1601 |
| `reference/` | reference drawing in Plan | EZD-901b |

- `app/src/lazy/dev-sample/` is the dev-only proof module, loaded by `/dev/lazy` on first press.
- **One list.** `eslint-rules/boundaries.mjs` (`LAZY_ROOT`, `LAZY_PLACES`, `EDITOR_CODE`, `EDITOR_CODE_IMPORTERS`, `HEAVY_PACKAGES`, `ENTRY_RULES`, `WATCH_PACKAGES`) is the single list read by the lint rule `ezdraft/import-boundaries` and by the contents check; EZD-029's replace path edits the DXF names there, and a test fails when that list and the Named tools `DXF` row drift apart.
- The lint rule (`eslint-rules/import-boundaries.mjs`, block in `eslint.config.mjs` for `app/src/**` and `packages/*/src/**`, test files ignored) reports `heavyPackage`, `lazyStatic` (a static import into `app/src/lazy/<name>/` from outside it) and `editorOnly` (editor code imported outside `EDITOR_CODE_IMPORTERS`). It resolves relative paths only; a ticket that adds a tsconfig path alias teaches the rule to resolve it. Transitive imports through shared code are caught by the contents check, not the lint.

### PWA (EZD-013)

EZD-013 (vault/plans/EZD-013.md Steps 1-12); 02 Platform; R24 #1; Q-0051 (a); Q-0053; Q-0088.

- Files: `app/src/lib/pwa/app-meta.ts` (`APP_NAME` `EZ Draft`, `THEME_COLOR` read from the `--ez-canvas` entry of `TOKENS`), `app/src/app/manifest.ts` (served at `/manifest.webmanifest`), `app/src/lib/pwa/register-sw.ts` (`registerServiceWorker`), `app/src/components/pwa/ServiceWorkerRegistration.tsx` (mounted last in `<body>` of the root layout), `app/public/sw.js`, `app/next.config.ts` (the `/sw.js` header), `app/src/app/layout.tsx` (`appleWebApp`, `viewport`), `app/src/pwa/app-icon.html` and `app/scripts/app-icons.mjs`.
- Manifest values: name and short name `EZ Draft` (R24 #1), `display` `standalone`, `start_url` and `scope` `/`, `id` `/`, `lang` `en`, `background_color` and `theme_color` `#f6f7f9` (`--ez-canvas`, 04 Frame and visual system), three icons (192 `any`, 512 `any`, 512 `maskable`). No description and no orientation.
- `/sw.js` with scope `/` is fixed: EZD-134 builds the Workbox worker at the same URL or unregisters this one.
- No fetch handler and no cache until EZD-134; the worker only calls `skipWaiting` and `clients.claim`.
- `registerServiceWorker` registers after the window `load` event, only in a secure context with service worker support, and reports a failed registration with `captureBrowserError(error, 'pwa.register')`, loaded with `import()`, and never throws.
- Re-render the icons: edit `app/src/pwa/app-icon.html`, run `pnpm --filter @ezdraft/app app-icons:render`, commit the five PNGs.
- Public static files keep a file extension, so the request gate (`app/src/proxy.ts` matcher) never sees them.

## Server-only data access and can()

03 rules 1–2, 11; R26 R1, R2, R14. Documented here; implemented by EZD-133 (helper, server-route pattern, browser-query lint rule) and EZD-102 (enforcement, UI hook).

- Browser code never queries tables. It calls the app's own HTTP routes (Route Handlers under `app/src/app/api/**`) through one fetch helper in `app/src/lib/` that adds the app version to every request (03 rule 12; EZD-134). Reads and writes use Route Handlers, not Server Actions, because the outbox (03 rule 9) and the EZ Binder inbound API need plain HTTP endpoints.
- The two exceptions (03 rule 1): Realtime subscriptions authorized per project scope (EZD-018) and signed uploads straight to Storage (EZD-132).
- Every route: read the session → load the user's membership and permissions in one indexed query per request (EZD-102) → `can()` → query with a Supabase client carrying the user's session, so RLS stays the backstop (03 rule 1; 11 rule 10) → return an explicit field list.
- Contract: `can(ctx, permission, target?) → boolean`. `ctx` is the per-request context: user, active tenant from the token-hook claim, membership status and scope, permission set. `permission` is a typed key from the EZD-101 list (key spelling is EZD-101's). `target` is `{ projectId }` when the action is on a project: scoped users pass only for their listed projects; deactivated users always get false (03 Tables membership; EZD-006). A `requirePermission(...)` wrapper turns false into a 403 (EZD-102). The browser `can()` hook (EZD-102) only hides controls; it is never the security check.
- `ctx`'s active tenant is the `tenant_id` claim the token hook sets (EZD-006); `membership_id` and `project_scope` are in the token too, and `app_user_id` names the user's `app_user` row.
- PostgREST refuses any request without the server-only gate header `x-ezd-api-gate`, so a user's access token alone reads and writes nothing through the REST API; only server routes, which call `can()`, reach it (Q-0087; EZD-006). EZD-007's `createSessionClient()` sends the header from the server-only env name `SUPABASE_API_GATE_SECRET`.
- Money (03 rule 2; R26 R2): cost fields are added to a response only when `can(ctx, <See company costs>)`, and sell, markup and total fields only when `can(ctx, <See sell prices>)`, through one serializer per resource in `app/src/server/`. Client-link routes never touch money tables (03 rule 11).
- The service-role key is used only in job handlers, migrations, seeds and admin scripts, never in request-path routes and never in browser bundles. The render worker uses its own revocable key (03 render_worker).

### Auth and session (EZD-007)

EZD-007a (vault/plans/EZD-007a.md Steps 1, 1b, 2.0, 2.1, 2.5); 02 Users and role presets; 11 Security and audit; R24 #14; R26 R15; Q-0046 (a); Q-0047 (a); Q-0048 (a); Q-0049; Q-0050 (a); Q-0052 (c); Q-0094; Q-0165 (a). The session, linking, cookie, page and message bullets are EZD-007b–f's.

- **Local Auth config** (`supabase/config.toml`, local only; each cloud project gets the same values by hand, `docs/runbook.md` `## Sign-in (EZD-007)`): `[auth.email]` `otp_length = 6` (R26 R15), `otp_expiry = 900` (Q-0049: link and code valid 15 minutes), `enable_confirmations = true` (a password sign-up gets no session without the mailbox), `secure_password_change = true`; `[auth]` `jwt_expiry = 3600` (Q-0052 (c)), `enable_signup = true` (code sign-in creates the auth user and the hook gates it); `[auth.sessions]` `inactivity_timeout = "9600h"` (Q-0048 (a): 400 days unused); `[auth.rate_limit]` `email_sent = 1000` (local only, so tests can send many emails). `minimum_password_length` is EZD-033's (Q-0094).
- **Sign-in email** `supabase/templates/sign-in.html`, set as both `[auth.email.template.magic_link]` and `[auth.email.template.confirmation]` (Auth sends "confirmation" the first time an email signs in and "magic link" after that); subject `Your EZ Draft sign-in link and code / <Spanish>`. One `lang="en"` block then one `lang="es"` block (Q-0047 (a)); the link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (no code verifier, so it opens on any device) plus the 6-digit `{{ .Token }}`; never `{{ .ConfirmationURL }}`, no image, no tracking.
- **Auth reads `config.toml` only at `supabase start`:** after any `[auth…]` change run `pnpm db:stop` once, then `pnpm db:up`; a `db reset` alone does not apply it.
- **Before-user-created hook** `private.auth_before_user_created(event jsonb)` (`[auth.hook.before_user_created]` `uri = "pg-functions://postgres/private/auth_before_user_created"`; Q-0165 (a)): `security definer`, executable by `supabase_auth_admin` only (revoked from `public`, `anon`, `authenticated`; not in `GATED_RPC_CALLS`, schema `private` is off the REST API). It allows (`{}`) when `lower(event->'user'->>'email')` matches an `app_user.email` with a membership that is `active` or passes `private.invite_is_valid`; everything else, including a missing email, gets `{"error": {"http_code": 403, "message": "sign_in_not_allowed"}}` (fail closed; R24 #14: users are invited in EZ Draft). Observed on the pinned CLI 2.121.0: the hook runs for the public sign-up and code-request paths and **not** for the admin API (`auth.admin.createUser` with the secret key created a user for an unknown email), so test fixtures that need an auth user go through `createAuthUserPastGate` all the same (finding A3) and admin creation stays a server-only path.
- **Invite validity** `private.invite_is_valid(p_status text, p_invited_at timestamptz)`: `invited` and `invited_at` within the last 7 days (Q-0050 (a); the EZD-105 row); a null sent date is invalid. Execute is revoked from `public` and given to no role (on the pinned stack the schema's default privileges did not cover it; EZD-006 T10 checks `anon` can call only `api_request_gate`); the hook and `link_app_user` run as owner. Called by the hook and by EZD-007b's `link_app_user`; EZD-105 may redefine it with the same signature.
- **Unconfirmed-password guard** (Q-0094): trigger `auth_users_password_guard` `before insert or update on auth.users`, function `private.auth_users_password_guard()` (`security definer`, no role may execute it directly). While `email_confirmed_at is null` it sets `encrypted_password` to `null`, the value the pinned Auth reads as "no password" (the stack itself stores a bcrypt hash even for a code-only user, so the guard writes one constant for every unconfirmed row). Confirmed accounts are untouched; EZD-033 and EZD-105b set passwords on confirmed accounts (Q-0095).
- **Linking at sign-in** (EZD-007b, vault/plans/EZD-007b.md Step 1; Q-0050 (a); Q-0043 (a); Q-0099 (b)): `public.link_app_user() returns table (app_user_id uuid, has_access boolean, accepted_membership_id uuid, accepted_tenant_id uuid)`, `plpgsql`, `volatile`, `security definer`, executable by `authenticated` only (`revoke all … from public, anon, service_role; grant execute … to authenticated`). Zero or one row. No row when `auth.uid()` is null, when the session has ended (`private.session_is_live()` false, finding B4), when the auth email is not confirmed (`email_confirmed_at is null`), or when no `app_user` row holds that lower-cased email unlinked or already linked to this auth user; a row linked to another auth user is never re-pointed. It sets `app_user.auth_user_id`, locks the person's memberships `for update`, then: an `active` membership → `(id, true, null, null)` and nothing accepted (one active company per person); else the most recent `private.invite_is_valid` invite (tie: higher `id`) becomes `active` → `(id, true, <membership>, <tenant>)`, every other invite stays `invited`, `invited_at` and `last_active_at` untouched; else `(id, false, null, null)`. Idempotent. EZD-007d's `completeSignIn` calls it right after `verifyOtp`.
- **Current user** (EZD-007b Step 2; Q-0052 (c)): `public.current_app_user_id() returns uuid`, `sql`, `stable`, `security definer`, `authenticated` only (same two statements). Returns null when `private.session_is_live()` is false, else the `app_user.id` whose `auth_user_id = auth.uid()`, or null. It never raises (it does not call the `private` helpers that raise `42501` on an ended session), so a deactivated user's still-valid JWT gets null and routes fail closed at 401. One `auth.sessions` primary-key lookup and one `app_user` unique-index lookup per call. Read by EZD-007c's `getSession()` and EZD-018.
- **Invite acceptance keeps the session** (EZD-007b Step 3; Q-0044 (b)): `private.membership_end_sessions()` is redefined with `create or replace` (same body; trigger and privileges kept) so a `status` change from `invited` to `active` does not end sessions; every other status change, every scope change and every delete still does.
- Both functions are in `GATED_RPC_CALLS` (`app/test-harness/rls/gate.ts`), so the API request gate applies (EZD-006 T22 (c), (j)).
- **Session client** (EZD-007c, vault/plans/EZD-007c.md Steps 2–4; Q-0087 (ii); Q-0048 (a); Q-0052 (c)): server code reaches Supabase for a signed-in person only through `createSessionClient(jar?)` in `app/src/server/auth/supabase-server.ts` (synchronous; `@supabase/ssr` `createServerClient` with the publishable key). Every PostgREST request carries the gate header `API_GATE_HEADER` (`x-ezd-api-gate`) from the server-only `SUPABASE_API_GATE_SECRET`, read per call by `serverGateSecret()` in `app/src/server/db/env.ts` (at least 43 characters, else it throws `api_gate_secret_not_set`, never the value). It never uses the secret key. `SessionCookieJar` is `{ getAll, set, isHttps }`; without a jar the client uses `next/headers`, and EZD-007d's request gate passes its own jar over the request and response cookies. Cookies are the Supabase auth cookies (`sb-…`), set only by the server, `httpOnly`, `sameSite` `lax`, `path` `/`, `secure` on `https` (first value of `x-forwarded-proto`), and 400 days from last use (`SESSION_COOKIE_OPTIONS`, `maxAge` 34560000; a delete keeps `maxAge` 0). Next.js refuses a cookie write from a Server Component, so the default jar drops it; EZD-007d's request gate writes the token refresh before the page renders, and Route Handlers and Server Actions write normally.
- **Session helpers** (`app/src/server/auth/session.ts`): `Session` is `{ authUserId, appUserId, email }`; the signed-in user's own `app_user` row is `session.appUserId` (EZD-026b, EZD-102). `getSession()` (React `cache()`, once per request) returns `null` when the client cannot be built (missing env or secret), when `auth.getClaims()` errors or has no `sub`, or when `current_app_user_id()` returns null (no linked `app_user`, or an ended session; the generated type says `string`, the code reads `string | null`); a failed `current_app_user_id` call rejects (Q-0168 (b)). `requireSession()` redirects to `/sign-in`; `requireApiSession()` returns a 401 `Response` with `{ "error": { "code": "not_signed_in", "message_key": "error.not_signed_in" } }`.
- **Completing a sign-in** (EZD-007d, vault/plans/EZD-007d.md Steps 2, 3; Q-0050 (a); Q-0052 (c)): `completeSignIn(client)` in `app/src/server/auth/complete-sign-in.ts` runs right after `verifyOtp`: `rpc('link_app_user')` (links the `app_user` and accepts the most recently sent valid invite); no row or `has_access` false signs out this device and returns `'no_access'`; an accepted invite emits `user.joined` with `via: 'sign_in'` (an emit failure does not fail the sign-in, the acceptance is committed); then `auth.refreshSession()` once so the token hook adds the tenant claim, and returns `'ok'`. It fails closed: an RPC error or a refresh error signs out this device and throws `link_app_user_failed` or `session_refresh_failed` (500 unexpected, never shown). It logs nothing.
- **Sign-in actions** (EZD-007d Step 3, `app/src/server/auth/actions.ts`, `'use server'`; Q-0167 (a); Q-0169 (a); Q-0174 (a)): they return codes, never text (EZD-007e owns the wording). `requestSignIn(formData)` (field `email`, trimmed and lower-cased) → `{ step: 'code' }`, or `invalid_email` (no Auth call, no cookie) or `too_many_requests` (only the per-IP 429 `over_request_rate_limit`, no cookie). The same answer for every address: accepted, refused by the hook (403) or any other 429 all return `{ step: 'code' }` and set the cookie, so the answer never shows whether an account exists; any other Auth error throws (500 unexpected). `verifySignInCode(formData)` (field `code`, six digits; `email` from the form, else the cookie) and `confirmSignInLink(formData)` (fields `token_hash`, `type`, only `email` accepted) redirect to `/` on success and clear the email cookie; otherwise `code_invalid` / `link_invalid` (a malformed input makes no Auth call), `no_access` or `too_many_requests` (Auth 429; the cookie stays). `signOut()` ends the session on this device only (`scope: 'local'`) and redirects to `/sign-in`, also when the client cannot be built. `setSignInLanguage(formData)` (field `lang`: `es`, anything else `en`) sets the language cookie; it never changes `app_user.language`. Nothing is logged; codes, token hashes and emails never appear in an error.
- **Sign-in cookies** (EZD-007d): `ezd_sign_in_email` (the address being signed in, `maxAge` 900 s, Q-0049) and `ezd_sign_in_lang` (`en` or `es`, `maxAge` 34,560,000 s, Q-0047 (a)); both `httpOnly`, `sameSite` `lax`, `path` `/`, `secure` on `https` (first value of `x-forwarded-proto`), written only by the server. `getSignInLanguage()` (`app/src/server/auth/sign-in-language.ts`) reads `ezd_sign_in_lang` for the signed-out pages only: `es` when the cookie is exactly `es`, else `en` (Q-0029 (a)); signed-in surfaces use `app_user.language`.
- **Request gate** (EZD-007d Steps 5, 6; P-Step 4; Q-0173): `app/src/proxy.ts` (Next.js 16 `proxy`, matcher every path except `_next/static`, `_next/image` and files with an extension). Pages are deny-by-default: with no session (`auth.getClaims()` error or no `sub`), a path not in `PUBLIC_PATHS` gets a `307` to `/sign-in` with no query string (no `next=`, so no open redirect). Missing Supabase env or a client that cannot be built counts as signed out; the gate never answers 500. It builds the one session client with its own jar over the request and response cookies, so a token refresh rewrites the 400-day auth cookies on use (400 days from last use, Q-0048 (a)); the cookies it writes go on whichever response it returns, with `Cache-Control: private, no-store`. It does not check for an ended session; pages call `requireSession()` and routes `requireApiSession()`. `PUBLIC_PATHS` (`app/src/server/auth/public-paths.ts`) is `/sign-in`, `/auth/confirm`, `/api` (Route Handlers answer 401 themselves) and `/dev` (developer pages, 404 in production); `isPublicPath(p)` is true for an entry or an entry followed by `/`. A later public page (client link, `/terms`, inbound API) adds its entry in its own commit.
- **Sign-in pages** (EZD-007f, vault/plans/EZD-007f.md Steps 3–10; Q-0047; Q-0039 (c); Q-0170 (b)): `/sign-in` (email, then the 6-digit code; a signed-in visitor goes to `/`; `?e=no_access` shows `error.no_access`) and `/auth/confirm` (verifies only when its button is pressed, never on `GET`; `Referrer-Policy: no-referrer` from `app/next.config.ts` `headers()`), both in the device's language with `LanguageSwitch`. "Use a different email" calls `clearSignInEmail()` (`actions.ts`), which deletes `ezd_sign_in_email`. An action that rejects for any reason other than Next's redirect shows `error.sign_in_failed`. `SignOutButton` (`app/src/components/auth/`) takes an optional `beforeSignOut` hook; when it answers false nothing is submitted (`confirmSignOut`; EZD-134, EZD-108). `/` requires a session and shows only Sign out until Phase 1 (Q-0039 (c)).
- **Local sign-in rate limits** (EZD-007d D1): `[auth.rate_limit]` `sign_in_sign_ups = 1000` and `token_verifications = 1000` in `supabase/config.toml`, local only, so one gate's many test sign-ins from 127.0.0.1 are not refused; cloud projects keep Supabase's limits.
- **Allowed Supabase client files** (EZD-007c T34): the only non-test files under `app/src/` that import `@supabase/*` as values are `app/src/server/auth/supabase-server.ts`, `app/src/server/db/client.ts` (`createPublicDbClient()`, anon, used only by `health.ts` for `rpc/health`), `app/src/server/jobs/db.ts` (`createJobsDbClient()`, secret key, job runner only; EZD-009) and `app/src/lib/realtime/adapter.ts` (EZD-018, the browser Realtime client, no table-query API). A ticket that needs another client file edits T34's list in its own commit with a reason, and the security-reviewer approves it.

### Realtime (EZD-018)

EZD-018 (vault/plans/EZD-018.md Steps 1–8); 02 Stack Database; 03 rules 1–2; 11 rule 11; R26 R1; P4; Q-0052 (c); Q-0087 (ii); Q-0044 (b).

- **Topics.** `project:<project_id>` (lock state, presence, job progress, review count) and `user:<app_user_id>` (notifications, `session.ended`), lower-case canonical UUIDs. Every channel is a Supabase Realtime **private** channel, so a join runs RLS on `realtime.messages`. Broadcast and Presence only; Postgres Changes are not used.
- **Who may join.** Two policies on `realtime.messages`, both `to authenticated` (none for `anon`): `realtime_messages_select` (receive broadcast and presence) through `private.realtime_can_receive(topic)`, and `realtime_messages_insert` (track presence only) through `private.realtime_can_track(topic)`. A `project:` topic needs `private.can_see_project(<id>)` (claim tenant and listed projects, read live, so a newly listed project is joinable on the next join, Q-0044 (b)); a `user:` topic needs `<id> = private.app_user_id()`; presence is project channels only; any other topic, a malformed id or an ended session is refused. `private.realtime_topic_id(topic, kind)` parses the id and never raises.
- **Clients never broadcast.** There is no insert policy for `broadcast`. Every event comes from the database through `private.broadcast_project(p_project_id, p_event, p_payload)` and `private.broadcast_user(p_app_user_id, p_event, p_payload)` (`security definer`, no API role may execute them; `22023` on a null argument or an event name not matching `^[a-z][a-z_]*\.[a-z][a-z_]*$`). Later tickets call them from triggers on the changed table, so an event is pushed only after its change commits: EZD-009 job progress, EZD-125 lock changes, EZD-127 review count on the project channel; EZD-110 notifications on the user channel. Each adds its event name to `app/src/lib/realtime/events.ts` (`ProjectChannelEvents`, `UserChannelEvents`) in the same commit as its trigger (T19 checks it).
- **Payload rule.** Every member who can see the project receives every project-channel message, and RLS checks project scope only, never permissions. A payload carries only ids, statuses, counters and timestamps: never money fields, model data, names or emails (03 rule 2). A subscriber that needs more refetches through a server route, where `can()` applies. `realtime.send` adds the message id as payload `id`; `toEventPayload` (`events.ts`) drops it.
- **`session.ended`.** `private.end_user_sessions(uuid)` (redefined in `plpgsql`, same signature and grants) also pushes `session.ended` `{}` on the user's channel whenever it ends their sessions (deactivation, removal, scope change, a narrowed project list; Q-0052 (c)). The hub then drops every channel, forgets the token and sends the person to `/sign-in`. The hard limit for a tampered browser is the access-token lifetime `jwt_expiry` = 3600 s.
- **Token route.** `GET /api/realtime/token` (`app/src/app/api/realtime/token/route.ts`) returns `{ url, apiKey, accessToken, expiresAt, appUserId }` (publishable key, the session's access token and its `expires_at` in seconds) with `Cache-Control: no-store`; 401 `error.not_signed_in` without a live session, 500 `error.db_unavailable` when the session read fails (Q-0168 (b)). The access token lives in browser memory only, for the Realtime socket; the refresh token stays in the `httpOnly` cookie. PostgREST refuses that token without the server-only gate header (Q-0087 (ii)), so it reads no table.
- **Hub.** `app/src/lib/realtime/` (`getRealtimeHub()` in `index.ts`, per tab, created on first use in the browser): `hub.project(projectId)` and `hub.user()` return handles (`status`, `ready`, `on(event, cb)`, `onResync(cb)`, `onStatus(cb)`, `release()`; project handles add `presence()` and `onPresence(cb)`); `react.ts` has `useProjectChannel` and `usePresence`. One channel per topic per tab, removed with the last handle; while any handle is open the hub also holds the user's own channel. Presence meta is `{ appUserId }` only (key = `appUserId`). The browser uses `@supabase/realtime-js` only, never `@supabase/supabase-js` (no table-query API in the browser).
- **Requests only on events.** The hub fetches a token at first connect, once after a refused or closed channel, and once per socket reopen after a drop; it starts no interval and no repeating timeout. The library's heartbeat frames and socket reconnect backoff travel on the WebSocket, not as HTTP requests. A join refused twice is `refused` and never retried.
- **Resync.** After a drop (channel error, timeout, unexpected close, socket close) the status is `reconnecting`; on the next socket open, or when `useOnline`'s source reports online, the hub fetches a token once, rejoins, and on `SUBSCRIBED` calls every `onResync` callback exactly once (the first subscription calls none), so each subscriber refetches once.
- **No polling lint** (11 rule 11). An `eslint.config.mjs` block for `app/src/**/*.{ts,tsx}` (test files, `test-utils/` and `test-harness/` ignored) refuses `setInterval` (`no-restricted-globals`) and `window.`/`globalThis.`/`self.setInterval` (`no-restricted-properties`). A display-only timer uses `// eslint-disable-next-line no-restricted-globals -- display only, no network`, and the code-reviewer checks the reason. A repeating `setTimeout` loop is checked by review. A later block that also sets either rule for the same files must repeat these entries, because a later flat-config block replaces a rule's options.

## Migrations

02 Named tools; 11 Operations; vault/tickets/README.md; EZD-023a.

- Folder `supabase/migrations/`. File name `<YYYYMMDDHHMMSS>_<snake_case_description>.sql`: a 14-digit UTC timestamp as `supabase migration new` writes it, then a description in lowercase letters, digits and underscores, e.g. `20261012093000_create_tenant.sql`. Timestamps are unique (check C5).
- One concern per file.
- Add before remove: never drop or rename what the previous release reads (11 Operations; check by EZD-023a, `### Release safety (EZD-023a)`).
- A migration that creates a table also adds `tenant_id`, its RLS policy, the `tenant_id` and `project_id` indexes and the tenant-isolation test (tickets README; 11 rule 10; EZD-006).
- TypeScript types are generated from the local database by the Supabase CLI into `app/src/server/db/database.types.ts` and committed (02 Named tools; EZD-004a adds the script).

### Local database

EZD-004a (vault/plans/EZD-004a.md Steps 2–6); 02 Named tools; 11 Operations "local (agents and tests)". The CLI is the root `supabase` devDependency, run through the root `db:*` scripts.

- `pnpm db:up`: `supabase status`, `supabase start` if the stack is not running, then `supabase db reset --local` every time, so every run applies every migration to a fresh database and wipes local data. The root `test` script runs it first, so every gate run (and CI) starts from a reset stack. Without Docker it exits 1 with `Local Supabase needs Docker running (start Docker Desktop).` on stderr.
- `pnpm db:env`: prints one JSON object with four keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from `supabase status` (the CLI's published local defaults, not secrets), and `SUPABASE_API_GATE_SECRET`, the trimmed content of `supabase/.temp/ezd-api-gate-secret` (EZD-007c); exit 1 when the stack is down, and exit 1 with no output and `supabase/.temp/ezd-api-gate-secret is missing: run pnpm db:up` on stderr when that file is missing or blank. `pnpm db:reset` and `pnpm db:stop` call the CLI directly.
- `pnpm supabase migration new <name>` writes the next migration file. After every migration run `pnpm db:types` and commit the result; `node scripts/db/gen-types.mjs --check` (test T9) fails the gate when the committed file differs from the local database.
- `supabase/config.toml`: `project_id = "ezdraft"` (one shared local stack for every worktree; one gate at a time, Q-0114), `[analytics] enabled = false`, `[edge_runtime] enabled = false` (jobs are Vercel Functions, P4); everything else at the CLI default. `supabase/seed.sql` holds tenant 1 and Josh (EZD-005b) and tenant 2 with its owner and 200 tenant 1 projects (EZD-016c); see the Tenancy tables (EZD-005) subsection.
- The first migration creates `public.health()`: `security definer`, `search_path = ''`, execute granted to `anon` and `authenticated` only; it returns one row `('ok', <newest applied migration version>)`, read through `POST /rest/v1/rpc/health`. It is a function, not a table, so EZD-006's table checks do not cover it.

Cloud dev: `.github/workflows/supabase-dev.yml` applies `supabase/migrations/` to the cloud project `ezdraft-dev` with `supabase db push --db-url` on each develop push that changes them and by Run workflow (Q-0107); without the `SUPABASE_DEV_DB_URL` secret it ends green and pushes nothing. Agents never run `db push` or `link` themselves (`.claude/hooks/guard-bash.mjs`). Josh's setup: `docs/runbook.md`, Supabase cloud projects.

### Tenancy tables (EZD-005)

EZD-005a (vault/plans/EZD-005a.md Steps 1, 5); 03 Tables tenant, user, membership, project; 03 intro; 11 rule 10; 11 Security and audit. Six migrations after the health migration: `create_set_updated_at`, `create_tenant`, `create_app_user`, `create_project`, `create_membership`, `create_membership_project`. RLS is enabled on every table with no policy; EZD-006 adds the policies, the token hook and the grants.

- The Data model `user` entity is table `public.app_user`: `user` is a reserved word in PostgreSQL.
- Tenant-less tables, the list EZD-006's CI test starts from (every later exemption needs its own reason here): `tenant` (it is the tenant; key `id`) and `app_user` (one person across tenants, linked to each company by `membership (user_id, tenant_id)`).
- A tenant-owned row that points at another tenant-owned row uses a composite foreign key carrying `tenant_id`: `membership` and `project` have `unique (id, tenant_id)`, and `membership_project` references `(membership_id, tenant_id)` and `(project_id, tenant_id)`, both `on delete cascade`, so a listed project can never belong to another company.
- Enumerated values are `text` columns with a `check` constraint, lower snake case (widening is add before remove, 11 Operations). `updated_at` on `tenant`, `app_user`, `project` and `membership` is kept by the `before update` trigger function `public.set_updated_at()` (`security invoker`, `search_path = ''`); `membership_project` has no `updated_at`.
- `tenant.contact` is JSON with keys `phone`, `email`, `website`, `address` (S15a Contact); `contact.email` is the company email replies go to (Q-0036; EZD-008). There is no separate reply-email column.
- `app_user.language` defaults to `en`; the inviter or the user switches it to `es` (Q-0029 (a); Q-0121 (a)).
- `app_user.auth_user_id` (unique, `references auth.users(id) on delete set null`) is filled at first sign-in by EZD-007.
- Indexes: `project_tenant_id_idx`, `membership_user_id_idx` (the EZD-006 token hook), `membership_project_tenant_id_idx`, `membership_project_project_id_idx`; `membership unique (tenant_id, user_id)` leads with `tenant_id` (11 rule 10).
- Seed rows (EZD-005b, vault/plans/EZD-005b.md Steps 1–3; Q-0033 (a); Q-0106; Q-0113): fixed ids tenant 1 = `00000000-0000-4000-8000-000000000001` (Worth Properties) and Josh = `00000000-0000-4000-8000-000000001001` (owner, membership `active` / `all`); `app/test-utils/seed-ids.ts` exports them as `TENANT_1_ID` and `JOSH_USER_ID`. `supabase/seed.sql` is local only (`supabase db reset --local`). Cloud projects get the same rows from `supabase/bootstrap/tenant-1.sql`, run once: dev by Josh through the SQL Editor (Q-0033 (a); `docs/runbook.md` Tenant 1 setup), prod by EZD-023b's release workflow on the first real release (Q-0106, Q-0113). The two files hold the same ids and values except the email (`josh@example.com` in the seed; typed in place of `PASTE-YOUR-EMAIL-HERE` in the bootstrap file); the placeholder (exactly once) and the codes `ezd_bootstrap_email_missing`, `ezd_bootstrap_already_done`, `ezd_bootstrap_done` are a contract with EZD-023b, and the file is one all-or-nothing `do $$ … $$;` block. `scripts/db/sql.mjs` `runLocalSql(sqlText)` is the local-only SQL runner (`docker exec … psql` into `supabase_db_<project_id>`, no connection argument).
- Local test rows (EZD-016c, vault/plans/EZD-016c.md Step 1; Q-0033 (a); Q-0198): `supabase/seed.sql` also holds tenant 2 (`Test Tenant 2`, id `00000000-0000-4000-8000-000000000002`), its owner (`tenant2-owner@example.com`, id `00000000-0000-4000-8000-000000002001`, membership `active` / `all`) and 200 tenant 1 projects (`Seed project 001` … `200`, ids from `00000000-0000-4000-8000-000000100001`). They are never in `supabase/bootstrap/tenant-1.sql`: the "same ids and values" rule between the two files covers tenant 1 and Josh only. `app/test-utils/seed-ids.ts` exports `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID`, `JOSH_EMAIL`, `TENANT_2_OWNER_EMAIL`, `SEED_PROJECT_COUNT` and `seedProjectId(i)`. Seed rule: tests never change seeded rows; a test that changes data creates its own rows with the EZD-006 or EZD-007a fixtures and removes them.

### Row-level security (EZD-006)

EZD-006 (vault/plans/EZD-006.md Steps 1–5, 8); 03 intro; 03 rule 1; 11 rule 10; 11 Operations; 11 Security and audit; R26 R1; Q-0043 (a); Q-0044 (b); Q-0087 (ii); Q-0052 (c). Seven migrations after EZD-005's: `create_private_schema`, `create_api_request_gate`, `create_rls_helpers`, `create_custom_access_token_hook`, `create_end_sessions_triggers`, `create_tenancy_policies`, `restrict_api_table_grants`.

- **Schema `private`** holds functions only (the audit's `table_in_private_schema` code): the helpers, the token hook and the request gate, all `security definer`, `set search_path = ''`, owned by `postgres`. It is not in `[api] schemas` (`supabase/config.toml` stays `public, graphql_public`), so nothing in it is callable through the REST API. `anon`, `authenticated`, `service_role` and `supabase_auth_admin` hold usage only; `pg_default_acl` holds no row for `private` on the pinned stack, so PUBLIC gets execute on a new function: every migration revokes it by name (`revoke all on function private.<fn>(…) from public;`) and grants by name. `anon` can execute exactly one function in it, `api_request_gate`.
- **Claims** (the token hook `private.custom_access_token_hook(jsonb)`, executable by `supabase_auth_admin` only; local `config.toml` `[auth.hook.custom_access_token]` `uri = "pg-functions://postgres/private/custom_access_token_hook"`; each cloud project enables it by hand, `docs/runbook.md`). One indexed query per token: `app_user` by `auth_user_id`, left-joined to the `active` memberships. `app_user_id` is set when an `app_user` row is linked to the auth user; `tenant_id`, `membership_id` and `project_scope` (`all` or `listed`) are set when exactly one `active` membership exists. Two or more active memberships set `app_user_id` only, so the person reads no tenant rows (Q-0043 (a): one active company per person; EZD-105 and EZD-007 refuse a second). `invited` and `deactivated` memberships never produce a tenant claim. No row: the claims are returned unchanged; the hook never fails sign-in. EZD-007 links `auth_user_id` at first sign-in and refreshes the session so the hook runs again.
- **Helpers** (executable by `authenticated` only; they read the claims with `auth.jwt()`): `private.session_is_live()` (the token's `session_id` still exists in `auth.sessions`); `private.tenant_id()` and `private.app_user_id()` (the claim, or null; they raise SQLSTATE `42501` `session_ended` when the session is gone, which is how a deactivated user's next request is refused even though the JWT is still valid); `private.all_projects()`; `private.listed_project_ids()` (the membership's `membership_project` rows, read live, one primary-key range scan); `private.tenant_user_ids()`; `private.can_see_project(uuid)` for one-off checks such as EZD-018's channel join.
- **Policy template.** Every policy is `to authenticated`; `anon` gets none; names are `<table>_<command>`. A table with `tenant_id` and `project_id` uses, for every USING and WITH CHECK, `tenant_id = (select private.tenant_id()) and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))`, optionally `and` more conditions; a table with `tenant_id` only uses the first clause. Always wrap a helper in a scalar subquery, `(select private.tenant_id())`, so PostgreSQL runs it once per statement as an InitPlan (11 rule 10: the tenant comes from the claim, never from a membership join per row; the audit's `helper_not_wrapped` and `policy_joins_membership` codes). The `::uuid[]` cast is required: PostgreSQL parses `= any ((select f()))` as a row subquery and fails with `uuid = uuid[]`. RLS checks tenant and project scope only, never permission rows (EZD-102). Tenancy policies: `tenant` `id = (select private.tenant_id())`; `app_user` own row or any user of the claim tenant (`private.tenant_user_ids()`); `membership` by `tenant_id`; `membership_project` and `project` by tenant and scope; `project` also has insert, update and delete policies.
- **Session ending** (`private.end_user_sessions(uuid)`, no API role may execute it; EZD-018 redefines it with `create or replace`, same signature, adding the `session.ended` push, Q-0052 (c)): trigger `membership_end_sessions` (after update or delete) ends the person's sessions when `status` or `scope` changes or the row is deleted, except a status change from `invited` to `active` (invite acceptance at sign-in; EZD-007b, Q-0044 (b)); trigger `membership_project_end_sessions` ends them when a listed project is deleted or its `membership_id` / `project_id` changes. Inserting a listed project does not end sessions, because listed projects are read live (Q-0044 (b)). Sessions end in every tenant and on every device. EZD-129 writes these rows as inserts and deletes and never bypasses the triggers.
- **Tenant-less tables** (`TENANTLESS_TABLES` in `app/test-harness/rls/tenancy-exemptions.ts`, same list as `### Tenancy tables (EZD-005)`): `tenant` (it is the tenant) and `app_user` (one person across tenants, linked by `membership`). They still have RLS and a policy. A later exemption adds its reason to both places and needs the security-reviewer's approval.
- **Grants.** The four tenancy tables `tenant`, `app_user`, `membership`, `membership_project` are read-only to `authenticated` (`select` only; `TABLE_GRANTS` in `app/test-harness/rls/table-grants.ts` records the reason per table): a signed-in member must not change their own status, scope or memberships; EZD-105, 106, 112 and 129 add reviewed write paths. `project` grants `select, insert, update, delete` to `authenticated`. `service_role` gets all four on every table (it bypasses RLS but still needs table privileges). `anon` holds no table privilege; `public.health()` keeps its explicit `anon` execute grant. TRUNCATE, REFERENCES and TRIGGER are never granted to an API role.
- **Table grants convention.** Every migration that creates a table or view in `public` grants explicitly, by table name: `select, insert, update, delete` to `authenticated` (or its `TABLE_GRANTS` set, with a reason) and to `service_role`, nothing to `anon`, `usage` on its sequences. `grant … on all tables in schema public` does not count. Default privileges in `public` grant nothing: `restrict_api_table_grants` revoked `postgres`'s default table privileges for `anon`, `authenticated` and `service_role` (the local CLI, and the cloud setting "Automatically expose new tables", work through `pg_default_acl` for role `postgres` in `public`, confirmed on CLI 2.121.0 / Postgres 17.11; migrations run as `postgres`). So the app does not depend on that setting (left on; matches the local CLI). Every such migration also enables RLS itself; the cloud setting "Enable automatic RLS" is left off, so local and cloud match. The `@smoke` audit enforces all of it (`grants_not_explicit`, `authenticated_grants_mismatch`, `service_role_grants_missing`, `rls_disabled`).
- **Function grants convention.** A migration that creates a `public` function revokes execute from `public`, `anon` and `service_role` by name (`revoke all on function public.<fn>(…) from public, anon, service_role;`) and grants only what the function needs (`grant execute … to authenticated;`), because default privileges for role `postgres` in `public` grant execute on a new function to `anon`, `authenticated` and `service_role` (confirmed on CLI 2.121.0 / PostgreSQL 17.11; EZD-007b finding B3). A function callable by `anon` or `authenticated` goes into `GATED_RPC_CALLS` (`app/test-harness/rls/gate.ts`), or T22 (j) fails. First applied by EZD-007b (`link_app_user`, `current_app_user_id`).
- **API request gate** (Q-0087 (ii)). `private.api_request_gate()` is registered as `pgrst.db_pre_request` on role `authenticator` (`alter role authenticator set …; notify pgrst, 'reload config'`; PostgREST v16.4 on the pinned CLI), so PostgREST runs it before every request: tables, RPC and GraphQL (`/graphql/v1` goes through PostgREST). It reads the request role from `current_setting('role')` (not `current_user`, which is the owner inside a definer function): `service_role` passes; `anon` passes only for `request.path` `/rpc/health`; every other `anon` or `authenticated` request must carry the header `x-ezd-api-gate` whose SHA-256 hex digest equals the stored one, else SQLSTATE `42501`. The digest is stored in Supabase Vault (supabase_vault 0.3.1: `vault.create_secret`, `vault.update_secret`, `vault.decrypted_secrets`) under `ezd_api_gate_sha256` by `private.set_api_gate_hash(text)` (no API role may execute it; it accepts only 64 lower-case hex characters). No stored digest: fails closed. Auth, Storage and Realtime do not go through PostgREST and are not behind it (EZD-132 keeps Storage policies tight). Locally `pnpm db:up` stores a fresh hash and writes the secret to the git-ignored `supabase/.temp/ezd-api-gate-secret`; the Vitest global setup stores its own per-run secret; `node scripts/db/api-gate.mjs generate` prints a secret and the SQL line for Josh's cloud step (`docs/runbook.md`). A ticket that adds a `public` function callable by `anon` or `authenticated` adds it to `GATED_RPC_CALLS` (`app/test-harness/rls/gate.ts`), or T22 (j) fails.

### Release safety (EZD-023a)

EZD-023a (vault/plans/EZD-023a.md Steps 1–5); 11 Operations ("add before they remove"); R26 R12; Q-0106; Q-0112; Q-0113. The check is `scripts/release/check-migrations.mjs`, run by the root `lint` script, so every gate run and CI run it (no ci.yml edit, `### CI`). EZD-023b's release workflow runs it again on the merge commit with `--base <previous tag> --head <sha>` before it changes production. `--base` must be a release tag and `--head` a release tag or a lower-case commit sha (7 to 40 hex characters); both are checked before any git process starts, else the line `invalid_ref` and exit 1 (Q-0156 (a)).

- **Release tags.** `phase-<N>` is the release at the end of phase N; `phase-<N>.<k>` (k ≥ 1) a release Josh approves between phase gates (regex `RELEASE_TAG_RE` in `scripts/release/tags.mjs`; order by N then k; `phase-01` and `phase-1.0` are not release tags). Tags are created only by EZD-023b's release workflow on GitHub, on `main`, after the migrations reach production; nobody makes one locally. The `phase-*` tag ruleset blocks updates and deletes (Q-0112), so `origin`'s tags are the record of what production received. "Previous tag" is the highest release tag that exists; there is no ancestry check (tags sit on `main`'s merge commits, not on `develop`).
- **Tag fetch.** Every run first lists origin's tags with `git ls-remote --tags origin 'refs/tags/phase-*'`; none listed is a successful fetch (a depth-1 fetch of a pattern that matches nothing exits 1 in a shallow clone, Q-0240). Otherwise it does `git fetch --no-tags origin "+refs/tags/phase-*:refs/tags/phase-*"` (`GIT_TERMINAL_PROMPT=0`, 30 s timeout, `--depth=1` only in a shallow clone; it writes only `refs/tags/phase-*` and never pushes). In GitHub Actions (`GITHUB_ACTIONS=true`) a failed fetch is **M0** and `--no-fetch` is ignored (fails closed). Locally a failed fetch prints `tags_not_fetched` and the check goes on with local tags (less strict, never stricter); `--no-fetch` prints `tags_not_fetched (--no-fetch)` and is for tests only. A reachable `origin` with no `phase-*` tag is a successful fetch.
- **No tag yet.** Until the first real release (Q-0113) the check prints `no release tag yet: nothing is released` and checks only M5, so pre-launch migrations may drop and rename freely.
- **"Still reads".** An object is read by the previous release when it exists at that tag and is not listed in that tag's `supabase/retired.json`. Removal takes two releases: release N stops reading the object and lists it in `supabase/retired.json` (the code-reviewer checks that no code at that commit reads it); release N+1 may drop or rename it. An object created after the previous tag may be dropped or renamed freely; created means absent at the tag, by kind and name (Q-0156 (a)): the check builds the base object set from the tag's migrations (`findDefined`), and re-declaring a released object (`create or replace …`, `create … if not exists …`, `add column if not exists …`) never makes it new, so dropping it afterwards is still M1. A retired table, view or materialized view covers its columns. Format: `{ "retired": [ { "kind", "name", "ticket", "reason" } ] }`; `kind` is `table`, `view`, `materialized_view`, `function`, `procedure`, `type`, `domain`, `schema`, `sequence`, `extension` or `column`; `name` is lower case, unquoted and schema-qualified (`column` 3 segments, `schema` 1, every other kind 2; no argument list on functions); a retired table covers its columns. The file sits outside `supabase/migrations/`, so it triggers neither `supabase-dev.yml` nor check C5.
- **Violations** (exit 1; one line per violation `[Mn] <file>: <object> <detail>`, then a summary naming the base tag): **M0** release tags could not be fetched in GitHub Actions; **M1** a new migration drops or renames an object the base tag still reads (not created by a new migration of a version ≤ its own, not retired at the base tag); **M2** a released migration is changed (compared after normalizing line endings to LF) or removed: never edit a released migration, add a new one; **M3** a new migration's 14-digit version is not newer than the newest released one (`## Migrations` file names); **M4** the SQL cannot be checked statically: a drop ending in `cascade`, or drop or rename text inside a string literal or dollar-quoted body (`execute '…'`, a function body: `drop <kind|column|attribute>`, `rename to|column|value|attribute`, `rename <identifier> to`, `set schema`; stricter, never weaker, so such a body is rewritten or reviewed); **M5** the head's `supabase/retired.json` is missing, not JSON or has a wrong shape, kind or segment count (checked even with no tag).
- **What the scan sees.** Destructive: `drop` of a listed kind (any number of names); `alter table … drop [column]`, `rename [column] … to`, `rename to`, `set schema`; `alter <kind> … rename to | set schema`; `alter view | materialized view … rename [column] … to` (the view's column); `alter type … rename value | rename attribute | drop attribute` (the type). Created: `create [or replace] <kind>` and `alter table … add [column]`. Unquoted names are lower-cased, a missing schema is `public`, `if [not] exists` and `only` are skipped. **Not checked** (the app does not read them, or they are outside "drops or renames"): `drop index`, `drop trigger`, `drop policy`, `drop constraint`, `alter index … rename`, `rename constraint`, `alter column … drop default | not null`, `truncate`, `alter column … type`, `revoke`, and view or function changes that alter a result shape; the code-reviewer watches for those. A widened check constraint (drop, then add) passes (`### Tenancy tables (EZD-005)`).
- Agents cannot run the script by hand (`.claude/hooks/guard-bash.mjs` denies `node scripts/release/…`); it runs through the gate's `lint` and through `node --test` on `scripts/release/__tests__/`. The tests use a bare local `origin` over `file://` and never reach the network (`git-fixture.mjs`, which EZD-023b reuses).

## Errors and logging

11 Operations, Security and audit; R26 R12, R16, R17; EZD-015, EZD-024, EZD-026, EZD-120b.

- Route error body: `{ "error": { "code": "<stable_snake_code>", "message_key": "<t() key>" } }`. Status: 400 invalid input (Zod failure), 401 not signed in, 403 permission missing (EZD-102), 404 row not found or outside the user's tenant or scope (the response does not reveal that it exists), 409 stale `lock_epoch` or sequence conflict (03 rules 6, 9), 500 unexpected. The browser shows `message_key` through `t()` (R26 R17); no raw server text reaches the UI.
- Browser: a failed load uses the inline error with Retry (EZD-015); a failed save keeps the edits and shows the save banner (EZD-120b). Nothing fails silently: anything skipped is counted and shown (R26 R16 pattern).
- Jobs: a failure writes `job.error` and `attempts` (03 job table); retry with backoff (EZD-009); a final failure goes to Sentry and the owner email (11 Operations; EZD-024).
- Logging: one structured JSON line per event from one logger module (`logger.ts`) on the server and in the worker: level, message, route or job kind, tenant_id, project_id, request or job id, duration. Never logged: tokens (share-link, magic-link, 6-digit code, EZ Binder sign-on code), keys and secrets, request bodies, email addresses, money values (03 rules 2, 11; CLAUDE.md rule 8). No `console.*` outside `logger.ts` and tests (check C8). Unexpected errors go to Sentry (EZD-024).

### Error reporting (EZD-024)

EZD-024 (vault/plans/EZD-024.md Steps 1-12); 11 Operations; R26 R12; Q-0067 (b); Q-0068 (a); Q-0069 (a); Q-0070 (a); Q-0035.

- **Flow.** Every error ends in `app/src/server/errors/`. Server errors arrive through `onRequestError` in `app/src/instrumentation.ts` and explicit `reportError()` calls (job runner, the `after()` kick, email failures). Browser errors are sent by the Sentry browser SDK (`app/src/instrumentation-client.ts`) to the app's own tunnel `POST /api/monitoring`, never straight to Sentry. The module scrubs the event, hands it to Sentry through the server client, and records its fingerprint in `error_alert` through `record_error_alert`; only when that hands out a claim does it email the alert with `sendEmail`.
- **`SENTRY_TRANSPORT`:** unset or empty is off (`sentry_off`; reporting never breaks the app, and the owner email does not depend on Sentry); `stub` uses the stub transport (`app/src/server/errors/test-harness/sentry-stub-transport.ts`, file sink `SENTRY_STUB_DIR`), refused in production; `sentry` needs a valid `SENTRY_DSN` and is refused under Vitest (`sentry_live_blocked_in_tests`). No tracing, profiling, replay or default integrations. `register()` starts the server client and tags events `ezd.source=function`.
- **Placeholder DSN and tunnel.** The browser always uses `https://public@ezdraft.invalid/1` (`PLACEHOLDER_DSN`, `app/src/lib/errors/browser-options.ts`) with `tunnel: '/api/monitoring'`, so no real DSN or build-time value reaches the browser. The tunnel is public, refuses a body over 262,144 bytes (413 `envelope_too_large`) and an envelope that does not parse or whose header `dsn` is not the placeholder (400 `invalid_envelope`), keeps `event` items only, scrubs them again, forwards them with the server's DSN in `after()` and records each one. The browser SDK packages are `@sentry/browser` (integrations global handlers, linked errors, dedupe); the server uses `@sentry/nextjs`, with `@sentry/core`'s envelope helpers in the tunnel.
- **Scrub rule** (`app/src/lib/errors/scrub.ts`): URL query and hash dropped; email addresses, UUIDs, tokens (24+ letters, digits, `_` or `-` with a letter and a digit) and 6-digit codes replaced; `request` keeps only `url` and the `User-Agent` header; `user` keeps only `id`; `extra` and `breadcrumbs` removed. Owner emails carry only scrubbed titles, ids and codes.
- **Fingerprint rule** (`app/src/server/errors/fingerprint.ts`): SHA-256 of source, error name, normalized message (scrubbed, hex runs and numbers replaced) and location (browser URL path with ids replaced, the route pattern, the job kind, or `worker`); no stack frames. A failed job is `job_failed`, tenant and job id; a failed webhook delivery `webhook_failed`, tenant and event id (one email each, Q-0068 (a)).
- **`error_alert`** (nullable `tenant_id`, null only for kind `error`, so error rows are visible to no member; members read their company's failure rows) is written only by `public.record_error_alert` and `public.release_error_alert_email` (`security definer`, executable by `anon`, `authenticated`, `service_role`, both in `GATED_RPC_CALLS`). A caller other than `service_role` may record only kind `error` from `browser`, `function` or `worker`, with tenant and project forced to null, and at most 100 new error rows per hour. The email cap is 20 alerts per rolling hour for all companies (Q-0068 (a)). A failed send releases the claim so a later occurrence can email. The request path reaches the store as `anon` through `createSessionClient` with an empty cookie jar (`alertStoreClient()`), never with the secret key.
- **Who gets alerts** (Q-0067 (b)): new errors go to `ALERT_EMAIL_TO` only; failed jobs and webhooks go to `ALERT_EMAIL_TO` plus the company's Owners (holders of Manage users and settings; `role_preset = 'owner'` until EZD-101 switches `ownerAlertRecipients` to the permission key), one message each, duplicate addresses merged; wording `office.alert.*` (English, Q-0069 (a)).
- **Copy link.** System alerts have no sender, so the copy-link rule of Q-0035 does not apply to them; Sentry (and `SENTRY_ISSUES_URL`) and the System status page (EZD-135) are the non-email path.
- **Convention:** a `catch` that turns an unexpected error into a 500 calls `reportError`. Handler throws in the job runner go to Sentry with `alert: false` (`onHandlerError`); the owner email for a job comes only from its final failure (`onJobFailed`, `defaultJobHooks()` in `app/src/server/jobs/default-hooks.ts`, used by the kick and the sweep). Email send failures go to Sentry with `ezd.location` `email.send` and the code only.
- **Webhooks:** EZD-1301 calls `reportWebhookFailure({ db, tenantId, projectId, eventName, eventId, attempts, lastStatus })` with the runner's client when a delivery has used up its retries; `eventName` must be a registered `webhook` event, else it throws `TypeError`.
- **Render worker contract** (EZD-1104b): the worker initialises the Node Sentry SDK at the same `@sentry/*` version with `dsn` = the placeholder DSN, `tunnel` = `<app origin>/api/monitoring`, the tag `ezd.source=worker` and the same `scrubEvent`, so it holds no Sentry secret and no new key, and its errors get the same dedupe and owner email.
- **Live check** `scripts/errors/live-check.mjs`, run by Josh by hand after the first release, refused under `CI`, never by the gate.
- Agents never sign in to Sentry; account steps are in `docs/runbook.md` `## Error reporting (EZD-024)`.

## Storage buckets and paths

03 rules 1, 11; 03 source_file, render, catalog_item, job; 11 rule 12, Operations, Data retention; EZD-025, EZD-132. Rules from the sources: every bucket is private; files are served through short-lived signed links; browser uploads go straight to Storage with resumable signed uploads; job inputs and outputs are Storage paths; originals are never changed; renders are stored full size plus 400 px and 1600 px copies; deletes of sent-package files are soft deletes. Layout (EZD-132 creates the buckets):

- Every path starts `<tenant_id>/` so Storage policies use the same tenant claim as table RLS (EZD-006). Project files continue `<project_id>/`; tenant-level files use `<tenant_id>/tenant/`.
- Buckets: `sources` (uploaded originals, every `source_file` kind; written once, never overwritten), `renders` (`<tenant_id>/<project_id>/<render_id>/full|1600|400.<ext>`), `exports` (PDF sets, DXF, GLB, USDZ, CSV, selections PDF, markup PDF/DXF; sent-package files soft-deleted), `media` (plan thumbnails and version previews, logo, catalog images 256 px, spec sheets, textures, camera-view thumbs), `jobs` (`<tenant_id>/<project_id or tenant>/<job_id>/in|out/...` scratch).
- Object names use ids, not user file names; the original file name is kept on the row (03 source_file).
- Job payloads and results name files as `{ bucket, path }` (`storagePathSchema`, `app/src/server/jobs/storage-path.ts`): one of the five buckets; `path` has no leading `/`, no `..` segment and no `\`. The runner checks every such object in a payload and a result: the path starts with `<job tenant_id>/`, and for a project job with `<tenant_id>/<project_id>/` or `<tenant_id>/tenant/` (EZD-009).
- Signed-link lifetimes are values set by EZD-132 from its own sources, not here.

## Tests

02 Named tools; CLAUDE.md rules 5–6; vault/tickets/README.md rule 4.

- Unit tests: Vitest, `*.test.ts` / `*.test.tsx`, next to the code they test. Commands: `pnpm test` (the root `node:test` files, then every package's `test`); `pnpm --filter @ezdraft/geometry test` for one package; root `pnpm exec vitest` runs the projects of the root `vitest.config.ts`. Every package project uses `environment: 'node'` until a component ticket adds a DOM environment.
- Run Prettier on the files you write (`pnpm exec prettier --write <files>`); formatting is review, not gated (EZD-001).
- Browser tests (EZD-007f; Q-0045 (a)): Playwright, `*.spec.ts`, in `app/e2e/`. Config `app/playwright.config.ts`: `testDir` `e2e`, `workers: 4` (Q-0114), `grep` from `EZD_TEST_GREP` only when set, `baseURL` `http://127.0.0.1:3000` (the local `site_url`; cookies are per host, so never `localhost`), the device projects of `### Browser tests (EZD-016a)`, web server `pnpm start -p 3000` checked at `/api/health` with `reuseExistingServer` off in CI. At load it reads the four `local.mjs env` values and `EZD_TEST_DB_URL` into `process.env` and never stores a gate hash (the secret is the one `pnpm db:up` stored). Run `pnpm build`, then `pnpm test:e2e` (the root script runs `db:up` first). Chromium is installed once (`pnpm --filter @ezdraft/app exec playwright install chromium`). Helpers: `signInWithCode(page, email)` (`app/test-harness/sign-in.ts`) and `waitForAuthEmail` / `countAuthEmails` / `clearAuthEmails` (`app/test-harness/mail-catcher.ts`, EZD-007d). EZD-016d extends the config: `### Browser tests (EZD-016a)`.
- Repo scripts: `node:test`, `scripts/**/*.test.mjs`, run by the root `test` script.
- Shared helpers live in `test-utils/` or `test-harness/` folders (`.claude/hooks/guard-paths.mjs`).
- The test that closes a ticket has the ticket id in its title, e.g. `EZD-005 done when: seed creates Worth Properties as tenant 1`, so reviewers can find it.
- Tests never call live AI, email, render providers or EZ Binder; they use the stubs of EZD-008, EZD-016, EZD-019 and EZD-021.
- Spike tests live with the spike under `spikes/` and are not run by the root gate (vault/spikes/TEMPLATE.md; PROCESS.md).
- Check C7 enforces the file names.
- Email: unit tests read readStubOutbox() (app/src/server/email/test-harness/stub-transport.ts); browser tests set EMAIL_STUB_DIR and read it with readStubOutboxDir from app/test-harness/email-outbox.ts (EZD-008a).

### Browser tests (EZD-016a)

EZD-016d (vault/plans/EZD-016d.md Steps 1–3); Q-0053; Q-0088; Q-0087; Q-0006; Q-0045 (a). EZD-016a appends to this subsection.

- **Device projects** (`DEVICE_PROJECTS` in `app/test-harness/e2e/devices.ts`, from the pinned `@playwright/test` 1.64.1 `devices`):
  - `desktop`: Chromium, `Desktop Chrome`, 1600 × 1000, scale 1, no touch, not mobile (04 Frame).
  - `ipad-landscape`: WebKit, `iPad Pro 11 landscape`, 1180 × 820, scale 2, touch, mobile (Q-0053; every iPad browser is WebKit).
  - `surface`: Chromium, `Desktop Chrome`, 1440 × 960, scale 2, touch, not mobile, no `channel` (Q-0088; Edge is Chromium).
  - `phone`: WebKit, `iPhone 13`, 390 × 844 (the descriptor's own viewport is overridden), touch, mobile (S17/S18 Layout).
  - No Firefox project: `ci.yml` installs only `chromium webkit`.
- **Routing by tags** `@desktop`, `@ipad`, `@surface`, `@phone`: a test with none of them runs in `desktop` only; a tagged test runs in exactly its tagged projects. `projectGrep(device, scope?)` builds each project's `grep`; a project `grep` replaces the config-level one, so it repeats the gate scope (`EZD_TEST_GREP`, `### Test scope (Q-0006)`) as a lookahead; an empty scope counts as unset.
- **Config** (`app/playwright.config.ts`): paths are absolute under `app/` (`testDir` `e2e`, `outputDir` `test-results`, `globalSetup`, `webServer.cwd`, html report `playwright-report`); `timeout` 60000, `retries` 0, `trace` `retain-on-failure`, `screenshot` `only-on-failure`; reporters `list` and `html` (never opened). No `extraHTTPHeaders`, so the gate secret never reaches the browser (Q-0087).
- **Global setup** (`app/test-harness/e2e/global-setup.ts`), in order: `SUPABASE_API_GATE_SECRET` set, else `Gate secret missing: run pnpm db:up`; `EMAIL_STUB_DIR` set, else `EMAIL_STUB_DIR missing`; tenant 1, Josh, tenant 2 and exactly `SEED_PROJECT_COUNT` tenant 1 projects present (`seedMissing`), else `Seed missing: run pnpm db:up`; then it creates and empties the outbox with `clearStubOutboxDir`. It never logs a secret.
- **Web server env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_API_GATE_SECRET` from `local.mjs env`; `SUPABASE_SECRET_KEY` also from `local.mjs env`, because the job run started on enqueue needs it (EZD-009); `EZD_TEST_DB_URL` set to `''`, because Playwright passes `process.env` through to the server; `EMAIL_TRANSPORT` `stub`, `EMAIL_FROM` `EZ Draft Test <test@example.test>`, `EMAIL_STUB_DIR` `app/.e2e/email-outbox` (git-ignored). The config also sets `process.env.EMAIL_STUB_DIR` to that folder at load, so specs and the global setup read what the server writes.
- **Run**: `pnpm build`, then `pnpm test:e2e` (root; runs `db:up` first). Browsers are installed once: `pnpm --filter @ezdraft/app exec playwright install chromium` and `pnpm --filter @ezdraft/app exec playwright install webkit`.
- **Root config**: `playwright.config.ts` at the repo root is exactly `export { default } from './app/playwright.config';`, because `ci.yml` "Install browsers" runs only when `hashFiles('playwright.config.*')` matches at the root and runs `pnpm exec playwright` from the root (so the root also lists `@playwright/test`). `ci.yml` is not edited.
- **Helpers** (EZD-016a, vault/plans/EZD-016a.md Steps 1–6; Q-0087 (ii); Q-0198): `signInAs(email)` / `signInAsOwner(page)` sign in a seeded or fixture user with an active membership through `/auth/confirm` (no email sent), under a per-email lock (`withEmailLock`, `app/test-harness/e2e/email-lock.ts`) because a new link replaces the earlier one; `sessions.open(emails)` opens one signed-in context per email at the current project's size and closes them at teardown (edit-lock and presence tests); `network.set(target, 'off' | 'on')` switches a context's network and waits for `navigator.onLine`; each signed-in result carries `serverDb` (gated, sends `x-ezd-api-gate`, as a server route does) and `browserDb` (no header, refused by PostgREST), which stay in the Node test process and never reach the page. Specs import only from `app/test-harness/e2e/test.ts`: `import { test, expect } from '../test-harness/e2e/test'`.

### Fixtures (EZD-016b)

EZD-016b (vault/plans/EZD-016b.md Steps 1, 6, 7); 08 Imports; 03 rule 5; Q-0065 (b); Q-0066 (b).

- **Layout.** `fixtures/` at the repo root holds the test data shared by `app/`, `packages/geometry` and `spikes/`: `fixtures/README.md`, `fixtures/manifest.json`, `fixtures/synthetic/` (the generated files, each with its `*.expected.json`) and `fixtures/real/<id>/` (Josh's files, once supplied). The generator is `scripts/fixtures/` (plain Node ESM, `node:` built-ins only, so a fixture is never made by the code that later reads or writes its format); its tests are `scripts/fixtures/__tests__/` (`node:test`, run unfiltered by the root `test` script).
- **Manifest and README.** `fixtures/manifest.json` lists every fixture (`id`, `origin` `generated` or `real`, `kind`, `status`, `path`, `expected`, `neededBy`, `withoutIt`, `standIn`, `source`); `fixtures/README.md` has one row per manifest id with the same origin and status and states which files are real and which are generated. A real file is committed only after Josh has removed names, addresses and photo location data (Q-0065 (b)), and is then stored unchanged.
- **Generated files** are rebuilt with `pnpm fixtures:generate` (default output `fixtures/synthetic/`) and never edited by hand.
- **Expected JSON** (`*.expected.json`) is written by hand from the plan's values, never by the generator.
- **Readers** are the app's own stack: `dxf-parser` for the DXF, `pdfjs-dist` (legacy build) for both PDFs and `three`'s `GLTFLoader` for the GLB, installed as root devDependencies.
- **A later ticket that adds a fixture** adds its manifest entry and README row in the same commit (T7 in `scripts/fixtures/__tests__/manifest.test.mjs` enforces it).
- **Variants** are written with the exported `room`, `planDrawing` and writers of `scripts/fixtures/` (EZD-302's unjoined wall, Q-0066 (b)), never by copying code.

### Test scope (Q-0006)

Phase tests plus a smoke set per ticket; the full suite at the phase gate (EZD-001 Step 6).

- Naming: every Vitest or Playwright test file wraps its tests in at least one top-level `describe` (`test.describe` in Playwright) whose title starts with the owning ticket ID, e.g. `describe('EZD-001 geometry package', …)`. A later ticket adding tests to a file adds its own top-level `describe`. Check C9 enforces this; the reviewer checks the ID is the right one.
- Phase = the ticket's `phase` in `vault/tickets/tickets.json`, set by the re-cut (Q-0194, Q-0218; Q-0221), not the ticket number: EZD-001 and EZD-026a are phase 0, EZD-133 phase 3, EZD-134 and EZD-1401 phase 14. A ticket ID missing from tickets.json, or a phase with no tickets, fails the gate.
- Smoke set: a test whose full name contains `@smoke` (Vitest title; Playwright title or `{ tag: '@smoke' }`): each phase's Build gate browser test, and any test a plan marks "smoke: yes". EZD-001 T1 is the first.
- Root `scripts/**/*.test.mjs` (`node:test`) are never filtered; `perf` (EZD-017) is not filtered; `typecheck`, `lint` and `build` are always whole-repo.
- How scope reaches the runners: `scripts/gate.mjs` sets `EZD_TEST_SCOPE` (`phase` or `full`) for every step and, in phase scope only, `EZD_PHASE` and `EZD_TEST_GREP` = `(?:EZD-(?:<id>|<id>|…)(?![0-9a-z]))|@smoke`, listing the number part of every ticket of that phase (for phase 14: `134|1401|1402|…`), read from the gate script's own checkout; in full scope it deletes both. Each package `vitest.config.ts` sets `test.testNamePattern` from `EZD_TEST_GREP` when present and `test.maxWorkers: 4` (Q-0019 read as 4, Q-0114). `app/playwright.config.ts` (EZD-007f, EZD-016d) sets `workers: 4` and `grep` from `EZD_TEST_GREP` the same way; each Playwright project's `grep` repeats the scope (`projectGrep`, `### Browser tests (EZD-016a)`), because a project `grep` replaces the config-level one. A test that spawns a runner sets the child's `EZD_TEST_GREP` itself and deletes it when the case has none.
- What runs where: a ticket check `node scripts/gate.mjs .claude/worktrees/EZD-xxx` runs the folder-name ticket's tickets.json phase plus `@smoke`; after merge on develop `node scripts/gate.mjs . --phase <N>` runs phase N plus `@smoke`; the phase gate `node scripts/gate.mjs . --full` and CI `node scripts/gate.mjs .` (folder not named `EZD-xxx`) run the full suite.

### Policy test harness (EZD-006)

EZD-006 (vault/plans/EZD-006.md Steps 6, 7); PROCESS.md Special tickets. Files under `app/test-harness/rls/`: `db.ts` (`adminSql()`, a postgres.js client to `EZD_TEST_DB_URL`, `max: 2`; `withRollback`), `fixtures.ts` (`createTenant`, `createProjects`, `createMember`, `createUnlinkedAuthUser`, `signIn` through the Auth admin API, no email sent; `claimsOf`, `sessionCount`, `asClaims`, `cleanup`), `gate.ts` (`GATED_RPC_CALLS`), `isolation.ts` (`describeTenantIsolation`), `audit.ts` (`auditRls`), `tenancy-exemptions.ts` (`TENANTLESS_TABLES`, `PROJECT_KEY`), `table-grants.ts` (`TABLE_GRANTS`, `explicitGrantRoles`), `README.md`.

- `EZD_TEST_DB_URL` is a test-only variable the global setup (`app/test-harness/supabase-env.global-setup.ts`) reads from `supabase status -o json` (`DB_URL`); it is not an app variable and is not in `.env.example`.
- The global setup generates a per-run gate secret, stores its hash with `private.set_api_gate_hash` and sets `SUPABASE_API_GATE_SECRET` for the test processes; no secret is committed. A local `pnpm dev` server started before a test run holds a stale secret until the next `pnpm db:up`.
- `signIn` returns `serverDb` (sends `x-ezd-api-gate`, as a server route does) and `browserDb` (does not). T1–T14 use `serverDb`, so they test RLS and grants as the backstop on their own; only `rls.api-gate.test.ts` uses header-less clients.
- A ticket that creates a table calls `describeTenantIsolation('<table>', { makeRow })` inside its own top-level `describe` (the audit's `no_isolation_test` code); a tenant-less table adds a `TENANTLESS_TABLES` entry with a reason; a narrower `authenticated` grant set adds a `TABLE_GRANTS` entry with a reason.
- The audit test `app/src/server/db/rls.audit.test.ts` (`auditRls`) and the gate test `rls.api-gate.test.ts` are `@smoke`, so every later ticket's gate runs them.

### Performance check (EZD-017)

EZD-017 (vault/plans/EZD-017.md Steps 1-13); 11 Performance (opening paragraph, Budgets, Rules); R26 R10; Q-0061 (a); Q-0071 (a); Q-0072 (a); Q-0073 (a).

- **Gate and trend** (G1): countable things gate (bytes, React commits, long tasks in the pan, rows, buffers, draw calls); frame, open, tab, tool-pick, Projects-page and autosave times are `trend` rows that are recorded and never fail.
- **Budgets.** `scripts/perf/budgets.mjs` (`BUDGETS`, `KB_BYTES`, `compressedSize`) is the only place budget numbers live, each with its source. Download size is gzip at zlib level 6 of the decoded body; 1 KB = 1,000 bytes (Q-0071 (a)); `/sign-in` and `/auth/confirm` are each held to 200 KB (Q-0072 (a)).
- **Run.** `pnpm build && pnpm perf` (`node scripts/perf/run.mjs`; flags `--base-url`, `--config`, `--pan-url`, `--only`, `--out`). Without `--base-url` it starts `next start` on 127.0.0.1:3200 with no Supabase env. The gate runs it as step `perf`. Exit 0 pass, 1 any fail or error, 2 usage error.
- **Results.** Every run that passes validation writes `perf-results/latest.json` (overwritten) and appends the same object as one line to `perf-results/history.jsonl` (git-ignored).
- **React commits (H1).** `scripts/perf/page-hooks.browser.js` installs a React devtools hook before any page script and counts `onCommitFiberRoot` calls between the `pan-start` and `pan-end` marks; a pan page with no React renderer is an `error` (`react_not_detected`), never 0. The probe page `/dev/perf-probe?inject=pan-commit` adds one commit per canvas pointer move, so the check's failure can be shown on purpose.
- **Long tasks (G5).** A main-thread task over 50 ms; 0 during the scripted pan is a gate, tasks before `pan-start` are a trend.
- **What JavaScript counts (G7, S1, S2).** Only what the page downloads with no user action (no click, key or scroll), each URL once: responses with status 200-299 whose resource type is `script` or whose content type is JavaScript (worker scripts included). Service worker scripts and what they fetch are summed apart in `excludedServiceWorkerBytes`; inline `<script>` text is not counted.
- **Phase 0** measures the empty shell (`/dev/shell` stands in for the editor until EZD-120b); the benchmark project arrives with EZD-236. Every measurement that needs a project, canvas, save or tab is `pending` with its owner in `scripts/perf/registry.mjs`.
- **Adding a measurement.** Write its collector in `scripts/perf/`, switch its `registry.mjs` row from `pending` to `active`, add or confirm its `budgets.mjs` row with a source, add a test that fails on a deliberate regression, and repoint the config `url`s when the real routes exist.
- Per-pointer-move values go through refs, never React state (11 rule 4); the pan row fails otherwise.

### Entry contents and bundle report (EZD-020)

EZD-020 (vault/plans/EZD-020.md Steps 5-6); 11 Budgets Download size, rule 7; Q-0071 (a).

- **Measurements** (`scripts/perf/registry.mjs`, URLs in `perf.config.mjs`): `entry-contents:office` (`/dev/entry/office`), `entry-contents:editor` (`/dev/entry/editor`), `entry-contents:field-pack` (`/dev/entry/field`), `entry-contents:client-link` (`/dev/entry/client`), `entry-contents:sign-in` (`/sign-in`), collector `scripts/perf/js-contents.mjs`, gate budgets `contents.<entry>` (unit `count`, value 0, rule = the entry's forbidden categories from `ENTRY_RULES`). The size rows `js-size:projects-settings`, `js-size:field-pack` and `js-size:client-link` are active on the same placeholder URLs; `js-size:editor` stays on `/dev/shell` until EZD-120b.
- **Forbidden categories** per entry: office, field pack, client link and sign-in: `editor`, `three`, `heavy`, `lazy`; editor: `heavy`, `lazy`. `editor` = app sources under `EDITOR_CODE`; `lazy` = app sources under `app/src/lazy/`; `three` and `heavy` = the `HEAVY_PACKAGES` categories. The value is the number of distinct (category, key) findings.
- **Source maps.** `app/next.config.ts` sets `productionBrowserSourceMaps: process.env.VERCEL !== '1'`: the gate and CI builds emit `.js.map` files; Vercel builds emit none, so no source map is published.
- **Method.** The collector loads the entry exactly as the `js-size` rows do (`collectScripts` in `js-size.mjs`), then for each counted file reads the last `//# sourceMappingURL=` (inline base64 or fetched with Node `fetch`, never counted as a page download) and attributes the file's UTF-8 bytes to sources (`scripts/perf/sourcemap.mjs`, Source Map v3 / ECMA-426, index maps with `sections` included). Bytes before the first segment, after a 1-field segment and newlines are unmapped. Bytes are minified bytes; the compressed totals stay the `js-size:*` rows.
- **Normalization.** The text after the last `node_modules/` gives `pkg:<name>` (two segments for a scoped name); Next.js's own copies under `next/dist/compiled/<name>/` count as `pkg:<name>`. Otherwise the prefixes `webpack://_N_E/`, `webpack:///`, `turbopack:///[project]/`, `[project]/` and leading `./` or `../` are stripped: `app/src/<p>` or `src/<p>` gives `app:<p>`, `packages/geometry/src/<p>` gives `geometry:<p>`, anything else `other:<s>`. Groups keep at most two folder segments (`app:components/shell`).
- **Error, never pass.** A counted file without a map is `error` (`missing_source_map`, `details.missingMaps`); an entry with no `app:` source is `error` (`no_app_sources`, `details.reason`).
- **Bundle report.** Whenever an `entry-contents:*` row was measured, the CLI prints `BUNDLE REPORT (...)` after the per-measurement lines and before `PERF PASS` or `PERF FAIL`, and writes `<out>/bundle-report.md` (one `## <measurement id>` section per entry: URL, the compressed total of a `js-size` row measured on the same URL, file count, top 15 groups plus `(rest)`, the watch list, findings). It runs in the gate's `perf` step, so it is in the CI log.
- **Watch list** `WATCH_PACKAGES`: `@sentry/`, `@supabase/realtime-js`, `@radix-ui/`, `radix-ui`, shown on every report with their bytes or `absent` (EZD-024, EZD-018, EZD-015).
- **Repointing or adding an entry.** The owner ticket changes the measurement's URL in `perf.config.mjs` (and its owner text in `registry.mjs`); a new entry adds a registry row and, if new, a `contents.*` budget with its source and an `ENTRY_RULES` entry.

## Handoff

Path `vault/handoff/CURRENT.md`, format `vault/handoff/TEMPLATE.md`, overwritten at session end; previous ones in `vault/handoff/log/` (CLAUDE.md Directory; PROCESS.md Ledgers).

## Machine checks

`node scripts/conventions/check.mjs [rootDir]` runs C1–C10 (plain Node, no dependencies). The root `lint` script runs it, so `scripts/gate.mjs` and CI fail on any violation. Rules with no machine check are marked "review".

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
| C9 | Every `*.test.ts`, `*.test.tsx`, `*.spec.ts` under `app/`, `packages/`, `worker/` has a top-level `describe` / `test.describe` whose title starts with a ticket ID (`test-utils/`, `test-harness/` and config files exempt) | same | EZD-001 |
| C10 | No literal color (hex or color function) in a declaration of a CSS file under app/src/ other than app/src/styles/tokens.css | same | EZD-010a |
| — | Named colors in CSS and colors in TSX style props | review | EZD-010a |
| — | Icon sprite and names file match icons.json; icons:build is byte-stable and refuses missing, repeated or unsorted names | app/src/components/icon/icons.test.ts (T8, T9) | EZD-010b |
| — | No icon font, no Google Fonts reference; woff2 files only in app/src/styles/fonts/ | app/src/styles/no-icon-font.test.ts (T7) | EZD-010c |
| — | Browser table query lint; RLS-policy CI test | lint rule and CI test | EZD-133 |
| — | RLS policy and tenant/project index on every table; explicit per-table grants | `app/src/server/db/rls.audit.test.ts` (`auditRls`, `@smoke`) | EZD-006 |
| — | PostgREST request gate refuses requests without the server header | `app/src/server/db/rls.api-gate.test.ts` (`@smoke`) | EZD-006 |
| — | Static imports of heavy libraries; bundle report | `ezdraft/import-boundaries` (`eslint-rules/import-boundaries.mjs`); `scripts/perf/js-contents.mjs` (gate step `perf`); `scripts/tooling/__tests__/import-boundaries-lint.test.mjs`, `scripts/perf/__tests__/sourcemap.test.mjs`, `scripts/perf/__tests__/js-contents.test.mjs`, `app/e2e/entries.spec.ts` | EZD-020 |
| — | No polling: `setInterval` refused in `app/src` | `eslint.config.mjs` (`no-restricted-globals`, `no-restricted-properties`); `scripts/tooling/__tests__/no-polling-lint.test.mjs` (T18) | EZD-018 |
| — | Realtime event names used in migrations are in `events.ts` | `scripts/db/__tests__/realtime-sql.test.mjs` (T19) | EZD-018 |
| — | Literal interface strings in phone components | `ezdraft/no-literal-ui-string`, `scripts/tooling/__tests__/messages-lint.test.mjs` | EZD-026a |
| — | Spanish catalog complete | typecheck (`satisfies`) and `app/src/server/messages/catalog.test.ts` | EZD-026d |
| — | Every literal route `message_key` in `app/src` is in `en`; keys built at run time are checked by review | `app/src/server/messages/message-keys.test.ts` | EZD-026d |
| — | Language read per request, session client only | `app/src/server/messages/request-language.test.ts` + review | EZD-026b |
| — | Office components use t() (English only) | review | EZD-026a |
| — | Strings built outside JSX, `.ts` helpers in phone folders, `t` under another name, run-time keys, `eslint-disable` for the rule | review | EZD-026a |
| — | Unknown event names | `app/src/lib/events/registry-usage.test.ts` (static scan, `@smoke`), typecheck (`EventName`) and runtime `UnknownEventError` | EZD-022 |
| — | Destructive migrations (drop or rename) | `scripts/release/check-migrations.mjs` (root `lint`) | EZD-023a |
| — | Performance counts and download size | scripts/perf/run.mjs (gate step perf); scripts/perf/__tests__/, app/e2e/perf-check.spec.ts | EZD-017 |
| — | A test reaching a live provider fails | test harness | EZD-021 |
| — | TypeScript, lint and test discovery exclude `.claude/worktrees/`, `vault/`, `spikes/` | `scripts/tooling/__tests__/tooling.test.mjs` (T6, T7, T9) | EZD-001 (PROCESS.md) |
| — | `packages/geometry` has no DOM or Node types | `scripts/tooling/__tests__/tooling.test.mjs` (T4) | EZD-001 |
| — | Formatting (Prettier) | review, not gated | EZD-001 |
| — | A stored sample of every schema version loads | CI test | the ticket that adds the schema (03 rule 5) |
| — | One Zod file per object type; Clipper only in a worker; error body shape; log redaction | review | — |
| — | CI fails when any gate check fails | scripts/gate.mjs exit code; proved by scripts/ci/__tests__/ci.test.mjs | EZD-002 |
| — | Vercel config pinned (region, Node major, framework) | scripts/hosting/__tests__/hosting.test.mjs | EZD-003 |
| — | Subdomain serves the app over HTTPS (after each release and by hand, not gated) | node scripts/hosting/check-live.mjs | EZD-003 |
| — | Migrations applied to the local database equal the files in `supabase/migrations/` | scripts/db/__tests__/db.test.mjs (T1) | EZD-004a |
| — | Committed `database.types.ts` matches the local database | scripts/db/__tests__/db.test.mjs (T9), `node scripts/db/gen-types.mjs --check` | EZD-004a |
| — | Supabase CLI pinned, runnable, Linux x64 binary in the lockfile | scripts/db/__tests__/db.test.mjs (T10) | EZD-004a |
| — | Cloud dev migrations workflow: pinned, dev-only, pushes nothing without its secret | scripts/db/__tests__/supabase-dev.test.mjs | EZD-004c |
| — | Unit tests never reach Resend: without an injected client the Resend transport returns email_live_blocked_in_tests | `app/src/server/email/email.test.ts` | EZD-008a |
| — | The live email check stays out of the gate, refuses to run under CI and sends nothing without RESEND_API_KEY | `scripts/email/__tests__/email-docs.test.mjs` | EZD-008b |
| — | Unknown email addresses get no account | EZD-007a T7, T28; EZD-007d T6 | EZD-007a, EZD-007d |
| — | The sign-in page has no password field (EZD-033 edits it) | `app/e2e/sign-in.spec.ts` (T14) | EZD-007f |
| — | The sign-in page never shows the emailed link or code | `app/e2e/sign-in.spec.ts` (T23) | EZD-007f |
| — | The API gate secret never reaches the browser | `app/e2e/gate-secret.spec.ts` (T21) | EZD-007f |
| — | Sign-in folders lint block (literal text, key prefixes, folders lint clean) | `scripts/tooling/__tests__/sign-in-lint.test.mjs` (T24) | EZD-007e, EZD-007f |
| — | Browser device projects, sizes and tag routing inside the gate scope | `app/test-harness/e2e/harness-config.test.ts` (T5, T6), `scripts/e2e/__tests__/harness-wiring.test.mjs` (T15) | EZD-016d |
| — | Browser web server env: gate secret and secret key only in the server env and Node (EZD-009); test DB URL empty; no browser headers | `harness-config.test.ts` (T5; Q-0087) | EZD-016d |
| — | CI's browser install finds a root Playwright config | `harness-wiring.test.mjs` (T9) | EZD-016d |
| — | Harness sign-in never sends the gate secret to the browser; server path gated, browser path refused | `app/e2e/harness.spec.ts` (T12; Q-0087) | EZD-016a |
| — | Shell CSS takes the 04 frame sizes and the tooltip radius from tokens | app/src/components/shell/frame-css.test.ts (S1, U7) | EZD-012a, EZD-012b |
| — | Touch targets at least 44 px on iPad and Surface; phone simple layout; layout switch at 1024 px | app/e2e/device-layouts.spec.ts (helper app/test-harness/touch-targets.ts) | EZD-014c |
| — | Phone components import no shell or device code | app/src/components/phone/phone-imports.test.ts | EZD-014a |
| — | Coarse-pointer 44 px rules, :hover only under (hover: hover), icon-only header below 1600 px | app/src/styles/touch-css.test.ts | EZD-014b |
| — | State components import no shell, phone, device or 3D code | app/src/components/states/states-imports.test.ts | EZD-015a |
| — | State components folder in the field lint block | scripts/tooling/__tests__/messages-lint.test.mjs (L1) | EZD-015a |
| — | State components on /dev/states: Retry, toast close and dialog buttons 44 px on iPad, Surface and phone; Spanish on a phone | app/e2e/states.spec.ts | EZD-015c |
| — | PWA icon files are PNGs of the manifest sizes | app/src/pwa/app-icons.test.ts (U4) | EZD-013 |
| — | Service worker has no fetch handler or cache before EZD-134 | app/src/lib/pwa/sw-file.test.ts (U5) | EZD-013 |
| — | Manifest, worker and icons reachable with no session | app/e2e/pwa.spec.ts (B2) | EZD-013 |
| — | Synthetic fixtures match their expected JSON; manifest matches README and files | `scripts/fixtures/__tests__/` | EZD-016b |
| — | Every registered job handler has a run-twice test | `app/src/server/jobs/handlers.test.ts` (T19) | EZD-009 |
| — | Secret key named in `app/src` only by `app/src/server/jobs/db.ts`; job kinds in code equal the database check | `scripts/db/__tests__/jobs-static.test.mjs`, `app/src/server/jobs/queue.db.test.ts` (T20) | EZD-009 |
| — | Live Sentry is refused in tests; Sentry off when `SENTRY_TRANSPORT` is unset | `app/src/server/errors/sentry-options.test.ts` (T2) | EZD-024 |
| — | Events and alert emails are scrubbed (emails, ids, tokens, codes, request data) | `app/src/server/errors/scrub-fingerprint.test.ts` (T4) | EZD-024 |
| — | No secret key in `app/src/server/errors/` or the tunnel route; error reporting docs, env names and `@sentry/*` rows | `scripts/errors/__tests__/errors-static.test.mjs` (T19) | EZD-024 |

### CI

EZD-002 (vault/plans/EZD-002.md Step 4). Sources in short form as above; `PROCESS` = vault/PROCESS.md.

- **When CI runs:** on the phase PR to `main` and by hand from the Actions tab (`workflow_dispatch`), never on push (PROCESS section 12; `.github/workflows/ci.yml`; Q-0021 (a); vault/spec/non-goals.md). Per-ticket checks are the local `node scripts/gate.mjs <worktree>` (PROCESS section 8 step 7).
- **What CI runs:** `node vault/tools/next_ticket.mjs --check`, then `scripts/gate.mjs` in full scope on Node 22 under `ubuntu-latest` (ci.yml; Test scope above). The job is named `gate`; it is the required check on `main` (Q-0144 (a); PROCESS section 12; Josh adds the rule, vault/tickets/needs-from-josh.md).
- **How a later ticket adds a CI check:** put it in a script the gate already runs (`typecheck`, `lint`, `test`, `build`, `test:e2e` (EZD-007f, root `package.json` line 13), or `perf` (EZD-017)); it then runs locally and in CI with no workflow edit. Never edit `.github/workflows/ci.yml`; it is Josh-owned (`.claude/hooks/guard-paths.mjs`; PROCESS section 4).
- **Checks that need a service the runner does not start** (for example Docker for EZD-004): the ticket's planner raises a question; the options are a new workflow file (the builder may write one) or a ci.yml change by Josh. A new workflow does not trigger on `push`, except `release.yml` on `main` (Q-0106) and `supabase-dev.yml` on `develop` for `supabase/migrations/**` (Q-0107); any other push trigger needs Josh's answer first (`scripts/ci/__tests__/ci.test.mjs` T2 fails it).
- **Workflows on a public repo** (Q-0106; Q-0112): no `pull_request_target` or `workflow_run` trigger; secrets are named only in a step's `env:`; new workflow files pin each `uses:` to a full commit SHA. T2 checks triggers, environments and secret lists for every file; each workflow's own ticket checks the rest (EZD-004c T1, EZD-023b T16, EZD-025 T11).
- **Environments and secrets** (Q-0112): production secrets only in the GitHub environment `release` (main only, no admin bypass), the dev database URL only in `dev` (develop only). Only `release.yml`, `backup-files.yml` and `backup-db.yml` may name `release`; only `supabase-dev.yml` may name `dev`; nothing names `production`; no environment is chosen by an expression. Each workflow reads an exact list of secrets (T2 (h)); `ci.yml` reads none. A later ticket that needs another secret changes its own plan and T2 (h) together.
- **Previews:** Vercel's Git integration, set up in EZD-003, not a workflow (Q-0007; Q-0116 (a)).
- **Tests stay offline:** no live AI, email, render providers or EZ Binder (vault/tickets/README.md rule 4), so CI needs no API keys; EZD-002 adds no secret (CLAUDE.md rule 8).
