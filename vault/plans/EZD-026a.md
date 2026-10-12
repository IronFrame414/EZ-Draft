# EZD-026a · Message helper: helper, catalogs, lint

Phase: 0 · Planned by: planner · Date: 2026-10-11 (revised 2026-10-12 for Josh's answers to Q-0030 and Q-0086) · Status: planned (Q-0030 and Q-0086 answered-josh (a); Q-0002 is deferred and does not block: R17 stands)

## Ticket (copied from the phase file)
Scope: One t() helper with English and Spanish message catalogs; a lint rule refuses a literal interface string in components of the field pack and phone entry points; the office editor uses the helper with English only. Split from EZD-026 (Q-0028); plan Part A.
Done when: Lint fails on a literal string in a phone-screen component; the test-page component renders the field section in Spanish and the office section in English for a user record with language es.
Depends on: EZD-001, EZD-010 (`tickets.json` `depends_on: ["EZD-001","EZD-010"]`). Also:
- **EZD-000** (through EZD-001), not in the row. This ticket:
  - adds to `docs/architecture.md` under existing `##` headings only (EZD-000 T5);
  - fills EZD-000's Machine checks row "literal interface strings in phone components (EZD-026)";
  - uses EZD-000's route error body, whose `message_key` is a `t()` key (vault/plans/EZD-000.md, Errors and logging).
- **EZD-004: missing from the row (ordering dependency).** Its health route returns `{ "error": { "code": "db_unavailable", "message_key": "error.db_unavailable" } }` (vault/plans/EZD-004.md Step 6, T3). This ticket adds that key to the catalogs (Step 2) and A11 finds the route's literal. The phase 0 build order (orchestrator, plan-review revision) puts EZD-004 before this ticket, so the row needs no change for the build to work; the orchestrator may add it to `depends_on`.
- **EZD-001**: `eslint.config.mjs` (extended here), `app/vitest.config.ts`, and `scripts/tooling/__tests__/` (node:test, run by the root `test` glob) (vault/plans/EZD-001.md Steps 2–3).
- **EZD-010**: the JSX transform for `.test.tsx` files (vault/plans/EZD-010.md, Files row `app/vitest.config.ts`) and the dev test-page folder `app/src/app/dev/<name>/` (EZD-010 Step 5). The route page that uses it is EZD-026b's.
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
  - Build answers (Josh): Q-0030 (a) (who writes the Spanish), Q-0086 (a) (English of the route error keys), Q-0029 (a) (new users default to English; EZD-026b), Q-0047 (a) (sign-in page language switch; EZD-007, see Risks). Q-0001, Q-0003, Q-0004, Q-0014 to Q-0019 do not touch language.
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
- Plans: `vault/plans/EZD-000.md`, `EZD-001.md`, `EZD-004.md` (`message_key` `error.db_unavailable`), `EZD-010.md` (dev pages, `renderToStaticMarkup` tests), `EZD-022.md`. This plan extends their files and replaces none.
- Process: `vault/PROCESS.md`, `vault/KNOWN-LIMITS.md` (item 5), `vault/tickets/README.md`, `CLAUDE.md` (rules 4, 6, 8, 11), `.claude/hooks/guard-paths.mjs`, `scripts/gate.mjs`.
- Mockup: none (`tickets.json` `mockups: []`; no product screen). The Studio boards hold no Spanish interface text except the S15 toggle "English / Español".

## Approach

Choices that no source makes are marked *planner's choice (CLAUDE.md rule 4)*. The code-reviewer confirms them at plan review.

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
    - There is no null branch. EZD-005 makes `app_user.language` `not null default 'en'` with `check (language in ('en','es'))` (vault/plans/EZD-005.md Data), so a user record always has a language (phase 0 plan review, finding 26). New users default to English (Q-0029 (a)), which is that column default.
  - **`NAMESPACES: Record<Surface, readonly string[] | 'all-but-dev'>`**:

    | Surface | Namespaces |
    | --- | --- |
    | `office` | every namespace except `dev` |
    | `field` | `common`, `field`, `error` |
    | `client` | `common`, `client`, `error` |
    | `dev` | `common`, `field`, `error`, `dev` |

  - **`SPANISH_NAMESPACES = ['common', 'field', 'error', 'dev'] as const`.**
  - **Key format** (*planner's choice*): `^(common|field|client|office|error|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$`. The `error` namespace holds the route error body's `message_key` values, for example EZD-004's `error.db_unavailable`. Errors show on phone screens, so `error` needs Spanish. These six namespaces cover every later key planned so far; EZD-024's alert keys are `office.alert.*` (vault/plans/EZD-024.md; phase 0 plan review, finding 21), so A5 keeps exactly this list.
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
  - Three dev keys of developer text for a dev page. They are not wording users see; they stand on the same footing as EZD-010's specimen text (KNOWN-LIMITS 5).
  - `error.db_unavailable`, the `message_key` of EZD-004's health route (vault/plans/EZD-004.md Step 6). EZD-004 builds before this ticket (phase 0 build order), and a route that returns a `message_key` must find it in the catalog (Step 5 rule; A11; phase 0 plan review, finding 7). This is wording users see: its English is Q-0086 (a) verbatim, and its Spanish is written by this ticket's builder in the same commit (Q-0030 (a)).
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
| `app/vitest.config.ts` | Change only if EZD-010 has not set a JSX transform | test-author | `.test.tsx` files |
| `app/src/app/dev/messages/page.tsx`, `app/src/server/messages/request-language.ts` | Not in this ticket | — | EZD-026b |
| `package.json` files, `pnpm-lock.yaml`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No new dependency; files owned by Josh or the orchestrator |

## Data
None. No tables, columns, migrations, RLS policies or `schema_version`. No money fields.

## Tests (written by test-author before any code)
- **A-tests** are Vitest in `@ezdraft/app` (`node` environment, EZD-001). React output uses `renderToStaticMarkup` from `react-dom/server`, as in EZD-010.
- **L-tests and D1** are `node:test`. L-tests use `new ESLint({ cwd: <repo root> })` with `lintText(code, { filePath })`, so they exercise the real `eslint.config.mjs`. Each probe is a small `.tsx` component, and the files need not exist.
- **Expected values.** Spanish expected values come from this plan's dev catalog (Step 2).
- **What is compared.** Exact strings, rule ids, severities and counts. Message wording is not compared, except for "contains".

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| A1 languageFor | unit | `languageFor(s, { language: l })` for every s in field, dev, office, client and l in en, es | field/en → `en`; field/es → `es`; dev/en → `en`; dev/es → `es`; office/es → `en`; client/es → `en`; office/en → `en`; client/en → `en` | R26 R17; 03 `user` language (en/es); Step 1; EZD-005 Data (`language` not null, so no null case) |
| A2 Surface subsets | unit | `Object.keys(catalogFor(surface, lang))` for every allowed pair: `office`/en, `client`/en, `field`/en, `field`/es, `dev`/en, `dev`/es | For each pair, the key set equals exactly the `en` keys whose namespace is in that surface's `NAMESPACES` entry (`office`: every namespace except `dev`), computed from `en` in the test. No fixed totals are asserted for any surface, so later tickets that add keys (EZD-011, EZD-012, EZD-015 rely on this per-namespace equality) do not edit this test. `dev`/en and `dev`/es also contain the 3 keys `dev.messages.greeting`, `dev.messages.items`, `dev.messages.sample` | Step 1 `NAMESPACES`; Step 2 table (the 3 dev keys); phase 0 plan review, finding 8 |
| A3 English-only surfaces | unit | `catalogFor('office','es')`, `catalogFor('client','es')` | Each throws | R26 R17 |
| A4 Spanish catalog complete | unit | `en`, `es` | The `es` key set equals the `en` keys whose namespace is in `SPANISH_NAMESPACES`. Every `es` string, and each `one`/`other` form, is non-empty after trim. Each key is either a string in both catalogs or a plural object with exactly `one` and `other` in both. The `{placeholder}` name sets are equal per key (and per form) | R26 R17 ("buttons and messages included"); R24 #40 ("never English or blanks") |
| A5 Key format | unit | every key of `en` | Matches `^(common\|field\|client\|office\|error\|dev)\.[a-z0-9_]+(\.[a-z0-9_]+)*$` | Step 1 (planner's choice) |
| A6 createT basics | unit | Fixture `{ 'x.a': 'Hello', 'x.b': 'Hi {name}', 'x.c': '{n} of {n}', 'x.p': { one: '{count} item', other: '{count} items' } }`, language `en` | `t('x.a')` → `Hello`. `t('x.b', { name: 'Ana' })` → `Hi Ana`. `t('x.c', { n: 3 })` → `3 of 3`. `t('x.b')` throws `MissingMessageParamError` (message contains `name`). `t('x.zz' as any)` throws `MissingMessageError` (message contains `x.zz`). `t.has('x.a')` is true; `t.has('nope')`, `t.has('toString')` and `t.has('constructor')` are false. `t.language === 'en'` | Step 1 |
| A7 Plurals and numbers | unit | `en` fixture `x.p` as in A6; `es` fixture `x.p = { one: '{count} elemento', other: '{count} elementos' }` | en: 0 → `0 items`, 1 → `1 item`, 2 → `2 items`. es: 0 → `0 elementos`, 1 → `1 elemento`, 2 → `2 elementos`, 1500 → `1500 elementos`, 1000000 → `1000000 elementos`. No `count` → throws `MissingMessageParamError` | Unicode CLDR cardinal rules (en `one`: i = 1 and v = 0; es `one`: n = 1; es `many` for exact millions falls to `other`, Step 1); no locale number format (Step 1, from S16 "Numbers differ") |
| A8 Types | unit + gate typecheck | `expectTypeOf<keyof typeof es>().toEqualTypeOf<SpanishKey>()`; a `T<MessageKey>` with `// @ts-expect-error` on `t('dev.messages.nope')` inside `expect(() => …).toThrow()` | Compiles; the gate `typecheck` passes (an unused `@ts-expect-error` would fail it) | Step 2 `satisfies`; Scope "One t() helper" |
| A9 Provider and hook | unit | `renderToStaticMarkup(<MessagesProvider language="es" messages={catalogFor('dev','es')}><SampleText /></MessagesProvider>)`, then the same with `en`; `<SampleText />` with no provider | es: contains `lang="es"`, `Mensaje de ejemplo`, `1 elemento`, `2 elementos`. en: contains `lang="en"`, `Sample message`, `1 item`, `2 items`. No provider: throws an Error whose message contains `MessagesProvider` | Step 2 table; Step 1; 11 Accessibility |
| A10 Test-page component (Done when) | unit | `renderToStaticMarkup(<MessagesSample user={{ language: 'es' }} />)`, then with `'en'`. Title `EZD-026a done when: test-page component renders the field section in Spanish and the office section in English for a user record with language es` | es user: the `data-testid="field-sample"` section has `lang="es"`, `Mensaje de ejemplo`, `1 elemento`, `2 elementos`; the `data-testid="office-sample"` section has `lang="en"`, `Sample message`, `1 item`, `2 items`. en user: both sections have `lang="en"` and `Sample message` | Ticket Done when; R26 R17; Step 2 table |
| A11 Route message keys are in the catalog | unit | Every `.ts` / `.tsx` file under `app/src`, excluding `*.test.*` and `*.spec.*`, scanned with `/["']?message_key["']?\s*:\s*(['"\x60])([^'"\x60$]+)\1/g` (a literal key; a key built at run time is not matched and is left to review, Step 5) | At least 1 match, and the matches include `error.db_unavailable` (EZD-004's health route), so the scan is not empty. Every matched key is an own key of `en` (`Object.hasOwn`); the failure message names the file and the key. `en['error.db_unavailable']` equals `Can't reach the database. Try again in a minute.` exactly. `es['error.db_unavailable']` is non-empty after trim and differs from the English text | Step 5 rule (phase 0 plan review, finding 7); vault/plans/EZD-004.md Step 6 and T3 (`message_key: 'error.db_unavailable'`); Q-0086 (a) (English, verbatim); Q-0030 (a) and R24 #40 (Spanish written, never English) |
| L1 Literal in a phone component fails (Done when) | unit (node:test) | `export default function P(){ return <button>Save</button>; }` linted as `app/src/app/(field)/x/page.tsx`, `app/src/components/field/X.tsx`, `app/src/components/phone/X.tsx`, `app/src/app/(client)/x/page.tsx`, `app/src/components/client/X.tsx`. Title `EZD-026a done when: lint fails on a literal string in a phone-screen component` | Each has ≥ 1 message with `ruleId === 'ezdraft/no-literal-ui-string'` and `severity === 2` | Ticket Done when; 11 rule 7; Step 4 globs |
| L2 Office not in scope | unit | Same code as `app/src/components/shell/Header.tsx` and `app/src/app/page.tsx` | 0 messages from the rule | Ticket Scope (lint covers field pack and phone entry points) |
| L3 Allowed forms | unit | Field file: `<button>{t('field.x')}</button>`; `<span>{' · '}</span>`; `<span>12</span>`; `<div className="a" data-x="Yes" role="dialog" id="b" />`; `<Button variant="primary" type="button" />`; `<a href="/x" />` | 0 messages from the rule | Step 4 |
| L4 Reported forms | unit | Field file, one probe each: `<input placeholder="Name" />`; `<img alt="Plan" />`; `<b title="Hi" />`; `<X aria-label="Close" />`; `<Dialog confirmLabel="OK" />`; `<Toast message={'Saved'} />`; `<p>{'Saved'}</p>`; ``<p>{`Saved ${n}`}</p>``; `<p>{ok ? 'Yes' : 'No'}</p>`; `<p>{err && 'Failed'}</p>`; `<p>Guardar</p>`; `<p>ñ</p>` | Each has ≥ 1 message from the rule, severity 2 | Step 4 rules 1–3; R26 R17 "buttons and messages included" |
| L5 Key namespaces | unit | Field file: `t('office.header.share')`, `t('client.x')`, `t('field.x')`, `t('common.x')`, `t('error.x')`. Client file: `t('field.x')`, `t('client.x')` | Field: the first two are reported, the other three are not. Client: `t('field.x')` is reported, `t('client.x')` is not | Step 4 rule 4; Step 1 `NAMESPACES`; R26 R17; R24 #40 |
| L6 Test files exempt | unit | L1 code as `app/src/app/(field)/x/page.test.tsx` and `app/src/components/field/X.spec.tsx` | 0 messages from the rule | Step 4 `ignores` |
| L7 Test page clean | unit | `lintFiles(['app/src/app/dev/messages'])` | 0 errors in total | Step 3; Step 4 dev block |
| D1 Docs updated | unit (node:test) | `docs/architecture.md` | Still exactly EZD-000's 13 `##` headings. Has `### Messages and language (t())`. Contains `ezdraft/no-literal-ui-string`, `(field)`, `(client)`, `components/phone`, `SPANISH_NAMESPACES`. The Machine checks table has a row naming `messages-lint.test.mjs`. `node scripts/conventions/check.mjs .` exits 0 | Step 5; EZD-000 T5 and C1 |
| Gate | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-026a` | Exit 0: `typecheck`, `lint`, `test`, `build` pass (and `test:e2e` if present). This is the per-ticket proof, since CI runs only on the phase PR (aad5540) | CLAUDE.md rule 9; `vault/PROCESS.md` |

## Reviewers needed
- **code-reviewer: always.** Confirms the folder names, namespaces and text-prop list, and checks that office components use `t()`.
- **calc-auditor: no.** No calculations.
- **ui-verifier: no.** There is no product screen and no route in this ticket.
- **security-reviewer: no.** No tables, auth, permissions, money, share links or API. Catalogs are server-only by folder.

## Risks
- **Spanish quality (Q-0030 (a)).** The builder writes the Spanish; nobody checks it before the field checks and Phase 15, where a Spanish-speaking crew member reviews it. Until then a clumsy phrase can reach a crew phone. Every later ticket that adds `common.`, `field.` or `error.` keys (EZD-007 under Q-0047 (a), EZD-009, EZD-014, EZD-015) follows the same rule.
  - EZD-011 and EZD-012 add only `office.` keys, which are English only.
- **EZD-007 extends this ticket's types (Q-0047 (a)).** The sign-in and link-confirm pages are bilingual with a device-remembered switch, so EZD-007 adds a `sign_in` surface (namespaces `common`, `error`) and a lint block for its pages (vault/plans/EZD-007.md Step 6). A1, A2 and A3 list their surface pairs explicitly, so they do not change; the Level-1 rule "never … a cookie" (Step 1) still holds for signed-in surfaces.
- **Folder alignment.**
  - EZD-020 must use `(field)` and `(client)`, or change the lint globs in its commit.
  - EZD-015 adds its folder to the field block.
  - Files outside the listed folders are not linted.
- **Lint blind spots.**
  - Not caught: strings built outside JSX, `.ts` helpers, and `t` under another name.
  - An `eslint-disable` comment for this rule is a review fail.
  - These are listed as "review" in Machine checks.
- **Server error keys.** This ticket adds EZD-004's `error.db_unavailable`. Every later route adds its own keys in the same commit (Step 5 rule), and A11 fails that ticket's gate if a literal key is missing from `en` (for example EZD-009's `error.not_authorized` and `error.job_not_found`, whose English is Q-0086 (a)). Keys built at run time escape A11 and are a review item.
- **Type import from `src/server/`.** EZD-133's future "no server code in browser code" lint must allow `import type`. Otherwise `MessageKey` moves to a generated type file in `src/lib/`.
- **Offline field pack.** The catalog subset travels in the page payload. Phase 14's service-worker cache must keep it with the page.
- **Default language of a new user (Q-0029 (a)).** English, which is EZD-005's existing `not null default 'en'`; no null case exists and nothing changes here.

## Open questions
None open.

Answered, applied above:
- Q-0030 (answered-josh (a), 2026-10-12): "each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15)". Applied in Depends on, the Step 2 table (`error.db_unavailable` Spanish), the Step 5 "adding a string" rule, A11 and Risks.
- Q-0086 (answered-josh (a), 2026-10-12): "Can't reach the database. Try again in a minute." / "You don't have permission to do that." / "That job no longer exists." This ticket uses the first, for `error.db_unavailable` (Step 2 table; A11). The other two are EZD-009's.

Referenced, not re-asked: Q-0028 (answered-agent; split applied), Q-0029 (answered-josh (a); EZD-026b), Q-0047 (answered-josh (a); EZD-007 extends the surfaces, Risks), Q-0002 (escalated, deferred; does not block, R26 R17 stands), Q-0013, Q-0021.
