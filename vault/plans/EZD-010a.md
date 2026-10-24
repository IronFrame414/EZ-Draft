# EZD-010a · Token files and check C10

- **ACs:** AC-EZD-010a-1 (tokens.css and tokens.ts hold the 36 values of App shell Frame and visual system and match each other), AC-EZD-010a-2 (check C10 fails a CSS file under app/src/ other than tokens.css that writes a literal color, and the real repository still passes the conventions check) (`vault/spec/acceptance-criteria.md` lines 40–41).
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen yet; the Studio colors, radii, shadows and frame sizes now live in one file, and the gate refuses a color written anywhere else.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Planned from `vault/plans/EZD-010.md` "Split proposal" Part EZD-010a, "Re-validation findings" V1–V14 and the parent's Approach Steps 1, 2, 6 and 7 (Q-0155). Every interface name and test ID of the parent is kept (T1, T2, T11, T12 part a, T13). Two refinements made here, both "how" (CLAUDE.md rule 3): finding P1 (Prettier) and the exact C10 scan rule (Step 3), each with added test cases marked "added by this plan".

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 22):
- **Scope:** CSS variables for cobalt, ink, slate, border, canvas, status colors, radii, shadows and frame sizes in app/src/styles/tokens.css with a typed copy tokens.ts (TOKENS); check C10 in scripts/conventions/check.mjs refusing literal colors in CSS outside tokens.css; docs/architecture.md Design tokens, fonts and icons subsection (tokens, oklch() only Q-0026 (a), radius exceptions). Split from EZD-010 (Q-0155); plan Part EZD-010a.
- **Done when:** tokens.css and tokens.ts hold the 36 values of App shell Frame and visual system and match each other; check C10 fails a CSS file under app/src/ other than tokens.css that writes a literal color, and the real repository still passes the conventions check.
- **Depends on:** EZD-001, EZD-000, EZD-004a, EZD-004b.
- **Spec ref:** App shell · Frame and visual system.

### Step 1: the 36 tokens (values the tests check)
Every value is copied verbatim from `vault/spec/sections/04-app-shell-and-global-ui.md` "Frame and visual system (Studio)" (lines 7–11). Prefix `--ez-` and value-named radii are the parent's planner's choices (EZD-010.md Step 1), kept because EZD-011–015 cite these names. Units px (every 04 size is px). Group: `color` rows 1–14, `status` 15–19, `radius` 20–25, `shadow` 26–27, `frame` 28–36.

| # | Variable | Value | 04 source text |
| --- | --- | --- | --- |
| 1 | `--ez-cobalt` | `oklch(0.55 0.17 262)` | cobalt (primary, selection) |
| 2 | `--ez-cobalt-text` | `oklch(0.45 0.17 262)` | cobalt text |
| 3 | `--ez-cobalt-tint` | `#eef1ff` | cobalt tint |
| 4 | `--ez-ink` | `#14171c` | ink |
| 5 | `--ez-slate-700` | `#3b424d` | slate 700 |
| 6 | `--ez-slate-500` | `#5e6672` | slate 500 |
| 7 | `--ez-slate-400` | `#7a828e` | slate 400 |
| 8 | `--ez-slate-300` | `#9aa3af` | slate 300 |
| 9 | `--ez-border` | `#dfe2e6` | border |
| 10 | `--ez-divider` | `#eef0f3` | divider |
| 11 | `--ez-hover` | `#f2f4f7` | hover |
| 12 | `--ez-canvas` | `#f6f7f9` | canvas |
| 13 | `--ez-canvas-grid` | `#e6e9ed` | "with 32 px grid `#e6e9ed`" |
| 14 | `--ez-surface` | `#fff` | surface |
| 15 | `--ez-red` | `oklch(0.6 0.19 28)` | demo / error red |
| 16 | `--ez-amber` | `oklch(0.72 0.16 65)` | review amber |
| 17 | `--ez-amber-tint` | `oklch(0.96 0.04 80)` | amber "on" color |
| 18 | `--ez-green` | `oklch(0.42 0.12 150)` | approved green |
| 19 | `--ez-green-tint` | `oklch(0.95 0.05 150)` | green "on" color |
| 20 | `--ez-radius-5` | `5px` | Radii 5 |
| 21 | `--ez-radius-7` | `7px` | Radii 7 |
| 22 | `--ez-radius-8` | `8px` | Radii 8 |
| 23 | `--ez-radius-10` | `10px` | Radii 10 |
| 24 | `--ez-radius-12` | `12px` | Radii 12 |
| 25 | `--ez-radius-999` | `999px` | Radii 999 |
| 26 | `--ez-shadow-card` | `0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)` | Card shadow |
| 27 | `--ez-shadow-floating` | `0 6px 20px rgba(20,30,50,.08)` | floating bars |
| 28 | `--ez-header-height` | `60px` | Header card 60 px |
| 29 | `--ez-header-margin` | `16px` | margin 16 |
| 30 | `--ez-body-padding` | `16px` | Body padding 16 |
| 31 | `--ez-body-gap` | `16px` | gap 16 |
| 32 | `--ez-rail-width` | `56px` | Tool rail 56 px |
| 33 | `--ez-left-panel-width` | `248px` | Left panel 248 px |
| 34 | `--ez-inspector-width` | `336px` | Inspector 336 px |
| 35 | `--ez-status-bar-height` | `30px` | Status bar 30 px |
| 36 | `--ez-grid-size` | `32px` | canvas … with 32 px grid |

