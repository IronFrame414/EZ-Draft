# EZD-007e · Magic-link sign-in: sign-in messages and lint

- **ACs:** AC-EZD-007e-1 (`vault/spec/acceptance-criteria.md` line 42; generated from Done-when, KNOWN-LIMITS "Acceptance criteria for Phase 0").
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen yet (the pages are EZD-007f); every word of the sign-in and confirm pages now exists in English and Spanish, and a check stops anyone from typing English straight into those pages.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned

Parent plan: `vault/plans/EZD-007.md` (Split proposal "Part EZD-007e" lines 60–69, findings V1–V17, Step 6 lines 304–336, Tests T24–T25 lines 493–494; Q-0164). This plan cites the parent's Steps as "P-Step n" and its tests as "P-Tn". Every key, every English text, the surface and the lint block are kept as the parent fixes them (Q-0164: "Every interface name other plans cite is kept; test IDs T1–T26 and expected values unchanged"). Test numbers used by the sibling plans: T27 reserved for Q-0167 (a), T28 EZD-007a, T29–T30 EZD-007b, T31–T35 EZD-007c, T36 EZD-007d (`vault/plans/EZD-007d.md` line 8); the new row here is T37.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 22):
- **Scope:** Plan vault/plans/EZD-007.md Approach Step 6: the sign_in surface, every Step 6 key except error.not_signed_in in en and es, the eslint.config.mjs block for the sign-in folders, the Messages docs bullets. Split from EZD-007 (Q-0164); plan Part EZD-007e.
- **Done when:** Every sign-in string is in the en and es catalogs under common.sign_in.* and error.*, the sign_in surface serves them in both languages, and the lint refuses literal text in the sign-in folders.
- **Depends on:** EZD-026c, EZD-026d, EZD-026a, EZD-007c.
- **Spec ref:** Users and role presets; Non-functional · Security.

### Findings against the parent text (planner, 2026-10-20; code read on develop at e77b23d)
- **E1 Merged files match the parent's V5.** `app/src/lib/messages/types.ts` line 3: `Surface = 'office' | 'field' | 'client' | 'dev'`. `language.ts`: `languageFor(surface: Surface, …)` (line 3), `NAMESPACES: Record<Surface, readonly string[] | 'all-but-dev'>` (line 7), so adding `'sign_in'` to `Surface` fails typecheck until `NAMESPACES.sign_in` exists. `app/src/server/messages/catalog.ts` lines 14–16 throw only for `es` on `office` or `client` and filter by `NAMESPACES[surface]` with `allowed.includes(namespace)` (line 22), so `catalogFor('sign_in', …)` needs no change there (parent V5). `en.ts` / `es.ts` hold four keys today (`dev.messages.*`, `error.db_unavailable`); `es` is typed `satisfies Record<SpanishKey, Message>` with `SpanishKey` over `SPANISH_NAMESPACES` = `common`, `field`, `error`, `dev` (`es.ts` line 5; `language.ts` line 14), so every `common.sign_in.*` and `error.*` key must have an `es` entry or typecheck fails.
- **E2 Callers of `languageFor`.** Only `app/src/app/dev/messages/MessagesSample.tsx` lines 8–9 (`'dev'`, `'office'`) and `language.test.ts` (the four existing surfaces). Narrowing its first parameter to `Exclude<Surface, 'sign_in'>` (P-Step 6: "the builder narrows its parameter type so it cannot be called with `'sign_in'`") breaks neither.
- **E3 Existing tests stay unchanged and passing.** `catalog.test.ts` A2 builds the expected keys from `NAMESPACES` for an explicit list of six surface/language pairs (lines 20–27), so it does not cover `sign_in` and is not edited; its done-when test (lines 78–97) requires `es` keys to equal the `en` keys of `SPANISH_NAMESPACES` with the same placeholders, which this ticket's `es` entries satisfy; A5 requires every key to match `KEY_PATTERN` (`common.sign_in.title` does). `language.test.ts` asserts `NAMESPACES.office/field/client/dev` by name (lines 33–43) and is not edited. EZD-026a L2 (`scripts/tooling/__tests__/messages-lint.test.mjs` lines 48–53) keeps `app/src/app/page.tsx` out of every lint block (P-Step 6: "`app/src/app/page.tsx` stays office and unlinted").
- **E4 P-T24 (c) moves to EZD-007f.** P-T24 (c) runs `lintFiles` on the three sign-in folders and expects 0 errors. None of them exists before EZD-007f (`app/src/app` holds `api`, `dev`, `layout.tsx`, `page.tsx`; `app/src/components` holds only `icon`), and the pattern this test copies, EZD-026a L7 (`messages-lint.test.mjs` lines 133–141), first asserts `results.length >= 1, 'the folder holds files'`. So (c) cannot pass in this part for a reason unrelated to the code. It is divided off to EZD-007f, which creates the folders, with its input and expected value unchanged, the same way the split divided P-T17 and P-T26 between parts "with no assertion changed" (Q-0164). This part runs P-T24 (a) and (b), which lint in-memory text under virtual file names (`lintText` with `filePath`, as EZD-026a L1–L6) and need no folder. EZD-007f's planner lists P-T24 (c) in that plan (section 9).
- **E5 A Tests row for the narrowing rule (L-012).** P-Step 6's rule that `languageFor` cannot be called with `'sign_in'`, and the contract value `NAMESPACES.sign_in = ['common', 'error']`, have no P-T row (P-T25 checks the catalogs only). T37 covers both: a `@ts-expect-error` call fails `pnpm typecheck` if the narrowing is missing, the same pattern as EZD-026d A8 (`catalog.test.ts` lines 105–110; `app/tsconfig.json` line 18 includes test files). It adds a row and changes no P-T expected value, as EZD-007d's T36 did.
- **E6 Docs Machine-checks row stays with EZD-007f.** The parent Split assigns "the `## Tests` and `## Machine checks` docs rows (Step 10)" to part f (Split Part EZD-007f Scope, line 72), including P-Step 10's T24 row (P-Step 10 line 384). This part writes only the `### Messages and language (t())` bullets (Split Part EZD-007e Scope, line 61).

