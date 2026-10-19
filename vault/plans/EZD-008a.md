# EZD-008a · Send helper and transports

- **ACs:** AC-EZD-008a-1, AC-EZD-008a-2 (`vault/spec/acceptance-criteria.md` lines 33–34; generated from Done-when, KNOWN-LIMITS last item)
- **Complexity:** medium (section 8)
- **User-visible result:** nothing on screen yet: the server can send an email (to a test outbox until Josh's Resend key is in), and every send hands back its link so later screens can show Copy link.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: questions (QP-1)

Planned from the parent plan `vault/plans/EZD-008.md` ("Split proposal" Part EZD-008a, "Re-validation findings" V1–V12, Approach Steps 1–6 part A and 8, Tests T1–T9, T14), split by Q-0152 (confirmed). Every interface name the parent fixed is kept (Q-0152: later plans cite them: EZD-024 lines 17, 177, 370, 393; EZD-019 line 353; EZD-016a lines 23, 72). Changes against the parent are listed in section 2 "Changes against the parent plan" and each one says why.

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 19):
- **Scope:** Server send helper in app/src/server/email/ that also returns the link so the UI can show Copy link; a stub transport, chosen by env, records messages for tests and can write them to a folder for browser tests; Resend transport; transport chosen per environment, stub refused in production (Q-0041); company emails sent as "<Company> via EZ Draft" with replies to the company email (Q-0036). Split from EZD-008 (Q-0152); plan Part EZD-008a.
- **Done when:** With the stub transport, the helper records one message and returns the same link URL that is in the message body. With a fake Resend client the Resend transport sends the same message, and without one it never reaches the network in tests.
- **Depends on:** EZD-004a, EZD-004b, EZD-006
- **Spec ref:** External services; R24 #15

This is a harness ticket (parent plan Approach; vault/PROCESS.md Special tickets): the test-author writes the stub transport, the outbox readers, the Vitest env defaults and the tests; the builder writes the module. Technical choices no source makes are marked *planner's choice* (CLAUDE.md rule 3: agents decide how to build).

