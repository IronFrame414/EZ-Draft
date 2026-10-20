# EZD-011c · Shell: header test page and Done-when browser test

- **ACs:** AC-EZD-011c-1 (Header is 60 px), AC-EZD-011c-2 (active tab shows cobalt text and 2 px bottom border), AC-EZD-011c-3 (the page is not found in production) (`vault/spec/acceptance-criteria.md` lines 66–68).
- **Complexity:** medium (section 8).
- **User-visible result:** on a preview, `/dev/header` shows the Studio editor header; clicking 3D moves the cobalt underline to it. The page does not exist in production.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned

Short citations: **P11** = `vault/plans/EZD-011.md` (parent plan; this part is its "Part EZD-011c", Step 7 and tests H10, H12–H14; findings V1–V14); **11A** / **11B** = `vault/plans/EZD-011a.md` / `EZD-011b.md` section 3; **04** = `vault/spec/sections/04-app-shell-and-global-ui.md`; **S03** = `vault/mockups/S03Plan.png` + `html/project/S03Plan.dc.html`; **arch** = `docs/architecture.md`.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 34):
- Scope: Plan vault/plans/EZD-011.md Step 7: the /dev/header test page (page.tsx, HeaderDemo.tsx, page.module.css) and the browser tests. Original scope: header component with wordmark, project name + chevron, subtitle, Plan/3D/Sheets/Render tabs, review pill slot, Share, Export, Issue set slots. Split into EZD-011a, EZD-011b, EZD-011c (Q-0238); plan Part EZD-011c.
- Done when: Header is 60 px; active tab shows cobalt text and 2 px bottom border. The page is not found in production.
- Depends on: EZD-011a, EZD-011b, EZD-016a, EZD-016d, EZD-010c, EZD-007d
- Spec ref: App shell · Header card

