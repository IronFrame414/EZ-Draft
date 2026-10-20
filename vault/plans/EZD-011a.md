# EZD-011a · Shell: header card, header button and card surface

- **ACs:** AC-EZD-011a-1, AC-EZD-011a-2, AC-EZD-011a-3 (`vault/spec/acceptance-criteria.md` lines 59–61)
- **Complexity:** low (section 8)
- **User-visible result:** nothing on screen yet; the Studio card surface, the 60 px header card and the Share / Export / Issue set button styles exist for the shell (shown on `/dev/header` by EZD-011c).
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned

Planned from `vault/plans/EZD-011.md` Split proposal "Part EZD-011a", Re-validation findings V1–V14 and Steps 1, 2, 5, 8 (ticket row Scope; Q-0238). Names, Step numbers and test IDs (H7, H8, H11, H15) are kept from that plan because EZD-012, EZD-014 and EZD-015 cite them. Short forms: `04` = `vault/spec/sections/04-app-shell-and-global-ui.md`; `S03` = `vault/mockups/html/project/S03Plan.dc.html` (+ `S03Plan.png`); `P11` = `vault/plans/EZD-011.md`; README = `vault/tickets/README.md`.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 32):
- Scope: Plan vault/plans/EZD-011.md Steps 1, 2 and 5 and Step 8's part-a docs lines: card.module.css (the one card surface), HeaderCard (60 px, 16 px margin), HeaderButton (secondary and primary), --ez-border-hover in tokens.css and tokens.ts, body margin reset in globals.css, shell index.ts. Split from EZD-011 (Q-0238); plan Part EZD-011a.
- Done when: HeaderCard is the 60 px header card (border-box height from --ez-header-height, margin --ez-header-margin on top and both sides) on the shared card surface; HeaderButton renders the board's secondary and primary buttons and passes every other prop through; --ez-border-hover is in both token files.
- Depends on: EZD-010a, EZD-010c, EZD-000, EZD-004a, EZD-004b
- Spec ref: App shell · Header card

**Values rule (lesson L-013).** Colors, radii, shadows, header height and header margin use `var(--ez-*)` tokens only (`app/src/styles/tokens.css`). Gaps, paddings and font sizes use plain `px`, because `tokens.css` has no spacing or type-size tokens (P11 V2; EZD-010c deviation). Font family uses `var(--ez-font-sans)` (EZD-010c).

**Steps**

