# EZD-026c · Message helper: t() core

- **ACs:** AC-EZD-026c-1 (createT returns a key's text, fills every {name} placeholder, picks the one or other form for English and Spanish and throws on a missing key or parameter), AC-EZD-026c-2 (languageFor gives English for the office and the client link and the user's language for the field pack and dev pages) (`vault/spec/acceptance-criteria.md` lines 92–93).
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen yet; the app now has one message helper that picks English or Spanish for a screen and fills in names and counts, which every later screen's words go through.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned (no QP questions)

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 55):
- **Scope:** Plan vault/plans/EZD-026a.md Approach Step 1 without MessagesProvider.tsx: types.ts, language.ts (languageFor, NAMESPACES, SPANISH_NAMESPACES, the key format), t.ts (createT, T, MissingMessageError, MissingMessageParamError, placeholders, plurals, no locale number format), index.ts. No catalog, no React, no docs. Split from EZD-026a (Q-0163); plan Part EZD-026c.
- **Done when:** createT returns a key's text, fills every {name} placeholder, picks the one or other form for English and Spanish and throws on a missing key or parameter; languageFor gives English for the office and the client link and the user's language for the field pack and dev pages.
- **Depends on:** EZD-001, EZD-004a, EZD-004b, EZD-005a. **Spec ref:** R26 R17.

The behavior is the shared Step 1 of vault/plans/EZD-026a.md (lines 204–243, minus `MessagesProvider.tsx` lines 237–241), and the Part EZD-026c entry (lines 106–115). This plan restates it as the contract (section 3) and fixes the details Step 1 left open, each marked *planner's choice (CLAUDE.md rule 3)*.

Steps:
1. **`app/src/lib/messages/types.ts`**: the four types of section 3. `Language` is `'en' | 'es'` (03 Tables `user`: "language (en/es)"; EZD-005a column check `language in ('en', 'es')`, `supabase/migrations/20261019165202_create_app_user.sql` line 9). `Surface` is `'office' | 'field' | 'client' | 'dev'` (R26 R17 surfaces; `dev` for dev test pages, shared Step 1). Folder: `src/lib/` holds code used by browser and server, "t() from EZD-026" (docs/architecture.md `## Folder layout`).
2. **`app/src/lib/messages/language.ts`**: `languageFor`, `NAMESPACES`, `SPANISH_NAMESPACES`, `KEY_PATTERN`.
   - `languageFor('office' | 'client', user)` → `'en'`; `languageFor('field' | 'dev', user)` → `user.language` (R26 R17: field pack and crew phone screens in Spanish, office editor and client link English in v1; 03 `user`: "Language is per user, not a field-pack toggle"). No null branch: the column is `not null default 'en'` (EZD-005a migration line 9; default English is Q-0029 (a)).
   - `NAMESPACES` and `SPANISH_NAMESPACES`: values of shared Step 1 (EZD-026a.md lines 215–224). `office` is the string `'all-but-dev'` (shared Step 1 type `Record<Surface, readonly string[] | 'all-but-dev'>`); EZD-026d's `catalogFor` interprets it.
   - The key format of shared Step 1 (line 225) is exported as `KEY_PATTERN` (*planner's choice*: the ticket Scope names "the key format" in `language.ts` but no export name; EZD-026d's A5 checks the same regex).
3. **`app/src/lib/messages/t.ts`**: `createT`, `T`, `MissingMessageError`, `MissingMessageParamError`, with the rules of shared Step 1 (lines 226–236), made exact in section 3: lookup by `Object.hasOwn`; `{name}` placeholders; plural `{ one, other }` chosen by `Intl.PluralRules`, `one` → `one`, every other category → `other` (Spanish `many` for exact millions included); numbers inserted with `String(value)`, no locale grouping (shared Step 1; S16 "Numbers differ" concern). One `Intl.PluralRules` per language, cached at module level. No new dependency: `Intl.PluralRules` and `Object.hasOwn` are built in and inside the browser floor (Q-0013 (a): Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 113+; `Object.hasOwn` needs Safari 15.4, Chrome 93, Firefox 92; `app/tsconfig.json` `lib` includes `esnext`).
4. **`app/src/lib/messages/index.ts`**: re-exports every name of section 3 (values and types). No React import anywhere in this ticket (Scope "no React"); `MessagesProvider` and `useT` are added to `index.ts` by EZD-026d (EZD-026a.md line 118).