### Steps (builder)
1. **`app/src/lib/messages/types.ts`**: `Surface` = `'office' | 'field' | 'client' | 'dev' | 'sign_in'` (P-Step 6 "Surface `sign_in`"; Split Part 007e Interface contract).
2. **`app/src/lib/messages/language.ts`**:
   - `languageFor(surface: Exclude<Surface, 'sign_in'>, user: { language: Language }): Language`, body unchanged (P-Step 6: "`languageFor` is not used for `sign_in` (no user is known; Step 3 `getSignInLanguage`); the builder narrows its parameter type"; E2).
   - `NAMESPACES.sign_in = ['common', 'error']` (P-Step 6; Q-0047 (a): the signed-out pages are bilingual, so they use Spanish namespaces only; `docs/architecture.md` Namespaces per surface).
   - `SPANISH_NAMESPACES` and `KEY_PATTERN` unchanged (both already cover `common` and `error`).
3. **`app/src/server/messages/catalogs/en.ts`**: add the 18 keys of the table in section 6 (every P-Step 6 key except `error.not_signed_in`, which EZD-007c adds; ticket Scope), English exactly as written there (Q-0046 (a); Q-0100; Q-0047 (a)). Existing keys untouched.
4. **`app/src/server/messages/catalogs/es.ts`**: the same 18 keys. `common.sign_in.lang_en` = `English` and `common.sign_in.lang_es` = `Español` (P-Step 6 table: "Each language is named in itself, so both catalogs hold the same text"; Q-0047 (a)). Every other key: Spanish written by the builder in this commit (Q-0030 (a)), non-empty and not the English text (R24 #40, "never English or blanks"); `common.sign_in.sent` keeps the placeholder `{email}` (`catalog.test.ts` lines 80–97; parent V5). A Spanish-speaking crew member checks it at the field checks and in Phase 15 (Q-0030 (a)).
5. **`eslint.config.mjs`**: append one block after the `app/src/app/dev/messages/` block (lines 66–76), same shape as EZD-026a's (P-Step 6 Lint; Split Part 007e Interface contract):
   - `files`: `app/src/app/sign-in/**/*.{tsx,jsx}`, `app/src/app/auth/confirm/**/*.{tsx,jsx}`, `app/src/components/auth/**/*.{tsx,jsx}`;
   - `ignores`: `['**/*.test.*', '**/*.spec.*']`; `plugins: { ezdraft }`;
   - rule `'ezdraft/no-literal-ui-string': ['error', { allowedKeyPrefixes: ['common.', 'error.'] }]`;
   - a one-line comment naming EZD-007e and the reason: these pages have a Spanish mode, so a literal would show English to a Spanish user (R26 R17 "buttons and messages included"; R24 #40).
6. **`docs/architecture.md` `### Messages and language (t())`** (Split Part 007e Scope; `docs/architecture.md` Lint bullet: "A ticket that adds a phone folder … changes the block's `files` in its own commit"):
   - Surfaces and language: surfaces are `office`, `field`, `client`, `dev` and `sign_in`; `sign_in` is the signed-out pages `/sign-in` and `/auth/confirm` (EZD-007f), whose language is the device's choice from `getSignInLanguage()` (EZD-007d; Q-0047 (a)), not `languageFor`, whose parameter excludes `sign_in`.
   - Namespaces per surface: `sign_in`: `common`, `error`; `catalogFor('sign_in', 'es')` is allowed.
   - Lint: add the sign-in folders `app/src/app/sign-in/`, `app/src/app/auth/confirm/`, `app/src/components/auth/` (prefixes `common.`, `error.`).
   - The Files bullet gains no file (no new message file).

### Files

| Path | New / change | Writer | Why |
| --- | --- | --- | --- |
| `app/src/lib/messages/types.ts` | Change | builder | Step 1 |
| `app/src/lib/messages/language.ts` | Change | builder | Step 2 |
| `app/src/server/messages/catalogs/en.ts` | Change | builder | Step 3 |
| `app/src/server/messages/catalogs/es.ts` | Change | builder | Step 4 |
| `eslint.config.mjs` | Change | builder | Step 5 |
| `docs/architecture.md` | Change | builder | Step 6 |
| `app/src/server/auth/sign-in-messages.test.ts` | New | test-author | T25, T37 |
| `scripts/tooling/__tests__/sign-in-lint.test.mjs` | New | test-author | T24 (a), (b) (node:test, as EZD-026a's L-tests) |

Write rules checked against `.claude/hooks/guard-paths.mjs` (L-002): the builder writes non-test `app/**`, `eslint.config.mjs` and `docs/architecture.md` (none under `scripts/`, `.claude/`, `vault/`); both test paths match `isTest` (lines 14–16: `.test.` suffix, `__tests__/`), the test-author's. `app/src/server/auth/` is created by EZD-007c (`vault/plans/EZD-007c.md` section 1), a dependency.

Data: none (no table, column, migration or policy). No money field.

## 2. Sources
- Spec: `vault/spec/sections/02-product-overview.md` line 37 (Users and role presets: crew sign in with a magic link that carries a 6-digit code, no password); `11-non-functional-requirements.md` lines 74–76 (Security and audit: Supabase Auth; magic links with link plus 6-digit code), lines 90–92 (Accessibility; nothing here, the pages are EZD-007f), Performance line 21 (download budgets; section 9); `03-data-model.md` line 32 (`user.language` en/es, per user). `04-app-shell-and-global-ui.md`: nothing on sign-in or language (read; the signed-out pages have no shell). `vault/spec/non-goals.md`, `glossary.md`: nothing that bears on this ticket.
- Decisions: R26 R17 (`vault/spec/decisions/13b-round-26.md` line 27: phone screens in Spanish "buttons and messages included"; "Every interface string goes through one message helper"); R24 #40 (`13a-rounds-24-25.md` line 109: Spanish users "never English or blanks"); `vault/spec/decisions/10-permissions-and-settings.md`: Q-0030 (a) (line 9, builder writes the Spanish), Q-0046 (a) (line 11, the planner's draft wording in `vault/plans/EZD-007.md`), Q-0047 (b-as-recorded-(a)) (line 12, English / Español switch on the sign-in page), Q-0100 (line 21, spam hint and `error.not_signed_in` English), Q-0002 and Q-0121 (lines 24, 26: Spanish is never the default; office stays English). Q-0164 (`vault/questions/QUESTIONS.md`, answered-agent: the split, names and expected values kept).
- Plans: `vault/plans/EZD-007.md` (Split Part 007e, V5, P-Step 6, P-T24, P-T25); `vault/plans/EZD-007c.md` section 1 step 5 (`error.not_signed_in` in `en` and `es`; creates `app/src/server/auth/`); `vault/plans/EZD-007d.md` line 8 (test numbering), line 129 ("their text is EZD-007e's catalog keys"); `vault/plans/EZD-026a.md` (lint blocks, Step 4).
- Code read (develop e77b23d): `app/src/lib/messages/types.ts`, `language.ts`, `language.test.ts`; `app/src/server/messages/catalog.ts`, `catalog.test.ts`, `get-t.ts`, `catalogs/en.ts`, `catalogs/es.ts`; `eslint.config.mjs`; `scripts/tooling/__tests__/messages-lint.test.mjs`; `app/src/app/dev/messages/MessagesSample.tsx` (via grep); `app/tsconfig.json` line 18; `.claude/hooks/guard-paths.mjs` lines 14–16, 73–85; `docs/architecture.md` `### Messages and language (t())`.
- Mockup: none (`tickets.json` `mockups: []`; no Studio board shows sign-in, parent Sources line 154).
- Research: no R-NNN report covers this ticket; no retriever was dispatched.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| type | `Surface` in `app/src/lib/messages/types.ts` | `'office' \| 'field' \| 'client' \| 'dev' \| 'sign_in'` |
| signature | `languageFor` in `app/src/lib/messages/language.ts` | `(surface: Exclude<Surface, 'sign_in'>, user: { language: Language }) => Language`; results for the four existing surfaces unchanged (EZD-026c tests) |
| export | `NAMESPACES.sign_in` | `['common', 'error']`; other entries unchanged |
| export | `catalogFor('sign_in', 'en' \| 'es')` (`app/src/server/messages/catalog.ts`, unchanged file) | does not throw; returns a frozen object whose keys are exactly the `common.` and `error.` keys of `en` (for `'en'`) or `es` (for `'es'`), values from that catalog |
| export | `getT('sign_in', 'en' \| 'es')` (`get-t.ts`, unchanged) | works as for other surfaces (follows from `catalogFor`) |
| catalog keys | `en`, `es` in `app/src/server/messages/catalogs/` | the 18 keys of section 6 plus EZD-007c's `error.not_signed_in`; English exactly as section 6; no key `common.sign_in.back` |
| lint block | `eslint.config.mjs` | `files` `['app/src/app/sign-in/**/*.{tsx,jsx}', 'app/src/app/auth/confirm/**/*.{tsx,jsx}', 'app/src/components/auth/**/*.{tsx,jsx}']`; `ignores` `['**/*.test.*', '**/*.spec.*']`; `'ezdraft/no-literal-ui-string': ['error', { allowedKeyPrefixes: ['common.', 'error.'] }]` |
| test file | `app/src/server/auth/sign-in-messages.test.ts` | top-level `describe` titles start `EZD-007e` (check C9); T25 title `EZD-007e done when: every sign-in string is in en and es and the sign_in surface serves them in both languages` |
| test file | `scripts/tooling/__tests__/sign-in-lint.test.mjs` | node:test; top-level `describe('EZD-007e sign-in pages lint', …)`; T24 title `EZD-007e done when: the lint refuses literal text in the sign-in folders` |

Dependents use these exactly: EZD-007f (pages call `catalogFor('sign_in', language)` and `useT()` with these keys; its components sit in the three linted folders; `SignOutButton` on the office page `/` uses `common.sign_in.sign_out` through `catalogFor('office', 'en')`, which includes `common`).

## 4. Tests
Written by test-author before any code. Catalog values are imported from `app/src/server/messages/catalogs/` (parent Tests "Languages"), so the builder's Spanish is never copied into a test. Messages are matched by `ruleId`, severity and count, never by wording (EZD-026a L-tests header). smoke: no for every row (none is a phase Build gate test).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T24 Sign-in pages lint block (P-T24 (a), (b); (c) is EZD-007f's, E4) | AC-EZD-007e-1 (lint clause) | unit (node:test, real `eslint.config.mjs` through `ESLint.lintText(code, { filePath })` from the repo root, as EZD-026a's `lint()` helper) | (a) `export default function P(){ return <p>Sign in</p>; }` linted as `app/src/app/sign-in/x.tsx`, `app/src/app/auth/confirm/x.tsx`, `app/src/components/auth/X.tsx`. (b) In `app/src/app/sign-in/x.tsx`, a component whose JSX children are `{t('office.x')}`, `{t('common.sign_in.title')}`, `{t('error.code_invalid')}` (one call per lint run, as EZD-026a L5) | (a) each file: ≥ 1 message with `ruleId` `ezdraft/no-literal-ui-string` and severity `2`. (b) `t('office.x')`: exactly 1 message from that rule; `t('common.sign_in.title')` and `t('error.code_invalid')`: 0 | P-T24; P-Step 6 lint block (prefixes `common.`, `error.`); EZD-026a Step 4; R26 R17; R24 #40 |
| T25 Sign-in catalog entries (P-T25) | AC-EZD-007e-1 (catalog and surface clauses) | unit (Vitest, no DB) | `en`, `es`; `catalogFor('sign_in', 'en')`, `catalogFor('sign_in', 'es')` | `en` holds each of the 19 P-Step 6 keys (section 6's 18 plus `error.not_signed_in`) with exactly the English of section 6 / P-Step 6 (`error.not_signed_in` = `You're signed out. Sign in again to continue.`). `es['common.sign_in.lang_en'] === 'English'` and `es['common.sign_in.lang_es'] === 'Español'`. Every other of the 19 keys in `es` is a string, non-empty after trim, and differs from its `en` value; `es['common.sign_in.sent']` contains `{email}`. `Object.keys(catalogFor('sign_in', l)).sort()` equals the sorted keys of that language's catalog (`en` for `'en'`, `es` for `'es'`) that start `common.` or `error.`, for both `l`. No key `common.sign_in.back` in `en` | P-T25; Q-0046 (a) (English); Q-0100 (spam hint, `error.not_signed_in`); Q-0047 (a) (switch labels named in themselves); Q-0030 (a) and R24 #40 (Spanish written, never English or blank); P-Step 6 (surface namespaces; confirm page reuses `common.sign_in.title`, so no `back` key) |
| T37 `sign_in` surface typing (new, E5) | AC-EZD-007e-1 (surface clause) | unit (Vitest; the `@ts-expect-error` line is checked by `pnpm typecheck`, as EZD-026d A8) | (a) `NAMESPACES.sign_in`; (b) `// @ts-expect-error` above `languageFor('sign_in', { language: 'es' })` inside a function that is never called; (c) `expectTypeOf<Parameters<typeof languageFor>[0]>().toEqualTypeOf<'office' \| 'field' \| 'client' \| 'dev'>()` | (a) deep-equals `['common', 'error']`. (b) typecheck passes only when the call is a type error (an unused `@ts-expect-error` fails `tsc`). (c) typecheck passes | P-Step 6 ("`NAMESPACES.sign_in = ['common', 'error']`"; "the builder narrows its parameter type so it cannot be called with `'sign_in'`"); Split Part 007e Interface contract; L-012 |
| Gate (orchestrator) | — | gate | `node scripts/gate.mjs .claude/worktrees/EZD-007e` | exit 0: `typecheck`, `lint`, `test`, `build`; EZD-026c `language.test.ts`, EZD-026d `catalog.test.ts`, `message-keys.test.ts` and EZD-026a `messages-lint.test.mjs` pass unchanged (E3) | CLAUDE.md rule 12; Q-0006 |

Refuse rules and their tests (L-012): literal text in a sign-in folder → T24 (a); a key outside `common.` / `error.` → T24 (b); `languageFor('sign_in', …)` → T37 (b); `office`/`client` refuse `es` → EZD-026d A3, unchanged.

## 5. Visual checklist
None (no screen changes; the pages are EZD-007f). So EZD-016a is not a dependency.

## 6. Proposed wording
None new. All English below is approved: Q-0046 (a) ("the planner's draft wording in vault/plans/EZD-007.md", P-Step 6 table) and Q-0100 (spam hint); the two language names are Q-0047 (a). Spanish is the builder's in this commit (Q-0030 (a)), so it is not proposed here. Listed for the builder and reviewer, copied from P-Step 6 lines 312–329:

| Key | en | es |
| --- | --- | --- |
| `common.sign_in.title` | `Sign in to EZ Draft` | builder |
| `common.sign_in.email_label` | `Email` | builder |
| `common.sign_in.send` | `Email me a sign-in link` | builder |
| `common.sign_in.sent` | `If {email} has EZ Draft access, we sent a sign-in link and a 6-digit code. Open the link, or type the code here.` | builder (keeps `{email}`) |
| `common.sign_in.check_spam` | `Not in your inbox? Check your spam or junk folder.` | builder (Q-0100) |
| `common.sign_in.code_label` | `6-digit code` | builder |
| `common.sign_in.code_submit` | `Sign in` | builder |
| `common.sign_in.change_email` | `Use a different email` | builder |
| `common.sign_in.confirm_title` | `Finish signing in` | builder |
| `common.sign_in.confirm_submit` | `Sign in` | builder |
| `common.sign_in.sign_out` | `Sign out` | builder |
| `common.sign_in.lang_en` | `English` | `English` |
| `common.sign_in.lang_es` | `Español` | `Español` |
| `error.invalid_email` | `Enter a valid email address.` | builder |
| `error.too_many_requests` | `Too many tries. Wait a minute and try again.` | builder |
| `error.code_invalid` | `That code is wrong or has expired.` | builder |
| `error.link_invalid` | `This sign-in link has expired or was already used.` | builder |
| `error.no_access` | `This account does not have access to EZ Draft. Ask your company's owner.` | builder |

`error.not_signed_in` (`You're signed out. Sign in again to continue.`, Q-0100) is EZD-007c's and is only read by T25 here.

## 7. Security review
security-review: no (no auth flow, permissions, data access, money, API or migration; message text, a type and a lint block; Split Part 007e "security-review: no").
Reviewers needed: code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (section 5 empty) · security-reviewer no.

## 8. Complexity and model recommendation
medium: data and config edits on the patterns EZD-026a/c/d set, plus Spanish text and one type narrowing; not low because the Spanish must satisfy the typecheck and catalog tests and the lint block guards a bilingual surface (PROCESS.md section 4; Split Part 007e Complexity). test-author `claude-sonnet-5-5`, builder `claude-sonnet-5-5`; code-reviewer `claude-opus-5-5`.

## 9. Dependencies
- From the row: EZD-026c (`types.ts`, `language.ts`), EZD-026d (catalogs, `catalogFor`, `catalog.test.ts`), EZD-026a (rule `ezdraft/no-literal-ui-string`, the lint blocks and `messages-lint.test.mjs` pattern), EZD-007c (adds `error.not_signed_in` to the same catalogs first, which T25 reads, and creates `app/src/server/auth/`, where T25's file lives). None missing: no screen (no EZD-016a), no event, no database.
- Not a dependency: EZD-007d (`getSignInLanguage` is only named in the docs bullet; nothing here calls it). Build order is a → f, so EZD-007d merges first anyway (Split proposal line 12).
- Dependents: EZD-007f uses every key, the surface and the lint block, and **carries P-T24 (c)** (`lintFiles` on the three folders → 0 errors; E4) and the `## Machine checks` row for T24 (E6); its planner adds both to its plan. EZD-033 adds password keys under the same namespaces (it changes this page).
- Risks:
  - The builder's Spanish could be awkward or wrong; tests only check it is present, not English and keeps `{email}`. A Spanish-speaking crew member checks it at the field checks and in Phase 15 (Q-0030 (a)).
  - `common.sign_in.*` keys also land in the `office`, `field`, `client` and `dev` subsets because those surfaces include `common` (parent V5: harmless); about 2 KB of text, server-side catalogs, so no effect on the 200 KB download budgets (11 Performance line 21; `catalogFor` is server-only, `docs/architecture.md` Files).
  - If EZD-007c changes the English of `error.not_signed_in` from Q-0100, T25 fails; both plans cite Q-0100 verbatim.

## 10. Open questions
None.
