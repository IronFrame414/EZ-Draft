# Lessons · planner

Entries follow the format in PROCESS.md section 13. Keep under about 30; the wrap unit consolidates.

## L-002  areas: tooling, scripts, process  seen: 1  status: ratified
Ticket EZD-000, 2026-10-19
Mistake: the plan put the conventions check under scripts/, a folder .claude/hooks/guard-paths.mjs denies to the builder, so the build blocked on Q-0124 after the tests were written.
Cause: the Files table was not checked against the write rules in guard-paths.mjs and PROCESS-EZDRAFT.md section 3.
Rule: for every path in the plan's Files table, confirm the role that writes it is allowed to by guard-paths.mjs; if not, choose an allowed path or list the exception as an open question before Stage 2.
Check: the plan review (review-plans) greps each Files-table path against guard-paths.mjs rules for the writing role.

## L-004  areas: tooling, scripts, process  seen: 1  status: ratified
Ticket EZD-000h, 2026-10-19
Mistake: the contract's ordered steps for applyGates (C7) returned early on an active override before the existing-hold check, so an override would have started new units past a BUDGET_HOLD.md; the plan's own prose and PROCESS.md section 10 step 1 say an existing hold blocks all but the in-progress build. Caught at code review round 1.
Cause: the step list was written separately from the prose rules and not checked against them; an early return silently overrode a later rule.
Rule: when a contract lists ordered steps with early returns, check each early return against every rule in the plan and its sources that a later step enforces, and order the steps so no rule is bypassed.
Check: the plan review walks each early-return step and names the later rules it skips; each skip cites a source that allows it.

## L-006  areas: ci, tooling, security  seen: 1  status: ratified
Ticket EZD-002, 2026-10-19
Mistake: T2's per-workflow allow-lists (Q-0112) checked only the `secrets.NAME`, block-form `environment:` and line-start `uses:` shapes, so `secrets: inherit`, `toJSON(secrets)`, brace-form `environment:`/`on:` and `actions/cache/restore` passed unseen. Caught by the security-reviewer at build review; cost a plan amendment (Q-0146) and two more test rounds.
Cause: the plan specified what a valid line looks like, not what to do with text the checker cannot parse.
Rule: an allow-list check over config text fails every form it does not parse (brace form, wildcard, inherit, expression), and the plan proves each rejection on an in-memory sample plus a clean control.
Check: the plan review lists, for each allow-list test, the other syntaxes the format permits for the same key and where the test rejects them.

## L-009  areas: data-model, migrations, security  seen: 1  status: ratified
Ticket EZD-006, 2026-10-19
Mistake: the plan's Step 5 policy template `project_id = any ((select private.listed_project_ids()))` does not parse on the pinned PostgreSQL 17.11 (42883 `uuid = uuid[]`); the builder's first migration failed and T16 needed a structural repair to add `::uuid[]`.
Cause: SQL contract text in the plan was written from memory and never run against the pinned local stack.
Rule: SQL that a plan fixes as contract text (policy templates, function signatures a test types in) is run once on the pinned local stack by the planner, or marked "confirm on pinned version" so the test-author verifies it before committing.
Check: the plan review lists every SQL fragment a test copies verbatim and names where it was run or marked.

## L-012  areas: tooling, scripts  seen: 2  status: ratified
Ticket EZD-010b, 2026-10-19
Mistake: plan Step 2 said an unknown flag or a flag with no value fails, but no test in section 4 checked it; builder round 1 accepted `--names --list` and `--constructor x` with exit 0, and the code-reviewer failed it (one extra round, builder tier up).
Cause: a rule written in the Approach prose had no matching Tests row, so the gate could not catch it and the builder worked to the tests.
Rule: every "fails"/"refuses" rule in a plan's Approach has a Tests row with a failing input (planner), and the builder implements every Approach rule, not only those the tests check.
Check: the plan review lists each refuse/fail rule in the Approach and the test case that covers it; the code-reviewer runs any uncovered rule by hand.

## L-013  areas: ui, tokens  seen: 1  status: ratified
Ticket EZD-010c, 2026-10-19
Mistake: plan Step 4 said `page.module.css` uses `var(--ez-*)` only, but the token set has no spacing tokens for the 8, 12 and 40 px the page needs; the builder used plain px and the code-reviewer logged it as a plan deviation.
Cause: the plan required tokens without checking that a token existed for every value the file would need.
Rule: a plan that says "tokens only" names the token for each property kind it covers (color, radius, shadow, spacing) or limits the rule to the kinds that have tokens.
Check: the plan review confirms each "tokens only" rule against the token list in `app/src/styles/tokens.css`.

## L-014  areas: migrations, release, security  seen: 1  status: ratified
Ticket EZD-023a, 2026-10-19
Mistake: plan Step 2 exempted objects "created after the tag" from the drop check, and Step 4 counted any `create` in a new migration as such, so `create or replace` or `if not exists` of a released object made it droppable; both reviewers failed round 1 (Q-0156 (a)).
Cause: the exemption was defined by the statements in the new migrations, not by what the base release already had.
Rule: an exemption for "new" objects is defined as absent at the base (by kind and name), never as "a create statement exists"; re-declarations do not count.
Check: the plan review probes every exemption with a re-declaration of a base object followed by the forbidden change.

## L-016  areas: migrations, auth, security  seen: 1  status: ratified
Ticket EZD-007a, 2026-10-20
Mistake: Step 2.0 said a new `private` function needed "no grant", relying on docs/architecture.md "default privileges grant execute to nobody"; on the pinned stack `pg_default_acl` has no row for schema `private`, so the function got PUBLIC execute and EZD-006 T10 failed until the builder added a revoke.
Cause: a security property was taken from a docs sentence instead of the live catalog.
Rule: every plan step that creates a function says `revoke all on function … from public` and then grants by name; it never relies on default privileges.
Check: plan review greps each `create function` step for an explicit revoke from public.

## L-021  areas: ui, testing  seen: 1  status: ratified
Ticket EZD-012c, 2026-10-22
Mistake: plan B2 expected computed `background-size` `32px 32px` on the frame root; the merged CSS draws the grid with two background layers, so Chromium returns `32px 32px, 32px 32px` and the gate failed (PLAN-GAP).
Cause: the expected computed style was written from the spec, not from the CSS rule of the existing element.
Rule: when a plan expects a computed style on an element that exists in merged code, read that rule and write the computed value, one entry per layer for multi-layer properties.
Check: the plan review compares each computed-style expectation with the element's CSS rule.

Ticket EZD-015a, 2026-10-22
Mistake: the plan added icons and wrote "the builder edits no existing test", but EZD-014b's HeaderButton.icon.test.tsx hardcodes the full icon list, so the gate failed (PLAN-GAP).
Cause: the plan checked tests that derive from icons.json, not tests that copy the list.
Rule: when a ticket adds to an inventory (icons, catalog keys, tokens), grep existing tests for exact copies of that list and name each one in the plan as a test-author edit with its new value.
Check: the plan review greps the inventory's names in test files.

## EZD-017 plan-gap (2026-10-22)
Mistake: a test row named fixture files without sizes, config id or `--only` flag, and a helper returned a field (`requests`) the contract omitted.
Rule: for every fixture file a test row names, give its size, its config entry (id, budget, url) and its `--only` flag in that row; record in the interface contract any field a test helper returns that a test reads.

## EZD-017 plan-gaps round 2 (2026-10-22)
Mistake: the contract gave a result type but not how each failure case is reported, and a pan setup move sat after the start mark so it was counted.
Rule: when a result type is in the contract, say up front how each failure case is reported; put every setup step that can trigger a counted event before the start mark.

## EZD-017 plan-gap round 3 (2026-10-22)
Mistake: a test row asked for `spawnSync` and an in-process fixture server together; spawnSync blocks the event loop, so the server never answered and five tests hung to the 170 s kill.
Rule: when a node:test case starts an in-process server and runs a child process against it, the plan says async `spawn` with `await`, never `spawnSync`.