Imports between the files are relative (`./types`), never the `@/*` alias (`app/vitest.config.ts` sets no alias; docs/architecture.md `### Events`; EZD-026a V2 (6)).

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/lib/messages/types.ts` | New | builder | Step 1 |
| `app/src/lib/messages/language.ts` | New | builder | Step 2; AC-EZD-026c-2 |
| `app/src/lib/messages/t.ts` | New | builder | Step 3; AC-EZD-026c-1 |
| `app/src/lib/messages/index.ts` | New | builder | Step 4 |
| `app/src/lib/messages/language.test.ts` | New | test-author | A1, A12 |
| `app/src/lib/messages/t.test.ts` | New | test-author | A6, A7 |
| `app/vitest.config.ts`, `eslint.config.mjs`, `docs/architecture.md`, `package.json` files, `pnpm-lock.yaml`, `app/src/server/**`, `vault/**` | Not touched | — | No config change, no package, no catalog (EZD-026d), no docs (EZD-026a writes `### Messages and language (t())` for all three parts) |

Write rules (lesson L-002, `.claude/hooks/guard-paths.mjs` lines 15–17, 73–77): the builder may write `app/src/lib/messages/*.ts`; the two `*.test.ts` files match the test-author's `isTest` pattern.

**Data:** none. No tables, columns, migrations, RLS policies or `schema_version`; no money fields. `app_user.language` is read as a fact (EZD-005a), not imported or queried.

## 2. Sources
- **Decisions:** R26 R17 (`vault/spec/decisions/13b-round-26.md` line 27): "the field pack and the other phone screens for crew are available in Spanish, buttons and messages included; the office editor and the client link are English in v1. Every interface string goes through one message helper from Phase 0". R24 #40 (`vault/spec/decisions/13a-rounds-24-25.md` line 109): "Spanish users always see Spanish … never English or blanks" (why a missing key throws instead of falling back).
- **Answers:** Q-0163 (split into EZD-026c, EZD-026d, EZD-026a; `vault/questions/QUESTIONS.md` line 172); Q-0028 (c) (first split); Q-0029 (a) (new users default to English, line 38); Q-0013 (a) (browser floor, line 22).
- **Spec:** `03-data-model.md` Tables `user` (line 32: "language (en/es) … Language is per user, not a field-pack toggle"); `11-non-functional-requirements.md` rule 7 (line 31: field pack and client link are separate entry points, the reason `client` is its own surface) and Budgets (field pack 200 KB: the helper is small and has no dependency); `04-app-shell-and-global-ui.md` (Projects and Settings are office pages, English). S16 "Numbers differ" warning (no locale number format, shared Step 1).
- **Plans:** vault/plans/EZD-026a.md Part EZD-026c (lines 106–115), shared Step 1 (lines 204–243), Tests A1, A6, A7 (lines 368, 373–374), V2 (6), V5, V6. Dependents that read this contract: EZD-026d (catalogs use `Message`, `Language`, `Surface`, `NAMESPACES`, `SPANISH_NAMESPACES`, `createT`), EZD-026a (lint `allowedKeyPrefixes` follow `NAMESPACES`), EZD-026b (`languageFor`, line 68: `language.ts` not changed), EZD-007 (line 204: adds `'sign_in'` to `Surface` and `NAMESPACES.sign_in = ['common', 'error']`), EZD-014 (line 97: `languageFor('field', user)`).
- **Code read 2026-10-19:** `app/vitest.config.ts` (node environment, `include: ['src/**/*.test.{ts,tsx}']`, global setup needs the local stack), `app/tsconfig.json` (`lib` esnext, strict via base), `eslint.config.mjs` (typescript-eslint recommended on all TS, test files included), `supabase/migrations/20261019165202_create_app_user.sql` line 9. `app/src/lib/messages/` does not exist.
- **Plural rules checked:** Node v22.23.3 on 2026-10-19: `new Intl.PluralRules('en').select` 0, 1, 2 → `other`, `one`, `other`; `es` 0, 1, 2, 1500, 1000000 → `other`, `one`, `other`, `other`, `many`; `String(1500)` → `1500`. Matches Unicode CLDR cardinal rules as A7 cites.
- **Non-goals, glossary:** nothing on the message helper (`vault/spec/non-goals.md`, `glossary.md`, grep "Spanish|language|message", 2026-10-19).
- **Lessons:** planner L-002 (write rules), L-012 (every throw rule has a failing-input test: A6, A7).
- **Mockup:** none (`tickets.json` `mockups: []`; no screen).
- **Research:** no research report covers this ticket.