Steps:
1. **`app/src/app/dev/header/page.tsx`** (new; server component, no `'use client'`; dev-page convention EZD-010c, `app/src/app/dev/tokens/page.tsx`; arch Folder layout `src/app/dev/<name>/`): default export `Page()`, synchronous. First line: `if (process.env.VERCEL_ENV === 'production') notFound();` (`next/navigation`). Otherwise returns `<MessagesProvider language="en" messages={catalogFor('office', 'en')}><HeaderDemo /></MessagesProvider>`; the `catalogFor` result is passed unchanged, no cast (arch Messages and language "Use"; P11 V4). Language is always `en` for `office` (R26 R17; arch), so no user is read. Relative imports only (arch Events: no `@/*` alias): `../../../lib/messages` (`MessagesProvider`), `../../../server/messages/catalog` (`catalogFor`), `./HeaderDemo`.
2. **`app/src/app/dev/header/HeaderDemo.tsx`** (new; `'use client'`; P11 Step 7): named export `HeaderDemo()`.
   - State: `activeView: EditorView` starting `'plan'`; `projectMenuCount: number` starting `0`.
   - Renders the frame `<div className={styles.frame} data-testid="header-demo" data-project-menu-count={String(projectMenuCount)}>` (styles from `./page.module.css`) holding exactly one `<EditorHeader …/>` and nothing else.
   - `EditorHeader` props (11B `EditorHeaderProps`): `projectsHref="/"`; `projectName="Sample project"`; `subtitle={['Sample client', 'Working copy', 'Saved just now']}`; `activeView`; `onViewChange` = set state; `onProjectMenu` = increment the counter; `share={<HeaderButton>{t('office.header.share')}</HeaderButton>}`, `export={<HeaderButton>{t('office.header.export')}</HeaderButton>}`, `issueSet={<HeaderButton variant="primary">{t('office.header.issue_set')}</HeaderButton>}` (11A `HeaderButton`; 11B section 6 keys); no `reviewPill` (EZD-127's; P11 V6); `views` not passed (all four).
   - Callbacks are `useCallback`; `subtitle` and the three slot elements are `useMemo` (or module constants for the subtitle), as 11B's docs ask of every caller (P11 Step 4 "Performance"; 11 rule 4). *Planner's choice.*
   - `t` from `useT()` (`../../../lib/messages`); `EditorHeader`, `HeaderButton`, type `EditorView` from `../../../components/shell` (11A/11B `index.ts`).
   - Sample strings are developer data on a dev page, written as literals like EZD-010c's specimen text (`app/src/app/dev/tokens/page.tsx`; KNOWN-LIMITS 5); "Working copy" and "Saved just now" are 04 / S03 examples (04 Header card Subtitle). Section 6 lists them.
3. **`app/src/app/dev/header/page.module.css`** (new; P11 Step 7): one class `.frame { display: flex; flex-direction: column; min-height: 100vh; background: var(--ez-canvas); }`. Colors through `var(--ez-*)` only (C10); the file has no spacing, radius or shadow declaration (L-013), because `HeaderCard` owns the 60 px height and 16 px margin (11A; arch Shell header) and the frame adds none.
4. No docs change: arch already documents `app/src/app/dev/<name>/` and its production 404 (P11 Part c Scope). No message key added (all from 11B). No package, no migration.

Files:
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/app/dev/header/page.tsx` | New | builder | Step 1 |
| `app/src/app/dev/header/HeaderDemo.tsx` | New | builder | Step 2 |
| `app/src/app/dev/header/page.module.css` | New | builder | Step 3 |
| `app/src/app/dev/header/page.test.tsx` | New | test-author | H10 |
| `app/e2e/shell-header.spec.ts` | New | test-author | H12–H14 |
| `app/src/components/shell/**`, `en.ts`, `tokens.*`, `globals.css`, `docs/architecture.md` | Not touched | — | 11A / 11B own them |
| `app/playwright.config.ts`, `app/test-harness/**`, `package.json` files, `vault/**` | Not touched | — | Harness is EZD-016a/016d's; no new script or dependency |

Write paths checked against `.claude/hooks/guard-paths.mjs` (L-002): `*.test.tsx` and `app/e2e/` match its test rule (test-author); the three page files do not (builder).

Data: none (no table, column, migration, RLS, `schema_version` or money field; P11 Data).

## 2. Sources
- 04 "Frame and visual system (Studio)": desktop frame 1600 × 1000, header card 60 px, margin 16; cobalt `oklch(0.55 0.17 262)`, cobalt text `oklch(0.45 0.17 262)`, slate 500 `#5e6672`, canvas `#f6f7f9`, border `#dfe2e6`.
- 04 "Header card (left to right)": tab names and order; "Active tab has cobalt text and a 2 px inset bottom border"; Project name + chevron opens the switcher; Subtitle "Client · version · save state", example "Saved just now".
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0026 (a) (oklch only, no fallback); Q-0037 (b) (pill amber, EZD-127; unused here); Q-0039 (c) (build gate opens `/dev/shell`, not this page); Q-0055 (a) / Q-0098 (narrow-screen icon buttons, EZD-014; not at 1600 px); Q-0208 / Q-0229 (disclaimer line, EZD-136; not on this dev page, P11 V8); Q-0214 (hidden, not greyed: empty slots).
- R26 R17 (`vault/spec/decisions/13b-round-26.md`): office strings through `t()`, English only.
- Q-0238 (split of EZD-011); Q-0114 (Playwright workers 4); Q-0006 / Q-0221 (test scope, phase grep).
- Mockup S03 header strip (y 0–92): `.card`, `<header>`, `.ht`, `.hton` (`font-weight:600`, `box-shadow: inset 0 -2px 0 oklch(0.55 0.17 262)`), `.b`, `.b:hover`, `.bp`, `body{margin:0}`. Board text is sample data (KNOWN-LIMITS 5).
- P11 Level-1 settlements: spec cobalt text (not the board's `oklch(0.5 …)`), border-box 60 px (not the board's 62 px).
- Code read on develop 2026-10-20 (733cd72): `app/src/app/dev/tokens/page.tsx` and `page.test.tsx` (pattern; T4 (a) not-found digest), `app/src/lib/messages/MessagesProvider.tsx` (props `language`, `messages: Readonly<Partial<Record<MessageKey, Message>>>`; wraps children in `<div lang style="display: contents">`), `app/src/server/messages/catalog.ts` (`catalogFor(surface, language)`), `app/src/server/auth/public-paths.ts` (`/dev` public), `app/test-harness/e2e/test.ts` (`test`, `expect`), `app/src/app/layout.tsx`, `app/src/styles/globals.css`.
- arch: Folder layout (`src/app/dev/<name>/`), Messages and language, Browser tests (EZD-016a) (device projects, untagged → `desktop`), Test scope (Q-0006).
- 11 Non-functional (Budgets: "Switch Plan / 3D / Sheets / Render within 150 ms"; 11 rule 4): met by 11B's `memo`; this page only follows the stable-props rule.
- Non-goals, glossary: nothing applies (no new term; `EditorView` is 11B's row, 11B section 9).
- No research report covers this ticket.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| route | `/dev/header` | Default export `Page()` of `app/src/app/dev/header/page.tsx`; public through `PUBLIC_PATHS` `/dev` (EZD-007d), no sign-in |
| export / signature | `Page` (default) | `Page(): JSX.Element`, synchronous server component. `VERCEL_ENV === 'production'` → `notFound()`, which throws an error whose `digest` is `NEXT_HTTP_ERROR_FALLBACK;404` (EZD-010c contract). Else `<MessagesProvider language="en" messages={catalogFor('office', 'en')}><HeaderDemo /></MessagesProvider>` |
| export | `HeaderDemo` (named) from `app/src/app/dev/header/HeaderDemo.tsx` | `'use client'`; no props; renders the frame with one `EditorHeader` (Step 2) |
| data-testid | `header-demo` | The frame `<div>`; the page's only `data-testid` |
| attribute | `data-project-menu-count` | On the frame; `"0"` at load, `+1` per project-name click |
| class | `page.module.css` `.frame` | `display: flex; flex-direction: column; min-height: 100vh; background: var(--ez-canvas)` |
| sample data | `HeaderDemo` | `projectName` `Sample project`; subtitle parts `Sample client`, `Working copy`, `Saved just now`; slots Share, Export (secondary), Issue set (primary); no pill |
| uses (11A) | `HeaderButton`, `HeaderCard` (inside `EditorHeader`) | `<header>` root, 60 px border-box, margin 16 16 0; `.button`, `.primary` |
| uses (11B) | `EditorHeader`, `EditorView`, keys `office.header.share` / `.export` / `.issue_set` / `.views` / `.view.*` | Tabs are `<button type="button">` in `<nav aria-label="Views">`; active tab has `aria-current="page"` and class `active`; project name is a `<button>` when `onProjectMenu` is given |
| spec file | `app/e2e/shell-header.spec.ts` | `import { test, expect } from '../test-harness/e2e/test'`; one top-level `test.describe('EZD-011c shell header', …)`; no device tag (runs in `desktop`, 1600 × 1000, `DEVICE_PROJECTS`); no sign-in fixture; not `@smoke` (EZD-032 is phase 0's build-gate test) |
| test file | `app/src/app/dev/header/page.test.tsx` | Vitest, one top-level `describe('EZD-011c header test page', …)` (C9; phase 0 grep lists `011c`, P11 V13) |
| locators | spec | Header `page.locator('header')`; tabs `page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: <label>, exact: true })`; project button `page.getByRole('button', { name: 'Sample project' })`; frame `page.getByTestId('header-demo')` |

No new message key, token, route handler or export used by another ticket (EZD-012 builds its own `/dev/shell`, Q-0039 (c)).

## 4. Tests

Vitest `node` environment, `renderToStaticMarkup` (EZD-010c pattern). Browser tests in EZD-016a's harness, `desktop` project 1600 × 1000, workers 4 (Q-0114). Colors are compared against a probe element the test appends to `document.body` with the same `var(--ez-*)` declarations, so the result does not depend on how Chromium serializes `oklch()` (P11 Tests; Q-0026 (a)). Pixel values compared exactly.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| H10 (a) Not found in production | AC-EZD-011c-3 | unit | `vi.stubEnv('VERCEL_ENV', 'production')`; call `Page()` | Throws; the error's `digest` is `NEXT_HTTP_ERROR_FALLBACK;404` | EZD-010c contract (`app/src/app/dev/tokens/page.test.tsx` T4 (a)); arch Folder layout `src/app/dev/<name>/` |
| H10 (b) Renders outside production | AC-EZD-011c-3 | unit | `VERCEL_ENV` unset; `renderToStaticMarkup(<Page />)` | No throw; exactly one `<header`; `data-testid="header-demo"`; `data-project-menu-count="0"`; text `Sample project`; exactly one `aria-current="page"`, on the tab with text `Plan` | Step 1–2 (*planner's choice*: proves the provider wiring; 11B H6 throws without a provider); 11B (`aria-current`) |
| H12 Done when. Title `EZD-011c done when: header is 60 px; active tab shows cobalt text and 2 px bottom border` | AC-EZD-011c-1, AC-EZD-011c-2 | browser (desktop) | Open `/dev/header`; append probe A `color: var(--ez-cobalt-text); box-shadow: inset 0 -2px 0 var(--ez-cobalt)` and probe B `color: var(--ez-slate-500)`; read computed values | `header` `getBoundingClientRect().height` `=== 60`. `Plan` tab has `aria-current="page"`; its computed `color` equals probe A's `color`; its computed `box-shadow` equals probe A's `box-shadow` and contains `inset` and `-2px`. Each of `3D`, `Sheets`, `Render`: computed `box-shadow === 'none'` and `color` equals probe B's. `Plan` tab rect `bottom === header.bottom - 1` (the 2 px line sits on the card's inner bottom edge, inside the 1 px border) | Ticket Done when; 04 Frame "Header card 60 px"; 04 Header card "cobalt text", "2 px inset bottom border"; 04 cobalt text `oklch(0.45 0.17 262)` (P11 Level-1); S03 `.hton` box-shadow color = 04 cobalt; S03 `.ht` `#5e6672` = 04 slate 500; 1 px border: 04 border / S03 `.card` |
| H13 Frame position | AC-EZD-011c-1 | browser (desktop) | `/dev/header` | `header` rect `x === 16`, `y === 16`, `width === 1568` (1600 − 2 × 16); `body` computed `margin` `0px` | 04 Frame ("margin 16"; 1600 × 1000 reference); S03 `body{margin:0}`; 11A (`margin: var(--ez-header-margin) var(--ez-header-margin) 0`; body reset in `globals.css`) |
| H14 Clicks | AC-EZD-011c-2 | browser (desktop) | Click `3D`; click `3D` again; click `Sample project` | After the first click: `3D` has `aria-current="page"`, computed `color` equals probe A's and `box-shadow` equals probe A's; `Plan` has no `aria-current` and `box-shadow === 'none'`. After the second click: still only `3D` current. Frame `data-project-menu-count` `"0"` before the project click, `"1"` after | 04 Header card ("Switch the canvas view"; "Project name + chevron · Opens project switcher"); P11 Step 4 (active tab click does nothing); Step 2 counter |
| Gate | all | gate | `node scripts/gate.mjs .claude/worktrees/EZD-011c` | Exit 0: typecheck, lint (C10 on `page.module.css`), test, build, `test:e2e` | CLAUDE.md rule 12; arch CI |

4 tests + gate (≤ 10). Every refuse/fail rule in section 1 (production → not found) has a row (L-012).

## 5. Visual checklist

Viewport: desktop 1600 × 1000, `/dev/header`, against the S03 header strip (y 0–92) and `S03Plan.dc.html` `<header>`.

| Element | State | Mockup |
| --- | --- | --- |
| Header card: white surface, 1 px border, radius 12, card shadow, 60 px tall, 16 px from top, left and right, on the canvas background | filled | S03 `.card`, `<header>`; 04 Frame |
| Wordmark "ez" ink + "draft" cobalt, 18 px 600; 1 × 24 px divider | filled | S03 |
| Project name 15 px 600 with 18 px slate `expand_more` chevron; subtitle 12 px slate, parts joined by " · " | filled | S03 |
| Tabs Plan / 3D / Sheets / Render centred; active tab cobalt text, 600, 2 px cobalt inset bottom line; others slate 14 px | filled; after clicking 3D | S03 `.ht`, `.hton` |
| Share and Export (secondary), Issue set (primary cobalt) at the right | filled | S03 `.b`, `.bp` |
| Secondary button border darkens on hover | hover | S03 `.b:hover` |

Not findings (P11 Part c): no "2 to review" pill (EZD-127); active text is the spec's cobalt text, slightly darker than the board; card 60 px, not the board's 62 px; sample text differs (KNOWN-LIMITS 5); no disclaimer line (EZD-136, Q-0229). The header loads no data and checks no permission, so it has no empty, loading, error or no-permission state.

## 6. Proposed wording

Developer sample data on a page that is not found in production (Step 2; precedent: EZD-010c "Sample text", recorded needs-josh-confirm). Labels Share, Export, Issue set, Views and the tab names are 11B's approved keys (04; S03).

| Where | Text |
| --- | --- |
| `/dev/header` project name | Sample project |
| `/dev/header` subtitle, client part | Sample client |
| `/dev/header` subtitle, version part | Working copy (04 Header card subtitle; S03 board text) |
| `/dev/header` subtitle, save-state part | Saved just now (04 Header card Subtitle example) |

## 7. Security review
security-review: no. Developer page, not found in production (H10 (a)); `/dev` is already public (EZD-007d, arch Request gate); no data, auth, permissions, money or API.
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier yes (section 5) · security-reviewer no.

## 8. Complexity and model recommendation
Medium: three small files, but the ticket's Done when rests on browser layout and computed-style checks in the new harness against two not-yet-built parts (PROCESS.md section 4: not clearly low). test-author Sonnet 5.5, builder Sonnet 5.5, ui-verifier Sonnet 5.5, code-reviewer Opus 5.5.

## 9. Dependencies
- From the row: EZD-011a (`HeaderCard` 60 px and margin, `HeaderButton`, body margin reset; **planned, not built**), EZD-011b (`EditorHeader`, `EditorView`, `office.header.*` keys; **planned, not built**), EZD-016a (`app/test-harness/e2e/test.ts`), EZD-016d (device projects, `app/playwright.config.ts`, `test:e2e` web server), EZD-010c (dev-page convention, fonts, `globals.css`), EZD-007d (`/dev` in `PUBLIC_PATHS`). Build after 011a and 011b merge.
- Missing from the row (all done): EZD-010a (`--ez-canvas`, `--ez-cobalt`, `--ez-cobalt-text`, `--ez-slate-500`; C10), EZD-010b (sprite `/icons/sprite.svg#expand_more`), EZD-026d (`MessagesProvider`, `catalogFor`), EZD-004a / EZD-004b (the gate's `db:up`; the Playwright config reads `local.mjs env` at load). Each is reached through 011a / 011b or the harness already.
- Risks:
  - If 011a or 011b merge with a deviation (class names, label text, tab markup, nav stretch), the H12 bottom-edge check or the locators may need a Stage 3 re-validation of this plan before the build.
  - H13 `width === 1568` assumes no vertical scrollbar: the frame is `min-height: 100vh` with only the 76 px header in it, so nothing overflows; anything later added to this page must keep that.
  - The page adds a client route to the build; it is a dev page and not counted in the Projects or editor download budgets (11 Budgets name those pages only).

## 10. Open questions
None.
