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

## L-012  areas: tooling, scripts  seen: 1  status: ratified
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

## L-023  areas: migrations, security  seen: 1  status: candidate
Ticket EZD-190, 2026-10-26
Mistake: the plan added a `private` function granted to `authenticated` only, then had a test call it directly as `service_role` and `anon`, and left `PRIVATE_EXECUTE` out of the test-author scope.
Cause: grants and the audit allow-list were not cross-read against the test rows.
Rule: a plan that adds a `private` function lists its `PRIVATE_EXECUTE` entry in the test-author scope and calls it in tests only as a role that has execute (else through a definer RPC that role can run).
Check: plan review matches every test caller role to the function's grants.

## L-024  areas: migrations, testing  seen: 1  status: candidate
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

## L-025  areas: tooling, process  seen: 1  status: candidate
Ticket EZD-244, 2026-10-28
Mistake: a backfill table in the plan listed the open tickets at plan time; four tickets planned later were missing and `--check` failed after the build.
Cause: the list was frozen in the plan instead of derived from STATUS.md at build time.
Rule: a backfill covers the open-ticket set at build time; the plan gives the builder the command that derives it.
Check: `next_ticket.mjs --check` passes after the backfill.

## L-026  areas: tooling, process  seen: 1  status: candidate
Ticket EZD-244, 2026-10-28
Mistake: the plan edited dispatch.md, which an earlier ticket's test pins by SHA-256 of its head; the gate failed on the pin and a plan gap was needed.
Cause: the plan did not search the tests for files it edits.
Rule: when a plan edits a file, grep scripts/**/*.test.mjs for its path; any pin by hash or line count is a structural-repair row with the new value and its authority.
Check: the gate shows no earlier-ticket test red on an edited file.

## L-027  areas: tooling, process  seen: 1  status: candidate
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

## L-028  areas: tooling, process  seen: 1  status: candidate
Tickets EZD-246, EZD-240, 2026-10-28
Mistake: a test or document line did not carry out an exact plan row (a pipe character in a table, assertion messages and a first-run check in T3); the reviewer found it after the build.
Cause: the plan's exact-text and "after each step" rows were prose the test-author could skim past.
Rule: write each such row as its own numbered check naming the line or step (for example "T3 asserts the sample after run 1 and after run 2"), and put a shared rule such as assertion messages in the test table, not only in Decided.
Check: the reviewer finds no test defect against a plan row.

## L-029  areas: tooling, security  seen: 1  status: candidate
Ticket EZD-248, 2026-10-28
Mistake: a plan for a command guard listed example patterns (regex entries for known bad forms); the security-reviewer found new bypasses in each of three rounds (options before the subcommand, `--` handling, redirections, other shells), and the ticket blocked.
Cause: the plan named forms to deny instead of the threat class and a fail-closed rule, and no not-denied control set bounded false denials.
Rule: a plan for a guard names the threat class, states the fail-closed rule (refuse what cannot be resolved statically) and the accepted cost up front, lists the shells and wrappers in scope, and says whether the guard is the real control or a best-effort accident guard with a git-level control behind it.
Check: the security-reviewer's first probes find nothing outside the plan's stated limits list.

## L-030  areas: tooling, tests  seen: 1  status: candidate
Tickets EZD-248, EZD-251, 2026-10-29
Mistake: a comment or rule wording in a plan or test file described code behavior that the code does not have (rule (r) m=data, "wrong-password tests write error_alert rows"); the reviewer found it after the build.
Cause: the sentence was written from memory of the code, not from the cited lines.
Rule: when a plan has the builder or test-author write a comment or rule text about code behavior, cite the file and line it restates and name the exact branch (for example "only the Auth-outage branch, actions.ts line 141").
Check: the reviewer finds no comment or rule text that differs from the code it cites.

## L-031  areas: release, testing, scripts  seen: 1  status: candidate
Tickets EZD-257, 2026-10-29
Mistake: a plan expected 10 distinct fixture git hashes from fixtures with fixed identity, fixed content and fixed messages; commits made in the same second got the same hash (test-author PLAN-GAP).
Cause: the plan named no input that makes each fixture's commits unique, and git dates have one-second resolution.
Rule: when a test checks that fixture git hashes are distinct, the plan names what makes each fixture's commits unique (for example a run counter in the commit message).
Check: the reviewer finds each distinctness check paired with a named unique input.

## L-032  areas: tooling, scripts, testing  seen: 1  status: candidate
Tickets EZD-250, 2026-10-29
Mistake: the plan's Verify column gave `node --test <bare folder>` (scripts/hooks/, scripts/launcher/, scripts/ledger/), which fails on the pinned Node 22.23.3 with "Cannot find module"; code-reviewer and security-reviewer found it in round 3.
Cause: the verify commands were written from memory of newer Node behavior and never run on the pinned version.
Rule: Verify commands must run on the pinned Node; the planner runs each verify command once before returning the plan, and a test folder is given as a quoted glob (`'scripts/hooks/*.test.mjs'`), never as a bare folder.
Check: the reviewer finds no `node --test` argument that is a bare folder.
Plan check: every `node --test` argument in the Verify column is a named file or a quoted `*.test.mjs` glob.

## L-033  areas: tooling, scripts, testing  seen: 1  status: candidate
Tickets EZD-173, 2026-10-29
Mistake: the plan changed a shared test helper's contract (every launcher test root is now a git repository with ledger.mjs copied) but named only four test files; develop's two newer launcher test files broke at merge, and the repair left an ignored option, two callers and two comments stale.
Cause: the plan listed the test files that existed when it was written and did not name the helper option and comments its rule makes obsolete.
Rule: when a plan changes what a shared test helper does, it names the helper's options, callers and comments that become stale, and says that test files added by develop later get the same repair.
Check: the reviewer greps the helper's old option and old comment text and finds no caller or comment left.
Plan check: a plan that changes a shared test helper lists each option and comment it removes or rewrites, and a grep command that finds none left.
