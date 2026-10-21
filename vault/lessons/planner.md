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
