# Phase 1 gate findings · 2026-11-02 (PR not opened; fix tickets first)

Gate on develop 310f0cd5: ledger OK, `gate.mjs . --full` PASS (typecheck, lint, test, build, e2e, perf). Phase 1 = slice 1 (EZD-101, 102, 103a, 103b, 132, 112, 113, 1704, 1707, 136), all done.

## Security review: FAIL (1 minor)
1. `.github/workflows/ci.yml:29` runs `npm install -g pnpm` unpinned -> fix ticket EZD-284.
Not read by the reviewer: vault/, .claude/, scripts/launcher, hooks, UI components, e2e, packages/geometry, spikes, lockfile body, most release and backup script bodies, every function body in `20261027001745_guard_gated_rpcs.sql` (counted 10 gate checks only).

Production-sensitive changes:
- `.github/workflows/**`: a new daily backup check (read-only, release environment); actions pinned to SHAs; CI now also runs on pushes to develop, read-only. pnpm in CI still unpinned (EZD-284).
- `supabase/migrations/**`: 22 new forward-only migrations (roles, permissions, file storage, customers, error throttle, gate backstop). One comment-only edit to `20261020101101` (no SQL change; nothing released, so the M2 frozen-file check does not apply).
- `scripts/release/**`: scratch-database migration check; release guard that blocks drops and renames. `scripts/backup/**`: backup check; restore, scratch and source scripts edited. `scripts/hosting/check-live.mjs` edited.
- `package.json`, `pnpm-lock.yaml`: dev-only `js-yaml` 4.3.2 (line in docs/architecture.md:292).
Production-sensitive changes: FAIL (only because of the open pnpm pin).

## Phase audit (Fable): NOT READY
1. Defect: Q-0341, Q-0355, Q-0357 answered "fix ticket", no ticket carried them -> EZD-287, EZD-285, EZD-286. Josh's 2026-11-02 triage (D10 (a)) covers only EZD-251, 252, 256, 263, not these.
2. Doc: phase-01.md header and Build gate were pre-recut -> fixed in place (superseded note). The EZ Binder stub, Edit lock and 200-project checks are not phase 1 and are not run at this gate.
3. Doc: PHASES.md slice 1 said Crew is redirected with another message and listed Translations -> fixed (Q-0214, Q-0234).
4. For the PR (Josh): wording to confirm not in `phase-01-for-josh.md`: EZD-113 Spanish `error.customer_*` (`app/src/server/messages/catalogs/es.ts:73-76`); EZD-1707 W3 (restates Q-0208). Add every `needs-josh-confirm` STATUS note.
5. For the PR (Josh): agent answers not yet confirmed: Q-0232 (signed-link lifetime 15 min, backup thresholds 26 h / 8 d, logo bucket, email-case rule); Q-0414 (phase 2 wizard opens customer list/add to Create projects, supersedes AC-EZD-113-6).
6. Field check (Josh): AC-EZD-1704-3 restore drill on the cloud project; EZD-171 Josh-run rows; 6 MB logo and bad-SVG refusals in a real browser; Settings on the cloud stack with real keys; debt D-001 (no "saving" state), D-002 (edit button cut off under 1,280 px).
7. Risks: dev pages/routes live on previews by design (Q-0413); EZD-102 is the pattern template for later tickets.
8. PR body must list EZD-141 (blocked; Josh's rule-20 exception, supabase/auth#2852; SET LOCAL warning at sign-in) and the blocked product tickets EZD-251, 252 (dropped, D10 (a)). Tooling tickets not done: list from `next_ticket.mjs --tooling 1`.

## Next
Fix tickets EZD-284..287 (phase 1, ready, product). After they merge: rerun /gate-phase 1 (steps 1-4 again), consult the advisor before the PR opens. Do not write vault/tickets/gates/phase-01.md until a PR URL exists.

# Round 2 · 2026-11-03 (develop 96483261; PR still not opened)

Gate: ledger OK, `gate.mjs . --full` PASS (typecheck, lint, test, build, e2e, perf). Warnings in gate.log: only the NO_COLOR/FORCE_COLOR line (debt D-007).

## Security review (3 passes): FAIL
1. Logo bytes can be replaced straight in Storage by a Company-settings member (`storage_media_insert`/`_delete`, 20261026120002_create_storage_buckets.sql) -> EZD-295 (with Q-0478).
2. Released migration 20261020101101 had a comment edited by EZD-160 (54bb4d44). It is on origin/main and Release run 40086272055 (2026-10-24) succeeded. No `phase-N` tag exists, so check-migrations M2 compares nothing ("no release tag yet: nothing is released") -> EZD-298 restores the file. Open for Josh: who creates the first `phase-N` tag, and when (no script or skill does).
3. `.github/workflows/ci.yml` checkout lacks `persist-credentials: false` -> EZD-300.
Pass 3 (workflows, package.json, lockfile, spike, supabase/checks, scripts/db, events.ts): PASS. Not fully read: gen-types.mjs body, scripts/db tests.

## Phase audit (Fable): NOT READY
Defects ticketed: Q-0477 -> EZD-296 (sources bucket limits; formats and size limit are Josh's, ask at planning), Q-0479 and Q-0486 -> EZD-297 (realtime event tests), Q-0478 -> EZD-295.
Debt rows: D-026 (EZD-285 plan header), D-027 (stale lines in phase-01.md).
Josh items for the PR body: D-006 (medium, due at this gate; fix is vault/handoff/d006-ci.patch and waits for his yes); Q-0232 and Q-0269 agent numbers to confirm; EZD-141 blocked (supabase/auth#2852); wording to confirm: EZD-113 Spanish `error.customer_*` (es.ts 73-76) and EZD-1707 W3 (STATUS notes needs-josh-confirm; phase-01-for-josh.md section 3 does not name them).
Field check: restore drill (AC-EZD-1704-3); real 6 MB logo and SVG upload in a browser; owner name and logo in the header after reload; signed download link after expiry; Settings and Customers on a phone.

## Tickets added (todo, no plan; STATUS rows land when this unit's results file is applied)
EZD-295 (logo server-only writes, security), 296, 297, 298, 300. EZD-294 was claimed by a questions 1 unit and is not in tickets.json; check it before reusing (D-025).

## Next
Plan, question, build and review 295 to 298 and 300 (plus 294 if it appears), then rerun /gate-phase 1 steps 1 to 4 and consult the advisor before the PR. Do not write vault/tickets/gates/phase-01.md until a PR URL exists.