Count check: 14 colors + 5 status + 6 radii + 2 shadows + 9 sizes = 36, the number in the Done when. "Desktop frame 1600 × 1000 reference" is a test viewport, not a style, and gets no variable (EZD-010.md Step 1; EZD-012 uses it). `--ez-font-sans` / `--ez-font-mono` are set by `next/font` in EZD-010c, not here. Not added here: `--ez-radius-6` (EZD-012, Q-0040 (c)), `--ez-radius-14` (EZD-015, Q-0057 (b)), the review-pill amber (EZD-011, Q-0037 (b)), `--ez-border-hover` (EZD-011), `--ez-touch-target` (EZD-014) — each appended by its own ticket to both files, citing its board (vault/tickets/README.md rule 5; EZD-010.md Step 2).

### Step 2: token files
- `app/src/styles/tokens.css`: exactly one `:root { … }` block, opening with the 36 declarations of Step 1 in that order, values written exactly as in the table. No other selector, no theme or dark variant (04 has none), no `@supports` block and no second declaration of any name: the `oklch()` values ship with no sRGB fallback (Q-0026 (a), vault/spec/decisions/04-app-shell-and-global-ui.md; browser floor Firefox 113+, Safari/iOS 16.4+, Chrome/Edge 111+, Q-0013 (a), docs/architecture.md Runtime). A short leading comment citing 04 and this plan is allowed (tests strip comments).
- `app/src/styles/tokens.ts`: `export const TOKENS` with the same entries in the same order (contract in section 3). Typed copy for TypeScript code (the EZD-010c token page; later the WebGL canvas, 11 Rules 4) (EZD-010.md Step 2).
- Not created here: `globals.css`, `fonts.ts`, the layout import of `tokens.css` (all EZD-010c). In this part `tokens.css` is imported by nothing; that is expected.

