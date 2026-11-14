# EZ Draft

Remodel CAD and permit-set web app for Worth Properties (tenant 1), served at ezdraft.ezcontractorbinder.com. Owner: Josh Bishop, a general contractor, not a programmer. He decides product, design and wording; agents decide how to build.

Build process (v3, 2026-11-13): one Opus builder per ticket, one fresh Fable reviewer, `scripts/check.mjs` as the gate, run by `scripts/loop.mjs`. The old process is archived in `vault/archive/` and is not followed.

## Stack
Next.js + React + TypeScript (app in `app/`), geometry in `packages/geometry`, Three.js via React Three Fiber, Supabase (Postgres with RLS, Auth, Storage), Vercel. pnpm workspace. Full versions and layout: `docs/architecture.md`, read by section with `node vault/tools/outline.mjs docs/architecture.md --section '<heading>'` (`--headings` lists them).

## Commands
- Gate: `node scripts/check.mjs` (database up, typecheck, lint, unit and database tests, build, live `scripts/` tests, e2e). A ticket is done only when it passes.
- Local database: `pnpm db:up`.
- Single app test: `pnpm --filter app exec vitest run <file>`; e2e: `pnpm --filter app exec playwright test <spec>`.

## Where things are
- Ticket: `vault/tickets/tickets.json` (title, acceptance criteria, spec files, decisions, mockups). Plan, if one exists: `vault/plans/<T>.md` (input, not law; the spec and decisions win).
- Reading list for a ticket: `node vault/tools/next_ticket.mjs --reads <T> builder`.
- Spec: `vault/spec/INDEX.md`, then the section files it names. Never load `vault/spec/spec.md` whole.
- Josh's decisions (override the spec): `vault/spec/decisions/INDEX.md`. Non-goals: `vault/spec/non-goals.md`. Words: `vault/spec/glossary.md`.
- Mockups: `vault/mockups/INDEX.md`. Mockup sample data is not a decision.
- Code rule catalog: `vault/spec/code-rules.json`. Rule numbers and values come only from its check text.

## Rules
1. Build what the ticket's acceptance criteria and spec say. No extra features. When something is truly unsettled, pick the option closest to the mockup and spec, and record it in `vault/build/assumptions.md` (ticket, question, choice, source). Do not stop.
2. Write tests with the feature. Expected numbers come from the spec, the code book or a worked example, never from running the code.
3. Locked tests (`app/src/server/db/rls.*.test.ts`, `**/*.golden.test.ts`) may not be edited; add new test files instead. Changing any other existing test needs a one-line reason in the commit message; the reviewer checks it.
4. Every table has RLS. Every new table or policy gets a database test proving one company cannot read or change another company's rows.
5. Tests never call live services (AI models, email, render providers, EZ Binder). Use stubs.
6. User-visible text: text on a mockup is decided. Other text follows the same style and is listed in `vault/build/assumptions.md` as wording for Josh to confirm.
7. No new dependency without a line in `docs/architecture.md` under Dependencies.
8. No secrets. Never read `.env` files.
9. Never push to main, force push, or run `supabase db push` or `supabase link`.
10. Report only what a command output in this session shows. Never weaken a check or a test to make it pass.