## EZD-018 re-validation (2026-10-22)
Mistake: the v1 plan redefined `end_user_sessions` without stating its language (EZD-006's is sql, so `perform` fails) or the null a cascaded delete passes, and expected broadcast payloads without knowing `realtime.send` adds an `id` key.
Rule: when a plan redefines a function it states the language and checks every caller's arguments, including null from a cascade; a plan that broadcasts through `realtime.send` states that it adds `id` to the payload.

## EZD-018 plan-gap (2026-10-22)
Mistake: Step 5 put Realtime behind an adapter and listed method names but not the channel's typed interface or what a counted "join attempt" is; the test-author could not write the fake adapter.
Rule: a plan that puts a library behind an adapter writes out the adapter's full typed interface, defines each counted event in terms of it, and checks the library's re-call limits (e.g. `subscribe` only once) before choosing how a retry works.

## EZD-018 plan-gap round 2 (2026-10-22)
Mistake: the plan added a non-test `@supabase/*` importer without naming the EZD-007c T34 allow-list edit, gave a dev-page attribute (`rt-self`) no value source, and prescribed a postgres.js payload as a JSON string cast to `jsonb` (double-encoded to a jsonb string).
Rule: when a plan adds a file a guard test restricts (allow-lists, import scans), it names that test's edit and its approver; every `data-testid` value names its source; SQL parameters for `jsonb` are bound as JS objects; at most one expected-refused Realtime join per connection.

## EZD-009 plan-gap (2026-10-22)
Mistake: the plan named modules ("typed wrappers behind JobQueue", "one static map read per call", runner config) without the factory name, method signatures, the lease key or how env-dependent maps are read; it also missed the EZD-007c T34 allow-list edit for the new secret-key client file.
Rule: every module a test injects or imports gets its exported name and full typed signature (factories, option objects with every key and default, error shapes); anything read per call is a function, not a constant; any new value import of a guarded package names the guard test's edit.
Follow-up rule (EZD-009 round 2): a test of an unscoped shared resource (a queue sweep, a global count) must be isolated across files, not only ordered within one; the plan names the cross-file mechanism (an advisory lock, a separate run) because Vitest runs files in parallel.
Follow-up rule (EZD-009 round 3): when a ticket adds the first reader of an environment name, the plan checks every harness that blanks or pins that name (e.g. EZD-016d T5 SUPABASE_SECRET_KEY) and names the edit; every route that parses a body states its 400 code and message_key up front.
- EZD-020 (2026-10-22): when a plan adds rows to a table an earlier ticket's test counts row for row (EZD-017 T7, `BUDGETS`), list that test under the allowed earlier-test edits with the new count, the exact row values and how an array field is compared (`deepEqual`).
- EZD-024 (2026-10-23): when a plan predates the API request gate (Q-0087), check every database client it names against the gate and EZD-007c T34, and check shared caps or global table counts for clashes between parallel test files.
- EZD-026b (2026-10-23): when a plan asserts an attribute on an element from a merged dependency, open that component's markup first and name the exact element that carries the attribute.
- EZD-028 (2026-10-23): a plan that defines a data shape tests will inspect must name every field of every kind (units and angle direction included) and every file a test reads (output path, results JSON keys, recorded execArgv) up front.
- EZD-029 (2026-10-23): when a required type might be unread, check the pinned package's handler list and extension point at planning time; give the own handler's output fields and the exported parser factory (`createParser`) that tests import.
- EZD-021 (2026-10-23): a plan that extends a harness or another ticket's code should name every existing test that pins the extended list or limit (exact key lists, frozen arrays, item counts, timeLeft values) and say who edits it.
- EZD-025 (2026-10-23): a plan written before its dependencies split must cite their merged code (exports, file:line, exact test lists such as EXPECTED_SECRETS and T18) rather than the earlier plan's step numbers, and list every follow-up STATUS assigns to it as a step or a QP.
- EZD-025 (2026-10-23): when tests inject fakes, the plan's contract must name every deps key, option name, result shape and pure helper's module and entry shape; probe the roles that own any Supabase-managed table a migration or script touches.
- EZD-031 (2026-10-23): fix default model ids and price values from official pages, and define a status for a run in progress, in the first plan version; a spike plan with a CLI must also list the confirmation lines.
- EZD-036 (2026-10-23): a control string in a build-output test must come from a value the entry actually imports, checked in the built chunks; the bundler drops exports nobody uses.
- EZD-025 (2026-10-23): before a plan writes to a shared file (.env.example, docs lists), grep every merged test that reads it and check whether each ignores # comment lines, not just the script the plan cites.
- EZD-034 (2026-10-23): when a plan adds a name to `.env.example`, list `scripts/db/__tests__/env.test.mjs` (EZD-004b T7) and `scripts/backup/__tests__/static.test.mjs` (EZD-025 T16) as test-author edits in section 4; grep tests for the name next to it (`SUPABASE_API_GATE_SECRET`).
- EZD-132 (2026-10-24): a Storage policy is the only check on a direct Storage call (outside the PostgREST gate; the browser holds the token), so scope every storage.objects insert or delete policy like the owning route: one prefix per owner ticket, the same switch its can() reads, and the table insert policy's row-ownership match.
- EZD-103a (2026-10-24): when a plan names a test helper, cite the file specs import it from (`app/test-harness/e2e/test.ts`), not only the file that defines it; specs import from one barrel.
- EZD-103a (2026-10-24): before a plan writes `icons:fetch <name>`, fetch the raw file at the pinned commit and confirm `viewBox="0 -960 960 960"`; some upstream icons are still in the legacy width/height format that EZD-010b's pipeline and T8 refuse. Never put `{` or `}` in text a plan dictates for a CSS comment inside `:root`.
- EZD-103a (2026-10-24): when a Decided "CSS" row maps a mockup element to a class, carry every style the board's class gives it (B15 `.sv` color), not only the layout rule; a span without its own color inherits the container's, so name that inheritance.
- EZD-103b (2026-10-25): when a browser test's later part asserts a clean state (no draft, no warning), the plan puts it in its own browser context (harness `sessions` fixture), because IndexedDB, localStorage and cookies persist across pages of one Playwright context and an earlier part's device data leaks into it.
- EZD-132 (2026-10-24): before a plan puts a permission read in any RLS policy (`storage.objects` included), read the ACs and machine checks of every merged or in-flight ticket that governs policies and routes (EZD-102 AC-6, D4, U8) and fit them or raise the conflict as a QP before the build; an agent answer (Q-0269 (b)) or a review finding never overrides an approved AC, and a dependency that merges mid-build brings its checks onto this ticket's gate.
- EZD-136 re-validation (2026-10-24): a plan that fixes an inventory for a completeness test (every `page.tsx` gets a row) must re-list the files at every re-validation, since a sibling ticket's dev page can join the set the plan said was absent.
- EZD-136 plan-gap (2026-10-24): when a plan adds text to an existing container (status bar, frame, footer), grep every earlier test for whole-markup "strip tags then expect empty" checks, not only element-count checks, and name each edit with its owner; a ticket gate's phase scope does not run the earlier phase's test, so only the full suite catches it.
- EZD-146 plan-gap (2026-10-25): when a plan asserts which stream, exit code or connection mode a pinned third-party CLI produces, run the pinned binary once on the local stack for that exact subcommand before writing the expected value; a sibling subcommand's test (`db dump` for `db push`) and a config file borrowed from another ticket (the scratch `config.toml` port) are not evidence.
- EZD-146 review round 1 (2026-10-25): when a plan reuses another ticket's process wrapper, read how that wrapper builds the child env and the mask list, and name in the plan every secret this ticket adds that the wrapper does not already drop or mask; "the helper handles the env" holds only for the names the helper was written for.
- EZD-148 plan-gap (2026-10-25): a line-scanning config checker must state in the plan what it does with every quoting form the format allows (escapes, quotes continued over a line break, a comment marker inside quotes), prove each on a sample, and never run the comment strip before an open-quote check; "refuse what cannot be read" must name the unreadable forms, or the builder handles only the ones listed.
- EZD-148 plan-gap 2 (2026-10-25): a text checker over config must list the line shapes it can read and prove every real-file line fits one (allow-list), not list the forms it refuses; a deny rule on quoting is fooled by quote pairing, every checker sharing the rule carries every refusal the others have, and an oracle parse over a generated corpus proves it before the plan returns.
- EZD-148 plan-gap 3 (2026-10-25): a line regex over YAML must use YAML's own character classes, not JavaScript's (`\s` matches non-ASCII spaces YAML does not; a key may follow `[` as well as `{` and `,`), and the oracle corpus must include every flow-collection opener and every Unicode space before the rule is trusted.
- EZD-148 plan-gap 4 (2026-10-25): a text checker over YAML must refuse the node-start indicators `&`, `*` and `!` wherever a node can begin, not only inside the values it inspects, because an alias makes a key's text live at a distance; the oracle corpus must include aliases, tags and merge keys.
- EZD-147 plan-gap (2026-10-25): a plan whose rule reads the same key as an existing rule names that rule's constants by identifier and reuses its line loop from day one, so a later fix to the shared extraction does not leave a second copy behind.
- EZD-152 (2026-10-25): when a plan filters another program's output (psql stderr), run that program once on the local stack and put its exact lines in section 2 before writing the rule; the probe shows which fields follow which (`QUERY:` after `LINE n:`), that continuation lines carry no label, and whether a flag (`-v VERBOSITY=terse`) removes the fields at the source.
- EZD-152 (2026-10-25): when a step changes one line of a file, re-read the comment above it and the docs sentence that describes it; both must restate the new rule exactly, or the builder is left with a false comment it was told not to touch.
- EZD-153 plan-gap (2026-10-25): a scanner rule over text inside a body is specified on the comment-stripped text at every nesting depth and names, per body language, which statements run as plain SQL; each case is probed on the pinned stack before the rule is written, since one unprobed "same as a do block" sentence left both a comment gap and an `sql`-body gap.
- EZD-153 plan-gap 2 (2026-10-25): a rule that reads SQL text is stated on the lexer's tokens, never on the raw text, and the plan lists every place the raw text is re-joined (`splitStatements`, `stripComments`) and every form the lexer cannot read as written (escape strings, continued strings, `
` comments, settings that change parsing), each proven on the pinned stack with an oracle corpus before the plan returns; a deny-list of normalizations leaks one form per review round.
- EZD-155 re-validation (2026-10-25): when a plan carries line numbers for a pinned base, take them with `grep -n` on that exact commit in the planning session and pin V0 to it; EZD-155's run.mjs numbers were copied from an older checkout and were off by two on the stated base, and a base change later moved the R4 line itself.
- EZD-160 plan-gap (2026-10-26): when new text names a ticket's phase, take the phase from `vault/tickets/tickets.json`, never from the spec's old numbering; the spec still says "Phase 1" for EZD-133, which is phase 3 after the re-cut.
- EZD-163 plan-gap (2026-10-26): before a plan requires every response body to be read, probe the real app's own navigations, memory-cache hits and a stopped service worker; Playwright cannot read some bodies, and a read on a stopped worker's response closes the browser.
- EZD-165 plan-gap (2026-10-26): when a plan says a foreign key blocks a column change, list every foreign key carrying that column (grep all migrations) and check the insert triggers that fill the dependent tables, not just the first table found.
- EZD-169 plan-gap (2026-10-26): when a test calls a route with only the session mocked, read every guard the route calls before its catch on the current develop (here `requireApiPermission` loads a permission context after the session) and mock each one, and take any "grep finds exactly N files" count on that same commit; EZD-102 and EZD-145 merged after planning and added a guard and two 500 routes.
- EZD-154 plan-gap (2026-10-26): when a plan exempts a path from a deny check, say what the path may expand to and what may run beside it, test command substitution and back-reference forms (`$(…)`, backtick, `$_`, `!$`) for each, and never rely on a fixed list of characters that end an option.
- EZD-155 (2026-10-26): a plan that quotes text from a guarded file must take it from develop's current head and recheck it at re-validation, not from the prototype commit (boost notify text changed in bd7c901).
- EZD-171 plan-gap (2026-10-26): a plan that checks a folder against an outside source must list the folder's real contents when written and say how each kind of file is handled, including repo-owned files such as notices and converted copies.
- EZD-188 plan-gap (2026-10-26): when a plan's shared helper must also serve another ticket's rule in the same file, plan that rule's rewrite over the helper up front (kept messages, its controls proven on an oracle) instead of a "stop if it merged" guard.
- EZD-172 plan-gap (2026-10-26): when a ticket splits a resource that was shared, the plan lists every shared file and earlier-ticket state (markers, locks, secret files) and decides per item whether it is per lane; it also searches the tests for hard-coded values the change moves (ports) and gives those tests E-rows from the start.
- EZD-172 plan-gap (2026-10-26, round 3): a ticket that adds parallel lanes must at planning time grep every test and harness file for each lane-0 resource (ports, project id, container names, .temp files, os.tmpdir locks) and give each hit an E-row or a written ruling; the gate runs lane 0 only and never catches them.
- EZD-172 plan-gap (2026-10-26, A1): when sweeping for lane conflicts, check every --workdir passed to the real Supabase CLI (it beats SUPABASE_WORKDIR and decides which [db] port counts as local) and grep fixed listening ports (-p <n>, next start, listen(<n>)), not only Supabase ports.
- EZD-113 re-validation (2026-10-26): give every export a plan takes from a dependency as path plus signature, write route 500 handling as the current reportRouteFailure convention, and require new migration timestamps to be newer than develop's newest file.
- EZD-200 plan-gap (2026-10-26): a plan that adds a file or directory lock must decide stale takeover as one atomic step that both checks "still that owner" and claims (unlink of a name unique to one take, lock created whole by rename), and test two waiters holding the same stale observation; never check-then-rmSync.

## L-023  areas: migrations, security  seen: 1  status: ratified
Ticket EZD-190, 2026-10-26
Mistake: the plan added a `private` function granted to `authenticated` only, then had a test call it directly as `service_role` and `anon`, and left `PRIVATE_EXECUTE` out of the test-author scope.
Cause: grants and the audit allow-list were not cross-read against the test rows.
Rule: a plan that adds a `private` function lists its `PRIVATE_EXECUTE` entry in the test-author scope and calls it in tests only as a role that has execute (else through a definer RPC that role can run).
Check: plan review matches every test caller role to the function's grants.

## L-024  areas: migrations, testing  seen: 1  status: ratified
Ticket EZD-190, 2026-10-26
Mistake: DB tests pinned catalog counts (9 tables, 8 functions) with `toEqual`; three migrations merged between planning and build, so the builder hit a PLAN-GAP.
Cause: a dated catalog snapshot was written into the test contract.
Rule: a test over catalog contents checks the rule plus a minimum list (`toContain`), never `toEqual` on a snapshot; each count in the plan names its date and newest migration.
Check: plan review greps test rows for `toEqual` over catalog lists.

Ticket EZD-1707, 2026-10-26
Mistake: the visual checklist said "card 720 px wide" while step 3 set `max-width: 720px` on a content-box card with padding and border, so the ui-verifier measured 786 px and failed it; section 6 also said W3 "ends with the Q-0208 sentence" when W3 restated it.
Cause: a CSS value was copied into the checklist as a rendered width, and a summary of wording was written from memory instead of compared with the decision text.
Rule: pixel widths in a checklist must say outer box vs max-width (and give the outer value with padding and border); a plan that says wording "is" a decision's text quotes it verbatim or says "restates".
Check: plan review compares every checklist width with the CSS box model of the step that sets it, and every "Q-xxxx wording" claim with the decision row.

Ticket EZD-153, 2026-10-27
Mistake: the plan read the Supabase CLI's JSON stdout from `migration up`, but the probe ran with CLAUDECODE set, and the child env allow-list and GitHub Actions have no such variable, so stdout was empty.
Cause: the CLI prints JSON only when it detects an AI agent unless told with `--output-format json`.
Rule: a CLI probe runs in the same allow-listed environment as the child (no CLAUDECODE or AI_AGENT), and a plan that reads CLI stdout names the output-format flag explicitly.
Check: plan review compares the probe's environment with the child's env list.

Ticket EZD-163, 2026-10-27
Mistake: a re-plan of a ticket whose worktree already existed did not say the branch had to be rebased, so the builder and test-author kept reading the old plan and hit a gap the new plan had already closed.
Cause: the worktree branched before the re-plan and its plan copy was stale.
Rule: a re-plan of a ticket that already has a worktree says up front that the branch must be rebased onto develop and names the files whose old commits get replaced.
Check: plan review looks for that line on any plan marked re-plan.

## EZD-193 plan-gap (2026-10-28)
Cause: the plan wrote raw session output to a file in a public repo with no size cap and no ignore rule; the security-reviewer failed it.
Rule: a plan that writes raw tool or session output to a file decides up front its size cap (unit, which end is kept, marker), whether the file is git-ignored in a public repo, and redaction before the cap, with a test for each.
Check: plan review looks for those three lines on any plan that saves raw output.

## EZD-241 plan-gap (2026-10-28)
Cause: a local test changed a guarded object in a plain session, then ran a guarded push; the guard checks the whole protected set on every DDL statement of its session, including the migration tool's own bookkeeping, so the push would fail.
Rule: a plan whose test changes a protected object outside the guarded session says how it is restored before the next guarded statement, and states how the guard treats changes made by other sessions.
Check: plan review reads each guard-test row for an unrestored change before a guarded call.

## EZD-241, 2026-10-28
Mistake: test U5 required `ownedBy` absent from the whole generated install SQL, which also embeds SNAPSHOT_SQL (contains `ownedBy`).
Rule: when a test checks a word is absent from generated text, say which part it covers and check no embedded text from elsewhere contains the word.

## EZD-241 (2), 2026-10-28
Mistake: a guard scoped by a session setting had no signal that the setting reached the protected session; failure codes did not say whether a re-run is safe.
Rule: a guard that goes inert when its scoping signal fails needs a positive signal from the protected session itself, and every failure code must say whether a re-run is safe.

## L-025  areas: tooling, process  seen: 1  status: ratified
Ticket EZD-244, 2026-10-28
Mistake: a backfill table in the plan listed the open tickets at plan time; four tickets planned later were missing and `--check` failed after the build.
Cause: the list was frozen in the plan instead of derived from STATUS.md at build time.
Rule: a backfill covers the open-ticket set at build time; the plan gives the builder the command that derives it.
Check: `next_ticket.mjs --check` passes after the backfill.

## L-026  areas: tooling, process  seen: 1  status: ratified
Ticket EZD-244, 2026-10-28
Mistake: the plan edited dispatch.md, which an earlier ticket's test pins by SHA-256 of its head; the gate failed on the pin and a plan gap was needed.
Cause: the plan did not search the tests for files it edits.
Rule: when a plan edits a file, grep scripts/**/*.test.mjs for its path; any pin by hash or line count is a structural-repair row with the new value and its authority.
Check: the gate shows no earlier-ticket test red on an edited file.

## L-027  areas: tooling, process  seen: 1  status: ratified
Ticket EZD-244, 2026-10-28
Mistake: the plan removed a pattern (an @ import, a whole-file read) but covered only the files the ticket row named; the reviewer found two skill lines still carrying it.
Cause: no up-front search for the pattern across skills and process files.
Rule: when a ticket removes a pattern, grep every skill and process file for it and give each hit a replacement row.
Check: a grep for the pattern returns 0 after the build.
- 2026-10-28 EZD-245: when a plan edits .claude/skills/build-ticket/dispatch.md, give the exact block lines and include the matching EZD-000e T7 update (scripts/process/retrievers.test.mjs) as a test-author row, because T7 pins the whole file. Also check a dispatch block does not repeat lines its --reads output already prints.
- 2026-10-28 EZD-172: a gate step that runs a worktree's own tools must come after that worktree's install, and an acceptance run of two worktrees must run each worktree's own gate.mjs in a fresh worktree. A lock file taken with open-then-write is visible empty for a moment, so a plan must make the owner id visible before the file is (temp file plus link), or treat an empty file as held.
- 2026-10-28 EZD-245: when a plan states an output or report format in more than one file (an agent file and a dispatch block), it gives the one exact text, names where each file carries it, and adds a text test that every copy matches and the old wording is gone; an 'every subcommand refuses' rule gets one failing-input test per subcommand, including read-only ones.
- 2026-10-28 EZD-250: when a plan changes next_ticket.mjs phase logic, check its fixtures against the live ledger's blocked tickets in earlier phases, and say what an idempotent tool writes when there is nothing to change.
- 2026-10-28 EZD-250: a tool that rewrites a guarded config file says what it does when the existing file cannot be parsed (refuse and notify, never rebuild from empty); for every child process the launcher runs, say what a missing file, a non-zero exit and unreadable output each do, and who hears about it.
- 2026-10-28 EZD-250: when a plan has a launcher state the watchdog reads, name exactly which events may replace it; every worktree path match is a prefix of the project folder, never a search anywhere in the path (check every helper that computes the path, not only the caller).
- 2026-10-28 EZD-250: when a test counts calls to a stub, say which call starts the count, especially when the code under test makes its own call before the state change.
- 2026-10-28 EZD-173: when a plan changes the return shape of an existing export, grep the existing tests for exact-match checks on that export and list each under changed tests; when a text template moves into a shared module, say the old copy is deleted and test that it is gone.
- 2026-10-28 EZD-173: when a tool writes a file that follows a process rule (lesson numbering, two-role entries, seen counts, an index), plan every operation that rule needs from the PROCESS.md section, checked against the real files, not only the one the caller named; grep the stale names a change leaves in PROCESS.md and the skills. The early return that skipped the commit repeats L-004.
- 2026-10-28 EZD-173: when a plan changes a module that other tests copy into temp roots (run.mjs, the ledger), grep every test that copies it and list each under changed tests with its fixture edits (copy list, git repo, moved file paths); and re-check after each develop merge that every writer of a shared ledger file (tickets.json included) writes and commits inside one ledger hold.
- 2026-10-28 EZD-246: when a plan adds text to a file an existing test pins (grep scripts/ for the file's path, e.g. dispatch.md under EZD-000e T7), give the exact lines and placement and a test-author row that updates the pin, as EZD-245 D26 did.
- 2026-10-28 EZD-172: when a plan writes a temp file under a predictable name, say up front "delete it first, then create it with the exclusive flag", so a leftover or planted file is never written through.
- 2026-10-28 EZD-173: when a plan writes a shared ledger file, name the module that owns that file's layout and ID rules and import it instead of copying the rule (addQuestion counted one questions file while develop counts three).

## L-028  areas: tooling, process  seen: 1  status: ratified
Tickets EZD-246, EZD-240, 2026-10-28
Mistake: a test or document line did not carry out an exact plan row (a pipe character in a table, assertion messages and a first-run check in T3); the reviewer found it after the build.
Cause: the plan's exact-text and "after each step" rows were prose the test-author could skim past.
Rule: write each such row as its own numbered check naming the line or step (for example "T3 asserts the sample after run 1 and after run 2"), and put a shared rule such as assertion messages in the test table, not only in Decided.
Check: the reviewer finds no test defect against a plan row.

## L-029  areas: tooling, security  seen: 1  status: ratified
Ticket EZD-248, 2026-10-28
Mistake: a plan for a command guard listed example patterns (regex entries for known bad forms); the security-reviewer found new bypasses in each of three rounds (options before the subcommand, `--` handling, redirections, other shells), and the ticket blocked.
Cause: the plan named forms to deny instead of the threat class and a fail-closed rule, and no not-denied control set bounded false denials.
Rule: a plan for a guard names the threat class, states the fail-closed rule (refuse what cannot be resolved statically) and the accepted cost up front, lists the shells and wrappers in scope, and says whether the guard is the real control or a best-effort accident guard with a git-level control behind it.
Check: the security-reviewer's first probes find nothing outside the plan's stated limits list.

## L-030  areas: tooling, tests  seen: 1  status: ratified
Tickets EZD-248, EZD-251, 2026-10-29
Mistake: a comment or rule wording in a plan or test file described code behavior that the code does not have (rule (r) m=data, "wrong-password tests write error_alert rows"); the reviewer found it after the build.
Cause: the sentence was written from memory of the code, not from the cited lines.
Rule: when a plan has the builder or test-author write a comment or rule text about code behavior, cite the file and line it restates and name the exact branch (for example "only the Auth-outage branch, actions.ts line 141").
Check: the reviewer finds no comment or rule text that differs from the code it cites.

## L-031  areas: release, testing, scripts  seen: 1  status: ratified
Tickets EZD-257, 2026-10-29
Mistake: a plan expected 10 distinct fixture git hashes from fixtures with fixed identity, fixed content and fixed messages; commits made in the same second got the same hash (test-author PLAN-GAP).
Cause: the plan named no input that makes each fixture's commits unique, and git dates have one-second resolution.
Rule: when a test checks that fixture git hashes are distinct, the plan names what makes each fixture's commits unique (for example a run counter in the commit message).
Check: the reviewer finds each distinctness check paired with a named unique input.

## L-032  areas: tooling, scripts, testing  seen: 1  status: ratified
Tickets EZD-250, 2026-10-29
Mistake: the plan's Verify column gave `node --test <bare folder>` (scripts/hooks/, scripts/launcher/, scripts/ledger/), which fails on the pinned Node 22.23.3 with "Cannot find module"; code-reviewer and security-reviewer found it in round 3.
Cause: the verify commands were written from memory of newer Node behavior and never run on the pinned version.
Rule: Verify commands must run on the pinned Node; the planner runs each verify command once before returning the plan, and a test folder is given as a quoted glob (`'scripts/hooks/*.test.mjs'`), never as a bare folder.
Check: the reviewer finds no `node --test` argument that is a bare folder.
Plan check: every `node --test` argument in the Verify column is a named file or a quoted `*.test.mjs` glob.

## L-033  areas: tooling, scripts, testing  seen: 1  status: ratified
Tickets EZD-173, 2026-10-29
Mistake: the plan changed a shared test helper's contract (every launcher test root is now a git repository with ledger.mjs copied) but named only four test files; develop's two newer launcher test files broke at merge, and the repair left an ignored option, two callers and two comments stale.
Cause: the plan listed the test files that existed when it was written and did not name the helper option and comments its rule makes obsolete.
Rule: when a plan changes what a shared test helper does, it names the helper's options, callers and comments that become stale, and says that test files added by develop later get the same repair.
Check: the reviewer greps the helper's old option and old comment text and finds no caller or comment left.
Plan check: a plan that changes a shared test helper lists each option and comment it removes or rewrites, and a grep command that finds none left.

## L-034  areas: tooling, scripts, testing  seen: 2  status: ratified
Tickets EZD-246, EZD-254, 2026-10-29
Mistake: reviewers found added work beyond the plan twice (a sentence in a skill file; a fourth test and extra fixture helpers beyond the D6 shape) because the plan did not say the list was complete.
Cause: the test table and exact-text blocks gave what to write but never said that nothing else is wanted.
Rule: a plan's test table gives the exact test count and titles, a fixture's returned shape is listed in full, and each exact-text block ends with "nothing else".
Check: the reviewer counts the tests, compares the fixture's returned names to the plan and finds no text or helper outside the plan.
Plan check: section 4 states the test count and the fixture's returned names; section 1 text blocks end with "nothing else".
- EZD-175 (2026-10-29): before calling a change to a shared step 'tests unchanged', run every test file that calls that step (here ledger-lock.test.mjs M1/M2) and pin new expected values in the plan.
- EZD-253 re-validation: set up a test ledger copy so it passes every --check rule on the live ledger (architecture list for each open ticket, a plan for each ready one); cite code by function name, not line number, because lines move between planning and build.
- EZD-253 plan-gap: when the plan adds a status message, say what fills each placeholder and give one ledger state that reaches every new branch, including grant holds for earlier phases.
- EZD-253 gap 2: when a test pins a change in which tickets are considered, the plan gives a state where old and new code differ and names the old code's result.
- EZD-253 gap 3: when a plan adds a ledger check, list up front every existing test fixture that builds a ledger state the check refuses (reopened done tickets, synthetic tooling plans) and say how each is repaired.

## L-035  areas: tooling, scripts, ledger  seen: 2  status: ratified
Mistake: a plan's test row or contract left an input out (EZD-253 U8 omitted that P2 was blocked, so its expected build was unreachable; EZD-154 left a bypass form uncovered), found only at test review.
Rule: for each test row, run the row's stated input through the plan's own decision rows (D-lines) by hand and confirm the expected value is the first one reached; list every sibling form of a blocked case.
Plan check: for each test row, name the D-line that yields its expected value and confirm no earlier D-line fires on the stated input.
- When a ticket moves a file per lane, the plan's architecture.md step greps the doc for every place naming the old path and gives each a lane note, not only the bullets it rewrites. (EZD-172 round 9)
When a plan asserts the whole of a list another merged ticket also writes to (e.g. notified), list every writer's lines from current develop code, not from the dependency branch the plan was written against.
Tests section: when a note can carry several line kinds (summary, JSON error, stderr), give each kind a test with a URL password, not only stderr (EZD-259 security review).
- EZD-261 (2026-10-29): When a plan edit replaces text in another plan, check the old text against current develop right before returning (other tickets edit those plans). Write each 'old text gone' test with its closing delimiter, so a valid longer command that starts the same way does not match.

## L-036  areas: tooling, scripts, testing  seen: 1  status: ratified
Mistake: a test row passes on today's code, or checks one output channel only, so the change it pins is not tested (EZD-253 U20 grant-needs row; EZD-259 N3/N4 redaction on stderr only).
Rule: for each test row, state the input where old and new code give different results, and name every output channel (stderr, summary, JSON) the changed behavior reaches.
Plan check: each test row names the old code's result on its input and lists the channels it asserts.

## L-037  areas: tooling, scripts, security  seen: 1  status: ratified
Mistake: EZD-267's plan gave an automatic permission grant and its apply/commit flow only the success path: no fixed list of files never granted (gate.mjs, grants.json), no restore for failed apply or failed commit, and a regression test whose input dropped a file the real case had (same shape: EZD-250, EZD-248, EZD-254).
Rule: a plan for code that grants a permission, or writes then commits, names the files it never grants with the refusal reason, the restore and single notice for every step that can fail after a write, and a test per failure branch whose input has every file the real case has.
Plan check: each write-then-commit step lists its failure branch and restore; each grant rule lists its deny list.

## L-038  areas: tooling, scripts, process  seen: 1  status: ratified
Mistake: tests pinned live values (budget hold 80, next Q-ID), so merges went red on develop for causes outside the diff (EZD-267, EZD-259, EZD-172, EZD-199); plan text also fixed a comment's line count and was off by a line (EZD-172, EZD-267).
Rule: a plan's test rows use fixture values, never the live ledger or budget files; plan text about a comment or doc names the sentence, not an exact line count.
Plan check: no test row reads vault/ ledger files, budget.json or the live next Q-ID; no plan text pins a comment's line count.
When a ticket widens which tickets `next_ticket.mjs` can build, list in the plan every shared ledger fixture (`ledger-copy.mjs`, `priority`/`questions-flow` `before()`) and every doc-text assertion (EZD-253 U17) that the change breaks, and give the test-author rows for them. Run the existing ledger and launcher suites against the planned change before writing Do not touch.
- EZD-108 (2026-10-30): when a plan adds a required prop or field to a shared component or type, grep the worktree for every caller and fixture, dev placeholder pages and typed test mocks included, and list each as a build step or test edit.
- EZD-108 (2026-10-30): before choosing a UI library component for a budgeted entry, check that page's headroom in perf-results and the library's bundle cost; the office entry had about 4 KB left and a Radix popper menu costs about 20 KB.
- EZD-108 (2026-10-30): a server-side password re-check must be checked against the live site's Auth settings (captcha on), not only the local test setup; every Code input needs a shared format check that runs before any throttle slot.
When a plan's test fixture adds a hard link, name a separate target file, never a guarded file: a hard link gives that file two links and the hard-link deny (W2) fires on it. (EZD-260)

## L-039  areas: tooling, security, docs  seen: 1  status: ratified
Mistake: plan-quoted comment or doc text claimed more than the code enforces (EZD-260: a comment said a link to "another checkout" gets no grant, but a link to a sibling worktree does; EZD-108: architecture.md named a component the code does not use), so a reviewer failed a finding for wording alone.
Rule: when a plan dictates comment or doc text, the text states only what the planned code enforces; the planner checks each claim in it against the code and narrows the wording to the case that is true.
Plan check: every comment or doc sentence the plan quotes names a case the planned code handles, checked against the code, not the plan's intent.
When a dependency adds a naming helper for a class of messages (EZD-255 unitSubject for limit texts), every new message of that class in the plan uses the helper.
When a rule changes from 'round N' to 'round N or later', list every place the skill states the old round.
When a rule's wording changes, grep .claude/agents/ and .claude/skills/ for the old wording and list every file in Build steps, so the grant covers them all.
EZD-277 (2026-10-30): a permission plan gives the direction of each compare up front: a check that refuses may fold wider than the disk, but a check that allows (grants, exemptions, writes-only-under rules) folds no wider than the disk; add a test row with a look-alike letter.
EZD-277 (2026-10-30): before a plan claims how the disk treats a name, test it on that disk against an existing folder; realpath rewrites a look-alike folder name to the real one and hides it from any check on the resolved path.

## L-040  areas: tooling, security, testing  seen: 1  status: ratified
Ticket EZD-277, 2026-10-30
Mistake: a permission plan folded letters with JavaScript toLowerCase for grants too; the disk folds fewer characters (dotless i stays distinct), so a grant covered a look-alike path, and a later claim about how the disk treats ſ, ﬁ and Kelvin K was wrong (realpath rewrites them to the ASCII folder).
Cause: the plan did not state the direction of each compare and did not test the disk with an existing folder.
Rule: a check that refuses may fold wider than the disk; a check that allows (grants, exemptions) folds only plain ASCII; test disk claims on that disk against an existing folder.
Check: each permission plan has a look-alike-letter row for every allow rule.
Plan check: Tests rows include a look-alike letter against an existing folder.

## L-041  areas: testing, docs, tooling  seen: 5  status: ratified
Audit M4, 2026-11-01 (ratified by Josh's acceptance of the audit recommendations, 2026-11-01)
Mistake: 73 test files check what documents say (architecture.md, runbook.md, CLAUDE.md, STATUS.md, the live vault); each doc edit then breaks a test, and EZD-160, 162, 243, 247 and 264 only re-aligned wording.
Cause: plans turned "the doc says X" into a test instead of testing the behaviour the doc describes.
Rule: never plan a test that reads a document's wording or the live vault; test the behaviour (the code, the config, the script's output) against fixtures. The only exceptions guard a real rule (no secrets in docs, migration lists) and test it as behaviour.
Check: no Tests row reads `docs/*.md`, `CLAUDE.md`, `vault/` or a heading or phrase in them.
Plan check: every Tests row names code, config or a fixture as its subject, never a document.

## L-042  areas: testing, tooling  seen: 3  status: ratified
Tickets EZD-108 and EZD-277, 2026-10-30 (code-reviewer r1, category test-defect)
Mistake: tests did not match what the plan or the types fixed: a settings test fixture lacked a field the type had just made required (tsc failed), and look-alike letters were typed as literal characters where the plan named \u escapes.
Cause: the plan gave test data in prose and never said that fixtures must satisfy the changed type or that exotic characters are written as escapes.
Rule: when a plan changes a type or needs non-ASCII test data, its Tests rows list the fixtures to update and name the exact escape sequences.
Check: each Tests row with a changed type names the fixture files; each look-alike row gives \u escapes.
Plan check: no Tests row says "look-alike" or "new required field" without the escape or the fixture path.

## L-043  areas: tooling, scripts, testing  seen: 1  status: ratified
Ticket EZD-287, 2026-11-02
Mistake: plan step 3 called projectId() without naming where it comes from; the builder wrote a private copy in local.mjs although scripts/db/sql.mjs already exports one, and the copy's regex drifted. The reviewer found it.
Cause: the plan used a helper by name and did not check the repo for an existing export.
Rule: every function a plan step calls that the plan does not create is named with its file path, found by grep at plan time; "add a helper" is written only when no export exists.
Check: the plan review greps each called-but-not-created name in the plan's steps and finds a file path beside it.
- EZD-108 (2026-11-02): a plan whose feature calls a password sign-in must check up front whether that call is captcha-guarded in production (runbook Captcha) and plan the widget and token from the start.
When a build step changes which value a function returns, the plan lists a test whose stub returns a value different from the input, so the step cannot pass by echoing the input. (EZD-290)
When a plan keeps an old quick check in front of a new parser, it says which one decides each refusal code; better, drop the old check so only the parser decides. (EZD-290)
When a plan's cleaner reports text positions, they come from the original string; include a test whose case change alters length (U+0130) and key the duplicate-attribute rule by expanded name with a two-prefixes-one-namespace test. (EZD-290)
Before a plan reuses a component in an office part, check `eslint-rules/boundaries.mjs` (`components/shell/` is EDITOR_CODE, barred from the office entry) and rebuild its CSS from tokens instead; a step that runs a Node script needing the network inside a unit prefixes `NODE_USE_ENV_PROXY=1` (Node fetch ignores the sandbox proxy). (EZD-110b)
- EZD-110b (2026-11-02): a popover list with a page of N rows states its maximum height and scroll area at the largest page in the smallest test window, and a store action that triggers a refetch says whether it waits for it before the UI reacts.
When a ticket extends a test file that exports nothing, section 3 must say which file the helpers live in and whether they are exported, and must define every helper it names instead of saying 'as <other ticket> T1'.

## L-044  areas: testing, realtime  seen: 1  status: ratified
Ticket EZD-297, 2026-11-03
Mistake: the plan's control row (N2) said "the N1 step-1 assert throws" without saying what value that assert expects; the test-author put a placeholder, so the inner check threw whether or not the event arrived. The plan's S1 upper-case case also used an id with no letters, so it could not test case.
Cause: a negative-control row named the assert but not the expected value, and a case-change input was written without checking it differs from the original.
Rule: a control row names the exact value the inner assert must expect (the id the step created), and a case, length or format test input is shown to differ from its original after the change.
Check: for each control row, the plan review finds the expected value beside the assert; each case-change input contains a letter or character that changes.
- EZD-295 re-validation (2026-11-03): when a ticket lowers a limit, list every earlier test fixture set just past the old limit (the *_PLUS_1 constants) as an edit, not only the tests that check the limit value.
- EZD-295 plan-gap (2026-11-03): when a plan says an earlier test passes unedited, open its body and check every call against the new policy; a policy that narrows Storage operations needs every earlier test that signs uploads to that bucket listed with its replacement call.
When a script runs outside the sandbox and takes a file path from a sandboxed caller, the plan names the one folder the file must be in, how symlinks and hard links are handled, and that the script reads the file itself rather than passing the path on; every child process gets a cwd outside any folder the sandbox can write (EZD-316 round 1).
A plan for a script that runs outside the sandbox first lists every file and env var its child processes read, then chooses a design where none of them is sandbox-writable, instead of blocking one variant per review round (EZD-316 round 3).
A plan that gates what a trusted script pushes names its trust anchor first: anything the sandbox can write is data, never authority (EZD-316 round 3).

## L-045  areas: tooling, security  seen: 1  status: ratified
Ticket EZD-316, 2026-11-03
Mistake: a sandbox-guard plan listed three denied write paths and a check-then-commit step; three review rounds each found another path of the same class (git hooks, worktree config, a resumed merge that records without checking, develop moving between check and commit).
Cause: the plan fixed the examples reviewers named instead of listing every file the unsandboxed step reads and every state it re-reads between check and use.
Rule: for a guard on an unsandboxed step, the plan lists every file and ref that step reads, marks each denied or checked, and says what is re-verified at the moment of use (rule 18).
Check: the plan has a read-list table with a decision per row and a test per check-then-use step.
Plan check: every path an excluded command reads appears in the plan's read-list table.
- EZD-298 (2026-11-03): when an AC says '(test)' but a ratified lesson forbids that test, section 4 says the AC is met by the code-reviewer's check under the Q-ID and names the ticket row line, so the test-author does not raise it as a gap.
When a browser test changes server state after a click whose server function sends a Realtime event, put the clicked row in a state where the function sends no event and name the SQL line that proves it; never make the test wait for a number of responses (EZD-110b T19).
When a component fetches on mount and also listens on a realtime channel, the plan says from the start how the gap before the first join is closed (refetch when ready resolves 'subscribed'), because the hub resyncs only on a re-subscribe (EZD-110b D16).

## L-047  areas: tooling, security  seen: 1  status: ratified
Ticket EZD-316, 2026-11-03
Mistake: the push guard was fixed one instance per round (body file, config race, commondir, hooks, resume path, squash race); 4 rounds found 22 findings, each a new case of one class: unsandboxed commands trusting git state the sandbox can write (refs, config, hooks, locks, objects).
Cause: the plan listed the write paths to deny instead of stating the trust rule (an unsandboxed command trusts nothing the sandbox can write) and checking every unsandboxed command against it.
Rule: a plan that moves an action outside the sandbox lists every unsandboxed command that touches the repo and, for each, which sandbox-writable inputs it reads; it closes the class (exact env, hooks off, no trusted ref or lock) before any single path.
Check: the plan has a table of unsandboxed commands by sandbox-writable input, and the security-reviewer finds no input missing from it.
Plan check: the table exists in the plan's security section.
Planner lesson: when a plan drops stale async results, say up front that a stale result changes nothing on success or failure, with a test for each.
Planner lesson: when a plan says what makes an async result stale, name every path that starts a new generation, not only the one the current finding is about.

## L-048  areas: ui, tokens, testing  seen: 2  status: ratified
Rule: A plan for a store that drops stale async results states staleness once, as an invariant over every mutation (one counter bumped by each state change; an older fetch applies only if the counter has not moved), and tests it as a matrix of every mutation against every fetch kind in flight, not one path per review round.
Sources: EZD-110b rounds 8-10 (three failed rounds, each closing one stale-fetch path).
Plan check: the store rule has no per-path staleness sentences; the test table has one case per (mutation, fetch kind) cell.
Re-validation EZD-117a: a plan that replaces or deletes a page lists every test and spec that renders it, and is re-checked against fix tickets merged on that page after the plan date.
EZD-117a: a plan that adds a SQL function containing count( checks CAP_LOCK_READ_ONLY in app/test-harness/rls/cap-locks.ts (EZD-321) and adds a test-author edit for any display-only counter.
A length cap on an encoded value is derived from the longest value the server itself can create (max chars x max bytes per char). Every field of a client-supplied value that SQL casts is bounded to the cast type's range, with a test against the database at the extremes.

## L-049  areas: testing, data-model, migrations  seen: 1  status: ratified
Ticket EZD-140, 2026-11-04
Mistake: the plan's Tests table named no edit to rls.audit.test.ts's exact list of TABLE_GRANTS tables, so adding the new table to TABLE_GRANTS failed T18 until the test-author edited the list after the build.
Cause: the plan listed the harness entries to add but not the tests that enumerate them.
Rule: when a plan adds an entry to a list the tests enumerate exactly (TABLE_GRANTS, write exemptions, token lists), the Tests table names the test that lists it as an edit row.
Check: grep the tests for the list's name and confirm each hit has a row.
Plan check: every harness-list addition in the Interface section has a matching test edit row.

## L-050  areas: testing  seen: 3  status: ratified
Phase 1 wrap, 2026-11-04 (categories test-missing, test-weak; EZD-253, EZD-108, EZD-110a, EZD-110b, EZD-117a)
Mistake: tests skipped checks the plan stated (icons draw, Cache-Control, a fall-through message) or passed for a wrong implementation (a per-caller queue passed the one-refresh test; 'A'.repeat(8201) failed JSON.parse before reaching the cap).
Cause: the Tests table did not map each plan check to a row, and gave no input that only the correct code rejects.
Rule: every check the plan states (sections 3 and 4, Decided) has a Tests row; each row names an input or count that the plausible wrong implementation fails.
Check: list the plan's checks beside the Tests rows; no check without a row.
Plan check: each Tests row names the wrong implementation it rejects.

## L-051  areas: testing  seen: 1  status: ratified
Phase 1 wrap, 2026-11-04 (category test-isolation; EZD-316, EZD-110b)
Mistake: tests left temp folders behind, and a browser test raced a permission change against an in-flight refetch.
Cause: the plan gave no cleanup step and no ordering for state changes against pending requests.
Rule: a Tests row that creates files names their removal in finally; a browser test that changes server state waits for every pending request first (see L-045).
Check: grep the tests for mkdtemp and setPermissions; each has cleanup or a wait.
Plan check: each Tests row that creates files names the cleanup.

## L-052  areas: data-model, testing  seen: 1  status: ratified
Phase 1 wrap, 2026-11-04 (categories contract-gap, general-case; EZD-108, EZD-110b, EZD-117a, EZD-321)
Mistake: plans left out blank and extreme inputs (empty code, cursor fields, begin-atomic function bodies) and a file the feature needed (a required prop), so reviewers found one case per round.
Cause: the plan described the main path and the examples, not each input's empty, maximum and malformed cases or every file that must change.
Rule: for each input the plan lists empty, over-limit and malformed behaviour with the status or message returned; the Files table lists every caller of a changed signature.
Check: grep for callers of each changed export and compare with the Files table.
Plan check: each input row has empty, maximum and malformed cases.

## L-053  areas: ci, tooling  seen: 2  status: ratified
Phase 1 wrap, 2026-11-04 (category gate-red; EZD-110b, EZD-298, EZD-117a, EZD-323)
Mistake: gate failures a plan could foresee: a client hook imported into a server component, a new counting SQL function against the cap-lock audit, ledger fixtures stale on a worktree behind develop.
Cause: the plan did not name which gate parts the change can turn red.
Rule: the plan lists the gate parts the change touches (build, test, e2e, audits) and says to merge develop into the worktree before the gate.
Check: the plan has a line per touched gate part.
Plan check: the Files table's new server component, SQL function or ledger row each has a gate-part line.

## L-054  areas: ui  seen: 1  status: ratified
Phase 1 wrap, 2026-11-04 (category ui-mismatch; EZD-108, EZD-110b)
Mistake: menu icons drew blank and the menu position differed from the mockup.
Cause: the visual checklist said "as the mockup" without the mockup's measurements.
Rule: each checklist row gives the mockup's measured edge, offset or icon name and a way to test it.
Check: no checklist row says only "matches the mockup".
Plan check: every visual row has a number or a named element.

## L-055  areas: docs  seen: 2  status: ratified
Phase 1 wrap, 2026-11-04 (category docs; EZD-268, EZD-300, EZD-316, EZD-117a)
Mistake: nine findings in four tickets: a doc line, skill step or table still described the behaviour the ticket changed.
Cause: the plan named the main doc but did not search for every line that states the old behaviour.
Rule: when a ticket changes a stated behaviour, the plan lists each doc, skill and agent line found by grep for the old value in its Files table.
Check: grep the repo for the old value; each hit is in the Files table or marked unchanged.
Plan check: the plan shows the grep and its hits.
2026-11-04 · EZD-174 · When a test expects a unit not to start yet, the plan states the lane limits that make it wait and works the input through the harness's run counting and the limit regexes by hand (plan-gap, E2/E3/E4/E6).
- EZD-325 (2026-11-04): when moving ports, grep every file that copies the range, including derived ones such as lane offsets in scripts/db/lane.mjs, and list each copy as a build step, test edit or Do not touch; take docs line numbers from a fresh grep.
When a value a client can forge reaches a PostgreSQL cast (a cursor, a filter), the plan's schema bounds every field to what the cast accepts, checked on the local database (year 0000, offsets past 15:59, U+0000, int range, timestamp length), and takes any length cap from the longest value the SQL emits, measured, so a forged value is a 400, never an RPC error (EZD-117a cursor).
When a ticket removes a test id, function signature or catalog key, grep app/e2e, app/src and app/test-harness for it while planning and list every match as an earlier-test edit (EZD-117b: E6-E9 missed).
When a ticket mounts a component that opens live connections, take its request count from the dependency's latest plan (EZD-110b D16, not EZD-110), check it against a trace, and do not count those requests under captureTraffic (EZD-117b).
When a plan question hands a budget to Josh, list every test and gate row that carries the number. That way, re-validation after the answer only confirms each one instead of searching the code for it.
Measure a page-size budget from a real build of the branch (manifest gzip) before an answer depends on it; when the sign-in landing page loads data, tests that count requests on another page wait for the landing page's requests first.
When a ticket adds controls, plan a touch-target test for each new region and state (header, no-match, error), and give every new control a 44 px tap area in the CSS row; a check scoped to `main` misses a header outside it, and shared touch classes apply only on touch screens.
When a plan adds a tap area, list every control in each region an existing touch check covers, for every role that check signs in as (an owner sees New project, a viewer does not).
A plan that adds controls on a phone or iPad screen sets their 44 px tap areas and a touch-target test up front (11 Accessibility; the EZD-117b review failed on this).
A plan that adds an API route lists an E-row for each test or harness that counts every route (money/route-cases.ts, EZD-133 C1), with the new case written out.
When a one-step dialog is cut out of a multi-column board, work out its width from the footer row's content (hint, buttons, gaps), not from an existing dialog's width.

## L-057  areas: tooling, docs, testing  seen: 1  status: ratified
Tickets EZD-316, EZD-332, EZD-201, 2026-11-05
Mistake: a part of the change the plan named was left out (patch hunks, a comment about moved code, escape sequences in a test file).
Cause: the plan described the change in prose, so no single list let the builder or reviewer tick every piece off.
Rule: a plan ends with a done-when list of every artifact the change touches (each patch hunk by file and step, each comment or header that describes moved code, each literal the plan says to escape); a patch plan names the develop commit it applies to.
Check: the reviewer walks the done-when list against the diff; the plan-checker fails a plan that moves code or issues a patch without that list.
Plan check: the plan has a done-when list with one line per hunk, comment and escaped literal it mentions.

## L-058  areas: tooling, testing, scripts  seen: 2  status: ratified
Tickets EZD-172, EZD-174, 2026-11-04
Mistake: the contract left a failure entry, a return value or a conflicting row undecided, and the code and tests disagreed with it.
Cause: rows written at different times contradicted each other (L8 against C11), and failure output the gate asserts had no row.
Rule: the interface contract lists every return value and every failure or log entry (exact text, caps, the case where its dependency is missing); the planner reads the rows pairwise and removes any two that give different answers for one input.
Check: the reviewer compares each function's return with the contract row; the plan-checker pairs rows on the same input.
Plan check: every function in the contract has a return value, every failure entry has its text and cap, and no two rows answer one input differently.

## L-059  areas: tooling, scripts, security  seen: 2  status: ratified
Tickets EZD-256, EZD-174, EZD-279, 2026-11-04
Mistake: a failure path was hidden or made a wrong state (a read error treated as an empty lock, a cleanup skipped when a call threw, a hook that exits 1 and lets the call through).
Cause: the plan described the success path and named no outcome for a throw or a load failure.
Rule: for each step that reads, deletes, loads a module or calls a helper that can throw, the plan says the outcome on a non-not-found error and on a throw: what is cleaned up (in finally), which message is printed, and whether the check fails closed.
Check: the reviewer forces each throw in a test; the plan-checker looks for an outcome per failing call.
Plan check: every I/O or import step has a stated outcome for an error other than not-found, and a guard fails closed.

## L-060  areas: migrations, ui, testing  seen: 1  status: ratified
Tickets EZD-117a, EZD-117b, 2026-11-05
Mistake: a new migration sorted before develop's newest, and new links and icon buttons were under the 44 px touch target.
Cause: the plan named the migration by a fixed timestamp and listed the controls without the touch-target list.
Rule: a plan that adds a migration says its timestamp is taken after the newest migration on develop at merge time; a plan that adds a link or icon button lists it in the touch-target list and names the test that renders it under expectTouchTargets.
Check: the dev push must not need --include-all; the touch-target test covers every control.
Plan check: each new migration says it follows develop's newest, and each new interactive control is in the tap-area list with a test.

## L-061  areas: security, api, tooling  seen: 1  status: ratified
Tickets EZD-117a, EZD-256, EZD-279, 2026-11-04
Mistake: input or path forms that the code did not bound got through (a cursor value the database cast rejects, a symlinked folder followed, a glob class folded wrongly).
Cause: the plan fixed the cases found and not the whole class.
Rule: for an input that reaches a database cast, a path or a pattern, the plan states the bound or form for the class (type range, no link followed, case-fold applied after parsing) and has a Tests row with a boundary value and a link or class case.
Check: the security-reviewer tries the boundary value; the plan-checker finds a bound for each input class.
Plan check: every input that reaches SQL, the file system or a pattern has its bound stated and a boundary test row.
- EZD-120a lessons: list every gate-wide registry a new table/trigger/route/error report must join (one-table-per-file check, SEEDED_BY_TRIGGER, MONEY_ROUTE_CASES, error-alert lock); pick seq/counter columns as integer when the interface types them as number (harness returns bigint as string).
EZD-238 · 2026-11-05 · When a plan matches ids across objects, state how the dependency compares them (EZD-202 compares ids lower-cased); EZD-238 needed Q-0595 (a).
Plan-gap lesson: put the module of every shared type (Change, Objects, OutboxStorage) in section 3, and say what each control method (retry, flush) does to state and drain timing.
Plan gap (EZD-120b): for every storage write the sync engine makes, state where the change is held when the write fails, replay order in retry(), and that a saved result is stored before anything is sent again.

## L-062  areas: data-model, testing  seen: 1  status: ratified
Tickets EZD-202, EZD-120b, 2026-11-05
Mistake: plans' Tests rows named timing, ordering and race cases loosely (counts, "at most one in flight", "next 2,000 ms", a put failing during an await), so tests passed on nothing or dropped a planned case, and the drain race needed an extra round (Q-0597).
Cause: the Tests row did not state the interleaving (which await is held, which call rejects meanwhile) or the exact expected counts and orders.
Rule: for every async or ordered behaviour, the plan's Tests row names the held await, the event injected during it, and the exact expected counts or call order; a row that cannot fail on the old behaviour is rewritten.
Check: each timing or race row names a held promise or fake timer and an assertion that fails without the fix.
Plan check: grep the Tests rows for "at most", "before", "after" and confirm each names the interleaving.
Plan lint: when a plan adds an entry to a page, route or path list, grep that list's users for hard-coded counts (toBe(N), EXPECTED_* = N, 'N pages' in titles/comments) and list each as a test-author edit with new value and source. (EZD-120c, E7/E8)
EZD-203 plan-gap round 1 (2026-11-05): say up front whether a crossing is a join (00e Join, Q-0570); a migration never deep-copies untrusted stored data, it copies only the levels the step changes.
EZD-120d: when a plan writes literal model objects (test data), build them from the geometry package defaults (DEFAULT_WALL_LAYERS, CURRENT_SCHEMA_VERSION), not hand-listed fields, so a later schema change cannot make the server reject them.
EZD-120d: when a helper has an exception path (a rethrown framework error) or loads a module lazily, the plan states up front what happens when it rejects or the load fails, and how a test reaches that path without a DOM.
A fix ticket for a spec in another phase must name node scripts/ui-run.mjs <T> <spec> as its proof, because the ticket gate (phase scope plus @smoke) never runs that spec. A touch-target check copied from an @ipad test must keep the tag or be dropped, because the bell and avatar are 44 px only under (any-pointer: coarse). (EZD-343)
When a cookie is renamed, the plan should decide up front how the old-named cookies get cleared on the scheme where they are no longer read, not leave them to expire.

## L-063  areas: auth, security  seen: 2  status: ratified
When a plan changes a cookie's name or attributes, list the old-name cookies too: say whether the request gate deletes stale and planted copies, and give a test row for each (EZD-120d planted marker; EZD-342 old plain sb- cookies left after deploy).
Plan check: does the plan name what happens to the cookie under its previous name and under a planted Domain= copy?
EZD-346: when a check compares against request.nextUrl.origin, a test helper builds its expected origin with new NextRequest(url).nextUrl.origin, not new URL(url).origin (Next rewrites 127.0.0.1 and [::1] to localhost; Playwright baseURL is 127.0.0.1).

## L-064  areas: testing, ui  seen: 2  status: ratified
Tickets EZD-202 and EZD-343, 2026-11-06
Mistake: EZD-202's tests wrote inline object data where the plan's fixture row said to copy v1.json objects, and EZD-343's E1 touch-target test had no run proof because the gate's e2e scope excludes phase 1 specs, so it failed when run.
Cause: the plan named the fixture's content but not its source file, and named a browser test without saying which gate scope runs it.
Rule: a Tests row names the file a fixture is copied from and what changes in the copy (ids, level), and a browser test row names the Playwright project or tag that runs it and the command that proves it passes.
Check: the plan review lists each fixture row's source file and each browser test's project or tag.
Plan check: every fixture row names its source file and edits; every e2e row names its project or tag and run command.
- EZD-207a (2026-11-06): when a Decided row says what happens while an async start is pending, give each thing that can change during the wait (detach, resize) its own test row with exact call counts.
- EZD-207a (2026-11-06): a plan that builds a view for another package's schema should list every member that schema has, including members open dependency plans add, each with its value and source.
A plan that checks a timing budget inside the browser suite must say up front that the measuring spec runs alone (Playwright runs 4 workers), and that the pan waits for the canvas's last async step (text), not only its ready attribute. (EZD-207c)
- EZD-209 (2026-11-06, L-049 again): a plan that adds a page file under app/src/app/ names the EZD-133 money page list edits (page-cases.ts PAGE_FILES, money-routes.test.ts C4 count, money-pages.spec.ts EXPECTED_PATHS) as test-author edit rows; and an empty-markup assertion rendered through MessagesProvider expects the provider's own wrapper, never '' (L-020).
- EZD-209 plan-gap (2026-11-06): a plan that adds a dev page and says "no test lists dev routes" must grep the tests for page-count and page-list inventories (EZD-133 C4 money page list, e2e EXPECTED_PATHS) and name each edit with its owner, or the builder meets a structural repair; see the EZD-136 re-validation line.
- EZD-358 (2026-11-06): a plan whose proof runs one spec through ui-run.mjs must check that spec's Playwright project for dependencies; if present the whole suite runs, so count by test title and state what happens when other tests fail.
- EZD-210b (2026-11-06): run every expected browser coordinate through snap (0.5 in length rounding, 5 degree angle capture) before it goes in a plan; pick points snap leaves unchanged. A test polls a count until stable, never a fixed wait.
- EZD-210b (2026-11-07): a test value computed from an angled or turned wall (cos/sin) is checked with toBeCloseTo(..., 9), not toBe; the plan says whether a derived length is stored rounded (03g: computed values are not).
EZD-359: when a run series has an evidence threshold, state up front what happens if it ends short, and reset the shared database before every full-suite run.
EZD-359: before a plan names a database command, read what the package.json script runs; reset-before-run means pnpm db:up, because bare db:reset wipes the API gate secret and breaks sign-in.
EZD-359: before a rule uses CPU time under emulated throttling, check how the throttle shows in thread time; Chromium's POSIX throttle spins on the main thread and does not suspend it.
Before naming a database reset command in a plan, read what it does in scripts/db/local.mjs. Use pnpm db:up, which resets the database and stores the API gate, never bare pnpm db:reset. (EZD-358)
EZD-294: an expression index runs its functions as the writing role, so a plan that indexes a private function must grant execute to every role with insert or update on the table (check role_table_grants) and add the PRIVATE_EXECUTE entries.
- EZD-299b (2026-11-09): device writes after an await on a list row (delete, requeue) are checked against the row version field (refusedAt) inside their own transaction; the plan names the field, how merged server rows carry it, and the result on mismatch.
EZD-294: when a plan says a counter only rises, list every store method that writes values (including ones another ticket adds), and bound every client-sent number by the limit the save path already uses.
EZD-294: when a plan bounds numbers the client sends, apply the same bound to stored values a backfill reads.
EZD-294: when a trigger keeps a stored value on update, the plan must say the upper bound applies to the kept value too, and check any backfill that runs while the trigger is on against that rule.
Planner EZD-294 (round 3): when a number is capped, state what happens when highest+1 passes the cap, for both trigger and backfill.
EZD-299 re-validation (2026-11-09): a plan whose browser tests call an API route directly should send every header the app's own client sends for that route family (the membership header), so a security fix to the route does not break the tests; name the fix ticket as a dependency up front.
- 2026-11-09 EZD-204a: when a plan raises CURRENT_SCHEMA_VERSION, grep every test for the old and new version numbers, including tests using the next version as the unknown one and responses upgraded to current; list each hit as an edit row up front.
Cite merged-code line numbers only after the dependency merges; a plan written against planned deps should cite them by plan section, not by file:line, so re-validation does not have to chase them.
- When a test checks a value that a merged dependency's code computes (e.g. hover after a click), trace that code path in re-validation, including the order of state changes inside a call with side effects, and name any fix in section 1 instead of listing the file under Do not touch. (EZD-208b)
- L-next candidate: when a plan puts an existing component into a server page, decide the 'use client' directive on the component itself if it uses hooks (EZD-224).
EZD-217 re-validation: when a dependency's plan is split, cite the part plan's merged contract rows (e.g. P208b C1, C2, DB7), not the parent's props, and take each import's source file from a merged file that already imports it.
EZD-217 plan-gap: when a fixture calls a merged helper, write its exact signature in the plan, including which argument it reads (withObjectNumber takes { type, data }, not data).