### Step 1 · Types (builder) `app/src/server/email/types.ts`
Exact shapes in section 3 (parent Step 1). Server-only by location (docs/architecture.md Folder layout `src/server/`). One recipient per call (*planner's choice*, parent Step 1: invite and magic links differ per person, one result gives one Copy link per person). No free `fromName`/`replyTo` input: sender name and reply address come only from `company` (Q-0036: replies go to the company email, "not to the individual sender").

### Step 2 · Body builder (builder) `app/src/server/email/body.ts`
`buildEmailBody({ paragraphs, link, lang })`, pure (parent Step 2):
- `text` = paragraphs joined by `\n\n`, then `\n\n`, then `link.url`, then `\n`. No paragraphs → `link.url + '\n'`.
- `html` = `<!doctype html><html lang="<lang>"><body>` + one `<p>…</p>` per paragraph + `<p><a href="<url>">label</a></p>` + `<p><url as text></p>` + `</body></html>`. `lang` defaults to `en` (R26 R17: crew screens in Spanish, so `es` is allowed). Every paragraph, the label, the href and the URL text are escaped (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`, `'`→`&#39;`). No styling, images or tracking pixel. The URL is printed as text too, so it can be copied when the button does not work (R24 #15 reason: spam).
- The only link in either body is `link.url` (Done when).

### Step 3 · Stub transport (test-author; harness) `app/src/server/email/test-harness/stub-transport.ts`
(parent Step 3)
- `createStubTransport({ dir? })` → `EmailTransport` with `name: 'stub'`; `readStubOutbox()`, `clearStubOutbox()`.
- Outbox: an array on `globalThis.__ezdEmailStubOutbox`, shared by every module copy in one process. Each record is a `StubMessage` (section 3); `id` = `'stub_' + crypto.randomUUID()`; `send` returns `{ ok: true, messageId: id }`. A message with no reply address is stored **without** a `replyTo` key (so the memory and file copies are identical, T7).
- Idempotency like the provider: a `send` whose `idempotencyKey` is already in the outbox records nothing and returns the first message's id (11 Operations: "Job handlers can be run twice safely").
- File sink: when `dir` is set, each recorded message is also written as JSON to `<dir>/<13-digit Date.now()>-<6-digit sequence>-<id>.json` (directory created if missing; the sequence is a per-process counter on `globalThis.__ezdEmailStubSeq`, starting at 1). *Planner's choice*, changed from the parent's `<Date.now()>-<id>.json`: two sends in the same millisecond would otherwise sort by random id and T7's "send order" would be flaky. A browser test runs in a different process from the app server, so it reads the folder (EZD-110 Done when; EZD-016a line 72 sets `EMAIL_STUB_DIR`).
- `app/test-harness/email-outbox.ts` (test-author): `readStubOutboxDir(dir)` (parsed `.json` files sorted by file name; `[]` when the folder does not exist), `clearStubOutboxDir(dir)`, `linksIn(message)` → `{ text, html }`: every `https?://` URL in `message.text` (match `/https?:\/\/[^\s<>"']+/g`), and every `href="…"` value in `message.html` with the five escapes of Step 2 undone. Used later by EZD-024 (line 17), EZD-105, EZD-110.

### Step 4 · Transport choice (builder) `app/src/server/email/transport.ts`
`getEmailTransport(env)` reads `env` **per call, never at module load** (EZD-004b rule: `app/src/server/db/env.ts` reads inside `readPublicDbEnv()`; docs/architecture.md Environment variables: "the app reads them per call, so `next build` needs none"). Checks in this order; the first that applies wins (parent Step 4):

| # | Env | Result |
| --- | --- | --- |
| 1 | `EMAIL_TRANSPORT` unset, empty, or not exactly `stub` / `resend` | `{ ok: false, code: 'email_transport_not_set' }` |
| 2 | `EMAIL_FROM` unset or not a valid sender (below) | `email_from_not_set` |
| 3 | `EMAIL_TRANSPORT=stub` and `VERCEL_ENV=production` | `email_stub_not_allowed` (ticket Scope "stub refused in production", Q-0041) |
| 4 | `EMAIL_TRANSPORT=stub` | `{ ok: true, transport: createStubTransport({ dir: env.EMAIL_STUB_DIR || undefined }), from: EMAIL_FROM }` |
| 5 | `EMAIL_TRANSPORT=resend` and `RESEND_API_KEY` unset or empty after trim | `email_key_not_set` (EZD-021 row pattern "AI key not set") |
| 6 | `EMAIL_TRANSPORT=resend` with a key | `{ ok: true, transport: createResendTransport({ apiKey }), from: EMAIL_FROM }` |

- Order check (lesson L-004): every early return before row 6 is a failure; the only `ok` returns are rows 4 and 6, and row 4 is reached only after row 3, so the production guard cannot be skipped.
- Valid sender: either a bare address, or `Name <address>` with a non-empty name containing no `"`, `<`, `>`, `\r`, `\n`; the address passes Zod's `z.email()` (zod 4.6.7, `app/package.json`). *Planner's choice.*
- Production is detected by `VERCEL_ENV` (set by Vercel; docs/architecture.md Hosting), not `NODE_ENV`: EZD-016a's browser tests run the app with `NODE_ENV=production` and must still use the stub.
- No default transport in code: unset fails loudly (*planner's choice*, parent Step 4). Previews may use either transport per environment (Q-0041; EZD-023b enters `stub` for Preview); a preview set to `resend` with a key gets Resend with no code change (T3 (g), (h)).

### Step 5 · Resend transport (builder) `app/src/server/email/resend-transport.ts`
`createResendTransport({ apiKey, client? })` → `EmailTransport` with `name: 'resend'` (parent Step 5; 02 Named tools "Email | Resend").
- Field names confirmed on the pinned SDK `resend@6.34.1` (`dist/index.d.mts`, read 2026-10-19 from the registry tarball): `emails.send(payload: CreateEmailOptions, requestOptions?: CreateEmailRequestOptions)`; payload fields `from`, `to: string | string[]`, `replyTo?: string | string[]`, `subject`, `text`, `html`; request option `idempotencyKey?: string` (sent as the `Idempotency-Key` header); the result is `{ data: { id } , error: null } | { data: null, error: { message, statusCode, name } }` plus `headers`. The SDK calls the global `fetch`. Dependencies: `postal-mime`, `standardwebhooks` (no install scripts reported by `npm view`); optional peer `@react-email/render` (not installed, not used).
- `send(message, opts)` calls `client.emails.send(payload)` with `payload = { from, to, subject, text, html }` plus `replyTo` only when the message has one, and passes a second argument `{ idempotencyKey }` only when a key is given.
- `data.id` → `{ ok: true, messageId: data.id }`; an `error` or a thrown error → `{ ok: false, code: 'email_provider_error' }`. `send` never throws.
- When no `client` is injected, `send` first checks `process.env.VITEST`: if set (Vitest sets `VITEST="true"`, vitest 5.0.5 `cli-api` chunk), it returns `{ ok: false, code: 'email_live_blocked_in_tests' }` without creating a client or making any request (CLAUDE.md rule 6; tickets README rule 4). Otherwise it creates `new Resend(apiKey)` once and reuses it. EZD-021 later adds the suite-wide guard.

### Step 6 · Send helper (builder) `app/src/server/email/send.ts`, `index.ts`
`sendEmail(input, options?)`; `options.env` defaults to `process.env` (parent Step 6 part A).
1. Validate `input` with Zod (02 Named tools; 03 rule 5 pattern). Invalid input throws `EmailInputError` (`code = 'email_invalid_input'`), a caller bug: `to` an email; `company.replyTo` null or an email; `company.name` non-empty after removing `"`, `<`, `>`, `\r`, `\n` and trimming; `subject` non-empty with no `\r` or `\n` (header injection); `link.url` passes `z.url({ protocol: /^https?$/ })` (same rule as `app/src/server/db/env.ts`; V8), so `javascript:`, `ftp:`, `mailto:` and relative paths fail; `link.label` non-empty; `paragraphs` an array of strings; `lang` `en` or `es`.
2. `getEmailTransport(env)`; on failure return `{ link: input.link.url, status: 'failed', transport: null, messageId: null, errorCode }`.
3. Sender (Q-0036 (b) with Josh's change): with `company`, From = `<display name> <address of EMAIL_FROM>`, where the display name is the cleaned `company.name` + `SENDER_SUFFIX` (`' via EZ Draft'`, one constant in `send.ts`, *planner's choice*; for tenant 1 "Worth Properties via EZ Draft", Q-0036's example) — quoting per QP-1; Reply-To = `company.replyTo` when not null, otherwise none (S15a company email not yet set). Without `company` (emails no company sends, e.g. EZD-024's `ALERT_EMAIL_TO`, Q-0067 (b)): From = `EMAIL_FROM` unchanged, no Reply-To (Q-0036 option (a), unchanged by Josh's change, which concerns company emails). " via EZ Draft" is part of a header, not interface text, so it is not translated.
4. `transport.send(message, { idempotencyKey })` → `status: 'sent'` with `transport` name and `messageId`, or `status: 'failed'` with the transport's code.
5. **The link is in every result, sent or failed** (R24 #15; Q-0035: "everything that sends an email must also generate and show the sender a link they can copy and paste"; 11 Security "Copy link fallback").
- No log line: `app/src/server/` has no `logger.ts` yet and check C8 forbids `console.` (V10); recipients and links (tokens) are never logged (docs/architecture.md Errors and logging). EZD-024 adds Sentry reporting by extending `send.ts` (EZD-024 line 342).
- `index.ts` re-exports `sendEmail`, `EmailInputError` and the types of `types.ts`. Imports inside the module and from tests are relative (V9: the app Vitest config has no `@/` alias).

### Step 7 · Test defaults (test-author) `app/vitest.config.ts`
Add `test.env: { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' }`; keep every existing key (`environment`, `include`, `testNamePattern`, `maxWorkers`, `globalSetup`, `testTimeout`; V5). `test.env` is in the pinned Vitest 5.0.5 types ("Custom environment variables assigned to `process.env` before running tests"). None of the global setup's names collides (V5).

### Step 8 · Dependency (builder)
`pnpm add resend@6.34.1` in `app` (`saveExact`). The Dependencies row already exists (`resend` `6.34.1`, `Used in` `app`, `Added by` EZD-000), so check C1 passes with no docs edit (V7). If the install reports a build script or a required peer, the builder stops and raises a question (docs/architecture.md Adding a dependency; Q-0140 (a)); none is expected (Step 5).

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/server/email/types.ts` | New | builder | Step 1 |
| `app/src/server/email/body.ts` | New | builder | Step 2 |
| `app/src/server/email/transport.ts` | New | builder | Step 4 |
| `app/src/server/email/resend-transport.ts` | New | builder | Step 5 |
| `app/src/server/email/send.ts` | New | builder | Step 6 |
| `app/src/server/email/index.ts` | New | builder | Step 6 |
| `app/package.json` | Change | builder | Step 8 |
| `pnpm-lock.yaml` | Change (regenerated) | builder | Step 8; the gate installs `--frozen-lockfile` |
| `app/src/server/email/test-harness/stub-transport.ts` | New | test-author | Step 3 |
| `app/test-harness/email-outbox.ts` | New | test-author | Step 3 |
| `app/src/server/email/email.test.ts` | New | test-author | T1–T10 |
| `app/vitest.config.ts` | Change (extend) | test-author | Step 7 |

Write rules checked against `.claude/hooks/guard-paths.mjs` (lesson L-002; V4): test-author paths match line 15 (`test-harness/` segment, `*.test.*`, `vitest.config.*`); builder paths are outside `scripts/`, `.claude/`, `vault/` and test paths (line 82). Not touched: `.env.example`, `docs/architecture.md`, `docs/runbook.md`, `scripts/**` (EZD-008b). Size: 8 builder + 4 test-author files and 10 tests, the size Q-0152 accepted for this part.

**Data:** none. No tables, columns, migrations, RLS or `schema_version`; no money fields. `RESEND_API_KEY` lives only in Vercel and Josh's terminal, never in the repo (CLAUDE.md rule 8).

## 2. Sources
- `vault/spec/sections/07-hooks-events-and-integrations.md` · External services: "Email provider | Share links, notifications, magic links | —".
- `vault/spec/decisions/13a-rounds-24-25.md` line 43, R24 #15: "Everything sent by email also shows a Copy link button, because email from the new domain may land in spam."
- `vault/spec/decisions/07-hooks-events-and-integrations.md`: Q-0035 (sender domain; Copy link for every send; sign-in exception is EZD-007's), Q-0036 (b) with a change ("<Company> via EZ Draft", replies to the company email), Q-0041 (both transports, per environment, previews on the stub), Q-0067 (b) (no-company alert emails). `02-product-overview.md` decisions: Q-0003 (Resend account shared with EZ Binder).
- `vault/spec/sections/02-product-overview.md`: Named tools (Email | Resend; Zod), line 37 (every email has a Copy link). `03-data-model.md`: rules 1, 2, 11 (server-only; nothing here touches tables or money). `04-app-shell-and-global-ui.md`: no screen changes (no mockup, `tickets.json` `mockups: []`). `11-non-functional-requirements.md`: Performance line 21 (200 KB download budgets: the module stays under `src/server/`, never in browser bundles), Operations line 65 (job handlers run twice safely → `idempotencyKey`), Security line 77 (Copy link fallback). `13b-round-26.md` R26 R17 (Spanish, `lang`).
- Q-0152 (split confirmed; names and expected values kept), Q-0153 (`scripts/email/` is EZD-008b's, not this part's).
- `vault/spec/non-goals.md`, `glossary.md`: no email entries (grep 2026-10-19).
- Code read 2026-10-19: `app/vitest.config.ts`, `app/package.json` (no `resend` yet), `app/tsconfig.json`, `app/test-harness/supabase-env.global-setup.ts` (throws without the local stack, so these unit tests need Docker; the gate runs `db:up` first, EZD-004a), `app/src/server/db/env.ts`, `.claude/hooks/guard-paths.mjs` lines 15, 82; `resend@6.34.1` `dist/index.d.mts` and `index.mjs` (registry tarball); vitest 5.0.5 dist types.
- Plans: `vault/plans/EZD-008.md` (parent), EZD-004b (env pattern, Vitest setup), EZD-006 (global setup), EZD-016a lines 23, 72, EZD-019 line 353, EZD-024 lines 17, 177, 342, 370, 393 (consumers of this contract).
- Research reports: none cover this ticket.

**Changes against the parent plan** (how-to choices only; no product change): (1) stub file name gains a sequence number (Step 3, flake fix; no consumer reads the name). (2) Resend payload fixed to `to` as a string, `replyTo` key only when set, second argument only with a key (Step 5; confirmed on the pinned SDK instead of "per the pinned SDK"). (3) The Resend client is created lazily, after the Vitest check (Step 5). (4) T4 also compares the Resend payload with the stub's record for the same input ("sends the same message", AC-EZD-008a-2). (5) T5 and T4 get "done when" titles for AC-EZD-008a-2. (6) T3 adds case (i) (EMAIL_FROM bare address, which EZD-024 T14 uses). (7) Sender quoting is QP-1; T14 (d) and (e) depend on it.

## 3. Interface contract

All paths under `app/src/server/email/` unless shown. Imports are relative (V9).

| Kind | Name or path | Details |
| --- | --- | --- |
| type | `EmailMessage` (`types.ts`) | `{ from: string; to: string; replyTo?: string; subject: string; text: string; html: string }` |
| type | `TransportResult` | `{ ok: true; messageId: string } \| { ok: false; code: 'email_provider_error' \| 'email_live_blocked_in_tests' }` |
| interface | `EmailTransport` | `readonly name: 'stub' \| 'resend'; send(message: EmailMessage, opts?: { idempotencyKey?: string }): Promise<TransportResult>` |
| type | `SendEmailInput` | `{ to: string; subject: string; paragraphs: string[]; link: { url: string; label: string }; company?: { name: string; replyTo: string \| null }; lang?: 'en' \| 'es'; idempotencyKey?: string }` |
| type | `EmailErrorCode` | `'email_transport_not_set' \| 'email_from_not_set' \| 'email_key_not_set' \| 'email_stub_not_allowed' \| 'email_provider_error' \| 'email_live_blocked_in_tests'` |
| type | `SendEmailResult` | `{ link: string; status: 'sent' \| 'failed'; transport: 'stub' \| 'resend' \| null; messageId: string \| null; errorCode: EmailErrorCode \| null }`; `link` is always `input.link.url` |
| export | `buildEmailBody` (`body.ts`) | `(args: { paragraphs: string[]; link: { url: string; label: string }; lang?: 'en' \| 'es' }) => { text: string; html: string }` |
| export | `getEmailTransport` (`transport.ts`) | `(env: Record<string, string \| undefined>) => { ok: true; transport: EmailTransport; from: string } \| { ok: false; code: EmailErrorCode }` |
| export | `createResendTransport` (`resend-transport.ts`) | `(opts: { apiKey: string; client?: ResendClientLike }) => EmailTransport` |
| type | `ResendClientLike` (`resend-transport.ts`) | `{ emails: { send(payload: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }, options?: { idempotencyKey?: string }): Promise<{ data: { id: string } \| null; error: { name: string; message?: string } \| null }> } }`; a `Resend` instance from `resend@6.34.1` must be assignable to it (typecheck) |
| export | `sendEmail` (`send.ts`) | `(input: SendEmailInput, options?: { env?: Record<string, string \| undefined> }) => Promise<SendEmailResult>`; throws only `EmailInputError` |
| export | `EmailInputError` (`send.ts`) | `class extends Error`, `readonly code = 'email_invalid_input'` |
| export | `SENDER_SUFFIX` (`send.ts`) | `' via EZ Draft'` |
| file | `index.ts` | re-exports `sendEmail`, `EmailInputError` and every type in `types.ts` |
| export | `createStubTransport` (`test-harness/stub-transport.ts`) | `(opts?: { dir?: string }) => EmailTransport` (`name: 'stub'`) |
| export | `readStubOutbox`, `clearStubOutbox` (same file) | `() => StubMessage[]` (a copy, send order); `() => void` |
| type | `StubMessage` (same file) | `EmailMessage & { id: string; idempotencyKey: string \| null; sentAt: string }`; `id` starts `stub_`; `sentAt` ISO 8601 |
| globals | `__ezdEmailStubOutbox`, `__ezdEmailStubSeq` | on `globalThis` |
| file name | stub sink | `<dir>/<13-digit ms>-<6-digit seq>-<id>.json`, one `StubMessage` as JSON |
| export | `readStubOutboxDir`, `clearStubOutboxDir`, `linksIn` (`app/test-harness/email-outbox.ts`) | `(dir: string) => StubMessage[]`; `(dir: string) => void`; `(m: Pick<StubMessage, 'text' \| 'html'>) => { text: string[]; html: string[] }` |
| env (read) | `EMAIL_TRANSPORT`, `EMAIL_FROM`, `EMAIL_STUB_DIR`, `RESEND_API_KEY`, `VERCEL_ENV`; `VITEST` (Resend transport only) | names fixed by the parent plan; EZD-008b documents them |
| config | `app/vitest.config.ts` `test.env` | `EMAIL_TRANSPORT: 'stub'`, `EMAIL_FROM: 'EZ Draft Test <test@example.test>'` (EZD-016a line 72 uses the same value) |
| Resend call | `client.emails.send` | `(payload)` or `(payload, { idempotencyKey })`; payload keys exactly `from`, `to`, `subject`, `text`, `html` and `replyTo` when set |

No routes, components, props or `data-testid`.

## 4. Tests
All in `app/src/server/email/email.test.ts`, inside one top-level `describe('EZD-008a send helper and transports', …)` (check C9; phase 0 grep matches `EZD-008a`, V6). `clearStubOutbox()` before each test. No test makes a network request (CLAUDE.md rule 6). Tests compare exact values and codes. Test data, not product wording: `LINK = 'https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&x=1'`; `TO = 'crew@example.test'`; `FROM = 'EZ Draft Test <test@example.test>'`; `ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM }`; `INPUT = { to: TO, subject: 'Test subject', paragraphs: ['Line one', 'Line two'], link: { url: LINK, label: 'Open' } }`; `CO = { name: 'Worth Properties', replyTo: 'office@example.test' }`. Needs the local stack running (global setup, V5). smoke: no.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 `EZD-008a done when: stub records one message and returns the link in its body` | AC-EZD-008a-1 | unit | `sendEmail(INPUT, { env: ENV_STUB })` | Result `link === LINK`, `status 'sent'`, `transport 'stub'`, `errorCode null`, `messageId` starts `stub_`; `readStubOutbox().length === 1`; its `to === TO`, `from === FROM`, `subject === 'Test subject'`; `linksIn(m).text` deep-equals `[LINK]`, `linksIn(m).html` deep-equals `[LINK]`; `result.link === linksIn(m).text[0]` | Done when; R24 #15; Steps 2, 3, 6 |
| T2 Body format and escaping | AC-EZD-008a-1 | unit | `buildEmailBody` with (1) INPUT's paragraphs and link; (2) `paragraphs: ['<script>x</script>']`, label `'A & B'`, `lang: 'es'`; (3) `paragraphs: []` | (1) `text === 'Line one\n\nLine two\n\n' + LINK + '\n'`; html contains `href="https://ezdraft.ezcontractorbinder.com/invite/AbC123?ref=email&amp;x=1"` exactly once, no raw `&x=1`, starts `<!doctype html><html lang="en">`. (2) html contains `&lt;script&gt;x&lt;/script&gt;`, no `<script>`, contains `A &amp; B`, starts `<!doctype html><html lang="es">`. (3) `text === LINK + '\n'` | Step 2 (planner's format) |
| T3 Transport choice | AC-EZD-008a-1 | unit | `getEmailTransport(env)` and `sendEmail(INPUT, { env })` for (a) `{}`; (b) `{ EMAIL_TRANSPORT: 'smtp', EMAIL_FROM: FROM }`; (c) `{ EMAIL_TRANSPORT: 'stub' }`; (d) `{ ...ENV_STUB, EMAIL_FROM: 'not an address' }`; (e) `{ ...ENV_STUB, VERCEL_ENV: 'production' }`; (f) `{ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM }`; (g) `{ ...ENV_STUB, VERCEL_ENV: 'preview' }`; (h) `{ EMAIL_TRANSPORT: 'resend', EMAIL_FROM: FROM, RESEND_API_KEY: 're_fake', VERCEL_ENV: 'preview' }` (`getEmailTransport` only); (i) `{ EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'x@example.test' }` | (a) `email_transport_not_set`; (b) `email_transport_not_set`; (c) `email_from_not_set`; (d) `email_from_not_set`; (e) `email_stub_not_allowed`; (f) `email_key_not_set`; (g) ok, `transport.name 'stub'`; (h) ok, `transport.name 'resend'`; (i) ok, `from === 'x@example.test'`. For (a)–(f) `sendEmail` resolves with `status 'failed'`, `transport null`, `messageId null`, `link === LINK`, the same code; outbox length 0 | Step 4; R24 #15 (link on failure); Q-0041 ((e), (g), (h)); EZD-024 line 393 ((i) shape) |
| T4 `EZD-008a done when: the Resend transport sends the same message through a fake client` | AC-EZD-008a-2 | unit | First `sendEmail({ ...INPUT, company: CO }, { env: ENV_STUB })` and keep the stub record `S`. Then `createResendTransport({ apiKey: 're_fake', client: fake })` driven through `sendEmail({ ...INPUT, company: CO, idempotencyKey: 'k1' })` with `getEmailTransport` replaced for this test only (`vi.resetModules()`, `vi.doMock('./transport', …)` returning `{ ok: true, transport, from: FROM }`, then `await import('./send')`; `vi.doUnmock` and `vi.resetModules()` afterwards, so T3 still uses the real module; not file-wide `vi.mock`, which is hoisted). Fake `emails.send` cases: (a) resolves `{ data: { id: 're_123' }, error: null }`; (b) resolves `{ data: null, error: { name: 'validation_error', message: 'x' } }`; (c) throws | Fake called once with `(payload, { idempotencyKey: 'k1' })`; `payload` keys exactly `from, to, replyTo, subject, text, html`; `payload.from === S.from === 'Worth Properties via EZ Draft <test@example.test>'`, `payload.to === TO`, `payload.replyTo === S.replyTo === 'office@example.test'`, `subject`, `text`, `html` equal `S`'s. (a) `status 'sent'`, `messageId 're_123'`, `transport 'resend'`. (b), (c) `status 'failed'`, `errorCode 'email_provider_error'`, `link === LINK`; no throw | Done when ("sends the same message"); Steps 5, 6; Q-0036; resend 6.34.1 types; 11 Operations line 65 |
| T5 `EZD-008a done when: without a fake client the Resend transport never reaches the network` | AC-EZD-008a-2 | unit | `vi.spyOn(globalThis, 'fetch')`; `createResendTransport({ apiKey: 're_fake' }).send({ from: FROM, to: TO, subject: 's', text: 't', html: 'h' })` | Resolves `{ ok: false, code: 'email_live_blocked_in_tests' }`; fetch spy 0 calls | Done when; CLAUDE.md rule 6; Step 5 (SDK uses global `fetch`) |
| T6 Invalid input throws | AC-EZD-008a-1 | unit | `sendEmail` with `ENV_STUB`, one change at a time: `to: 'not-an-email'`; `company: { name: 'Worth Properties', replyTo: 'x' }`; `company: { name: '  ', replyTo: null }`; `company: { name: '"<>', replyTo: null }`; `subject: ''`; `subject: 'a\r\nBcc: x@example.test'`; `link.url`: `'javascript:alert(1)'`, `'ftp://x.test/a'`, `'/invite/AbC123'`; `link.label: ''` | Each rejects with an `EmailInputError` whose `code === 'email_invalid_input'`; outbox length 0 | Step 6 item 1 |
| T7 Stub file sink | AC-EZD-008a-1 | unit | `ENV_STUB` + `EMAIL_STUB_DIR` = a new `fs.mkdtemp` folder; two sends with `to` `a@example.test` then `b@example.test` | `readStubOutboxDir(dir)` has 2 messages in send order, each deep-equal (`toStrictEqual`) to the matching `readStubOutbox()` entry; the folder holds exactly 2 `.json` files, names matching `/^\d{13}-\d{6}-stub_[0-9a-f-]{36}\.json$/`; `readStubOutboxDir` of a missing folder is `[]` | Step 3; EZD-110 Done when |
| T8 Stub idempotency | AC-EZD-008a-1 | unit | Two `sendEmail` with `idempotencyKey: 'k1'`, then one with `'k2'` | Outbox length 2; first two results have equal `messageId`; the third differs | Step 3; 11 Operations line 65 |
| T9 Test defaults | AC-EZD-008a-1 | unit | Read `process.env.EMAIL_TRANSPORT`, `process.env.EMAIL_FROM` with no stubbing; then `sendEmail(INPUT)` with no `env` option | `'stub'`; `'EZ Draft Test <test@example.test>'`; result `status 'sent'`, `transport 'stub'`; outbox length 1 | Step 7; CLAUDE.md rule 6 |
| T10 Sender rules | AC-EZD-008a-1 | unit | `sendEmail` with `ENV_STUB` and (a) `INPUT`; (b) `{ ...INPUT, company: CO }`; (c) `{ ...INPUT, company: { name: 'Worth Properties', replyTo: null } }`; (d) `company: { name: 'A "B" <c>\r\nBcc: x', replyTo: null }`; (e) `company: { name: 'Smith, Jones LLC', replyTo: null }` | (a) `from === FROM`, no `replyTo` key. (b) `from === 'Worth Properties via EZ Draft <test@example.test>'`, `replyTo === 'office@example.test'`. (c) same `from`, no `replyTo` key. (d) and (e): per QP-1 — under (b) (recommended): (d) `from === '"A B cBcc: x via EZ Draft" <test@example.test>'`, (e) `from === '"Smith, Jones LLC via EZ Draft" <test@example.test>'`; under (a): (d) `from` contains no `"`, no `\r`/`\n`, no `<`/`>` before the address, ends ` via EZ Draft <test@example.test>` (parent T14), (e) `from === 'Smith, Jones LLC via EZ Draft <test@example.test>'`. Every result `link === LINK` | Q-0036 (b) with a change; Q-0067 (b) (no company); Step 6 item 3; RFC 5322 section 3.2.3 (QP-1) |
| Gate (orchestrator) | — | gate | `node scripts/gate.mjs .claude/worktrees/EZD-008a` with Docker running | Exit 0: typecheck, lint, test, build pass | CLAUDE.md rule 12 |

Parent IDs: T1–T9 keep their numbers; parent T14 is T10 here (Q-0152 kept expected values; T10 (a)–(c) are the parent's). Parent T10–T12 belong to EZD-008b.

## 5. Visual checklist
None (no screen; `tickets.json` `mockups: []`). EZD-016a is not a dependency.

## 6. Proposed wording
None. Every word a recipient reads comes from the caller (later tickets, through `t()`); " via EZ Draft" is the header form Josh gave in Q-0036. Error codes are not shown to users; callers map them to `message_key`s (docs/architecture.md Errors and logging).

## 7. Security review
security-review: **yes**. Areas: API (outbound provider call with `RESEND_API_KEY`, key read per call and never logged); header injection (subject, company name, sender); HTML escaping of caller text and links; the production guard against the stub (`VERCEL_ENV`); links carry tokens and are never logged (03 rule 11; docs/architecture.md Errors and logging); live sends blocked in unit tests.
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no (section 5 empty) · security-reviewer yes.

## 8. Complexity and model recommendation
**medium**: a new server module with a provider switch and a test harness later tickets reuse (EZD-016a, 024, 105, 110), but no data model, permissions, money or auth (PROCESS.md section 4). test-author Sonnet 5.5; builder Sonnet 5.5 (code-reviewer and security-reviewer Opus 5.5).

## 9. Dependencies
- Ticket row: **EZD-004a** (the gate's `pnpm db:up`; the Vitest global setup throws without the local stack, V5), **EZD-004b** (`app/vitest.config.ts`, global setup, `zod` in `app/package.json`, per-call env pattern of `app/src/server/db/env.ts`), **EZD-006** (extended global setup; this ticket does not edit it). All `done` per the handoff (vault/handoff/CURRENT.md).
- Not in the row, used directly: **EZD-000** (`resend` Dependencies row; checks C1, C7, C8, C9), **EZD-001** (the `app` package, `eslint.config.mjs`, vitest config). Transitive through EZD-004b; no change to the row needed.
- Dependents: EZD-008b (docs, env names, runbook, live check), EZD-016a (sets `EMAIL_TRANSPORT`, `EMAIL_FROM`, `EMAIL_STUB_DIR` on its web server), EZD-019 (mirrors `getEmailTransport`'s result shape), EZD-021, EZD-023b, EZD-024 (extends `send.ts`), EZD-105, EZD-110.
- Risks: the `test.env` defaults apply to every app unit test (intended, CLAUDE.md rule 6). A Resend import from browser code would count against the 200 KB budget (11 line 21); the module stays under `src/server/` (EZD-133 lint later). Company names with non-ASCII letters rely on Resend encoding the header (not verified; T10 uses ASCII). The stub module ships in server code but is refused when `VERCEL_ENV=production` (T3 (e)).

## 10. Open questions
- **Q-0154 (was QP-1):** RFC 5322 (section 3.2.3) requires a display name that contains `,` `.` `:` `;` `@` `(` `)` `[` `]` or `\` to be quoted, so a company named e.g. "Smith, Jones LLC" would be misread as two addresses, but the parent plan's T14 (d) (kept by Q-0152) expects no `"` in the From; options: (a) keep the parent's unquoted form (T10 (d) as in the parent; such names may break or show wrongly), or (b) quote the display name whenever it contains one of those characters (T10 (d) becomes `"A B cBcc: x via EZ Draft" <test@example.test>`; names without them, such as "Worth Properties via EZ Draft", are unchanged) — planner recommends (b); a technical choice, not a product one.