1. **Card surface** `app/src/components/shell/card.module.css` (new): one class `.card` with exactly `background: var(--ez-surface)`, `border: 1px solid var(--ez-border)`, `border-radius: var(--ez-radius-12)`, `box-shadow: var(--ez-shadow-card)` (04 Frame: surface, border, radius 12, card shadow; S03 `.card`). It is the one card style: EZD-012's rail, panels and inspector compose it (P11 Step 1; EZD-012 plan line 60).
2. **Body reset** `app/src/styles/globals.css` (change): add `margin: 0;` to the existing `body` rule, keeping `font-family: var(--ez-font-sans);` (S03 `body{margin:0}`; P11 Step 1; EZD-010c contract "later tickets may add rules"). EZD-012 does not repeat it.
3. **Token** (change both files, P11 V3):
   - `app/src/styles/tokens.css`: append `--ez-border-hover: #c9ced5;` as the last declaration inside the one `:root` block (after `--ez-grid-size`), preceded by the comment `/* S03 .b:hover; vault/tickets/README.md rule 5; EZD-011a */`.
   - `app/src/styles/tokens.ts`: append `{ name: '--ez-border-hover', value: '#c9ced5', group: 'color' }` as the last `TOKENS` entry, so EZD-010a T1 (c) / T2 (c) parity holds (same entries, same order).
   - Source: S03 `.b:hover{border-color:#c9ced5}`; README rule 5 (layout detail with no rule follows the Studio board); `docs/architecture.md` Design tokens ("A ticket that adds a token appends it to both files with its board … in a comment"; no Q-ID exists, the value is the approved board's, P11 V3).
4. **`HeaderCard`** `app/src/components/shell/HeaderCard.tsx` + `HeaderCard.module.css` (new; P11 Step 2):
   - `HeaderCard({ children, 'aria-label': ariaLabel })` renders exactly `<header className={styles.header} aria-label={ariaLabel}>{children}</header>`: the `<header>` is the root element, no wrapper. Server-safe: no `'use client'`, no state, no hooks. `children` is optional because EZD-012's `/dev/shell` renders `<HeaderCard />` empty (EZD-012 plan lines 114, 173).
   - `.header`: first declaration `composes: card from './card.module.css';`, then `box-sizing: border-box; height: var(--ez-header-height); margin: var(--ez-header-margin) var(--ez-header-margin) 0; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 16px; overflow: hidden;`.
   - Sources: 04 Frame ("Header card 60 px, margin 16"); tokens `--ez-header-height: 60px`, `--ez-header-margin: 16px` (EZD-010a); S03 `<header class="card" style="height: 60px; flex: none; display: flex; align-items: center; gap: 16px; padding: 0 16px; margin: 16px 16px 0; overflow: hidden">`. `border-box` makes the outer box 60 px with the 1 px border (P11 Level-1 table row 1; Done when). The header owns its height and margin; the frame adds none (P11 Step 2; EZD-012 plan line 123).
5. **`HeaderButton`** `app/src/components/shell/HeaderButton.tsx` + `HeaderButton.module.css` (new; P11 Step 5):
   - Signature: `HeaderButton({ variant = 'secondary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'secondary' | 'primary'; ref?: Ref<HTMLButtonElement> })`. React 19.3.1 takes `ref` as a prop, so no `forwardRef` (docs/architecture.md Dependencies; P11 Step 5). `ref` is in `rest` and reaches the `<button>`.
   - Renders `<button type="button" {...rest} className={classes}>`: `type` defaults to `button`, a caller `type` wins (it is in `rest`); `classes` = `styles.button`, then `styles.primary` when `variant === 'primary'`, then the caller's `className` when given, joined by single spaces. Every other prop (`aria-*`, `data-*`, `title`, handlers, `ref`) passes through unchanged, so Radix `asChild` triggers (EZD-721, EZD-1201) and EZD-014's icon form (`aria-label`, `title`; P11 V8) work. No `'use client'` needed (no hooks); a client parent may pass handlers.
   - `.button`: `display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; font: 500 14px var(--ez-font-sans); border: 1px solid var(--ez-border); border-radius: var(--ez-radius-8); background: var(--ez-surface); color: var(--ez-ink); cursor: pointer;` (S03 `.b`; its `text-decoration:none` is for links and is not needed on a `<button>`).
   - `.button:hover`: `border-color: var(--ez-border-hover);` (S03 `.b:hover`).
   - `.primary`: `padding: 9px 16px; font-weight: 600; background: var(--ez-cobalt); border-color: var(--ez-cobalt); color: var(--ez-surface);` (S03 `.bp`; 04 "Issue set (primary)"). `.bp` keeps the `.b:hover` border as drawn (P11 Step 5).
   - No focus-style override (browser focus ring stays). The 44 px iPad target is EZD-014's (P11 Risks; EZD-014 plan line 106).
6. **Barrel** `app/src/components/shell/index.ts` (new): `export { HeaderCard } from './HeaderCard'; export { HeaderButton } from './HeaderButton';`. EZD-011b appends its exports.
7. **Docs** `docs/architecture.md` (change; P11 Step 8 part-a bullets, V11): add `### Shell header (EZD-011)` under `## Folder layout`, directly after the `### Messages and language (t())` subsection and before `## Server-only data access and can()`. Bullets: the files of `app/src/components/shell/` added here and what each is for; `card.module.css` is the one card surface (compose it, never copy it); `HeaderCard` owns the 60 px height and 16 px top and side margin, so the frame adds none; slot fillers use `HeaderButton` (`variant` `secondary` or `primary`, every other prop passed through); the body margin reset lives in `globals.css`. No `##` heading added (EZD-000 T5); no Dependencies row (no package added).

**Files**

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/components/shell/card.module.css` | New | builder | Step 1 |
| `app/src/components/shell/HeaderCard.tsx`, `HeaderCard.module.css` | New | builder | Step 4 |
| `app/src/components/shell/HeaderButton.tsx`, `HeaderButton.module.css` | New | builder | Step 5 |
| `app/src/components/shell/index.ts` | New | builder | Step 6 |
| `app/src/styles/tokens.css`, `app/src/styles/tokens.ts` | Change | builder | Step 3 |
| `app/src/styles/globals.css` | Change | builder | Step 2 |
| `docs/architecture.md` | Change | builder | Step 7 |
| `app/src/components/shell/shell-css.test.ts` | New | test-author | H7 part a, H11 |
| `app/src/components/shell/HeaderCard.test.tsx` | New | test-author | H16 |
| `app/src/components/shell/HeaderButton.test.tsx` | New | test-author | H8 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add cases) | test-author | H15 part a |
| `app/src/styles/tokens.test.ts`, `app/src/app/dev/tokens/page.test.tsx`, `app/src/app/layout.test.tsx` | Not touched | — | They assert the 36 spec rows, parity and the body font, not counts (P11 V3; read 2026-10-20); they must still pass |
| `package.json` files, `pnpm-lock.yaml`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | No dependency; not builder files |

Data: none (no table, column, migration, RLS policy, `schema_version` or money field).

## 2. Sources
- Spec `04` (`--reads EZD-011a planner`): opening paragraph; **Frame and visual system (Studio)** (Header card 60 px, margin 16; colors surface `#fff`, border `#dfe2e6`, ink, cobalt; radii incl. 8 and 12; card shadow); **Header card (left to right)** ("Issue set (primary)"; Share, Export).
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0026 (a) (oklch as written, no fallback; cobalt used via token); Q-0055 (a), Q-0098 (EZD-014's icon-only `HeaderButton`, why props pass through); Q-0214 (controls hidden, not greyed: slot owners). None changes this part. "Visual direction: the Studio mockups are final and approved" (`vault/spec/decisions/13c-open-and-resolved.md` line 24, via P11 line 6).
- Answered questions: Q-0238 (the split; this part's scope), Q-0114 (workers 4; Vitest config), Q-0006 (test titles carry the part ID).
- Mockup: S03 Plan editor (`vault/mockups/S03Plan.png`, `html/project/S03Plan.dc.html`): `body{margin:0}`, `.card{…}`, `<header class="card" style="…">`, `.b{…}`, `.b:hover{border-color:#c9ced5}`, `.bp{…}` (read 2026-10-20). The header is drawn the same on every Studio editor board (P11 Sources). No Polished, Refined or Layout C board used.
- Code read: `app/src/styles/tokens.css`, `tokens.ts` (36 entries, groups), `globals.css`; `app/vitest.config.ts` (node environment, automatic JSX, `maxWorkers: 4`); `app/src/styles/tokens.test.ts` (T1/T2 by name and parity); `scripts/conventions/__tests__/architecture-doc.test.mjs` (`REQUIRED_HEADINGS`, flat per-ticket cases); `docs/architecture.md` (Design tokens, Folder layout, Tests, Test scope).
- Plans: P11 (Split proposal part a, V1–V14, Steps 1, 2, 5, 8, Tests H7, H8, H11, H15); contracts of EZD-010a and EZD-010c (section 3); uses of these names in EZD-012 (lines 19, 50–60, 114, 123–126, 161, 173), EZD-014 (lines 24, 106–116, 147, 161), EZD-015 (lines 38, 246: `--ez-border-hover`).
- `vault/spec/non-goals.md`, `glossary.md`: nothing for a card or button. `03` Data model: no table touched. `11` Performance: no package, no store, no per-frame work; download size grows by two tiny components (EZD-017 measures).
- Lesson L-013 (tokens only per property kind; applied in section 1 Values rule).
- Research reports: none cover this ticket.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file / class | `app/src/components/shell/card.module.css` `.card` | Exactly the four declarations of Step 1. Others reuse it with `composes: card from '<relative path>/card.module.css'` |
| export | `HeaderCard` from `app/src/components/shell/HeaderCard.tsx` (named) | `HeaderCard(props: { children?: ReactNode; 'aria-label'?: string }): JSX.Element`; root element `<header class={styles.header}>`, no wrapper; `aria-label` attribute only when given; no `'use client'` |
| file / class | `app/src/components/shell/HeaderCard.module.css` `.header` | First declaration `composes: card from './card.module.css'`; then `box-sizing: border-box`, `height: var(--ez-header-height)`, `margin: var(--ez-header-margin) var(--ez-header-margin) 0`, `flex: none`, `display: flex`, `align-items: center`, `gap: 16px`, `padding: 0 16px`, `overflow: hidden` |
| export | `HeaderButton` from `app/src/components/shell/HeaderButton.tsx` (named) | `HeaderButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'secondary' \| 'primary'; ref?: Ref<HTMLButtonElement> })`; default `variant` `secondary`; renders one `<button type="button" {...rest}>`; class list `button` [+ `primary`] [+ caller `className`] |
| file / classes | `app/src/components/shell/HeaderButton.module.css` `.button`, `.button:hover`, `.primary` | Declarations of Step 5. EZD-014 extends this file (touch target, `@media (hover: hover)`, icon form) |
| export | `app/src/components/shell/index.ts` | `HeaderCard`, `HeaderButton` (named re-exports); EZD-011b appends `EditorHeader`, `Wordmark`, `EDITOR_VIEWS`, `EditorView`, `VIEW_LABEL_KEYS` |
| token | `--ez-border-hover: #c9ced5` | Last declaration of the `:root` block in `tokens.css`; last `TOKENS` entry `{ name: '--ez-border-hover', value: '#c9ced5', group: 'color' }` |
| CSS rule | `app/src/styles/globals.css` `body` | `font-family: var(--ez-font-sans); margin: 0;` |
| docs | `docs/architecture.md` `### Shell header (EZD-011)` | Under `## Folder layout`, after `### Messages and language (t())`, before `## Server-only data access and can()`; EZD-011b appends its bullets |
| test titles | Vitest top-level `describe('EZD-011a …')`; node:test `test('EZD-011a H15 …')` | Check C9; phase 0 grep lists `011a` (docs/architecture.md Test scope; P11 V13). `shell-css.test.ts` holds one top-level `describe` per part (EZD-011b adds its own) |

No route, no `data-testid`, no message key, no user-visible text.

## 4. Tests
All Vitest tests run in `@ezdraft/app`, `environment: 'node'` (`app/vitest.config.ts`). Markup via `renderToStaticMarkup` from `react-dom/server` (pattern: `app/src/components/icon/Icon.test.tsx`, `app/src/app/dev/tokens/page.test.tsx`). Class names: the test imports the same CSS module (`import styles from './HeaderButton.module.css'`) and compares the `class` attribute's space-separated tokens against `styles.button` / `styles.primary` / `styles.header`, so it holds under any Vitest CSS-module naming strategy. CSS text checks read the file with `readFileSync`, strip `/* … */` comments and collapse whitespace (pattern: `tokens.test.ts` `squash`), then take the declarations of the named rule block. Smoke: no.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| H7 part a: header and card CSS (`shell-css.test.ts`, `describe('EZD-011a shell CSS')`) | AC-EZD-011a-1 | unit | Text of `HeaderCard.module.css`, `card.module.css`, `HeaderButton.module.css`, `app/src/styles/globals.css` | (a) `.header` first declaration `composes: card from './card.module.css'`; `.header` contains `box-sizing: border-box`, `height: var(--ez-header-height)`, `margin: var(--ez-header-margin) var(--ez-header-margin) 0`, `flex: none`. (b) `.card` contains `background: var(--ez-surface)`, `border: 1px solid var(--ez-border)`, `border-radius: var(--ez-radius-12)`, `box-shadow: var(--ez-shadow-card)`. (c) No `#` hex color, `rgb(`, `rgba(` or `oklch(` in the three shell CSS files. (d) `globals.css` `body` rule contains `margin: 0` and still `font-family: var(--ez-font-sans)` | 04 Frame (60 px via EZD-010a `--ez-header-height: 60px`; margin 16 via `--ez-header-margin: 16px`; surface, border, radius 12, card shadow); S03 `<header style>`, `.card`, `body{margin:0}`; Done when ("border-box height", "margin on top and both sides", "shared card surface"); check C10; EZD-010c T6 (d) |
| H16 HeaderCard markup (`HeaderCard.test.tsx`, `describe('EZD-011a HeaderCard')`) | AC-EZD-011a-1 | unit | (1) `<HeaderCard aria-label="T"><span data-c="1" /></HeaderCard>`; (2) `<HeaderCard />`; (3) source text of `HeaderCard.tsx`; (4) `import * as shell from './index'` | (1) markup starts with `<header` and ends with `</header>`, exactly one `<header`; `class` tokens equal `[styles.header]`; `aria-label="T"`; contains `<span data-c="1"></span>` inside. (2) exactly `<header class="${styles.header}"></header>` (no `aria-label`). (3) no `'use client'` / `"use client"` directive. (4) `shell.HeaderCard === HeaderCard` and `shell.HeaderButton === HeaderButton` (direct imports) | Section 3 contract; P11 Step 2 ("renders one `<header>`", server-safe); EZD-012 plan lines 114, 161, 173 (empty `HeaderCard` is the `<header>` child of the frame); `T` is test data |
| H8 HeaderButton (`HeaderButton.test.tsx`, `describe('EZD-011a HeaderButton')`) | AC-EZD-011a-2 | unit | (1) `<HeaderButton>Share</HeaderButton>`; (2) `<HeaderButton variant="primary" aria-haspopup="menu" data-x="1" title="t" className="extra">Issue set</HeaderButton>`; (3) `<HeaderButton type="submit">S</HeaderButton>`; (4) text of `HeaderButton.module.css` | (1) exactly one `<button`, `type="button"`, `class` tokens equal `[styles.button]`, text `Share`. (2) one `<button`, `type="button"`, class tokens equal `[styles.button, styles.primary, 'extra']` in that order, `aria-haspopup="menu"`, `data-x="1"`, `title="t"`, text `Issue set`. (3) `type="submit"`. (4) `.button` contains `border: 1px solid var(--ez-border)`, `border-radius: var(--ez-radius-8)`, `background: var(--ez-surface)`, `color: var(--ez-ink)`, `padding: 9px 14px`; `.button:hover` contains `border-color: var(--ez-border-hover)`; `.primary` contains `background: var(--ez-cobalt)`, `border-color: var(--ez-cobalt)`, `color: var(--ez-surface)`, `font-weight: 600`, `padding: 9px 16px` | S03 `.b` (`#dfe2e6` = 04 border, 8px = radius 8, `#fff` = surface, `#14171c` = ink, `9px 14px`), `.b:hover` (`#c9ced5`), `.bp` (`oklch(0.55 0.17 262)` = 04 cobalt, 600, `9px 16px`); 04 "Issue set (primary)"; Done when ("passes every other prop through"); section 3 class order; Share / Issue set are test data |
| H11 token added (`shell-css.test.ts`, same `describe`) | AC-EZD-011a-3 | unit | `:root` block of `app/src/styles/tokens.css` (comments stripped); `TOKENS` from `app/src/styles/tokens.ts` | `tokens.css` declares `--ez-border-hover: #c9ced5` exactly once; `TOKENS` contains exactly one entry with name `--ez-border-hover`, and it equals `{ name: '--ez-border-hover', value: '#c9ced5', group: 'color' }`. No count or position asserted (EZD-010a T1/T2 hold order and parity) | S03 `.b:hover{border-color:#c9ced5}`; README rule 5; P11 V3 |
| H15 part a: docs (`architecture-doc.test.mjs`, flat cases titled `EZD-011a H15 (a)` … `(d)`) | AC-EZD-011a-1, -2 | unit (node:test) | `docs/architecture.md`; `node scripts/conventions/check.mjs .` | (a) the `##` headings deep-equal `REQUIRED_HEADINGS` (13, in order). (b) a line exactly `### Shell header (EZD-011)` exists, after the line `### Messages and language (t())` and before `## Server-only data access and can()`. (c) the text between that heading and the next `##`/`###` heading contains `HeaderCard`, `HeaderButton`, `card.module.css` and `globals.css`. (d) the check exits 0 (C1 no new package; C8; C10 on the new CSS) | Step 7; P11 Step 8, V11; EZD-000 T5; docs/architecture.md Machine checks C1, C8, C10 |
| Gate | all | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-011a` | Exit 0: `typecheck`, `lint`, `test`, `build`, `test:e2e`; EZD-010a T1/T2, EZD-010c T3/T6 still pass unedited | CLAUDE.md rule 12; `scripts/gate.mjs` |

## 5. Visual checklist
None. Nothing renders these components on a page in this part; EZD-011c's `/dev/header` and its ui-verifier check the card and buttons against S03 (P11 Part EZD-011c). So EZD-016a is not a dependency of this part.

## 6. Proposed wording
None. This part adds no user-visible text; the button labels come from EZD-011b's `office.header.*` keys and the callers.

## 7. Security review
security-review: no. No tables, auth, permissions, data access, money or API; permission hiding of the buttons is the slot owners' (Q-0214; P11 Reviewers).
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier no (section 5 empty) · security-reviewer no.

## 8. Complexity and model recommendation
**Low**: three CSS modules and two stateless components on the existing token, CSS-module and `renderToStaticMarkup` patterns, with a complete contract and no data, permissions, money or auth (PROCESS.md section 4). test-author Haiku 5.5 (`claude-haiku-5-5`), builder Haiku 5.5 (`claude-haiku-5-5`); code-reviewer Opus 5.5 (P11 Part a).

Size note: 10 builder files and 4 test files, 5 tests: over "about 8 files", but the part was cut by Q-0238 and every file is a few lines (P11 Split proposal); no further split proposed.

## 9. Dependencies
From the ticket row: EZD-010a (tokens, `TOKENS`, check C10), EZD-010c (`globals.css`, `--ez-font-sans`), EZD-000 (`docs/architecture.md`, `architecture-doc.test.mjs`, `check.mjs`), EZD-004a and EZD-004b (the gate's `db:up`; the app Vitest global setup needs the local stack) (P11 V14). All `done` (P11 V14; handoff 2026-10-20). Missing from the row: none. Not needed: EZD-016a (no browser test or visual checklist here), EZD-010b (no icon), EZD-026c/d (no text).

Dependents: EZD-011b (index.ts, `HeaderCard` as the `EditorHeader` root), EZD-011c, EZD-012 (empty `HeaderCard`, `composes: card`), EZD-014 (extends `HeaderButton` and its CSS; adds its own test file, never edits H8), EZD-015 (`--ez-border-hover`).

Risks:
- **Composes path.** `composes: card from './card.module.css'` must work under both Turbopack (`next build`) and Vitest; if `next build` rejects it, the builder stops and reports (no copied card rule; one card surface, P11 Step 1).
- **Class-name strategy in Vitest.** Tests compare against the imported module's own values, never a literal class string, so a CSS-module hashing change does not break them.
- **Token order.** `--ez-border-hover` must be last in both files; EZD-012 later appends `--ez-radius-6` after it (EZD-012 plan line 126).
- **Touch target.** `HeaderButton` is about 38–40 px tall, under 11's 44 px iPad target; EZD-014 raises it (P11 Risks).

## 10. Open questions
None. Settled at Level 1: outer height 60 px with `border-box` (04 Frame; Done when; P11 Level-1 table); hover border `#c9ced5` as a token from S03 (README rule 5; P11 V3); header padding and gaps in `px` (no spacing tokens; L-013; P11 V2).
