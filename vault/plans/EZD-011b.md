# EZD-011b · Shell: editor header content and labels

- **ACs:** AC-EZD-011b-1, AC-EZD-011b-2, AC-EZD-011b-3, AC-EZD-011b-4 (`vault/spec/acceptance-criteria.md` lines 62–65)
- **Complexity:** medium (section 8)
- **User-visible result:** nothing on screen yet; the editor header (wordmark, project name, view tabs and the places for Share, Export and Issue set) exists as one component, shown on `/dev/header` by EZD-011c.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned; re-validated vs EZD-011a 529269c

Short forms: **P11** = `vault/plans/EZD-011.md` (base plan; its Split proposal Part EZD-011b, findings V1–V14 and Steps 3, 4, 6, 8 are this part's source, Q-0238); **04** = `vault/spec/sections/04-app-shell-and-global-ui.md`; **S03** = `vault/mockups/html/project/S03Plan.dc.html` `<header>` (nearest Studio board, tickets README rule 5); **11A** = EZD-011a plan section 3.

## 1. What to build

Ticket row (phase-00.md line 33):
- Scope: Plan vault/plans/EZD-011.md Steps 3, 4 and 6 and Step 8's part-b docs lines: Wordmark, EditorHeader (memo; wordmark, project name + chevron, subtitle, Plan/3D/Sheets/Render tabs, review pill, Share, Export, Issue set slots), editor-views.ts, the office.header.* keys in en.ts. Split from EZD-011 (Q-0238); plan Part EZD-011b.
- Done when: EditorHeader shows the wordmark, the project name with its chevron, the subtitle, the Plan / 3D / Sheets / Render tabs in that order and the four slots in order; only the active tab is marked current; an empty slot renders nothing; every label comes from t() with an office.header.* key.
- Depends on: EZD-011a, EZD-010b, EZD-026c, EZD-026d, EZD-004a, EZD-004b.
- Spec ref: App shell · Header card.

Steps (builder):
1. **`editor-views.ts`** (P11 Step 4 last block): `EDITOR_VIEWS`, `EditorView`, `VIEW_LABEL_KEYS` (section 3). `MessageKey` is a type-only import from `app/src/server/messages/catalog.ts`, the way `app/src/lib/messages/MessagesProvider.tsx` line 5 imports it, so no server code enters the client bundle (docs/architecture.md Messages and language).
2. **`Wordmark.tsx` + `Wordmark.module.css`** (P11 Step 3): `'use client'` (it calls `useT()`); a `next/link` `Link` to the `href` prop holding two spans from keys `office.header.wordmark_ez` / `office.header.wordmark_draft`. CSS from S03 wordmark `<div>`: `.wordmark` `display: flex; align-items: baseline; gap: 1px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; color: var(--ez-ink); text-decoration: none`; `.accent` `color: var(--ez-cobalt)` (S03 `oklch(0.55 0.17 262)` = 04 cobalt). No extra `aria-label` (visible text is the name; extra text would be new wording, CLAUDE.md rule 3). The href is a prop because no source fixes the Projects route yet (P11 Step 3, *planner's choice*).
3. **`EditorHeader.tsx` + `EditorHeader.module.css`** (P11 Step 4): `'use client'`, `React.memo`, renders its children inside 11A's `HeaderCard` in 04 Header card's left-to-right order:
   1. `<Wordmark href={projectsHref} />`;
   2. divider `<span class=divider aria-hidden="true">` (1 × 24 px, `background: var(--ez-border)`; S03);
   3. title block `<div class=titleBlock>` (flex column, `gap: 1px`, `min-width: 0`; S03): project name, then subtitle;
      - with `onProjectMenu`: `<button type="button" class=name title={projectName}>` holding `<span class=nameText>{projectName}</span>` and `<Icon name="expand_more" size={18} />`; click calls `onProjectMenu`. Without it: `<span class=name title={projectName}><span class=nameText>{projectName}</span></span>`, no chevron, no button (a chevron with nothing behind it is a dead control; EZD-128 passes the handler, P11 Step 4);
      - subtitle `<span class=subtitle>` only when at least one part remains after dropping `null`, `undefined`, booleans and `''`; parts joined by `<span aria-hidden="true"> · </span>` (space, U+00B7, space; 04 "Client · version · save state"; S03). The separator has no letter, so it stays a literal (EZD-026a Step 4, P11 Step 6);
   4. `<nav class=views aria-label={t('office.header.views')}>`: one `<button type="button" class=tab>` per entry of `views` (default `EDITOR_VIEWS`, a module constant so `memo` holds), always in `EDITOR_VIEWS` order; label `t(VIEW_LABEL_KEYS[view])`; the tab equal to `activeView` adds class `active` and `aria-current="page"` (S03 `aria-current`); other tabs have no `aria-current`. Clicking a non-active tab calls `onViewChange(view)`; clicking the active tab calls nothing (P11 Step 4, *planner's choice*; browser-tested in EZD-011c H14). If `activeView` is not in `views`, no tab is current and nothing throws (*planner's choice*);
   5. slots `reviewPill`, `share`, `export` (destructured as `export: exportSlot`, V9), `issueSet`, in that order, each rendered as given with no wrapper, so an empty slot renders nothing (04 order; "Hidden when N = 0", "Hidden without *Issue permit sets*…" are the slot owners'; Q-0214; R24 "Controls a user lacks are hidden").
   - CSS (single-class rule blocks, so tests read `.tab` and `.active` blocks): `.divider` `flex: none; width: 1px; height: 24px; background: var(--ez-border)`; `.titleBlock` `display: flex; flex-direction: column; gap: 1px; min-width: 0`; `.name` `display: flex; align-items: center; gap: 4px; min-width: 0; padding: 0; border: 0; background: none; font: 600 15px var(--ez-font-sans); color: var(--ez-ink)`, plus `cursor: pointer` on `button.name`, and the chevron `.name svg { flex: none; color: var(--ez-slate-500) }` (S03 `.ms` 18 px `#5e6672`; `Icon` fills `currentColor`); `.nameText`, `.subtitle` `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (P11 Step 4, *planner's choice*); `.subtitle` `font-size: 12px; color: var(--ez-slate-500)`; `.views` `flex: 1; display: flex; justify-content: center; gap: 4px; align-self: stretch`; `.tab` `display: flex; align-items: center; padding: 0 14px; color: var(--ez-slate-500); font-size: 14px; font-family: inherit; background: none; border: 0; cursor: pointer` (S03 `.ht`); `.active` `font-weight: 600; color: var(--ez-cobalt-text); box-shadow: inset 0 -2px 0 var(--ez-cobalt)` (04 Header card "cobalt text and a 2 px inset bottom border"; P11 Level-1 table: spec cobalt text over the board's `oklch(0.5 …)`). Plain px for sizes and gaps: 04 defines no spacing tokens (V2; lesson L-013); colors use `var(--ez-*)` only (C10). All tokens named exist in `app/src/styles/tokens.css` (EZD-010a).
4. **`en.ts`**: append the 10 keys of section 6's table (P11 Step 6). No `es` entry: `office` is not in `SPANISH_NAMESPACES` (R26 R17; V4). The last three are for slot fillers (EZD-011c dev page; later EZD-1201, EZD-721, EZD-716 reuse them). "N to review" is EZD-127's.
5. **`index.ts`**: append named re-exports `EditorHeader`, `Wordmark`, `EDITOR_VIEWS`, `VIEW_LABEL_KEYS` and `export type { EditorView, EditorHeaderProps }`; keep 11A's `HeaderCard`, `HeaderButton`.
6. **`docs/architecture.md`**: append to 11A's `### Shell header (EZD-011)` (P11 Step 8 part-b bullets): `EditorHeaderProps` and the slot order; board positions reserved for later tickets (presence avatars before the pill, S06; Stop editing between pill and Share, S21; field-pack chip between title block and tabs, S22; each adds its own optional prop); slot owners hide with `can()` and an empty slot renders nothing; `EditorView` / `EDITOR_VIEWS` is the one view type (EZD-120b imports it); header strings are `office.header.*` keys; `EditorHeader` is `memo`, so callers pass stable callbacks (`useCallback`) and no per-frame props. No Dependencies row (`next/link` is part of `next`); no new machine check ("Office components use t(): review" exists).

| Path | New / change | Why |
| --- | --- | --- |
| `app/src/components/shell/editor-views.ts` | New | Step 1 |
| `app/src/components/shell/Wordmark.tsx`, `Wordmark.module.css` | New | Step 2 |
| `app/src/components/shell/EditorHeader.tsx`, `EditorHeader.module.css` | New | Step 3 |
| `app/src/components/shell/index.ts` | Change (11A's file) | Step 5 |
| `app/src/server/messages/catalogs/en.ts` | Change | Step 4 |
| `docs/architecture.md` | Change | Step 6 |
| `app/src/components/shell/EditorHeader.test.tsx` | New (test-author) | H1–H6, H17 |
| `app/src/components/shell/shell-css.test.ts` | Change (test-author; 11A's file, new top-level `describe`) | H7 part b |
| `app/src/components/shell/header-messages.test.ts` | New (test-author) | H9 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (test-author) | H15 part b |
| `es.ts`, `catalog.test.ts`, `tokens.*`, `package.json` files, lockfile | Not touched | V4: `catalog.test.ts` derives keys from `en`; no token, no package |

Every path checked against `.claude/hooks/guard-paths.mjs`: builder paths are not tests, `vault/` or `scripts/`; test-author paths match its `isTest` pattern (lesson L-002).

Data: none. No table, column, migration, RLS, `schema_version` or money field (P11 Data). The header shows only what its caller passes.

## 2. Sources
- 04 `**Frame and visual system (Studio)**` (colors cobalt, cobalt text, ink, slate 500, border; header 60 px, margin 16) and `**Header card (left to right)**` table (order, tab names, subtitle "Client · version · save state", pill and Issue set hiding) and the Round 24 paragraph (Stop editing, version label: later tickets).
- 04 opening paragraph: Plan, 3D, Sheets, Render "are tabs of it, not separate pages" (tabs are buttons, P11 Step 4).
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0214 (controls hidden, not greyed: empty slots), Q-0026 (a) (oklch tokens as written), Q-0055 (a) and Q-0098 (icon-only header buttons: EZD-014, not here), Q-0037 (b) (pill amber: EZD-127, not here). R26 R17 (`13b-round-26.md`: one message helper; office English only). R24 "Controls a user lacks are hidden" (`13a-rounds-24-25.md`). Q-0238 (this split; QUESTIONS.md line 247).
- 11 Performance: Budgets "Switch Plan / 3D / Sheets / Render within 150 ms"; rule 4 (no React render per pointer move); rule 11 (counts over Realtime, not here).
- Mockup: S03 (`vault/mockups/S03Plan.png`, classes `.ht`, `.hton`, `.ms`); `tickets.json` lists none, nearest board per tickets README rule 5; sample text is not a decision (KNOWN-LIMITS 5). No Polished, Refined or Layout C board.
- P11 Split proposal Part EZD-011b, findings V2, V4, V9, V10, V11, V13, V14; Steps 3, 4, 6, 8; Tests table H1–H7, H9, H15.
- Dependency contracts: 11A (EZD-011a section 3), EZD-010b section 3 (`Icon`, `expand_more` in `icons.json`), EZD-026c section 3 (`KEY_PATTERN`, `SPANISH_NAMESPACES`), EZD-026d section 3 (`MessagesProvider`, `useT`, `catalogFor`, `en`, `MessageKey`).
- Code read on develop at 7fac268: `app/src/server/messages/catalogs/en.ts` (no `office.` key; none at 529269c either), `app/src/styles/tokens.css` (lines 3–11, 30–31), `app/src/components/icon/Icon.tsx`, `app/src/lib/messages/MessagesProvider.tsx` and `.test.tsx`, `app/vitest.config.ts` (`environment: 'node'`, `oxc` JSX), `scripts/conventions/__tests__/architecture-doc.test.mjs` (`REQUIRED_HEADINGS`; EZD-011a H15 (a)–(d)). At 529269c: `app/src/components/shell/` (`HeaderCard.tsx`, `index.ts`, `shell-css.test.ts`), docs `### Shell header (EZD-011)`; match 11A.
- Research reports: none.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| const | `EDITOR_VIEWS` (`app/src/components/shell/editor-views.ts`) | `['plan', '3d', 'sheets', 'render'] as const` |
| type | `EditorView` (same) | `(typeof EDITOR_VIEWS)[number]` |
| const | `VIEW_LABEL_KEYS` (same) | `Record<EditorView, MessageKey>` = `{ plan: 'office.header.view.plan', '3d': 'office.header.view.3d', sheets: 'office.header.view.sheets', render: 'office.header.view.render' }` |
| export | `Wordmark` (`Wordmark.tsx`, named, `'use client'`) | `Wordmark({ href }: { href: string })`; renders `<a href={href}>` (next/link) with class tokens `[styles.wordmark]`, inner exactly `<span>{ez}</span><span class="{styles.accent}">{draft}</span>` |
| classes | `Wordmark.module.css` | `.wordmark`, `.accent` (Step 2) |
| type | `EditorHeaderProps` (`EditorHeader.tsx`, exported) | `{ projectsHref: string; projectName: string; onProjectMenu?: () => void; subtitle?: readonly ReactNode[]; activeView: EditorView; views?: readonly EditorView[]; onViewChange: (view: EditorView) => void; reviewPill?: ReactNode; share?: ReactNode; export?: ReactNode; issueSet?: ReactNode }` (P11 Step 4; V9; EZD-014 passes `export`) |
| export | `EditorHeader` (`EditorHeader.tsx`, named, `'use client'`) | `memo(function EditorHeader(props: EditorHeaderProps))`; root is 11A's `HeaderCard` `<header>`; children order and markup of Step 3 |
| classes | `EditorHeader.module.css` | `divider`, `titleBlock`, `name`, `nameText`, `subtitle`, `views`, `tab`, `active` (Step 3). Tests use `name`, `subtitle`, `tab`, `active` by importing the module (11A pattern) |
| attributes | tabs | `<button type="button">`, class tokens `[styles.tab]` or `[styles.tab, styles.active]`; active adds `aria-current="page"` |
| attributes | nav | `<nav class="{styles.views}" aria-label={t('office.header.views')}>` |
| attributes | project name | `title={projectName}`; chevron `Icon` 18 px (`<use href="/icons/sprite.svg#expand_more">`, EZD-010b) only with `onProjectMenu` |
| message keys | `en` (`app/src/server/messages/catalogs/en.ts`) | The 10 `office.header.*` keys and values of section 6; none in `es` |
| export | `app/src/components/shell/index.ts` | adds `EditorHeader`, `Wordmark`, `EDITOR_VIEWS`, `VIEW_LABEL_KEYS`, types `EditorView`, `EditorHeaderProps`; keeps `HeaderCard`, `HeaderButton` (11A) |
| docs | `### Shell header (EZD-011)` in `docs/architecture.md` | 11A's subsection; this part appends Step 6's bullets inside it |
| test titles | Vitest top-level `describe('EZD-011b …')`; node:test `test('EZD-011b H15 …')` | C9; phase 0 grep lists `011b` (V13). `shell-css.test.ts`: its own top-level `describe('EZD-011b shell CSS')` |

No route and no `data-testid` (EZD-011c's page adds `data-project-menu-count` on its own frame).

## 4. Tests
Vitest in `@ezdraft/app`, `environment: 'node'`; markup via `renderToStaticMarkup` (pattern `app/src/lib/messages/MessagesProvider.test.tsx`), wrapped in `<MessagesProvider language="en" messages={catalogFor('office', 'en')}>` unless the row says otherwise; `next/link` needs no mock (V10). Class checks compare `class` tokens against the imported CSS module's names; CSS text checks strip comments, collapse whitespace and read the named single-class rule block (`squash`, `block` in `shell-css.test.ts`, 529269c). "Text" means the markup with tags removed. Common props **HP**: `projectsHref="/" projectName="P1" onProjectMenu={fn} subtitle={['A','B','C']} activeView="plan" onViewChange={fn} reviewPill={<i data-slot="pill"/>} share={<i data-slot="share"/>} export={<i data-slot="export"/>} issueSet={<i data-slot="issue"/>}` (P1, A–C and slot markers are test data). Smoke: no.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| H1 Order and content (`EditorHeader.test.tsx`) | AC-EZD-011b-1 | unit | `<EditorHeader {...HP} />` | (a) exactly one `<header` (11A root). (b) In document order: `<a` with `href="/"` and class tokens `[Wordmark styles.wordmark]`, text `ezdraft`; a `<span aria-hidden="true"` divider; the `<button type="button"` with class tokens `[styles.name]`, `title="P1"`, text `P1`, containing `<use href="/icons/sprite.svg#expand_more"` and `width="18"`; the element with class `styles.subtitle`, text `A · B · C`, each ` · ` inside `<span aria-hidden="true">`; `<nav` with `aria-label="Views"` holding exactly 4 `<button type="button"` with texts `Plan`, `3D`, `Sheets`, `Render` in that order; after `</nav>`, `data-slot` `pill`, `share`, `export`, `issue` in that order, then `</header>`. (c) exactly one `aria-current="page"`, on the `Plan` tab | 04 Header card order and tab names; 04 subtitle " · "; S03 `nav aria-label="Views"`, chevron 18 px; section 6 values; section 3 |
| H2 Active tab follows `activeView` | AC-EZD-011b-2 | unit | HP with `activeView` each of `3d`, `sheets`, `render` | Exactly one tab has `aria-current="page"` and exactly one has `styles.active` among its class tokens; both are the tab with text `3D`, `Sheets`, `Render` respectively; every other tab's class tokens equal `[styles.tab]` | 04 "Active tab has cobalt text…"; S03 `aria-current`; section 3 |
| H3 Empty slots and optional parts | AC-EZD-011b-3 | unit | (1) `projectsHref="/" projectName="P1" activeView="plan" onViewChange={fn}` only; (2) as (1) plus `subtitle={['A', null, '', false, 'B']}`; (3) as (1) plus `subtitle={[null, '']}` | (1) the markup between `</nav>` and `</header>` is the empty string; no `expand_more`; no `<button` other than the 4 tabs; the element with class `styles.name` is a `<span` with `title="P1"` and text `P1`; no element with class `styles.subtitle`. (2) subtitle text `A · B` (one separator). (3) no element with class `styles.subtitle` | Step 3 (empty slot renders nothing; skipped parts); 04 "Hidden when N = 0", "Hidden without…" (slot owner's); Q-0214 |
| H4 `views` subset keeps 04 order | AC-EZD-011b-1, -2 | unit | (1) HP with `views={['render','plan']}`; (2) HP with `views={['render']}` (active `plan`) | (1) exactly 2 tabs, texts `Plan` then `Render`; `Plan` has `aria-current="page"`. (2) exactly 1 tab, `Render`, no `aria-current` anywhere, nothing thrown | 04 order "Plan / 3D / Sheets / Render"; Step 3 (*planner's choice* for (2)) |
| H5 Labels go through t() | AC-EZD-011b-4 | unit | HP inside a provider whose messages are a spread of `catalogFor('office','en')` with each of `office.header.wordmark_ez`, `wordmark_draft`, `views`, `view.plan`, `view.3d`, `view.sheets`, `view.render` set to `X:<full key>` | `<a>` text `X:office.header.wordmark_ezX:office.header.wordmark_draft`; nav `aria-label="X:office.header.views"`; tab texts `X:office.header.view.plan`, `…view.3d`, `…view.sheets`, `…view.render` in order; none of the case-sensitive texts `Plan`, `3D`, `Sheets`, `Render`, `Views`, `ezdraft` appears in the markup | R26 R17 (every string through one helper); docs/architecture.md Messages (office strings use `office.` keys); Done when |
| H6 Without a provider | AC-EZD-011b-4 | unit | `renderToStaticMarkup(<EditorHeader {...HP} />)` with no `MessagesProvider` | Throws an `Error` whose message contains `MessagesProvider` | EZD-026d section 3 (`useT` outside a provider) |
| H7 part b: header CSS (`shell-css.test.ts`, `describe('EZD-011b shell CSS')`) | AC-EZD-011b-2 | unit | Text of `EditorHeader.module.css` | `.active` contains `color: var(--ez-cobalt-text)`, `box-shadow: inset 0 -2px 0 var(--ez-cobalt)`, `font-weight: 600`; `.tab` contains `color: var(--ez-slate-500)`; the file has no `#` hex color, `rgb(` or `oklch(` (C10 also enforces this) | 04 Header card ("cobalt text and a 2 px inset bottom border"); P11 Level-1 table; S03 `.hton` weight 600, `.ht` `#5e6672` = 04 slate 500 |
| H9 Header message keys (`header-messages.test.ts`) | AC-EZD-011b-4 | unit | `en`, `es`, `KEY_PATTERN` | The `office.header.*` keys of `en` are exactly the 10 of section 6, each with exactly that value; no key of `es` starts with `office.`; every one of the 10 matches `KEY_PATTERN` | Section 6 (04 Header card; S03); R26 R17 (office English only); EZD-026c section 3 `KEY_PATTERN` |
| H15 part b: docs (`architecture-doc.test.mjs`, flat cases `EZD-011b H15 (a)`…`(c)`) | AC-EZD-011b-1, -4 | unit (node:test) | `docs/architecture.md`; `node scripts/conventions/check.mjs .` | (a) `##` headings deep-equal `REQUIRED_HEADINGS` (13, in order). (b) the text between `### Shell header (EZD-011)` and the next `##`/`###` heading contains `EditorHeader`, `EDITOR_VIEWS` and `office.header`. (c) the check exits 0 (C1 no new package; C8; C10 on the new CSS) | P11 Step 8, V11; EZD-000 T5; Machine checks C1, C8, C10 |
| H17 Exports, memo and view constants (`EditorHeader.test.tsx`) | AC-EZD-011b-1, -4 | unit | `import * as shell from './index'`; direct imports; source text of `EditorHeader.tsx`, `Wordmark.tsx`; text of `Wordmark.module.css` | (a) `shell.EditorHeader`, `shell.Wordmark`, `shell.EDITOR_VIEWS`, `shell.VIEW_LABEL_KEYS` are identical (`===`) to the direct imports; `shell.HeaderCard`, `shell.HeaderButton` still defined. (b) `EDITOR_VIEWS` deep-equals `['plan','3d','sheets','render']`; `VIEW_LABEL_KEYS` deep-equals the section 3 mapping. (c) `EditorHeader.$$typeof === Symbol.for('react.memo')`. (d) the first statement of both sources is the `'use client'` directive. (e) `.wordmark` contains `color: var(--ez-ink)`, `font-size: 18px`, `font-weight: 600`; `.accent` contains `color: var(--ez-cobalt)` | Section 3; 04 order; P11 Step 4 (memo; 11 Budgets 150 ms, rule 4); S03 wordmark (18 px, 600, "draft" `oklch(0.55 0.17 262)` = 04 cobalt, ink `#14171c`) |
| Gate | — | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-011b` | Exit 0: typecheck, lint, test, build, test:e2e | CLAUDE.md rule 12 |

Not unit-testable with static markup and covered by EZD-011c H14 in a browser: a click on a non-active tab calls `onViewChange`, a click on the active tab calls nothing, the project button calls `onProjectMenu`. The test-author maps these to EZD-011c, not to this part's ACs.

## 5. Visual checklist
None. No page renders the header until EZD-011c, whose ui-verifier checks it against S03 at desktop 1600 × 1000 (P11 Part EZD-011c visual checklist). So EZD-016a is not a dependency of this part.

## 6. Proposed wording
None new: every value below is on 04 or the S03 board (Josh approved the Studio boards, "Visual direction", `13c-open-and-resolved.md` line 24). Listed for the record (P11 Step 6):

| Where | Text |
| --- | --- |
| `office.header.wordmark_ez` / `office.header.wordmark_draft` | `ez` / `draft` (04 "ezdraft wordmark"; S03 split spans) |
| `office.header.views` (nav label, screen readers) | `Views` (S03 `aria-label`) |
| `office.header.view.plan` / `.3d` / `.sheets` / `.render` | `Plan` / `3D` / `Sheets` / `Render` (04) |
| `office.header.share` / `office.header.export` / `office.header.issue_set` | `Share` / `Export` / `Issue set` (04) |

## 7. Security review
security-review: no. No tables, auth, permissions, money, share links or API; the header checks no permission, and the slot owners hide controls with `can()` in their own reviewed tickets (P11 Reviewers).
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier no (section 5 empty; EZD-011c) · security-reviewer no.

## 8. Complexity and model recommendation
medium: a memoized client component with ordered slots and typed props that eleven later tickets extend, plus message keys and 10 tests, on existing patterns; no data, permissions, money or auth (PROCESS.md section 4; P11 Part EZD-011b). test-author Sonnet 5.5, builder Sonnet 5.5, code-reviewer Opus 5.5.

## 9. Dependencies
- From the row: EZD-011a (`HeaderCard`, `index.ts`, `shell-css.test.ts`, the docs subsection; done, 529269c; its deviation (`globals.css` `body` order) touches nothing here; Step 6 keeps its H15 (c) names), EZD-010b (`Icon`, `expand_more`, sprite), EZD-026c (`KEY_PATTERN`, `SPANISH_NAMESPACES`, `createT`), EZD-026d (`MessagesProvider`, `useT`, `catalogFor`, `en`, `MessageKey`), EZD-004a, EZD-004b (the gate's `db:up`; the app Vitest global setup needs the local stack) (V14). All done.
- Missing from the row (all done): EZD-010a (`--ez-ink`, `--ez-cobalt`, `--ez-cobalt-text`, `--ez-slate-500`, `--ez-border`; C10), EZD-000 (`architecture-doc.test.mjs`, `REQUIRED_HEADINGS`), EZD-001 (Vitest and ESLint configs), EZD-010c (`--ez-font-sans` for `.name`). Reached via EZD-011a or EZD-026d.
- Dependents: EZD-011c (dev page, browser tests H12–H14), EZD-012, 014, 015, 032, 126, 136; EZD-014 passes `export` and adds the icon-only button form (Q-0055 (a), Q-0098).
- Risks:
  - Prop growth: EZD-121, 122, 126, 127, 128, 130, 716, 721, 1201, 1401, 1402 each add one optional prop at the board position in docs; none restructures the component (P11 Risks).
  - Re-render discipline: `memo` holds only if callers pass stable callbacks and slot elements; EZD-017's commit count during a pan catches a header that re-renders per frame (11 rule 4).
  - iPad width and 44 px targets: EZD-014's (P11 Risks); `min-width: 0` and ellipsis let the title shrink.
  - Render tab hiding without *Run fast renders* (S03 Permissions): the `views` prop allows it; EZD-102 and Phase 11 decide.
  - Glossary: "Plan / 3D / Sheets / Render tabs" → `EditorView` is a new code name; `vault/spec/glossary.md` says the introducing ticket adds the row, but builders cannot write `vault/` (CLAUDE.md rule 5), so the orchestrator may add it at merge.

## 10. Open questions
None. Settled at Level 1: active tab text uses 04 cobalt text, not the board's lighter value (04 Header card; P11 Level-1 table); `export` is the prop name (V9, EZD-014's contract); no `es` entries (R26 R17; V4).