## 3. Interface contract
Matches EZD-026a shared Step 1; the rows marked *planner's choice* fill what it left open. EZD-007 later widens `Surface` and `NAMESPACES` with `sign_in` and decides how `languageFor` treats it (vault/plans/EZD-007.md line 204); this ticket adds nothing for `sign_in`.

| Kind | Name or path | Details |
| --- | --- | --- |
| type | `Language` (`types.ts`) | `'en' \| 'es'` |
| type | `Surface` (`types.ts`) | `'office' \| 'field' \| 'client' \| 'dev'` |
| type | `Message` (`types.ts`) | `string \| { one: string; other: string }` |
| type | `MessageParams` (`types.ts`) | `Record<string, string \| number>` |
| function | `languageFor` (`language.ts`) | `languageFor(surface: Surface, user: { language: Language }): Language`. `office`, `client` → `'en'`; `field`, `dev` → `user.language`. Never throws. |
| const | `NAMESPACES` (`language.ts`) | `Record<Surface, readonly string[] \| 'all-but-dev'>`: `office: 'all-but-dev'`, `field: ['common', 'field', 'error']`, `client: ['common', 'client', 'error']`, `dev: ['common', 'field', 'error', 'dev']` (arrays in this order). |
| const | `SPANISH_NAMESPACES` (`language.ts`) | `['common', 'field', 'error', 'dev'] as const` |
| const | `KEY_PATTERN` (`language.ts`) | *planner's choice (name)*: `/^(common\|field\|client\|office\|error\|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/` (no `g` flag, so `.test` has no state). |
| type | `T<K extends string>` (`t.ts`) | `((key: K, params?: MessageParams) => string) & { has(key: string): key is K; readonly language: Language }` |
| function | `createT` (`t.ts`) | `createT<K extends string>(language: Language, messages: Readonly<Record<K, Message>>): T<K>`. Does not copy or freeze `messages`. |
| lookup | `t(key, params)` | `Object.hasOwn(messages, key)`; false → throw `MissingMessageError`. |
| placeholders | `t(key, params)` | Every `{name}` with `name` matching `[A-Za-z_][A-Za-z0-9_]*` is replaced by `String(params[name])`, every occurrence. A placeholder whose name is not an own key of `params` (`Object.hasOwn`; `params` missing counts as `{}`) throws `MissingMessageParamError`. Params with no placeholder are ignored, and braces around anything else (`{ }`, `{1a}`) stay as written (*planner's choice*). No other syntax (no escapes, no ICU). |
| plurals | `t(key, params)` | For a `{ one, other }` message: `typeof params?.count !== 'number'` → throw `MissingMessageParamError` (name `count`). Else form = `one` when `pluralRules(language).select(count) === 'one'`, otherwise `other`; then placeholders are filled in that form as above (so `{count}` gives `String(count)`). |
| numbers | — | Inserted with `String(value)`: no grouping, no decimal comma, for both languages. |
| method | `t.has(key)` | `Object.hasOwn(messages, key)`; `has('toString')`, `has('constructor')` are false. |
| property | `t.language` | The `language` passed to `createT`. |
| class | `MissingMessageError` (`t.ts`) | `extends Error`; `name === 'MissingMessageError'`; `message` contains the key and the language. |
| class | `MissingMessageParamError` (`t.ts`) | `extends Error`; `name === 'MissingMessageParamError'`; `message` contains the missing param name (and the key). |
| file | `index.ts` | Re-exports `languageFor`, `NAMESPACES`, `SPANISH_NAMESPACES`, `KEY_PATTERN`, `createT`, `MissingMessageError`, `MissingMessageParamError` and the types `Language`, `Surface`, `Message`, `MessageParams`, `T`. Imports nothing from React or `src/server/`. |
| test files | `language.test.ts`, `t.test.ts` | Vitest, next to the code; each with one top-level `describe` whose title starts `EZD-026c` (check C9); imports relative (`./language`, `./t`, `./index`). A6's title is `EZD-026c done when: createT returns a key's text, fills placeholders, picks the plural form and throws on a missing key or parameter`; A1's is `EZD-026c done when: languageFor gives English for office and client and the user's language for field and dev`. |

## 4. Tests
Written by test-author before any code. Vitest in `@ezdraft/app` (`node` environment). No database call, but the app Vitest global setup needs the local stack running (EZD-026a V5), which the gate's `pnpm test` starts with `db:up`. Error classes are checked with `toThrow(MissingMessageError)` / `toThrow(MissingMessageParamError)` plus a "message contains" check; wording beyond that is not compared. A missing key is passed as `'x.zz' as never` (not `as any`: typescript-eslint recommended's `no-explicit-any` applies to test files, `eslint.config.mjs`).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| A1 languageFor (Done when) | AC-EZD-026c-2 | unit | `languageFor(s, { language: l })` for every s in `field`, `dev`, `office`, `client` and l in `en`, `es` | field/en → `en`; field/es → `es`; dev/en → `en`; dev/es → `es`; office/en → `en`; office/es → `en`; client/en → `en`; client/es → `en` | R26 R17; 03 `user`; EZD-026a.md A1 (line 368); EZD-005a migration line 9 (no null case) |
| A6 createT basics (Done when) | AC-EZD-026c-1 | unit | Fixture `{ 'x.a': 'Hello', 'x.b': 'Hi {name}', 'x.c': '{n} of {n}', 'x.p': { one: '{count} item', other: '{count} items' } }`, language `en` | `t('x.a')` → `Hello`. `t('x.b', { name: 'Ana' })` → `Hi Ana`. `t('x.c', { n: 3 })` → `3 of 3`. `t('x.b')` and `t('x.b', {})` each throw `MissingMessageParamError` whose message contains `name`. `t('x.zz' as never)` throws `MissingMessageError` whose message contains `x.zz` and `en`. `t.has('x.a')` true; `t.has('nope')`, `t.has('toString')`, `t.has('constructor')` false. `t.language === 'en'` | EZD-026a.md A6 (line 373); section 3 (the `{}` probe and the `en` in the message are this plan's additions, lesson L-012) |
| A7 Plurals and numbers | AC-EZD-026c-1 | unit | `en` fixture `x.p` as in A6; `es` fixture `{ 'x.p': { one: '{count} elemento', other: '{count} elementos' } }` | en: 0 → `0 items`, 1 → `1 item`, 2 → `2 items`. es: 0 → `0 elementos`, 1 → `1 elemento`, 2 → `2 elementos`, 1500 → `1500 elementos`, 1000000 → `1000000 elementos`. `t('x.p')` (no `count`) and `t('x.p', { count: '2' })` (not a number) each throw `MissingMessageParamError` whose message contains `count` | EZD-026a.md A7 (line 374): CLDR cardinal rules (en `one`: i = 1 and v = 0; es `one`: n = 1; es `many` for exact millions falls to `other`), confirmed on Node 22 (section 2); no locale number format (shared Step 1, S16 "Numbers differ"); the string-count probe is section 3's plural rule (lesson L-012) |
| A12 Namespace constants and exports | AC-EZD-026c-2 | unit | Import from `./index` | `NAMESPACES.office === 'all-but-dev'`; `NAMESPACES.field` deep-equals `['common', 'field', 'error']`; `NAMESPACES.client` deep-equals `['common', 'client', 'error']`; `NAMESPACES.dev` deep-equals `['common', 'field', 'error', 'dev']` (each surface asserted on its own, not the whole object, so EZD-007's `sign_in` entry does not break it); `SPANISH_NAMESPACES` deep-equals `['common', 'field', 'error', 'dev']`. `KEY_PATTERN` matches `error.db_unavailable`, `dev.messages.items`, `office.header.share`; does not match `Error.x`, `field`, `field.`, `field.A`, `other.x`, `field.x-y`. `createT` and `languageFor` from `./index` are functions. `createT('en', {})('a.b' as never)` throws an error that is `instanceof` both `Error` and the index's `MissingMessageError` with `name === 'MissingMessageError'`; `createT('en', { 'a.b': '{x}' })('a.b')` throws one that is `instanceof` both `Error` and the index's `MissingMessageParamError` with `name === 'MissingMessageParamError'` (the constructors' arguments are not part of the contract, so the test never calls `new`) | Shared Step 1 table and key format (EZD-026a.md lines 215–225); section 3 `index.ts` row; R26 R17 (which surfaces need Spanish) |
| Gate | both | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-026c` | Exit 0: `typecheck` (app `next typegen && tsc --noEmit` covers `lib/messages/*.ts`), `lint`, `test`, `build` | CLAUDE.md rule 12 |

Smoke: no test is `@smoke` (none is a phase Build gate browser test; docs/architecture.md `### Test scope`). The phase-0 grep `(?:EZD-0\d{2}[a-z]?(?![0-9]))|@smoke` matches `EZD-026c`.

## 5. Visual checklist
None (no screen; `tickets.json` `mockups: []`).

## 6. Proposed wording
None. The error messages are developer text, never shown to a user (a missing key fails a test or the typecheck, EZD-026d A4/A8); A6, A7 fixtures are test data.

## 7. Security review
security-review: no (no auth, permissions, data access, money, API or migrations; pure functions with no I/O).
Reviewers needed: code-reviewer always · calc-auditor no (no calculations; plural choice is CLDR) · ui-verifier no (section 5 has no rows) · security-reviewer no.

## 8. Complexity and model recommendation
**Medium:** four small pure-TypeScript files with a complete contract and two test files of exact values (A1, A6, A7, A12), but a new shared pattern that eight later tickets build on, with plural rules per language and throw rules that must match the contract exactly (PROCESS.md section 4: not clearly low; EZD-026a.md line 113). test-author Sonnet 5.5, builder Sonnet 5.5; code-reviewer Opus 5.5.

## 9. Dependencies
- **Ticket row:** EZD-001 (app package, `app/vitest.config.ts`, `eslint.config.mjs`, typecheck), EZD-004a (the gate's `pnpm test` runs `db:up` first), EZD-004b (the app Vitest global setup, which throws without the local stack), EZD-005a (`app_user.language` `not null`, so `languageFor` has no null branch; used as a fact, no import). All `done` (STATUS.md).
- **Missing from the row (say so):** EZD-000 (folder layout `src/lib/`, checks C7–C9 that the gate's `lint` runs on the new files); done, and met through EZD-001's own dependency, so no ledger change is needed.
- **Later tickets that read this contract:** EZD-026d, EZD-026a, EZD-026b, EZD-007 (widens `Surface`, `NAMESPACES`), EZD-011, EZD-012, EZD-014, EZD-015, EZD-024, EZD-1503 (through EZD-026d's `useT` / `getT`, which return this `T`).
- **Risks:** (1) A change to a name or signature here breaks EZD-026d's and EZD-007's plans; a deviation goes in the STATUS note so they are re-validated. (2) The tests need Docker running only because of the shared global setup (V5), not because of this code. (3) EZD-007 adding `sign_in` must keep A12 green; A12 asserts per surface for that reason.

## 10. Open questions
None. Settled at Level 1: the key-format export name and the unmatched-brace and extra-param behavior are how-to-build choices (CLAUDE.md rule 3), recorded in section 3; plural categories are CLDR's, checked on Node 22 (section 2).
