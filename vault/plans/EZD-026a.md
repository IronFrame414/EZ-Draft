# EZD-026a · Message helper: phone-screen lint and docs

- **ACs:** AC-EZD-026a-1 (Lint fails on a literal string in a phone-screen component), AC-EZD-026a-2 (Office files and test files are not linted by the rule, the test-page folder lints clean, and docs/architecture.md describes the helper, the catalogs and the lint) (`vault/spec/acceptance-criteria.md` lines 96–97).
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen; the gate now refuses a crew phone screen or client-link screen that has words typed straight into it instead of going through the message helper, so every crew word can be shown in Spanish.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned (no QP questions)

How this file is laid out: sections 1–10 are part EZD-026a's plan (process v2 template). Below them, kept unchanged in substance because the EZD-026c and EZD-026d ticket rows and eight later plans cite them: the part entries for EZD-026c and EZD-026d (split proposal, Q-0163, 113ce03), the re-validation findings V1–V12, and the shared plan text with Steps 1–5. Where this plan's sections 3 and 4 add detail to Step 4 or to the L/D test rows, sections 3 and 4 govern (the shared Tests table points here).

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 57):
- **Scope:** Plan vault/plans/EZD-026a.md Approach Step 4 (the rule ezdraft/no-literal-ui-string, the local plugin, the three eslint.config.mjs blocks) and Step 5 (all docs/architecture.md changes for the three parts). Split from EZD-026 (Q-0028); split again into EZD-026c, EZD-026d, EZD-026a (Q-0163); plan Part EZD-026a.
- **Done when:** Lint fails on a literal string in a phone-screen component. Office files and test files are not linted by the rule, the test-page folder lints clean, and docs/architecture.md describes the helper, the catalogs and the lint.
- **Depends on:** EZD-026c, EZD-026d, EZD-001, EZD-000. **Spec ref:** R26 R17.

Steps (the behavior is the shared Step 4 and Step 5 below; this list fixes what is new for this part):
1. **The rule** `eslint-rules/no-literal-ui-string.mjs`: reports rules 1–4 of shared Step 4 (JSX text with a letter; a text expression as a JSX child; a text attribute by the two name patterns; with `allowedKeyPrefixes`, a `t('<literal>')` key outside the prefixes). The first argument of `t(...)` is never reported as a literal. Source: R26 R17 ("Every interface string goes through one message helper from Phase 0"; "buttons and messages included"), `vault/spec/decisions/13b-round-26.md` line 27; ticket Scope.
2. **The local plugin** `eslint-rules/index.mjs`, a new root folder for the repo's own rules (shared Step 4). EZD-020 registers `import-boundaries` in the same file (vault/plans/EZD-020.md Step 4 heading, line 221), so the plugin object is the single home of `ezdraft/*` rules.
3. **`eslint.config.mjs`** (EZD-001's file): import the plugin once at the top and append the three blocks of shared Step 4 (field and crew phone, client link, test page) as the last entries inside the existing `tseslint.config(…)` call (V2 (2); current file lines 15–38). Nothing else in the file changes. Phone entry points are the field pack and the client link (11 rule 7, `vault/spec/sections/11-non-functional-requirements.md` line 31); lint scope is phone only and office components are not linted by the rule (ticket Scope; shared Level-1 decisions).
4. **`docs/architecture.md`**: shared Step 5 in full, for all three parts, with the V7 specifics: `eslint-rules/` added to the root line of the `## Folder layout` code block; `### Messages and language (t())` after `### Events`; the Folder layout `src/lib/` line's "t() from EZD-026" becomes "t() from EZD-026c"; the Machine checks row `| — | Literal interface strings in phone components | lint rule | EZD-026 |` (doc line 376) gets Check `ezdraft/no-literal-ui-string`, `scripts/tooling/__tests__/messages-lint.test.mjs` and Built by `EZD-026a`; the added rows name the part that built the check (`EZD-026d` for `catalog.test.ts` and `message-keys.test.ts`, `EZD-026a` for the review rows). No `##` heading is added (EZD-000 T5 and EZD-010a/b/c T12 (a) require exactly the 13, `scripts/conventions/__tests__/architecture-doc.test.mjs` lines 84–98, 171–176, 215–218). No Dependencies row (no package; the `eslint` row line 133 already names EZD-026a).

The docs describe EZD-026c's and EZD-026d's merged files. Both build before this part (`tickets.json` `depends_on`; build positions 30, 31, 32). If their STATUS notes record a deviation, this plan is re-validated at Stage 3 step 1 and the docs follow the merged code.

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `eslint-rules/no-literal-ui-string.mjs` | New | builder | The rule (Step 1; shared Step 4) |
| `eslint-rules/index.mjs` | New | builder | Local plugin `ezdraft` (Step 2) |
| `eslint.config.mjs` | Change (append three blocks and one import) | builder | Phone-surface blocks (Step 3) |
| `docs/architecture.md` | Change | builder | Helper, catalogs, lint, rules for adding a string (Step 4; shared Step 5) |
| `scripts/tooling/__tests__/messages-lint.test.mjs` | New | test-author | L1–L7 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add one `test(...)`) | test-author | D1 |
| `app/**`, `package.json` files, `pnpm-lock.yaml`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No app code (EZD-026c, EZD-026d), no new dependency |

Write rules checked against `.claude/hooks/guard-paths.mjs` (lesson L-002): the builder may write `eslint-rules/**`, `eslint.config.mjs` and `docs/architecture.md` (lines 76–86 deny only `.claude/`, `CLAUDE.md`, `scripts/` outside four folders and `ci.yml`); the test-author's two files are under `__tests__/` (line 15).

**Data:** none. No tables, columns, migrations, RLS policies or `schema_version`; no money fields.

