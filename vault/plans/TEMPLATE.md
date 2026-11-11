# EZD-xxx · <ticket title>
Every v2 table has rows or `None: <reason>`; `plan_lint.mjs` checks them on a plan with the `- Template: v2` line (EZD-382).
A plan is written in two plan units (EZD-384): first the brief, then this whole plan. `node vault/tools/next_ticket.mjs --plan-step <T>` names the step; the `- Plan step:` header line records the step the file is at.

- **ACs:** AC-EZD-xxx-1, AC-EZD-xxx-2 … (from `vault/spec/acceptance-criteria.md`; one per testable sentence of the ticket's Done-when until the phase has Stage 0 ACs)
- **Complexity:** low | medium | high (PROCESS.md section 4; one sentence of reasoning in section 8 below)
- **Areas:** <lesson areas, comma-separated, lower-case; from vault/lessons/INDEX.md>
- **User-visible result:** one line, plain words: what now works for Josh.
- Phase: N · Planned by: planner · Date: YYYY-MM-DD · Status: planned | questions
- Template: v2
- Plan step: code-bound

## Brief
Written first, at step brief (EZD-384; PLANNING-REDESIGN.md 1.2 P1). A brief file is the header above without the Complexity and Template lines and with `- Plan step: brief`, then this section, section 2 (ending with its `Architecture:` line) and section 10, nothing else. The whole plan keeps this section, with `Files (estimate)` set to its Build steps row count and `Tests (estimate)` to its test count. Both are whole numbers from 0 to 999. Over 20 files or over 25 tests (PROCESS.md section 6 "Ticket size") means `Split` is `yes`, a `## Split proposal` section (lettered parts, each with scope, Done-when and ACs) follows this one, and no whole plan is written. `plan_lint.mjs` checks the rows, the number range, the Split value, that a `## Split proposal` is present when Split is yes, and the size limit.
| Item | Value |
| --- | --- |
| Plain words | what the ticket must do, in plain words |
| ACs | AC-EZD-xxx-1, AC-EZD-xxx-2 … |
| Screens | the screens it touches, or none |
| Tables | the tables it touches, or none |
| Routes | the routes it touches, or none |
| Files (estimate) | a whole number |
| Tests (estimate) | a whole number |
| Split | no, or yes |

## 1. What to build
Execution-grade (token diet, Josh 2026-10-22): a Sonnet test-author and builder carry this out without making design choices; anything they would have to decide is decided here or is a QP question. No narrative, and no text copied from the sources (cite them by ID). `node vault/tools/plan_lint.mjs <plan> --allow-questions` checks the three blocks below and, on a v2 plan, every v2 table.

### Build steps
In build order. One row per file. "Exports and signatures": the exact exported names and TypeScript signatures (or `none`). "Copy the pattern from": an existing file in the repo the builder mirrors (or `none (first of its kind)` plus the pattern in one line). "Verify with": the command that proves the step (a test name, `pnpm run typecheck`).
A step the orchestrator does, not the builder: put `(orchestrator ...)` after the path in its Path cell (EZD-300 hold: only a path the guard denies the orchestrator then holds the ticket for Josh).
"New / change": `new` (the path is not at HEAD) or `change` (it is). The Path cell names one repo path in backticks; "Copy the pattern from" starts with an existing repo path or with `none`. On a v2 plan `node vault/tools/contract_check.mjs <plan>` checks all three against HEAD (EZD-383).
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |

### Decided for the builder
Every choice a builder could otherwise make: library, file location, naming, state handling, error handling, edge cases, empty or invalid input, ordering, defaults. "None" only when there is truly no choice.
| Choice | Decision | Source |
| --- | --- | --- |

### Do not touch
Files, exports and behaviors the builder must leave as they are. "None" when nothing is at risk.

### Behaviour per role
For each AC, the behaviour in steps for every role: owner, office, field, view-only, no permission.
| AC | Role | Behaviour |
| --- | --- | --- |

### Failure and edge cases
Every function and screen action: empty, bad and too-large input (an integer or length bound for every number, L-061), double click or two requests at once, offline and reconnect, storage or network failure, floating-point margin for any measured or rounded value. No silent failure: every error path names its message or state.
| Function or action | Case | Behaviour | What the user sees |
| --- | --- | --- | --- |

### Database columns
Exact DDL for every new or changed column; every integer column names its upper bound (L-061).
| Table | Column | Type | Null | Default | Check | Upper bound |
| --- | --- | --- | --- | --- | --- | --- |

### RLS policies
The whole policy text for each of select, insert, update and delete, and the tenant and role checks each makes.
| Table | Command | Policy text | Tenant and role checks |
| --- | --- | --- | --- |

### Grants
Grants to anon, authenticated and service role for every new or changed object.
| Object | anon | authenticated | service_role |
| --- | --- | --- | --- |

### Database functions
Every function: signature, `SECURITY DEFINER` or not, and the `require_api_gate`, tenant and permission checks inside it.
| Function | Signature | Security definer | Checks inside |
| --- | --- | --- | --- |

### Migrations
The migration file name (`<YYYYMMDDHHMMSS>_<name>.sql`, sorting after develop's newest, L-060), the type regeneration step and any backfill. The security-reviewer signs this and the three tables above off for any ticket that touches tables, permissions, money or migrations.
| Migration file | Order | Type regeneration | Backfill |
| --- | --- | --- | --- |

Ticket row, copied from the phase file: Scope / Done when / Depends on / Spec ref.

## 2. Sources
Spec sections (`vault/spec/sections/...` with headings), decision IDs (R24 #n, R26 Rn, Q-nnnn, with the decisions file), and the mockup (`vault/mockups/Snn….png` + HTML). Every statement in section 1 cites one of these. Research reports R-NNN the plan drew on; a ticket no report covers says so. End with `Architecture: <heading>; <heading>`: the `docs/architecture.md` headings this ticket needs beyond the core (the file's `Core sections:` line), or `Architecture: none beyond the core`. `next_ticket.mjs --set-architecture` copies it to `tickets.json` (EZD-244).

## 3. Interface contract
What tests and code are both written to. Dependents must match it.
A `file`, `export` or `signature` row puts `(new)` or `(exists)` in its Kind cell (`export (exists)`). An export row's Name is the name in backticks, then "from", then the path (`` `V2_BLOCKS` from `vault/tools/plan_lint.mjs` ``); a signature row's is the call in backticks, then "from", then the path, with `\|` for a `|` inside it. `node vault/tools/contract_check.mjs <plan>` checks each against HEAD: a path or export marked exists is there, one marked new is not, and an existing signature takes as many parameters as the plan says (EZD-383).
| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |
| --- | --- | --- |

### Connections
One row for each caller, consumer, route, event, job, other screen and other phase's test the change reaches, with file:line found by grep at develop HEAD. A gap marker instead of a file:line fails plan_lint.
File:line is `path:line` or `path:line-line`, several split by commas, each at HEAD. Each entry of the shared-list register `vault/shared-lists.json` whose `reaches` globs match a Build steps path needs a row with the entry's `id` in Name and its `test` file in File:line; `node vault/tools/connections_check.mjs <plan>` checks it (EZD-383).
| Kind | Name | File:line | What changes |
| --- | --- | --- | --- |

### Shared lists
Every app-wide list or count a test pins that the change touches (page counts, route inventories, RLS audit lists, money route cases, tap-target lists, disclaimer page lists, bundle budgets, secret-key client lists), with the expected new value.
| List | Test file | Current value | New value |
| --- | --- | --- | --- |

### Data flow
End to end, one row per hop: screen → API route → server function → SQL function or table → response → screen state, with the exact names.
| Hop | From | To | Exact name |
| --- | --- | --- | --- |

### Live site
Every database function or table the change alters that main's code still calls (Q-0264), and how main keeps working; if it cannot, the migration waits for the phase merge.
| Database object | Main's caller | How main keeps working |
| --- | --- | --- |

## 4. Tests
Written by test-author before any code. Every expected value has a source; no source → open question.

### Tests
One row per AC. The exact fixture and where it comes from, how the test waits for timing or ordering (no fixed sleeps), which gate scope runs it, and whether it must hold on CI. No count or timing that depends on the machine.
| Test | AC | Type | Input | Expected value | Source of the expected value | Fixture | Wait method | Gate scope | CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

### Regression list
Every existing test the Connections table touches; the gate runs these whatever its scope.
| Test file | Test name | Why |
| --- | --- | --- |

## 5. Visual checklist

### Visual checklist
Only when a screen changes; otherwise "None". Name the one viewport (desktop 1600 × 1000, iPad landscape 1180 × 820, or phone). A plan with rows here depends on EZD-016a.
| Element | State (empty / loading / error / filled / no permission) | Mockup |
| --- | --- | --- |

### Component tree
The new and changed components and which existing component each one copies.
| Component | New / change | Copies | Parent |
| --- | --- | --- | --- |

### Screen states
For each screen: empty, loading, filled, error, no permission, offline, partial. Each row names its mockup board, or "not on a mockup" (its wording then goes to section 6).
| Screen | State | Mockup | What shows |
| --- | --- | --- | --- |

### Interactions
For each control: pointer down, up and drag, Shift, Ctrl/Cmd, touch, keyboard, Escape and cancel, with the exact size and position from the mockup and the tap area in px (44 px rule).
| Control | Input | Behaviour | Drag threshold | Size and position | Tap area |
| --- | --- | --- | --- | --- | --- |

### Neighbours
How the screen sits next to elements other tickets own: header, rail, banners, editor bar.
| Element | Owner ticket | How it sits |
| --- | --- | --- |

### Viewports
Desktop 1600×1000, iPad 1180×820, and phone where the spec asks for it.
| Viewport | Size | Applies |
| --- | --- | --- |

## 6. Proposed wording
User-visible text this ticket adds that is not on the mockup (errors, validation, empty states, toasts, labels on unmocked states). Josh approves at Stage 2. None → "None".
| Where | Text |
| --- | --- |

## 7. Security review
security-review: yes | no. When yes: the areas touched (auth · permissions · data access · money · API · migrations).
Reviewers needed: code-reviewer always · calc-auditor yes/no · ui-verifier yes/no (yes when the Visual checklist has rows) · security-reviewer yes/no (matches the line above).

## 8. Complexity and model recommendation
Rating, one sentence of reasoning, and the suggested test-author and builder models (PROCESS.md section 4).

## 9. Dependencies
From the ticket row, plus any it missed (say so). Risks: what could break other tickets or performance budgets.

### Risks
What could break (performance budgets, other phases, the live site), and for each: would this ticket's own gate notice? If not, the regression list covers it.
| Risk | What could break | Gate notices it | Covered by |
| --- | --- | --- | --- |

## 10. Open questions
QP-1, QP-2 … one sentence each with the options. Only the orchestrator turns these into Q-IDs. None → "None".