### Step 3: check C10 (colors only in the token file)
Source: 02 Named tools "Styling and UI primitives: CSS modules on the design tokens" (`vault/spec/sections/02-product-overview.md` line 74); EZD-010.md Step 6. Added to `scripts/conventions/check.mjs` as `checkC10()`, called after `checkC9()`; extended, not replaced.
- **Files scanned:** every file whose name ends `.css` returned by the script's existing `walk('app/src')` (so `SKIP_DIRS` applies: `node_modules`, `__fixtures__`, `__tests__`, `fixtures`, …), except exactly `app/src/styles/tokens.css`.
- **Exact rule (planner's choice; the parent left the parse open):** strip `/* … */` comments; split the remaining text into segments at each `{`, `}` and `;`. A segment that ends at `{` is a selector or at-rule prelude and is not checked (so `#main`, `#fade`, `a:hover`, `@media (…)` pass). A segment that ends at `;` or `}` and contains `:` is a declaration; its value is the text after the first `:`. The value fails when it contains (a) `#` followed by exactly 3, 4, 6 or 8 hex digits `[0-9a-fA-F]` and then no word character (`/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?!\w)/i`), or (b) a color function: `/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i`. Custom properties (`--x: #fff`) are declarations and are checked.
- **Output:** one line per failing file and declaration, `[C10] <repo-relative path>: <problem>` (the script's `fail()` format, docs/architecture.md Machine checks); exit 1 as for every check. The pass line becomes `conventions check: C1–C10 pass (…)` and the header comment names EZD-010a.
- **Not covered (marked "review" in Machine checks):** named colors (`white`, `red`) and colors in TSX `style` props; `transparent`, `currentColor`, `inherit` are allowed. Known false positive: `url(#abc)` with a hex-looking id (EZD-010.md Risks); a ticket that meets it raises a question.
- The real repository has no `.css` file under `app/src/` today (checked 2026-10-19), and `tokens.css` is exempt, so EZD-000 T25 keeps passing.

### Step 4: `docs/architecture.md` (same commit) and `.prettierignore`
Only `###` subheadings are added, so the 13 `##` headings of EZD-000 T5 stay exactly as they are (finding V6).
- `## Folder layout` code block: new line under `app/` — `  src/styles/              design tokens: tokens.css (the only CSS with literal colors, check C10), tokens.ts (typed copy, TOKENS) (EZD-010a)`. EZD-010c adds `globals.css`, `fonts.ts`, `fonts/` to it.
- `## Folder layout` paragraph: "`lint` runs check C1–C9 first" → "C1–C10".
- New subsection `### Design tokens, fonts and icons` after `### Root config files` (inside `## Folder layout`), token bullets only (EZD-010b and EZD-010c append icon and font bullets):
  - names use the `--ez-` prefix; radii are named by value;
  - `app/src/styles/tokens.css` holds every literal color and shadow, `tokens.ts` (`TOKENS`) mirrors it entry for entry; values come from 04 Frame and visual system or a cited Studio board (vault/tickets/README.md rule 5); a ticket that adds a token appends it to both files with its board and Q-ID in a comment; components use `var(--ez-*)` only (C10);
  - measurements, code and numbers use DM Mono (`var(--ez-font-mono)`, EZD-010c) (04 Type);
  - colors: the spec's `oklch()` values ship as written, no sRGB fallback; browser floor Firefox 113+, Safari/iOS 16.4+, Chrome/Edge 111+ (Q-0026 (a); Q-0013 (a));
  - board-cited exception radii approved by Josh: `--ez-radius-6` for tooltips (Q-0040 (c), added by EZD-012) and `--ez-radius-14` for dialogs (Q-0057 (b), added by EZD-015); any other radius that conflicts with 04's list becomes a question;
  - `tokens.css` is excluded from Prettier, because Prettier rewrites `rgba(20,30,50,.05)` to `rgba(20, 30, 50, 0.05)` and the values must stay the spec text (finding P1).
- `## Machine checks`: intro "runs C1–C9" → "C1–C10"; two rows in the `ID | Rule | Check | Built by` table, after C9: `| C10 | No literal color (hex or color function) in a declaration of a CSS file under app/src/ other than app/src/styles/tokens.css | same | EZD-010a |` and `| — | Named colors in CSS and colors in TSX style props | review | EZD-010a |`.
- `## Dependencies`: no row (no package added; 02 Named tools: CSS modules are built into Next.js).
- `.prettierignore`: append `# EZD-010a: token values are the spec text verbatim; Prettier would rewrite the shadow values (vault/plans/EZD-010a.md finding P1).` and `app/src/styles/tokens.css`.

**Finding P1 (new, 2026-10-19).** `printf ':root {\n  --ez-shadow-card: 0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07);\n}\n' | pnpm exec prettier --stdin-filepath app/src/styles/tokens.css` on develop (Prettier 3.9.10) prints `rgba(20, 30, 50, 0.05)` and `rgba(20, 30, 50, 0.07)`. docs/architecture.md Tests tells every builder to run Prettier on files it writes, and EZD-011, 012, 014, 015 all append to `tokens.css`, so without the ignore entry T1 (a) would break on a later ticket. Same precedent as `app/src/server/db/database.types.ts` (EZD-004a line in `.prettierignore`).

### Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/styles/tokens.css` | New | builder | Step 1–2 (04 Frame and visual system) |
| `app/src/styles/tokens.ts` | New | builder | Step 2, `TOKENS` |
| `scripts/conventions/check.mjs` | Change (extend EZD-000/001) | builder | Step 3, C10 (builder may write `scripts/conventions/`, Q-0124 (a), guard-paths.mjs line 80) |
| `docs/architecture.md` | Change | builder | Step 4 |
| `.prettierignore` | Change (extend EZD-001/004a) | builder | Step 4, finding P1 |
| `app/src/styles/tokens.test.ts` | New | test-author | T1, T2 |
| `scripts/conventions/__tests__/check.test.mjs` | Change (add cases) | test-author | T11 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add cases) | test-author | T12 part a |
| `app/vitest.config.ts`, `eslint.config.mjs`, `app/package.json`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No `.tsx` test in this part (V3); no lint change (V2); Josh- or orchestrator-owned |

Write rules (lesson L-002; finding V8): every builder path is allowed by `.claude/hooks/guard-paths.mjs` (`app/**`, `scripts/conventions/**`, `docs/architecture.md`, `.prettierignore` are not test paths and not in the line 83 deny list); the three test-author paths match its `isTest` rule (line 15: `__tests__/`) or are `*.test.ts`.

Data: none. No tables, columns, migrations, RLS, `schema_version` or money fields.

## 2. Sources
- `vault/spec/sections/04-app-shell-and-global-ui.md` "Frame and visual system (Studio)" lines 7–11 (all 36 values; Type line for DM Mono use).
- `vault/spec/sections/02-product-overview.md` Named tools line 74 ("CSS modules on the design tokens") for C10.
- `vault/spec/sections/11-non-functional-requirements.md` Performance, Rules 4 (canvas, reason for `tokens.ts`) and 8 (fonts and icons self-hosted; context, applied in EZD-010b/c). `03-data-model.md`: nothing touched.
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0026 (a), Q-0037 (b), Q-0040 (c), Q-0057 (b); Q-0013 (a) (docs/architecture.md Runtime; QUESTIONS.md line 22); Q-0124 (a) (builder owns `scripts/conventions/`); Q-0155 (the split, QUESTIONS.md line 164).
- `vault/tickets/README.md` rule 5 (board-cited tokens); `vault/KNOWN-LIMITS.md` item 5 (board sample data is not a decision: the boards' extra shades are not added).
- `vault/plans/EZD-010.md` Split proposal Part EZD-010a, findings V1–V14, Approach Steps 1, 2, 6, 7, Tests T1, T2, T11, T12, T13.
- Code read 2026-10-19 on develop (f0e1ec2): `scripts/conventions/check.mjs` (`fail()` line 12, `SKIP_DIRS` line 54, `walk` line 57, C9 lines 388–405, run list and pass line 407–424), `scripts/conventions/__tests__/check.test.mjs` (`makeRepo` line 73, `expectPass`/`expectFail` lines 91–101, T25 line 321), `scripts/conventions/__tests__/architecture-doc.test.mjs` (`REQUIRED_HEADINGS`, T5), `docs/architecture.md` (13 `##` headings; Folder layout; Machine checks), `.prettierignore`, `.claude/hooks/guard-paths.mjs`, `app/vitest.config.ts`, `app/tsconfig.json`.
- Non-goals, glossary: nothing on tokens (grep 2026-10-19). Mockups: none (`tickets.json` `mockups: []`; no screen).
- Research: no R-NNN report covers this ticket.

## 3. Interface contract
Dependents (EZD-010b, EZD-010c, EZD-011, 012, 013, 014, 015) cite these names; they are the parent's names unchanged.

| Kind | Name or path | Details |
| --- | --- | --- |
| file | `app/src/styles/tokens.css` | One `:root { … }` block; first 36 declarations = Step 1 rows in order, values verbatim; every custom property starts `--ez-`; no other selector, no `@supports`, no name declared twice. Later tickets append inside the same block |
| export | `TOKENS` from `app/src/styles/tokens.ts` | `export const TOKENS: readonly { name: \`--ez-${string}\`; value: string; group: 'color' \| 'status' \| 'radius' \| 'shadow' \| 'frame' }[]`; same entries as `tokens.css`, same order; no default export |
| CLI | `node scripts/conventions/check.mjs [rootDir]` | Unchanged signature; adds C10 (Step 3); failure line `[C10] <path>: <problem>`; exit 1 on any violation, else exit 0 with `conventions check: C1–C10 pass (…)` |
| docs | `docs/architecture.md` `### Design tokens, fonts and icons` | Created here inside `## Folder layout`; EZD-010b and EZD-010c append bullets to it |
| docs | Machine checks row `C10` | Columns `ID \| Rule \| Check \| Built by`, Built by `EZD-010a` |
| config | `.prettierignore` line `app/src/styles/tokens.css` | Finding P1 |

## 4. Tests
Rules: T1, T2 are Vitest in `@ezdraft/app` (`environment: 'node'`), in one top-level `describe` whose title starts `EZD-010a` (check C9; Test scope grep `EZD-0\d{2}[a-z]?` matches `EZD-010a`). They read `tokens.css` with `node:fs` relative to the test file and import `TOKENS` by relative path (no `@/` alias in `app/vitest.config.ts`, V2). The app's global setup needs the local stack up (V3; the gate runs `db:up` first). T11, T12 are `node:test` cases added to EZD-000's files, titles starting `EZD-010a`, built on `makeRepo(overrides)` / `expectPass` / `expectFail` (T11) and `readArch()` (T12). Parsing: strip `/* … */` comments, collapse whitespace runs to one space, trim; compare values exactly (hex lowercase as written in 04). Tests match exit codes, check IDs and paths, never message wording. No total token count is asserted anywhere (parent finding 8), so later appended tokens need no test edit.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 CSS tokens match the spec. Title: `EZD-010a done when: tokens.css holds the 36 spec values and matches tokens.ts` | AC-EZD-010a-1 | unit | Parse the `:root` block of `app/src/styles/tokens.css` into ordered `name → value` | (a) each of the 36 Step 1 names is present with exactly its Step 1 value, and the 36 appear in Step 1 order relative to each other; (b) exactly one rule block in the file and its selector is `:root`; every custom property in it starts `--ez-`; (c) parity: every `--ez-*` name in `tokens.css` is in `TOKENS` with the same value and vice versa, and no name appears twice in either; (d) no `@supports` in the file | 04 Frame and visual system (per-row source in Step 1); Q-0026 (a) for (d); Q-0040 (c), Q-0057 (b) for why (c) has no count |
| T2 TS tokens match the CSS | AC-EZD-010a-1 | unit | `TOKENS` from `tokens.ts` | (a) the 36 Step 1 rows are present with exactly their `name`/`value`, in Step 1 order relative to each other; `group` is `color` for rows 1–14, `status` 15–19, `radius` 20–25, `shadow` 26–27, `frame` 28–36; (b) every entry's `group` is one of the five; (c) the full `name`/`value` sequence equals the one parsed from `tokens.css`, same order | Step 1; Step 2; EZD-010.md T2 |
| T11 C10 colors only in tokens. Main title: `EZD-010a T11 (AC-EZD-010a-2) done when: C10 fails a CSS file under app/src/ that writes a literal color` | AC-EZD-010a-2 | unit (node:test) | `makeRepo` plus one override each: (a) `app/src/x.module.css` = `a{color:#fff}`; (b) same path `a{box-shadow:0 1px 2px rgba(0,0,0,.1)}`; (c) `a{color:oklch(0.5 0.1 20)}`; (d) `a{--local:#123456}`; (e) `app/src/styles/tokens.css` = `:root{--ez-x:#fff;--ez-y:rgba(0,0,0,.1)}`; (f) `app/src/x.module.css` = `#main{color:var(--ez-ink)}`; (g) `/* #fff */ a{color:var(--ez-ink)}`. Added by this plan (Step 3 rule): (h) `#fade{color:var(--ez-ink)}`; (i) `app/src/styles/globals.css` = `body{background:#ABCDEF}`; (j) `app/src/x.module.css` = `@media (min-width:600px){a{color:HSL(0 0% 0%)}}`; (k) `app/src/__fixtures__/y.css` = `a{color:#fff}` | (a)–(d), (i), (j): exit 1, output contains `[C10]` and the file's repo-relative path; (e)–(h), (k): exit 0 | 02 Named tools line 74; Step 3 (exempt path, selector rule, case-insensitive match, `SKIP_DIRS`) |
| T12 part a Docs updated | — (CLAUDE.md rule 7: conventions recorded in the same commit) | unit (node:test) | `docs/architecture.md`; `.prettierignore` | (a) the `##` headings equal `REQUIRED_HEADINGS` (13, same order, no other `##`); (b) a line `### Design tokens, fonts and icons` exists; (c) the `ID \| Rule \| Check \| Built by` table has a row whose ID cell is `C10`; (d) the text contains `--ez-`, `Q-0026`, `--ez-radius-6` and `--ez-radius-14`; (e) `node scripts/conventions/check.mjs <repo root>` exits 0; (f) added by this plan: `.prettierignore` has a line exactly `app/src/styles/tokens.css` | EZD-000 T5 and V6 for (a); Step 4; Q-0026 (a), Q-0040 (c), Q-0057 (b); finding P1 for (f) |
| T13 Gate on a clean tree | both | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-010a` | exit 0: `typecheck`, `lint` (C1–C10), `test` (including EZD-000 T25, the real repo passes), `build` | CLAUDE.md rule 12 |

Unchanged and still required: EZD-000 T25 (`check.test.mjs` line 321) — the real repository passes with C10 in place (AC-EZD-010a-2 second clause). smoke: no (none of these is a phase Build gate test).

## 5. Visual checklist
None. No screen changes (`tickets.json` `mockups: []`; `tokens.css` is imported by nothing until EZD-010c). EZD-016a is not a dependency (finding V12: it depends on EZD-007, which depends on EZD-010).

## 6. Proposed wording
None. C10's message is developer text in the gate output, not user-visible.

## 7. Security review
security-review: no (no auth, permissions, data access, money, API or migrations).
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier no (section 5 empty) · security-reviewer no.

## 8. Complexity and model recommendation
medium: two plain data files and docs, but C10 runs in every gate's `lint` over the whole repository, so a wrong pattern blocks every later ticket (PROCESS.md section 4: not clearly low). test-author `claude-sonnet-5-5`, builder `claude-sonnet-5-5` (PROCESS.md section 4 medium row); code-reviewer Opus 5.5.

Size: 5 builder files + 3 test files = 8; 4 test IDs plus the gate (within PROCESS.md section 6).

## 9. Dependencies
- From the ticket row: **EZD-001** (app package, `.prettierignore`, `app/vitest.config.ts`, `app/tsconfig.json` including `**/*.ts`, C9; done 3b1037c), **EZD-000** (`check.mjs`, its node:test files, `docs/architecture.md`; done), **EZD-004a** (the gate's `pnpm db:up`; done 78b3103), **EZD-004b** (the app Vitest global setup that throws without the local stack; done 22b6f0a).
- Missing from the row, context only: **EZD-008a** set the `env` keys in `app/vitest.config.ts` (V14); this part does not edit that file, so it is not a build dependency. EZD-016a is not needed (section 5).
- Dependents: EZD-010b (appends icon bullets to `### Design tokens, fonts and icons`), EZD-010c (`TOKENS`, `tokens.css`), and through EZD-010 all of EZD-007, 011, 012, 015, 026a, 028; EZD-011, 012, 014, 015 append tokens to both files.
- **Risks:** (1) C10 runs on every later CSS file: a pattern that is too wide blocks screen tickets, too narrow lets colors through; the selector rule and cases (f)–(k) cover the known shapes, `url(#abc)` is a known false positive. (2) Without the `.prettierignore` entry a later builder's Prettier run would break T1 (finding P1). (3) `oklch()` strings cannot be parsed by Three.js `Color`; canvas tickets convert them (EZD-010.md Risks); this part invents no sRGB values (Q-0026 (a)). No performance budget effect: no JavaScript is added to any bundle (nothing imports `tokens.ts` yet).

## 10. Open questions
None. Every value comes from 04 Frame and visual system; the C10 parse rule and the Prettier exclusion are "how" choices (CLAUDE.md rule 3), recorded in Step 3 and finding P1 for the code-reviewer to confirm at plan review.