## 2. Sources
- **Decisions:** R26 R17 (`vault/spec/decisions/13b-round-26.md` line 27): Spanish for "the field pack and the other phone screens for crew … buttons and messages included"; office editor and client link English in v1; "Every interface string goes through one message helper from Phase 0". R24 #40 ("Spanish users always see Spanish … never English or blanks"), the reason a literal on a Spanish surface is an error. Q-0028 (split into Parts A and B), Q-0163 (split into EZD-026c, EZD-026d, EZD-026a). Q-0030 (a) (the builder of each ticket writes the Spanish in the same commit; documented in Step 5's "adding a string"). Q-0047 (b) (EZD-007 adds a `sign_in` surface and its own lint block, vault/plans/EZD-007.md Step 6).
- **Spec:** `11-non-functional-requirements.md` rule 7 (line 31: "The phone field pack and the client link are separate entry points") and Budgets (line 21: field pack and client link 200 KB each); `02-product-overview.md` Platform (phone: field pack, client view); `03-data-model.md` Tables `user` (language en/es, per user); `04-app-shell-and-global-ui.md` (Projects, Settings, field pack and client link are the separate pages); screens S15 (Language toggle), S17 ("Language from the user's setting"), S18 (client link on the phone).
- **Glossary:** "Field pack: phone routes under `/field`" and "Client link: routes under `/c/<token>`" (`vault/spec/glossary.md` lines 31–32) are a starting proposal not to be cited until the owning ticket is done (line 34). App Router route groups `(field)` and `(client)` add no URL segment, so those paths stay open to EZD-14xx and EZD-12xx inside the groups; EZD-020 already plans its entry points in `(field)` and `(client)` (vault/plans/EZD-020.md lines 26, 100–102, 145–146). No conflict.
- **Non-goals:** nothing on language or lint (`vault/spec/non-goals.md`, grep "Spanish|language|lint", 2026-10-19).
- **Code read 2026-10-19:** `eslint.config.mjs` (ESLint 9.39.5 flat config, one `tseslint.config(…)` call, `APP` blocks matched from the root, `settings.next.rootDir` absolute); `app/package.json` (`"lint": "eslint ."`, so the gate lints `app/**` through the root config); root `package.json` `lint` and `test` (node:test glob `scripts/**/*.test.mjs`); `scripts/tooling/__tests__/tooling.test.mjs` T7/T8 lines 116–136 (`importFromRoot('eslint')`, `new ESLint({ cwd: root })`, `lintText(code, { filePath })`); `scripts/conventions/__tests__/architecture-doc.test.mjs` (`REQUIRED_HEADINGS` lines 84–98, `tableWithHeader`, `strip`, the T12 pattern lines 306–317); `docs/architecture.md` (headings, line 163, line 376).
- **Plans:** shared Steps 4–5 and V1–V12 below; vault/plans/EZD-001.md (ESLint config, `scripts/tooling/__tests__/`); vault/plans/EZD-000.md (architecture doc, T5, check C1); dependents that read this contract: EZD-020 (Step 4: `eslint-rules/import-boundaries.mjs` registered in `eslint-rules/index.mjs`; its L-tests copy L1's harness), EZD-015 (line 284: adds `app/src/components/states/**/*.{tsx,jsx}` to the field block), EZD-014 (L1: `lintFiles(['app/src/components/phone'])` with 0 messages from the rule), EZD-007 (`sign_in` block).
- **Lessons:** planner L-002 (write rules, above), L-012 (every refuse rule has a failing-input test; applied in L4–L6).
- **Mockup:** none (`tickets.json` `mockups: []`; no screen).
- **Research:** no research report covers this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| file / export | `eslint-rules/no-literal-ui-string.mjs` | `export default` an ESLint 9 rule object: `meta.type: 'problem'`; `meta.messages` with exactly the ids `literal` and `keyNamespace` (wording is the builder's, developer text); `meta.schema: [{ type: 'object', properties: { allowedKeyPrefixes: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }]` (ESLint 9 refuses options for a rule without a schema); `create(context)` uses `context.sourceCode`. Rules 1–3 report `literal`; rule 4 reports `keyNamespace`, one message per offending call. |
| file / export | `eslint-rules/index.mjs` | `export default { meta: { name: 'ezdraft' }, rules: { 'no-literal-ui-string': <rule> } }`. EZD-020 adds `'import-boundaries'` to this `rules` object. |
| config | `eslint.config.mjs` | `import ezdraft from './eslint-rules/index.mjs';` once; every block that uses the plugin passes this same object as `plugins: { ezdraft }` (ESLint 9 refuses two different objects under one plugin key). Rule id `ezdraft/no-literal-ui-string`. |
| config block | field and crew phone | `files: ['app/src/app/(field)/**/*.{tsx,jsx}', 'app/src/components/field/**/*.{tsx,jsx}', 'app/src/components/phone/**/*.{tsx,jsx}']`, `ignores: ['**/*.test.*', '**/*.spec.*']`, `rules: { 'ezdraft/no-literal-ui-string': ['error', { allowedKeyPrefixes: ['common.', 'field.', 'error.'] }] }`. EZD-015 appends `app/src/components/states/**/*.{tsx,jsx}` to `files`. |
| config block | client link | `files: ['app/src/app/(client)/**/*.{tsx,jsx}', 'app/src/components/client/**/*.{tsx,jsx}']`, same `ignores`, `allowedKeyPrefixes: ['common.', 'client.', 'error.']`. |
| config block | test page | `files: ['app/src/app/dev/messages/**/*.{tsx,jsx}']`, same `ignores`, `allowedKeyPrefixes: ['common.', 'field.', 'error.', 'dev.']`. |
| globs | parentheses | Written literally; if the pinned ESLint/minimatch treats `(` `)` as special, escape them. L1 proves the globs match. |
| test file | `scripts/tooling/__tests__/messages-lint.test.mjs` | node:test; one top-level `describe('EZD-026a phone-screen lint', …)`; tests titled `EZD-026a L<n> …`, L1 titled `EZD-026a done when: lint fails on a literal string in a phone-screen component`. Loads ESLint as tooling.test.mjs T7 does. |
| test case | `scripts/conventions/__tests__/architecture-doc.test.mjs` | One added flat `test('EZD-026a D1: …')`, reusing the file's `readArch`, `REQUIRED_HEADINGS`, `tableWithHeader`, `strip`. |
| docs | `docs/architecture.md` | `### Messages and language (t())` under `## Folder layout`, after `### Events`; Machine checks rows as Step 4 of section 1. |
| names described | (from EZD-026c, EZD-026d) | `app/src/lib/messages/`: `languageFor`, `NAMESPACES`, `SPANISH_NAMESPACES`, `createT`, `MessagesProvider`, `useT`; `app/src/server/messages/`: `en`, `es`, `catalogFor`, `getT`; `app/src/app/dev/messages/` (shared Steps 1–3). |

## 4. Tests
Written by test-author before any code. All are `node:test`, run by the root `test` script (never filtered by `EZD_TEST_GREP`, docs/architecture.md `### Test scope`). L-tests use `new ESLint({ cwd: <repo root> })` and `lintText(code, { filePath })` against the real config (files need not exist), except L7 which uses `lintFiles`. Every probe is a small component, e.g. `export default function P({ t, ok, n, err, k }) { return <p>{…}</p>; }`, so `t` is the identifier the rule checks. "From the rule" = messages with `ruleId === 'ezdraft/no-literal-ui-string'`. Severity 2 is ESLint's numeric value for `'error'` (the config's severity, section 3). Message wording is never compared.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| L1 Literal in a phone component fails (Done when) | AC-EZD-026a-1 | unit (node:test) | `export default function P(){ return <button>Save</button>; }` as `app/src/app/(field)/x/page.tsx`, `app/src/components/field/X.tsx`, `app/src/components/phone/X.tsx`, `app/src/app/(client)/x/page.tsx`, `app/src/components/client/X.tsx` | Each: ≥ 1 message from the rule with `severity === 2` and `messageId === 'literal'` | Ticket Done when; 11 rule 7; section 3 globs and message ids |
| L2 Office not in scope | AC-EZD-026a-2 | unit | L1 code as `app/src/components/shell/Header.tsx` and `app/src/app/page.tsx` | 0 messages from the rule | Ticket Scope (phone only); R26 R17 (office English, checked by review) |
| L3 Allowed forms | AC-EZD-026a-1 | unit | Field file (`app/src/components/field/X.tsx`), one probe each: `<button>{t('field.x')}</button>`; `<span>{' · '}</span>`; `<span>12</span>`; `<span>1/64</span>`; `<div className="a" data-x="Yes" role="dialog" id="b" lang="es" />`; `<Button variant="primary" type="button" />`; `<a href="/x" />` | Each: 0 messages from the rule | Shared Step 4 (allowed characters; never-reported attributes; `t` first argument) |
| L4 Reported forms | AC-EZD-026a-1 | unit | Field file, one probe each: `<input placeholder="Name" />`; `<img alt="Plan" />`; `<b title="Hi" />`; `<X aria-label="Close" />`; `<Dialog confirmLabel="OK" />`; `<Toast message={'Saved'} />`; `<p>{'Saved'}</p>`; ``<p>{`Saved ${n}`}</p>``; `<p>{ok ? 'Yes' : 'No'}</p>`; `<p>{err && 'Failed'}</p>`; `<p>Guardar</p>`; `<p>ñ</p>`; `<>Save</>` | Each: ≥ 1 message from the rule, severity 2, `messageId === 'literal'` | Shared Step 4 rules 1–3; R26 R17 "buttons and messages included"; lesson L-012 |
| L5 Key namespaces | AC-EZD-026a-1 | unit | Field file: `t('office.header.share')`, `t('client.x')`, ``t(`office.x`)``, `t('field.x')`, `t('common.x')`, `t('error.x')`, `t(k)`. Client file (`app/src/components/client/X.tsx`): `t('field.x')`, `t('client.x')`. Test-page file (`app/src/app/dev/messages/X.tsx`): `t('dev.x')`, `t('office.x')`. Each inside `<p>{…}</p>`, one call per probe | Reported with exactly 1 message from the rule, `messageId === 'keyNamespace'`: field `office.header.share`, `client.x`, `` `office.x` ``; client `field.x`; test page `office.x`. 0 messages from the rule: field `field.x`, `common.x`, `error.x`, `t(k)` (a key not known before run time is review, shared Step 5); client `client.x`; test page `dev.x` | Section 3 `allowedKeyPrefixes`; shared Step 1 `NAMESPACES`; shared Step 4 rule 4 (a no-substitution template literal counts as a literal); R26 R17; R24 #40 |
| L6 Test files exempt | AC-EZD-026a-2 | unit | L1 code as `app/src/app/(field)/x/page.test.tsx`, `app/src/components/field/X.spec.tsx`, `app/src/components/client/X.test.tsx`, `app/src/app/dev/messages/X.test.tsx` | Each: 0 messages from the rule | Section 3 `ignores` (all three blocks; lesson L-012) |
| L7 Test page clean | AC-EZD-026a-2 | unit | `lintFiles(['app/src/app/dev/messages'])` (EZD-026d's files) | ≥ 1 result (the folder exists) and the sum of `errorCount` is 0 | Shared Step 3; section 3 test-page block |
| D1 Docs updated | AC-EZD-026a-2 | unit (node:test) | `docs/architecture.md` | `##` headings deep-equal `REQUIRED_HEADINGS` (13, in order). Has the line `### Messages and language (t())`. Contains each of `ezdraft/no-literal-ui-string`, `eslint-rules/`, `(field)`, `(client)`, `components/phone`, `app/src/lib/messages/`, `app/src/server/messages/`, `createT`, `useT`, `catalogFor`, `SPANISH_NAMESPACES`, `Q-0030`. The Machine checks table (`ID`, `Rule`, `Check`, `Built by`) has a row whose Check contains `messages-lint.test.mjs` with Built by `EZD-026a`, a row whose Check contains `catalog.test.ts` with Built by `EZD-026d`, and a row whose Check contains `message-keys.test.ts` with Built by `EZD-026d`. No Dependencies row has Added by `EZD-026a`. `node scripts/conventions/check.mjs <root>` exits 0 | Shared Step 5; section 1 Step 4; EZD-000 T5 and C1; `architecture-doc.test.mjs` lines 84–98 |
| Gate | both | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-026a` | Exit 0: `typecheck`, `lint` (the app `eslint .` now runs the rule over every phone folder that exists), `test`, `build` | CLAUDE.md rule 12 |

## 5. Visual checklist
None (no screen; `tickets.json` `mockups: []`).

## 6. Proposed wording
None. The rule's two messages (`literal`, `keyNamespace`) and the docs are developer text, never shown to a user.

## 7. Security review
security-review: no (no auth, permissions, data access, money, API or migrations; a lint rule and docs).
Reviewers needed: code-reviewer always (confirms the text-attribute list, the folder names and that office components use `t()`) · calc-auditor no · ui-verifier no (section 5 has no rows) · security-reviewer no.

## 8. Complexity and model recommendation
**Medium:** one custom AST rule on the real flat config with four report rules, fully specified by L1–L7, that runs in every later gate's `lint` over the phone folders, plus a docs section describing two other parts' code; no data, permissions, money or auth (PROCESS.md section 4: not clearly low). test-author Sonnet 5.5, builder Sonnet 5.5; code-reviewer Opus 5.5.

## 9. Dependencies
- **Ticket row:** EZD-026c and EZD-026d (L7 lints `app/src/app/dev/messages/`; L5's test-page probe and the docs describe their files), EZD-001 (`eslint.config.mjs`, `scripts/tooling/__tests__/`), EZD-000 (`docs/architecture.md`, `architecture-doc.test.mjs`, check C1).
- **Missing from the row (say so):** EZD-004a (the gate's `pnpm test` runs `db:up` first, so the gate needs the local stack and Docker even though L/D tests touch no database; done). Met through EZD-026c/d's own `depends_on`; no ledger change needed.
- **Later tickets that read this contract:** EZD-020 (registers `import-boundaries` in `eslint-rules/index.mjs`; its entry files in `(field)` and `(client)` must pass this rule), EZD-015 (adds `components/states/**` to the field block), EZD-014 (`components/phone/` lint-clean), EZD-007 (adds a `sign_in` block), EZD-011, EZD-012, EZD-024, EZD-026b, EZD-1503.
- **Risks:** (1) No gate `lint` or `typecheck` covers `eslint-rules/*.mjs` (V8): the root `lint` reaches only `app` and `packages/geometry`, so L1–L7 are the rule's only check. (2) Once merged, any phone-folder file with a literal fails every later gate; EZD-020's placeholders hold no text (vault/plans/EZD-020.md line 148). (3) Blind spots, listed as review rows: strings built outside JSX, `.ts` helpers in phone folders, `t` under another name, run-time keys, and `eslint-disable` for this rule (a review fail). (4) Folder alignment: a phone screen outside the listed folders is not linted; EZD-020 and EZD-015 change the globs in their own commits. (5) The docs depend on EZD-026c/d landing as planned; a deviation triggers re-validation before this build.

## 10. Open questions
None. (Glossary `/field` vs the `(field)` route group: settled at Level 1, section 2.)

## Parts EZD-026c and EZD-026d (split proposal, Q-0163; their ticket rows cite "plan Part EZD-026c / EZD-026d")

Split applied 0a4a1c6: EZD-026c t() core → EZD-026d catalogs and test-page component → EZD-026a lint and docs (this plan). Each part is planned as its own unit from its entry here, the findings V1–V12 and the shared plan text. Test IDs A1–A11 and every expected value are unchanged; each Vitest file's top-level `describe` starts with its part ID (check C9), and A10's title is `EZD-026d done when: …`.

### Part EZD-026c · Message helper: t() core
- **Scope:** Approach Step 1 without `MessagesProvider.tsx`: `types.ts`, `language.ts` (`languageFor`, `NAMESPACES`, `SPANISH_NAMESPACES`, the key format), `t.ts` (`createT`, `T`, the two error classes, placeholders, plurals, no locale number format), `index.ts` re-exporting them. No catalog, no React, no docs (part EZD-026a writes `### Messages and language (t())` for all three parts).
- **Done when:** `createT` returns a key's text, fills every `{name}` placeholder, picks the `one` or `other` form with `Intl.PluralRules` for English and Spanish and throws on a missing key or parameter; `languageFor` gives English for the office and the client link and the user's language for the field pack and dev pages.
- **Depends on:** EZD-001 (the ticket row); EZD-004a and EZD-004b (the gate's `pnpm db:up` and the app Vitest global setup, which throws without the local stack; not in the ticket row, V5); EZD-005a (`app_user.language` is `not null`, so `languageFor` has no null branch, V6; used as a fact, no import).
- **Interface contract:** Step 1 bullets for `types.ts`, `language.ts`, `t.ts` and `index.ts`, unchanged. Files import by relative path (V2 (6)).
- **Files (4 + 2 test-author files):** builder: `app/src/lib/messages/types.ts`, `language.ts`, `t.ts`, `index.ts`; test-author: `app/src/lib/messages/language.test.ts` (A1), `t.test.ts` (A6, A7).
- **Tests (3 + gate):** A1, A6, A7, each file with a top-level `describe` whose title starts `EZD-026c`; the gate.
- **Complexity:** medium: few files and a complete contract, but a new shared pattern that eight later tickets build on, with plural rules per language (PROCESS.md section 4: not clearly low). test-author and builder Sonnet 5.5; code-reviewer Opus 5.5.
- **security-review: no** (no auth, permissions, data access, money or API). **Visual checklist:** none (no screen). **Proposed wording:** None (A6/A7 fixtures are test data).
- **User-visible result:** nothing on screen yet; the app has one message helper that picks English or Spanish and fills in names and counts.

### Part EZD-026d · Message helper: catalogs and test-page component
- **Scope:** Approach Step 1's `MessagesProvider.tsx` (with `useT`, added to `index.ts`), Step 2 (the `en` and `es` catalogs with the four keys of the Step 2 table, `catalog.ts`, `get-t.ts`) and Step 3 (`SampleText.tsx`, `MessagesSample.tsx`; no `page.tsx`, so no route).
- **Done when:** The test-page component renders the field section in Spanish and the office section in English for a user record with language es (AC-EZD-026a-2's sentence). The Spanish catalog has text for every key of the Spanish namespaces, and every literal route `message_key` in `app/src`, including the health route's `error.db_unavailable`, is in the English catalog.
- **Depends on:** EZD-026c; EZD-004b (the health route's `message_key`, `app/src/app/api/health/route.ts` line 13; not in the ticket row, V4); EZD-010b (the `.tsx` test transform in `app/vitest.config.ts`, V3); EZD-010c (the `app/src/app/dev/<name>/` folder and the `renderToStaticMarkup` test pattern, V3); EZD-004a, EZD-004b, EZD-005a as part EZD-026c.
- **Interface contract:** Step 1 `MessagesProvider` / `useT` bullets; Step 2 `en`, `MessageKey`, `es`, `SpanishKey`, `catalogFor(surface, language)`, `getT(surface, language)`; Step 3 components, props and `data-testid` values `sample`, `items-1`, `items-2`, `field-sample`, `office-sample`; all unchanged.
- **Files (8 + 4 test-author files):** builder: `app/src/lib/messages/MessagesProvider.tsx`, `index.ts` (change), `app/src/server/messages/catalogs/en.ts`, `catalogs/es.ts`, `catalog.ts`, `get-t.ts`, `app/src/app/dev/messages/SampleText.tsx`, `MessagesSample.tsx`; test-author: `app/src/lib/messages/MessagesProvider.test.tsx` (A9), `app/src/server/messages/catalog.test.ts` (A2–A5, A8), `message-keys.test.ts` (A11), `app/src/app/dev/messages/MessagesSample.test.tsx` (A10).
- **Tests (8 + gate):** A2, A3, A4, A5, A8, A9, A10 (title `EZD-026d done when: test-page component renders the field section in Spanish and the office section in English for a user record with language es`), A11, each file with a top-level `describe` whose title starts `EZD-026d`; the gate (A8's `@ts-expect-error` is checked by the app `typecheck`, V2 (4)).
- **Complexity:** medium: plain data files and two small components on an existing test pattern, with type-level completeness checks; no data, permissions, money or auth (PROCESS.md section 4). test-author and builder Sonnet 5.5; code-reviewer Opus 5.5.
- **security-review: no** (catalogs are server-only by folder; no auth, permissions, data access, money or API). **Visual checklist:** none (no route; the page is EZD-026b's). **Proposed wording:** `error.db_unavailable` en "Can't reach the database. Try again in a minute." (Q-0086 (a), already approved); its Spanish is written by the builder in the same commit and checked by a Spanish-speaking crew member at the field checks and in Phase 15 (Q-0030 (a)); the orchestrator records it as needs-josh-confirm wording. The three `dev.messages.*` keys are developer text (Step 2).
- **User-visible result:** nothing on a page yet (the test page's route is EZD-026b's); the English and Spanish message lists exist, and the health check's "Can't reach the database" error has its text in both languages.


### Reviewers (all parts)
code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (no product screen and no route) · security-reviewer no.

## Re-validation findings (2026-10-19; apply in every part's plan)

- **V1 Size.** See Split proposal. Nothing in the plan's behavior or test values changes; the parts only divide it.
- **V2 EZD-001 deviations (STATUS.md row EZD-001).** (2) ESLint 9.39.5, not 10.x: the merged `eslint.config.mjs` is one `tseslint.config(…)` call (lines 15–38) with `app/**` blocks matched from the repo root (line 11) and an absolute `settings.next.rootDir` so it works when ESLint runs from the root or from `app/` (lines 12–13, 34–37). Step 4's three blocks are appended inside that call with `plugins: { ezdraft: <eslint-rules/index.mjs> }`, the ESLint 9 flat-config form; nothing else in the file changes. (4) No `tsconfig.test.json`: `app/tsconfig.json` includes `**/*.ts` and `**/*.tsx`, and the app `typecheck` script is `next typegen && tsc --noEmit` (`app/package.json`), so A8's `@ts-expect-error` is type-checked by the gate as the plan assumes. (5) `settings.next.rootDir` absolute: no effect. (6) The `@/*` alias stays in `app/tsconfig.json`, but `app/vitest.config.ts` sets no alias, so code and tests import by relative path (EZD-004b deviation, STATUS.md; docs/architecture.md `### Events`). C9 and test scope: every Vitest file has a top-level `describe` whose title starts with its part ID (scripts/conventions/check.mjs lines 394–405); the root node:test files are not under C9, but their titles start with the part ID as `architecture-doc.test.mjs` (flat `test('EZD-000 T5 …')`, line 171) and `tooling.test.mjs` (`describe('EZD-001 repo tooling', …)`, line 67) do; the phase-0 grep `(?:EZD-0\d{2}[a-z]?(?![0-9]))|@smoke` matches EZD-026a, c and d. The L-tests load ESLint as `tooling.test.mjs` T7/T8 do (`importFromRoot('eslint')`, `new ESLint({ cwd: root })`, `lintText(code, { filePath })`, lines 117–136).
- **V3 EZD-010 split (Q-0155).** The `.tsx` test transform is EZD-010b's: `app/vitest.config.ts` line 8 `oxc: { jsx: { runtime: 'automatic' } }` (vault/plans/EZD-010b.md lines 109–110), so the Files row "`app/vitest.config.ts`: change only if EZD-010 has not set a JSX transform" is now "not touched". The dev page folder `app/src/app/dev/<name>/` and the `renderToStaticMarkup` pattern are EZD-010c's (vault/plans/EZD-010c.md lines 43–44, 105, 108; `app/src/app/dev/tokens/page.test.tsx` line 3; docs/architecture.md Folder layout line 158). This ticket adds no `page.tsx` there, so no route and no `notFound()`; EZD-026b's `page.tsx` follows EZD-010c's production `notFound()` convention. EZD-010c's deviation (plain px in `page.module.css`) has no effect: this ticket adds no CSS file, and `MessagesProvider`'s inline `display: contents` is not a color (check C10). `app/src/app/layout.tsx` sets `<html lang="en">`; the provider's `lang` attribute overrides it inside its subtree, as A9 and A10 expect.
- **V4 EZD-004 split (Q-0148).** The health route is EZD-004b's `app/src/app/api/health/route.ts`; line 13 returns `{ error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } }` exactly (vault/plans/EZD-004b.md lines 28, 82, T3 line 97). A grep of `app/src` non-test files on 2026-10-19 finds that line as the only literal `message_key`, so A11's "at least 1 match, including `error.db_unavailable`" holds today; later routes add theirs under the Step 5 rule. Citations of `vault/plans/EZD-004.md` Step 6 / T3 now read `vault/plans/EZD-004b.md` (edited below). EZD-004b is done, so the ordering dependency is met.
- **V5 Shared Vitest setup.** `app/vitest.config.ts` holds `environment: 'node'`, `include: ['src/**/*.test.{ts,tsx}']`, `testNamePattern` from `EZD_TEST_GREP`, `maxWorkers: 4`, `globalSetup: ['test-harness/supabase-env.global-setup.ts']` (EZD-004b), `testTimeout: 15000` and `env` with `EMAIL_TRANSPORT`, `EMAIL_FROM` (EZD-008a). No part edits it. The global setup throws when the local stack is down, so the A-tests, although they touch no database, run only with Docker up (the gate's `pnpm test` runs `db:up` first). `react-dom` is already an app dependency (`app/package.json`), so `renderToStaticMarkup` needs no new package.
- **V6 EZD-005 split (Q-0150).** `app_user.language` is EZD-005a's: `supabase/migrations/20261019165202_create_app_user.sql` line 9 `language text not null default 'en' check (language in ('en', 'es'))` (vault/plans/EZD-005a.md line 79). Citations of `vault/plans/EZD-005.md` Data now read that file (edited below); A1's "no null case" stands.
- **V7 docs/architecture.md.** It has exactly the 13 `##` headings of `REQUIRED_HEADINGS` (`architecture-doc.test.mjs` lines 84–97; doc lines 5–353, counted 2026-10-19), and EZD-010a T12 (a) (line 215) already asserts exactly those 13 in order, so D1's heading clause repeats a check that exists (kept; no value changes). `architecture-doc.test.mjs` exists, so D1 is an added case. `### Messages and language (t())` goes under `## Folder layout` after the existing `### Root config files`, `### Design tokens, fonts and icons` and `### Events`. The Machine checks row Step 5 fills exists at line 376 as `| — | Literal interface strings in phone components | lint rule | EZD-026 |` (columns `ID | Rule | Check | Built by`): part EZD-026a writes its Check cell (`ezdraft/no-literal-ui-string`, `scripts/tooling/__tests__/messages-lint.test.mjs`) and sets Built by to `EZD-026a`; the added rows name the part that built the check (`EZD-026d` for the catalog and message-key tests, `EZD-026a` for the review rows). The Folder layout line 163 "t() from EZD-026" becomes "t() from EZD-026c". The `eslint` Dependencies row (line 133) already names EZD-026a; no new row (no package).
- **V8 Lint coverage of `eslint-rules/`.** The root `lint` script runs `pnpm -r … run lint`, and `pnpm -r` reaches only `app` and `packages/geometry`, not the root (`pnpm -r --filter "!./spikes/**" exec pwd` printed those two, 2026-10-19). So no gate `lint` or `typecheck` covers `eslint-rules/*.mjs`; L1–L7 are its only check. Recorded as a risk, not a change.
- **V9 Write rules.** Checked against `.claude/hooks/guard-paths.mjs`: the builder may write `app/**`, `eslint-rules/**`, `eslint.config.mjs` and `docs/architecture.md` (lines 76–86 deny only `.claude/`, `CLAUDE.md`, `scripts/` outside four folders and `ci.yml`); the test-author writes `*.test.*` and `__tests__/` (line 15), which covers every test file above.
- **V10 CLAUDE.md rule numbers.** The text below cited the 2026-10-11 numbering; current numbers: "planner's choice (CLAUDE.md rule 4)" → rule 3 (agents decide how to build); the gate rule 9 → rule 12; live services rule 6 and secrets rule 8 unchanged; one ticket one branch rule 11 unchanged. Edited below.
- **V11 Dependencies not in the ticket row.** `tickets.json` `depends_on` is now EZD-001, EZD-010a, EZD-010b, EZD-010c (the phase row still says EZD-010). Used but not listed: EZD-000 (`docs/architecture.md`, its tests, check C1), EZD-004a (the gate's `db:up`), EZD-004b (the health route key and the Vitest global setup), EZD-005a (the `language` column), EZD-008a (the `env` keys in `app/vitest.config.ts`). All are done; each part's Depends on names those it uses.
- **V12 Spec and answers.** R26 R17 (`vault/spec/decisions/13b-round-26.md`), Q-0028 (c, applied as the split), Q-0029 (a), Q-0030 (a), Q-0086 (a) and Q-0155 read as the plan cites them (`vault/questions/QUESTIONS.md` lines 37–39, 94, 164). Q-0047's answer is option (b) (line 55: Josh answered the batch letter (a), which is option (b), the English / Español switch on the sign-in page); the plan's "Q-0047 (a)" now reads "Q-0047 (b)" (edited below); the content cited is the same and only EZD-007 uses it. No answer changes a tested value. No research report covers this ticket.

## Shared plan text for EZD-026c, EZD-026d and EZD-026a (2026-10-11, revised 2026-10-12 and 2026-10-19; dependents cite its Steps)

For part EZD-026a, sections 1–10 above govern where they add detail (section 3 contract, section 4 L1–L7 and D1). The "Reviewers needed", "Risks" and "Open questions" headings below belong to the shared text.

## Ticket (copied from the phase file)
Scope: One t() helper with English and Spanish message catalogs; a lint rule refuses a literal interface string in components of the field pack and phone entry points; the office editor uses the helper with English only. Split from EZD-026 (Q-0028); plan Part A.
Done when: Lint fails on a literal string in a phone-screen component; the test-page component renders the field section in Spanish and the office section in English for a user record with language es.
Depends on: EZD-001, EZD-010 (phase row; `tickets.json` `depends_on: ["EZD-001","EZD-010a","EZD-010b","EZD-010c"]` after the EZD-010 split, Q-0155). Also (re-validation 2026-10-19: V3, V4, V6, V11):
- **EZD-000** (through EZD-001), not in the row. This ticket:
  - adds to `docs/architecture.md` under existing `##` headings only (EZD-000 T5);
  - fills EZD-000's Machine checks row "literal interface strings in phone components (EZD-026)";
  - uses EZD-000's route error body, whose `message_key` is a `t()` key (vault/plans/EZD-000.md, Errors and logging).
- **EZD-004b (EZD-004 split, Q-0148): missing from the row (ordering dependency).** Its health route returns `{ "error": { "code": "db_unavailable", "message_key": "error.db_unavailable" } }` (`app/src/app/api/health/route.ts` line 13; vault/plans/EZD-004b.md lines 28, 82, T3 line 97). This ticket adds that key to the catalogs (Step 2) and A11 finds the route's literal. The phase 0 build order (orchestrator, plan-review revision) puts EZD-004 before this ticket, so the row needs no change for the build to work; the orchestrator may add it to `depends_on`.
- **EZD-001**: `eslint.config.mjs` (extended here), `app/vitest.config.ts`, and `scripts/tooling/__tests__/` (node:test, run by the root `test` glob) (vault/plans/EZD-001.md Steps 2–3).
- **EZD-010b, EZD-010c** (EZD-010 split, Q-0155): the JSX transform for `.test.tsx` files is EZD-010b's (`app/vitest.config.ts` line 8 `oxc: { jsx: { runtime: 'automatic' } }`; vault/plans/EZD-010b.md lines 109–110), and the dev test-page folder `app/src/app/dev/<name>/` is EZD-010c's (vault/plans/EZD-010c.md lines 43–44, 105). The route page that uses it is EZD-026b's.
- **Q-0030** (answered-josh (a), 2026-10-12): "each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15)". This ticket's builder therefore writes the Spanish of `error.db_unavailable` (Step 2).
- **Q-0086** (answered-josh (a), 2026-10-12): the English of `error.db_unavailable` is "Can't reach the database. Try again in a minute." (Step 2).
- **Q-0002** (escalated, deferred; does not block). R26 R17, which this ticket implements, stands as written.
- Tickets that now depend on this one (Q-0028, split applied): EZD-007, EZD-011, EZD-012, EZD-014, EZD-015, EZD-026b, EZD-1503 (`tickets.json`). EZD-020 has to align its folders with this ticket (Step 4).

Spec ref: R26 R17 (`tickets.json` `spec_files: ["spec/decisions.md"]`).

## Sources read
- Decisions:
  - R26 R17: "the field pack and the other phone screens for crew are available in Spanish, buttons and messages included; the office editor and the client link are English in v1. Every interface string goes through one message helper from Phase 0".
  - R24 #40: "Spanish users always see Spanish, reviewed or not; never English or blanks".
  - R24 #9 (permit sheets English only); R26 R1.
  - Build answers (Josh): Q-0030 (a) (who writes the Spanish), Q-0086 (a) (English of the route error keys), Q-0029 (a) (new users default to English; EZD-026b), Q-0047 (b) (sign-in page language switch; EZD-007, see Risks). Q-0001, Q-0003, Q-0004, Q-0014 to Q-0019 do not touch language.
- Questions: the whole of `vault/questions/QUESTIONS.md`.
  - Q-0028 (split applied), Q-0030 (answered-josh (a)) and Q-0086 (answered-josh (a), shared with EZD-004 and EZD-009) belong to this ticket.
  - Q-0002 is escalated and deferred; it does not block.
  - Q-0013 (browser floor): `Intl.PluralRules` is supported throughout it.
  - Q-0021 and commit aad5540: CI runs only on the phase PR and by hand, so this ticket's proof is the local gate (`vault/PROCESS.md`, CI paragraph).
- Spec:
  - `03-data-model.md`: Architecture rules 1, 11, 12; Tables `user` ("language (en/es) … Language is per user, not a field-pack toggle").
  - `04-app-shell-and-global-ui.md`: whole file. "The only separate pages are Projects, Settings, the phone field pack and the client link".
  - `11-non-functional-requirements.md`: Budgets ("client link and field pack 200 KB each"); rule 7 ("The phone field pack and the client link are separate entry points"); Offline; Accessibility.
  - `02-product-overview.md`: Platform ("Phone: field pack, client view, 3D viewer, measure, photo markup"); Roles (Crew "View field pack in their language").
  - Screens: `S15-settings-users-permissions.md` (Language toggle "English / Español"; helper text "Field pack, tasks and notes open in Spanish for this user. Permit sheets stay in English"); `S16-translation-review.md` (the queue covers sheet notes, keynotes and field tasks; "Numbers differ" warning); `S17-field-pack-phone.md` ("Language from the user's setting").
- Ticket rows: phase-00 (EZD-010, 011, 012, 014, 015, 020, 026b), phase-15 (EZD-1503).
- Plans: `vault/plans/EZD-000.md`, `EZD-001.md`, `EZD-004b.md` (`message_key` `error.db_unavailable`), `EZD-005a.md` (`language` column), `EZD-010b.md` (`.tsx` test transform), `EZD-010c.md` (dev pages, `renderToStaticMarkup` tests), `EZD-022.md`. This plan extends their files and replaces none.
- Process: `vault/PROCESS.md`, `vault/KNOWN-LIMITS.md` (item 5), `vault/tickets/README.md`, `CLAUDE.md` (rules 3, 6, 8, 11), `.claude/hooks/guard-paths.mjs`, `scripts/gate.mjs`.
- Mockup: none (`tickets.json` `mockups: []`; no product screen). The Studio boards hold no Spanish interface text except the S15 toggle "English / Español".

## Approach

Choices that no source makes are marked *planner's choice (CLAUDE.md rule 3)*. The code-reviewer confirms them at plan review.

### Level-1 decisions (with sources)
- **Surfaces.**
  - The field pack and the other crew phone screens may be Spanish. The office editor and the client link are English (R26 R17).
  - Projects and Settings count as office, so they are English. R17 offers Spanish only to "the field pack and the other phone screens for crew". The S15 helper text names only "Field pack, tasks and notes". 02 Platform keeps Projects and Settings off the phone.
- **The language input is the user record's `language` (en/es).** It is never a field-pack toggle, the browser locale or a cookie (03 `user`; S17). This ticket takes the record as a parameter. EZD-026b reads it for the signed-in user.
- **No English fallback on Spanish surfaces.** "Never English or blanks" (R24 #40), and "buttons and messages included" (R17). Every key a Spanish surface may use must therefore have Spanish text. This is enforced by typecheck, a unit test and the lint, not at runtime.
- **Phone entry points.** These are the field pack and the client link (11 rule 7). The lint covers both: the client link is a phone screen (02 Platform; S18 "(phone)") even though it is English.
- **Lint scope is phone only** (ticket Scope). Office components use `t()` with English only, and code review checks that.

### Step 1: Core helper, `app/src/lib/messages/` (shared by browser and server; EZD-000 Folder layout "src/lib/ … t() from EZD-026")
- `types.ts`:
  - `type Language = 'en' | 'es'` (03 `user`).
  - `type Surface = 'office' | 'field' | 'client' | 'dev'`. `dev` is for dev test pages only.
  - `type Message = string | { one: string; other: string }`.
  - `type MessageParams = Record<string, string | number>`.
- `language.ts`:
  - **`languageFor(surface, user: { language: Language }): Language`.**
    - `office` and `client` return `'en'` (R17).
    - `field` and `dev` return `user.language`.
    - There is no null branch. EZD-005a makes `app_user.language` `not null default 'en'` with `check (language in ('en', 'es'))` (`supabase/migrations/20261019165202_create_app_user.sql` line 9; vault/plans/EZD-005a.md line 79), so a user record always has a language (phase 0 plan review, finding 26). New users default to English (Q-0029 (a)), which is that column default.
  - **`NAMESPACES: Record<Surface, readonly string[] | 'all-but-dev'>`**:

    | Surface | Namespaces |
    | --- | --- |
    | `office` | every namespace except `dev` |
    | `field` | `common`, `field`, `error` |
    | `client` | `common`, `client`, `error` |
    | `dev` | `common`, `field`, `error`, `dev` |

  - **`SPANISH_NAMESPACES = ['common', 'field', 'error', 'dev'] as const`.**
  - **Key format** (*planner's choice*): `^(common|field|client|office|error|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$`. The `error` namespace holds the route error body's `message_key` values, for example EZD-004b's `error.db_unavailable`. Errors show on phone screens, so `error` needs Spanish. These six namespaces cover every later key planned so far; EZD-024's alert keys are `office.alert.*` (vault/plans/EZD-024.md; phase 0 plan review, finding 21), so A5 keeps exactly this list.
- `t.ts`:
  - **Signature.** `createT<K extends string>(language, messages: Readonly<Record<K, Message>>): T<K>`, where `T<K> = ((key: K, params?: MessageParams) => string) & { has(key: string): key is K; language: Language }`.
  - **Lookup** uses `Object.hasOwn`. A missing key throws `MissingMessageError`, whose message contains the key and the language.
  - **Placeholders.** `{name}` with a name matching `[A-Za-z_][A-Za-z0-9_]*`. Every occurrence is replaced with `String(params[name])`. A placeholder with no matching param throws `MissingMessageParamError`, whose message contains the name.
  - **Numbers are inserted as given**, with no locale grouping or decimal comma (*planner's choice*). This keeps dimensions and counts identical across languages, which is the concern behind S16's "Numbers differ" warning.
  - **Plural messages** `{ one, other }`:
    - They need a numeric `params.count`; without it they throw `MissingMessageParamError`.
    - The form is chosen by `new Intl.PluralRules(language).select(count)`. `one` gives the `one` form. Every other category gives the `other` form, including Spanish `many` (exact millions, CLDR 42+).
    - One `PluralRules` instance is cached per language.
  - **`t.has(key)`** lets the browser narrow a server `message_key` string.
  - **Output** is a plain string. React escapes it.
- `MessagesProvider.tsx` (`'use client'`):
  - `MessagesProvider({ language, messages, children })` renders `<div lang={language} style={{ display: 'contents' }}>{children}</div>` inside a context holding `createT(language, messages)`.
  - The `lang` attribute is there for screen readers (11 Accessibility). `display: contents` keeps layout unchanged (*planner's choice*).
  - `useT(): T<MessageKey>` throws an `Error` whose message contains `MessagesProvider` when called outside a provider.
  - Convention: the hook's result is always named `t`. The lint key check (Step 4) relies on that name.
- `index.ts` re-exports the browser-safe parts.
- **No new dependency.** React context and `Intl.PluralRules` are built in.

### Step 2: Catalogs, `app/src/server/messages/`
They sit in the server-only folder so they never enter a client bundle. 11 Budgets allow 200 KB each for the field pack and the client link.

- **`catalogs/en.ts`**: `export const en = { … } as const satisfies Record<string, Message>`, and `export type MessageKey = keyof typeof en`.
- **`catalogs/es.ts`**: `export const es = { … } as const satisfies Record<SpanishKey, Message>`, where `SpanishKey = Extract<MessageKey, \`${'common' | 'field' | 'error' | 'dev'}.${string}\`>`. Because of `satisfies`, a missing or extra Spanish key fails `typecheck`.
- **Content in this ticket** is four keys:
  - Three dev keys of developer text for a dev page. They are not wording users see; they stand on the same footing as EZD-010c's specimen text (KNOWN-LIMITS 5).
  - `error.db_unavailable`, the `message_key` of EZD-004b's health route (`app/src/app/api/health/route.ts` line 13). EZD-004b builds before this ticket (phase 0 build order), and a route that returns a `message_key` must find it in the catalog (Step 5 rule; A11; phase 0 plan review, finding 7). This is wording users see: its English is Q-0086 (a) verbatim, and its Spanish is written by this ticket's builder in the same commit (Q-0030 (a)).
  - Other real strings arrive with the tickets that show them: EZD-011, EZD-012 and EZD-014 depend on this ticket (Q-0028), and EZD-015 does too. EZD-009 adds `error.not_authorized` and `error.job_not_found` under the same rule (Q-0086).

| Key | en | es |
| --- | --- | --- |
| `dev.messages.sample` | `Sample message` | `Mensaje de ejemplo` |
| `dev.messages.greeting` | `Hello, {name}` | `Hola, {name}` |
| `dev.messages.items` | `{ one: '{count} item', other: '{count} items' }` | `{ one: '{count} elemento', other: '{count} elementos' }` |
| `error.db_unavailable` | `Can't reach the database. Try again in a minute.` (Q-0086 (a), verbatim) | Written by this ticket's builder in the same commit (Q-0030 (a)); non-empty, never English (R24 #40); checked by a Spanish-speaking crew member at the field checks and in Phase 15 (Q-0030 (a)) |

- **`catalog.ts`**:
  - `catalogFor(surface, language)` returns a new frozen object with only that surface's namespaces, taken from `en` or `es`.
  - `catalogFor('office', 'es')` and `catalogFor('client', 'es')` throw, because both surfaces are English-only in v1 (R17).
  - It re-exports the types `MessageKey` and `SpanishKey`. Browser code may `import type` them, since type imports are erased.
- **`get-t.ts`**: `getT(surface, language)` returns `createT(language, catalogFor(surface, language))`. It is for server components, which cannot use context.
- **Data flow**: a server layout or page resolves the language, calls `catalogFor`, and passes the result to `<MessagesProvider>`. Client components then call `useT()`. Only one language's subset is sent to the browser.

### Step 3: Test-page component, `app/src/app/dev/messages/`
- **`SampleText.tsx`** (`'use client'`) renders three spans through `useT()`:
  - `<span data-testid="sample">{t('dev.messages.sample')}</span>`
  - `<span data-testid="items-1">{t('dev.messages.items', { count: 1 })}</span>`
  - `<span data-testid="items-2">{t('dev.messages.items', { count: 2 })}</span>`
- **`MessagesSample.tsx`** (server component). `MessagesSample({ user }: { user: { language: Language } })` renders two sections:
  - `<section data-testid="field-sample">`: `MessagesProvider` with `language = languageFor('dev', user)` and `messages = catalogFor('dev', language)`, around `<SampleText />`.
  - `<section data-testid="office-sample">`: the same with `languageFor('office', user)`.
  - The page has no other text.
- The route `page.tsx` that reads the signed-in user's language is EZD-026b's. This ticket adds no route, so nothing new is served.

### Step 4: Lint rule `ezdraft/no-literal-ui-string` (local plugin, no new dependency)
- **Files.**
  - `eslint-rules/no-literal-ui-string.mjs`: the rule.
  - `eslint-rules/index.mjs`: the plugin `{ meta: { name: 'ezdraft' }, rules: { 'no-literal-ui-string': rule } }`.
  - `eslint-rules/` is a new root folder for the repo's own lint rules. EZD-020 and EZD-133 can add theirs there.
- **What the rule reports.**
  1. A `JSXText` containing a Unicode letter (`/\p{L}/u`). Whitespace, digits and punctuation alone (`·`, `×`, `/`, `—`, `1/64`) are allowed.
  2. A JSX child `JSXExpressionContainer` holding a *text expression*. A text expression is:
     - a string `Literal` with a letter;
     - a `TemplateLiteral` with a letter in any quasi;
     - a `ConditionalExpression` with a text-expression branch;
     - a `LogicalExpression` with a text-expression operand, checked recursively.
  3. A `JSXAttribute` whose value is a string literal with a letter, or a container holding a text expression, and whose name matches either of these patterns:
     - `^(alt|title|placeholder|label|text|message|caption|heading|description|hint|tooltip|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$`
     - `[a-z0-9](Label|Title|Text|Message|Placeholder|Caption|Heading|Description|Hint|Tooltip)$`

     Other attributes are never reported: `className`, `id`, `href`, `src`, `type`, `role`, `variant`, `data-*`, `key`, `lang`.
  4. When the option `allowedKeyPrefixes` is set: a call `t('<literal>')` (the callee is the identifier `t`; a no-substitution template literal counts as a literal) whose key starts with none of the prefixes.
- The first argument of `t(...)` is never reported as a literal string.
- Message ids: `literal` and `keyNamespace`.
- **`eslint.config.mjs`** (EZD-001's file, extended) gets three blocks. Each has `ignores: ['**/*.test.*', '**/*.spec.*']` and severity `error`. Escape the parentheses in the globs if the pinned ESLint needs it; L1 proves the globs match.

  | Block | Files | `allowedKeyPrefixes` |
  | --- | --- | --- |
  | Field pack and crew phone screens | `app/src/app/(field)/**/*.{tsx,jsx}`, `app/src/components/field/**/*.{tsx,jsx}`, `app/src/components/phone/**/*.{tsx,jsx}` | `['common.', 'field.', 'error.']` |
  | Client link | `app/src/app/(client)/**/*.{tsx,jsx}`, `app/src/components/client/**/*.{tsx,jsx}` | `['common.', 'client.', 'error.']` |
  | Test page | `app/src/app/dev/messages/**/*.{tsx,jsx}` | `['common.', 'field.', 'error.', 'dev.']` |

- **Folder names** (*planner's choice*, recorded in docs for later tickets):
  - `(field)` and `(client)` are App Router route groups. EZD-020 creates the field pack and client link entry points there, or changes this list in its own commit.
  - EZD-014's phone layout goes in `components/phone/`.
  - EZD-015 adds its state-component folder to the field block.

### Step 5: `docs/architecture.md` (same commit; `###` subheadings only, so EZD-000 T5 holds)
- **`## Folder layout`**:
  - Add `eslint-rules/` to the root list.
  - Add `### Messages and language (t())`, covering:
    - the files of Steps 1–3;
    - surfaces and the language rule (R17; 03 `user`; S15);
    - namespaces per surface, and which need Spanish;
    - key format;
    - placeholder and plural syntax, and that numbers are not locale-formatted;
    - catalogs are server-only and passed through `catalogFor`;
    - the hook result is named `t`;
    - **adding a string**: add the `en` entry, plus the `es` entry in the same commit for Spanish-required namespaces. The ticket's builder writes the Spanish text in that commit, and a Spanish-speaking crew member checks it at the field checks and in Phase 15 (Q-0030 (a));
    - **route error keys**: "a route that returns a `message_key` adds it to `en`, and to `es` when its namespace needs Spanish, in the same commit" (phase 0 plan review, finding 7). A11 checks every literal `message_key` in `app/src`; a key built at run time is checked by review;
    - the phone-surface folders of Step 4;
    - route error `message_key` values live in `error`;
    - shell and office strings use `office.` keys, English only.
- **`## Machine checks`**:
  - Fill in the EZD-000 row "literal interface strings in phone components (EZD-026)" with `ezdraft/no-literal-ui-string` and `scripts/tooling/__tests__/messages-lint.test.mjs`.
  - Add "Spanish catalog complete: typecheck (`satisfies`) + `app/src/server/messages/catalog.test.ts`".
  - Add "every literal route `message_key` in `app/src` is in `en`: `app/src/server/messages/message-keys.test.ts`; keys built at run time: review".
  - Add "office components use t() (English only): review".
  - Add "strings built outside JSX, `.ts` helpers in phone folders, `t` under another name: review".
- **`## Dependencies`**: no new rows.

## Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/lib/messages/types.ts`, `language.ts`, `t.ts`, `MessagesProvider.tsx`, `index.ts` | New | builder | The t() helper (Scope; R17) |
| `app/src/server/messages/catalogs/en.ts`, `catalogs/es.ts` | New | builder | English and Spanish catalogs (Scope) |
| `app/src/server/messages/catalog.ts`, `get-t.ts` | New | builder | Per-surface subsets; server `t` (R17; 11 Budgets) |
| `app/src/app/dev/messages/SampleText.tsx`, `MessagesSample.tsx` | New | builder | Test-page component (Done when) |
| `eslint-rules/no-literal-ui-string.mjs`, `eslint-rules/index.mjs` | New | builder | The lint rule (Scope) |
| `eslint.config.mjs` | Change (extend EZD-001) | builder | Phone-surface blocks (Step 4) |
| `docs/architecture.md` | Change | builder | Step 5 |
| `app/src/lib/messages/t.test.ts`, `language.test.ts`, `MessagesProvider.test.tsx` | New | test-author | A1, A5–A9 |
| `app/src/server/messages/catalog.test.ts` | New | test-author | A2–A4, A8 |
| `app/src/server/messages/message-keys.test.ts` | New | test-author | A11 (route `message_key` literals are in `en`) |
| `app/src/app/dev/messages/MessagesSample.test.tsx` | New | test-author | A10 (Done when) |
| `scripts/tooling/__tests__/messages-lint.test.mjs` | New | test-author | L1–L7 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add case) | test-author | D1 |
| `app/vitest.config.ts` | Not touched (EZD-010b set the `.tsx` transform, V3) | — | `.test.tsx` files |
| `app/src/app/dev/messages/page.tsx`, `app/src/server/messages/request-language.ts` | Not in this ticket | — | EZD-026b |
| `package.json` files, `pnpm-lock.yaml`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No new dependency; files owned by Josh or the orchestrator |

## Data
None. No tables, columns, migrations, RLS policies or `schema_version`. No money fields.

## Tests (written by test-author before any code)
- **A-tests** are Vitest in `@ezdraft/app` (`node` environment, EZD-001). React output uses `renderToStaticMarkup` from `react-dom/server`, as in EZD-010c (`app/src/app/dev/tokens/page.test.tsx`). Imports by relative path (no `@/` alias in Vitest, V2 (6)). Each file has a top-level `describe` whose title starts with its part ID (check C9; V2); node:test titles start with the part ID.
- **L-tests and D1** are `node:test`. L-tests use `new ESLint({ cwd: <repo root> })` with `lintText(code, { filePath })`, so they exercise the real `eslint.config.mjs`. Each probe is a small `.tsx` component, and the files need not exist.
- **Expected values.** Spanish expected values come from this plan's dev catalog (Step 2).
- **What is compared.** Exact strings, rule ids, severities and counts. Message wording is not compared, except for "contains".

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| A1 languageFor | unit | `languageFor(s, { language: l })` for every s in field, dev, office, client and l in en, es | field/en → `en`; field/es → `es`; dev/en → `en`; dev/es → `es`; office/es → `en`; client/es → `en`; office/en → `en`; client/en → `en` | R26 R17; 03 `user` language (en/es); Step 1; EZD-005a migration `create_app_user` line 9 (`language` not null, so no null case) |
| A2 Surface subsets | unit | `Object.keys(catalogFor(surface, lang))` for every allowed pair: `office`/en, `client`/en, `field`/en, `field`/es, `dev`/en, `dev`/es | For each pair, the key set equals exactly the `en` keys whose namespace is in that surface's `NAMESPACES` entry (`office`: every namespace except `dev`), computed from `en` in the test. No fixed totals are asserted for any surface, so later tickets that add keys (EZD-011, EZD-012, EZD-015 rely on this per-namespace equality) do not edit this test. `dev`/en and `dev`/es also contain the 3 keys `dev.messages.greeting`, `dev.messages.items`, `dev.messages.sample` | Step 1 `NAMESPACES`; Step 2 table (the 3 dev keys); phase 0 plan review, finding 8 |
| A3 English-only surfaces | unit | `catalogFor('office','es')`, `catalogFor('client','es')` | Each throws | R26 R17 |
| A4 Spanish catalog complete | unit | `en`, `es` | The `es` key set equals the `en` keys whose namespace is in `SPANISH_NAMESPACES`. Every `es` string, and each `one`/`other` form, is non-empty after trim. Each key is either a string in both catalogs or a plural object with exactly `one` and `other` in both. The `{placeholder}` name sets are equal per key (and per form) | R26 R17 ("buttons and messages included"); R24 #40 ("never English or blanks") |
| A5 Key format | unit | every key of `en` | Matches `^(common\|field\|client\|office\|error\|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$` | Step 1 (planner's choice) |
| A6 createT basics | unit | Fixture `{ 'x.a': 'Hello', 'x.b': 'Hi {name}', 'x.c': '{n} of {n}', 'x.p': { one: '{count} item', other: '{count} items' } }`, language `en` | `t('x.a')` → `Hello`. `t('x.b', { name: 'Ana' })` → `Hi Ana`. `t('x.c', { n: 3 })` → `3 of 3`. `t('x.b')` throws `MissingMessageParamError` (message contains `name`). `t('x.zz' as any)` throws `MissingMessageError` (message contains `x.zz`). `t.has('x.a')` is true; `t.has('nope')`, `t.has('toString')` and `t.has('constructor')` are false. `t.language === 'en'` | Step 1 |
| A7 Plurals and numbers | unit | `en` fixture `x.p` as in A6; `es` fixture `x.p = { one: '{count} elemento', other: '{count} elementos' }` | en: 0 → `0 items`, 1 → `1 item`, 2 → `2 items`. es: 0 → `0 elementos`, 1 → `1 elemento`, 2 → `2 elementos`, 1500 → `1500 elementos`, 1000000 → `1000000 elementos`. No `count` → throws `MissingMessageParamError` | Unicode CLDR cardinal rules (en `one`: i = 1 and v = 0; es `one`: n = 1; es `many` for exact millions falls to `other`, Step 1); no locale number format (Step 1, from S16 "Numbers differ") |
| A8 Types | unit + gate typecheck | `expectTypeOf<keyof typeof es>().toEqualTypeOf<SpanishKey>()`; a `T<MessageKey>` with `// @ts-expect-error` on `t('dev.messages.nope')` inside `expect(() => …).toThrow()` | Compiles; the gate `typecheck` passes (an unused `@ts-expect-error` would fail it) | Step 2 `satisfies`; Scope "One t() helper" |
| A9 Provider and hook | unit | `renderToStaticMarkup(<MessagesProvider language="es" messages={catalogFor('dev','es')}><SampleText /></MessagesProvider>)`, then the same with `en`; `<SampleText />` with no provider | es: contains `lang="es"`, `Mensaje de ejemplo`, `1 elemento`, `2 elementos`. en: contains `lang="en"`, `Sample message`, `1 item`, `2 items`. No provider: throws an Error whose message contains `MessagesProvider` | Step 2 table; Step 1; 11 Accessibility |
| A10 Test-page component (Done when) | unit | `renderToStaticMarkup(<MessagesSample user={{ language: 'es' }} />)`, then with `'en'`. Title `EZD-026d done when: test-page component renders the field section in Spanish and the office section in English for a user record with language es` | es user: the `data-testid="field-sample"` section has `lang="es"`, `Mensaje de ejemplo`, `1 elemento`, `2 elementos`; the `data-testid="office-sample"` section has `lang="en"`, `Sample message`, `1 item`, `2 items`. en user: both sections have `lang="en"` and `Sample message` | Ticket Done when; R26 R17; Step 2 table |
| A11 Route message keys are in the catalog | unit | Every `.ts` / `.tsx` file under `app/src`, excluding `*.test.*` and `*.spec.*`, scanned with `/["']?message_key["']?\s*:\s*(['"\x60])([^'"\x60$]+)\1/g` (a literal key; a key built at run time is not matched and is left to review, Step 5) | At least 1 match, and the matches include `error.db_unavailable` (EZD-004b's health route), so the scan is not empty. Every matched key is an own key of `en` (`Object.hasOwn`); the failure message names the file and the key. `en['error.db_unavailable']` equals `Can't reach the database. Try again in a minute.` exactly. `es['error.db_unavailable']` is non-empty after trim and differs from the English text | Step 5 rule (phase 0 plan review, finding 7); `app/src/app/api/health/route.ts` line 13 and vault/plans/EZD-004b.md T3 (`message_key: 'error.db_unavailable'`); Q-0086 (a) (English, verbatim); Q-0030 (a) and R24 #40 (Spanish written, never English) |
| L1–L7, D1 | node:test | see section 4 of this file (part EZD-026a) | see section 4 | see section 4 (supersedes the earlier rows: adds message ids, the template-literal, run-time-key and test-page probes in L5, the client and test-page files in L6, and the helper and catalog names and part rows in D1) |
| Gate | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-026a` | Exit 0: `typecheck`, `lint`, `test`, `build` pass (and `test:e2e` if present). This is the per-ticket proof, since CI runs only on the phase PR (aad5540) | CLAUDE.md rule 12; `vault/PROCESS.md` |

## Reviewers needed
- **code-reviewer: always.** Confirms the folder names, namespaces and text-prop list, and checks that office components use `t()`.
- **calc-auditor: no.** No calculations.
- **ui-verifier: no.** There is no product screen and no route in this ticket.
- **security-reviewer: no.** No tables, auth, permissions, money, share links or API. Catalogs are server-only by folder.

## Risks
- **Spanish quality (Q-0030 (a)).** The builder writes the Spanish; nobody checks it before the field checks and Phase 15, where a Spanish-speaking crew member reviews it. Until then a clumsy phrase can reach a crew phone. Every later ticket that adds `common.`, `field.` or `error.` keys (EZD-007 under Q-0047 (b), EZD-009, EZD-014, EZD-015) follows the same rule.
  - EZD-011 and EZD-012 add only `office.` keys, which are English only.
- **EZD-007 extends this ticket's types (Q-0047 (b)).** The sign-in and link-confirm pages are bilingual with a device-remembered switch, so EZD-007 adds a `sign_in` surface (namespaces `common`, `error`) and a lint block for its pages (vault/plans/EZD-007.md Step 6). A1, A2 and A3 list their surface pairs explicitly, so they do not change; the Level-1 rule "never … a cookie" (Step 1) still holds for signed-in surfaces.
- **Folder alignment.**
  - EZD-020 must use `(field)` and `(client)`, or change the lint globs in its commit.
  - EZD-015 adds its folder to the field block.
  - Files outside the listed folders are not linted.
- **Lint blind spots.**
  - Not caught: strings built outside JSX, `.ts` helpers, and `t` under another name.
  - An `eslint-disable` comment for this rule is a review fail.
  - These are listed as "review" in Machine checks.
- **Server error keys.** This ticket adds EZD-004b's `error.db_unavailable`. Every later route adds its own keys in the same commit (Step 5 rule), and A11 fails that ticket's gate if a literal key is missing from `en` (for example EZD-009's `error.not_authorized` and `error.job_not_found`, whose English is Q-0086 (a)). Keys built at run time escape A11 and are a review item.
- **Type import from `src/server/`.** EZD-133's future "no server code in browser code" lint must allow `import type`. Otherwise `MessageKey` moves to a generated type file in `src/lib/`.
- **Offline field pack.** The catalog subset travels in the page payload. Phase 14's service-worker cache must keep it with the page.
- **Default language of a new user (Q-0029 (a)).** English, which is EZD-005a's existing `not null default 'en'`; no null case exists and nothing changes here.

## Open questions
None open.

Answered, applied above:
- Q-0030 (answered-josh (a), 2026-10-12): "each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15)". Applied in Depends on, the Step 2 table (`error.db_unavailable` Spanish), the Step 5 "adding a string" rule, A11 and Risks.
- Q-0086 (answered-josh (a), 2026-10-12): "Can't reach the database. Try again in a minute." / "You don't have permission to do that." / "That job no longer exists." This ticket uses the first, for `error.db_unavailable` (Step 2 table; A11). The other two are EZD-009's.

Referenced, not re-asked: Q-0028 (confirmed-josh (c); split applied), Q-0029 (answered-josh (a); EZD-026b), Q-0047 (answered-josh (b); EZD-007 extends the surfaces, Risks), Q-0002 (escalated, deferred; does not block, R26 R17 stands), Q-0013, Q-0021.
