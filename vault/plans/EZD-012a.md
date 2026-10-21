# EZD-012a · Shell: tool rail and tooltip

- **ACs:** AC-EZD-012a-1, AC-EZD-012a-2 (`vault/spec/acceptance-criteria.md` lines 69–70)
- **Complexity:** medium (reasoning in section 8)
- **User-visible result:** nothing on screen yet; the editor's tool rail (40 px tool buttons, cobalt active tool, dark tooltip with name and shortcut) exists as one component that EZD-012b and EZD-012c put on screen.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 35):
- **Scope:** Plan vault/plans/EZD-012.md Part EZD-012a: ToolRail (56 px rail, 40 px buttons, dark tooltip with name and shortcut), its CSS, rail-types.ts, --ez-radius-6 in tokens.css and tokens.ts, the four office.shell/office.tool rail keys in en.ts, three icons through the icon pipeline, shell index.ts exports. Split from EZD-012 (Q-0239).
- **Done when:** ToolRail renders the given tools as 40 px buttons with icon, name and shortcut, marks only the active tool pressed, shows each tool's dark tooltip on hover or keyboard focus only, and renders no button for an empty rail; --ez-radius-6 is in both token files.
- **Depends on:** EZD-010a, EZD-010b, EZD-011a, EZD-026c, EZD-026d, EZD-004a, EZD-004b
- **Spec ref:** App shell · Frame, Tool rail, Status bar

Source plan: vault/plans/EZD-012.md (Split proposal Part EZD-012a; Re-validation findings V2–V5, V10, V12; Approach Step 2, Step 5, Step 6 icons bullet). Names, test IDs and values are kept from it; EZD-012b, EZD-012c, EZD-014, EZD-032 cite them. *Planner's choice* marks a "how" no source decides (CLAUDE.md rule 3).

Steps:
1. **Icons** (EZD-010b pipeline; docs/architecture.md "Design tokens, fonts and icons"): `pnpm --filter @ezdraft/app icons:fetch arrow_selector_tool`, `… help`, `… kitchen`; set `icons.json` to `["arrow_selector_tool", "expand_more", "help", "kitchen"]` (sorted; current file is `["expand_more"]`); `pnpm --filter @ezdraft/app icons:build`; commit SVGs, sprite and names file. Glyphs are the S03 board's (`arrow_selector_tool` Select, `kitchen` Cabinets, `help` Help; tickets README rule 5). If a name is missing at `ICON_COMMIT`, stop and raise a question; no substitute glyph (V12).
2. **Token** (Q-0040 (c); S03 `.tip{…border-radius:6px…}`): append `--ez-radius-6: 6px;` as the last declaration of the `:root` block in `app/src/styles/tokens.css`, after `--ez-border-hover`, with the comment `/* S03 .tip; Q-0040 (c); EZD-012a */`; append `{ name: '--ez-radius-6', value: '6px', group: 'radius' }` as the last `TOKENS` entry in `tokens.ts` (same order as the CSS, EZD-010a Step 2). EZD-010a T1/T2 assert the 36 spec rows and parity, no count; not edited.
3. **Messages** (R26 R17; office is English only, not in `SPANISH_NAMESPACES`, docs "Messages and language"): append to `en` in `app/src/server/messages/catalogs/en.ts`, after `office.header.issue_set`, the four keys of section 3. No `es` entry.
4. **Types** `app/src/components/shell/rail-types.ts` (section 3). Type-only imports, as `editor-views.ts`. No tool registry (04 table and "Shown on" are EZD-230's).
5. **Component** `app/src/components/shell/ToolRail.tsx`: `'use client'`, controlled, no state, no effects, no pointer/scroll/resize listeners (11 rule 4; EZD-017 counts commits). Markup in section 3. Click calls `onSelect(tool.id)` only (11 Budgets "Tool pick … within 50 ms"). Labels through `const t = useT()` (docs: the hook result is named `t`). `<Icon name={tool.icon} size={21} />` (21 from S03 `.rb` `font-size:21px`). Tooltip is CSS-only: no React state on hover, no Radix (02 lists Radix for dialogs, menus, popovers only).
6. **CSS** `app/src/components/shell/ToolRail.module.css`, rules in section 3 "CSS rules". Colors, radii and frame sizes through `var(--ez-*)` (C10; 02 "CSS modules on the design tokens"). Board sizes with no token (40, 10, 2, 24, 6, 52, 5/9, 8, 12 px) stay px: 04 defines no spacing tokens (L-013; V2). No `overflow: hidden` on the rail or its groups (would clip the tooltip). No `pointer-events: none` on the tooltip (EZD-012c B6 hit-tests it).
7. **Barrel** `app/src/components/shell/index.ts`: append `export { ToolRail } from './ToolRail';` and `export type { RailTool, RailSeparator, RailEntry } from './rail-types';` (V4; docs "index.ts re-exports the shell parts").
8. Run Prettier on the hand-written files (docs Tests). No `docs/architecture.md` change (EZD-012b writes `### Editor shell`; the radius-6 line already exists in docs "Design tokens"). No dependency added.

| Path | New / change | Why |
| --- | --- | --- |
| `app/src/components/shell/ToolRail.tsx` | New (builder) | Step 5; 04 Tool rail |
| `app/src/components/shell/ToolRail.module.css` | New (builder) | Step 6; S03 `.rb`, `.rbon`, `.rs`, `.tip` |
| `app/src/components/shell/rail-types.ts` | New (builder) | Step 4 |
| `app/src/components/shell/index.ts` | Change (builder) | Step 7 |
| `app/src/styles/tokens.css`, `app/src/styles/tokens.ts` | Change (builder) | Step 2; Q-0040 (c) |
| `app/src/server/messages/catalogs/en.ts` | Change (builder) | Step 3 |
| `app/src/components/icon/icons.json`; generated: `svg/arrow_selector_tool.svg`, `svg/help.svg`, `svg/kitchen.svg`, `icon-names.generated.ts`, `app/public/icons/sprite.svg` | Change / new (builder, by script) | Step 1 |
| `app/src/components/shell/ToolRail.test.tsx` | New (test-author) | U1, U2, U8 |
| `app/src/components/shell/frame-css.test.ts` | New (test-author) | S1 part a, U7; EZD-012b adds its own top-level `describe` (V10) |
| `icons.test.ts`, `tokens.test.ts`, `catalog.test.ts`, `header-messages.test.ts`, `shell-css.test.ts`, `card.module.css`, `HeaderCard.*`, `globals.css`, `layout.tsx`, `package.json` files, `docs/`, `vault/` | Not touched | Owned by EZD-010a/b, EZD-011a/b, EZD-026d; none asserts a count this ticket changes (EZD-010b T8 is one symbol per `icons.json` entry; H9 filters `office.header.*`) |

Data: none. No table, migration, RLS, `schema_version` or money field.

## 2. Sources
- Spec `vault/spec/sections/04-app-shell-and-global-ui.md`: **Frame and visual system** (tool rail 56 px; colors cobalt, ink, slate 700/300, border, hover, surface; DM Mono for codes; Material Symbols Outlined as an SVG sprite; radii 5/7/8/10/12/999); **Tool rail** ("The active tool is a cobalt button with a white icon; hovering shows a dark tooltip with name and shortcut"; table rows Select V, Cabinets C, Help ?; "every rail tool has a default key"; Check sits above Help). **Status bar**: nothing in this part (EZD-012b).
- `11-non-functional-requirements.md`: Performance budgets row "Tool pick … On screen within 50 ms"; rule 4 (no React render per pointer move); Accessibility and input ("All icon buttons have labels and tooltips; keyboard shortcuts for rail tools").
- `02-product-overview.md` Named tools (via docs/architecture.md): CSS modules on tokens; Radix for dialogs, menus, popovers.
- `03-data-model.md`: nothing touched.
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0040 (c) (tooltip radius 6 px, board-cited exception token); Q-0026 (a) (`oklch()` cobalt, no fallback); Q-0038 (b) and Q-0122 (a) ("More tools" flyout and per-user order, both EZD-230's, phase 11; not built here, `top`/`bottom` props stay). R26 R17 (office English, every string through one helper). Q-0239 (the split). Q-0229 (status bar disclaimer, EZD-136): not this part.
- Mockup (Studio): `vault/mockups/S03Plan.png`, `vault/mockups/html/project/S03Plan.dc.html`: rail `<nav class="card" aria-label="Tools" style="width: 56px; … gap: 2px; padding: 10px 0">`; `.rb{width:40px;height:40px;border-radius:8px;…background:transparent;color:#3b424d;font-size:21px}`; `.rb:hover{background:#f2f4f7}`; `.rbon{background:oklch(0.55 0.17 262);color:#fff}`; `.rbon:hover{background:oklch(0.55 0.17 262)}`; `.rs{width:24px;height:1px;background:#dfe2e6;margin:6px 0}`; `.tip{position:absolute;left:52px;top:50%;transform:translateY(-50%);white-space:nowrap;background:#14171c;color:#fff;font-size:12px;padding:5px 9px;border-radius:6px;display:flex;gap:8px;z-index:3}`; key `<span class="mono" style="color: #9aa3af">C</span>`; spacer `flex: 1` before Check and Help. Sample tools on the board are not a decision (KNOWN-LIMITS 5).
- Code read on develop (62980a9): `app/src/styles/tokens.css`, `tokens.ts` (no `--ez-radius-6` yet; last entry `--ez-border-hover`), `app/src/components/icon/Icon.tsx` (`Icon({ name, size })` → `<svg width height aria-hidden="true" …><use href="/icons/sprite.svg#<name>">`), `icons.json` (`["expand_more"]`), `app/scripts/icons-fetch.mjs` (`ICON_COMMIT`), `app/src/components/shell/index.ts`, `card.module.css` (`.card`), `editor-views.ts` (type-only `MessageKey` import), `shell-css.test.ts` and `EditorHeader.test.tsx` (`renderToStaticMarkup` in `MessagesProvider`, `block()` CSS helper), `app/src/lib/messages/MessagesProvider.tsx` (`useT(): T<MessageKey>`), `app/src/server/messages/catalogs/en.ts` (`en`, `MessageKey`), `app/vitest.config.ts` (`environment: 'node'`, no DOM).
- Dependency contracts: EZD-010a (tokens, C10), EZD-010b (`Icon`, pipeline), EZD-010c (`--ez-font-mono`), EZD-011a (`card.module.css`, `index.ts`), EZD-026c/d (`useT`, `MessagesProvider`, `catalogFor`, `MessageKey`), read as merged code and docs/architecture.md; parent plan V2–V5.
- Lessons: L-013 (name the token per property kind or limit "tokens only"; applied in Step 6).
- Research: no report covers this ticket.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file / types | `app/src/components/shell/rail-types.ts` | `import type { IconName } from '../icon/icon-names.generated'`; `import type { MessageKey } from '../../server/messages/catalog'`. `export type RailTool = { kind: 'tool'; id: string; icon: IconName; label: MessageKey; shortcut: string }`; `export type RailSeparator = { kind: 'separator' }`; `export type RailEntry = RailTool \| RailSeparator` |
| file / export | `app/src/components/shell/ToolRail.tsx` | `'use client'`; `export function ToolRail(props: { top: RailEntry[]; bottom: RailTool[]; activeId: string \| null; onSelect: (id: string) => void })` |
| markup | rail root | `<nav class=… data-shell-region="rail" aria-label={t('office.shell.tools')}>` containing, in order, `<div data-rail="top">` (the `top` entries in order) and `<div data-rail="bottom">` (the `bottom` tools in order). Both groups always render, also when empty |
| markup | each tool | `<div class=slot>` → `<button type="button" class=tool data-rail-tool={id} aria-label={t(label)} aria-keyshortcuts={shortcut} aria-pressed={id === activeId}>` holding `<Icon name={icon} size={21} />`, then sibling `<span class=tip data-rail-tooltip="" aria-hidden="true">{t(label)}<kbd class=key>{shortcut}</kbd></span>`. React key `id` |
| markup | each separator | `<span class=separator data-rail="separator" role="separator" aria-orientation="horizontal" />`; React key its index |
| props | `activeId` | the one tool whose `id === activeId` has `aria-pressed="true"`; every other tool `aria-pressed="false"`; `null` presses none |
| CSS rules | `ToolRail.module.css` (selectors exact; tests compare after collapsing whitespace and normalizing quotes) | `.rail`: first declaration `composes: card from './card.module.css'`; `box-sizing: border-box; flex: none; align-self: stretch; width: var(--ez-rail-width); display: flex; flex-direction: column; align-items: center; padding: 10px 0`. `.group`: `display: flex; flex-direction: column; align-items: center; gap: 2px`. `.top`: `flex: 1; min-height: 0`. `.slot`: `position: relative`. `.tool`: `width: 40px; height: 40px; padding: 0; border: 0; border-radius: var(--ez-radius-8); display: flex; align-items: center; justify-content: center; background: transparent; color: var(--ez-slate-700); cursor: pointer`. `.tool:hover`: `background: var(--ez-hover)`. `.tool[aria-pressed='true'], .tool[aria-pressed='true']:hover` (after `.tool:hover`): `background: var(--ez-cobalt); color: var(--ez-surface)`. `.tool:focus-visible`: `outline: 2px solid var(--ez-cobalt); outline-offset: 2px`. `.separator`: `width: 24px; height: 1px; margin: 6px 0; background: var(--ez-border)`. `.tip`: `display: none; position: absolute; left: 52px; top: 50%; transform: translateY(-50%); z-index: 3; white-space: nowrap; gap: 8px; padding: 5px 9px; font-size: 12px; background: var(--ez-ink); color: var(--ez-surface); border-radius: var(--ez-radius-6)`. `.slot:hover .tip, .tool:focus-visible + .tip`: `display: flex`. `.key`: `font-family: var(--ez-font-mono); font-size: inherit; color: var(--ez-slate-300)`. No other rule's selector contains `.tip` |
| barrel | `app/src/components/shell/index.ts` | adds `ToolRail`; types `RailTool`, `RailSeparator`, `RailEntry` |
| token | `app/src/styles/tokens.css` / `tokens.ts` | `--ez-radius-6: 6px` (last `:root` declaration); `TOKENS` last entry `{ name: '--ez-radius-6', value: '6px', group: 'radius' }` |
| messages | `en` (`catalogs/en.ts`) | `office.shell.tools` = `Tools`; `office.tool.select` = `Select`; `office.tool.cabinets` = `Cabinets`; `office.tool.help` = `Help` |
| icons | `icons.json`, `IconName` | `["arrow_selector_tool", "expand_more", "help", "kitchen"]`; `IconName` gains the three names |
| data-* for later parts | — | `data-shell-region="rail"`, `data-rail="top" \| "bottom" \| "separator"`, `data-rail-tool`, `data-rail-tooltip` are what EZD-012b U3/U6, EZD-012c B4–B6 and EZD-032 select on; do not rename |

Notes: hover/focus-only showing is CSS (`:hover` on the slot, `:focus-visible` on the button), so a mouse click does not pin the tooltip and no React commit happens on hover (11 rule 4). The pressed rule repeats `:hover` so the active tool stays cobalt under the pointer (S03 `.rbon:hover`). The tooltip is `aria-hidden` because the button already carries name (`aria-label`) and key (`aria-keyshortcuts`) (11 Accessibility; *planner's choice*). Focus outline 2 px cobalt, offset 2 px: *planner's choice*.

## 4. Tests

Vitest in `@ezdraft/app`, `environment: 'node'` (no DOM; `app/vitest.config.ts`). Components are rendered with `renderToStaticMarkup` inside `<MessagesProvider language="en" messages={catalogFor('office', 'en')}>` (EZD-011b pattern). CSS is read as text with the `block()` helper pattern of `shell-css.test.ts`. Each file has one top-level `describe` starting `EZD-012a` (C9; V10). Fixture tools: `select` = `{ kind: 'tool', id: 'select', icon: 'arrow_selector_tool', label: 'office.tool.select', shortcut: 'V' }`, `cabinets` = (`kitchen`, `office.tool.cabinets`, `C`), `help` = (`help`, `office.tool.help`, `?`) (04 Tool rail table; S03 glyphs). Smoke: no. Hover and focus in a real browser are EZD-012c B5–B6.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| U1 Rail markup (title starts `EZD-012a done when:`), file `ToolRail.test.tsx`, `ToolRail` imported from `./index` | AC-EZD-012a-1 | unit | (a) `top [select, {kind:'separator'}, cabinets]`, `bottom [help]`, `activeId 'select'`; (b) same with `activeId null` | (a) exactly one `<nav`, with `data-shell-region="rail"` and `aria-label="Tools"`; exactly 3 `<button`, each `type="button"`; `aria-pressed="true"` exactly once, on the button with `data-rail-tool="select"`, and `aria-pressed="false"` exactly twice; `aria-label` `Select`, `Cabinets`, `Help`; `aria-keyshortcuts` `V`, `C`, `?` on the matching buttons; 3 `<svg` with `width="21"` and `<use href="/icons/sprite.svg#arrow_selector_tool">`, `#kitchen`, `#help`; exactly one `role="separator"` with `data-rail="separator"`, between the select and cabinets buttons in document order; 3 `data-rail-tooltip` spans, each `aria-hidden="true"`, holding `Select` then a `<kbd` with `V`, `Cabinets`/`C`, `Help`/`?`; `data-rail="top"` before `data-rail="bottom"`; select and cabinets before `data-rail="bottom"`, help after it. (b) 0 `aria-pressed="true"`, 3 `aria-pressed="false"` | 04 Tool rail (names, keys V/C/?, "active tool"); section 3 markup; Step 3 values; S03 `<nav aria-label="Tools">`, glyphs, `.rb` 21 px |
| U2 Empty rail | AC-EZD-012a-1 | unit | `top []`, `bottom []`, `activeId null` | `<nav` with `data-shell-region="rail"` and `aria-label="Tools"`; `data-rail="top"` and `data-rail="bottom"` present; 0 `<button`, 0 `role="separator"`, 0 `data-rail-tooltip` | Parent plan Level-1 answer (EZD-230 row: tools without a built feature are not shown); section 3 |
| U8 Rail CSS: 40 px buttons, cobalt active, dark tooltip on hover or focus only | AC-EZD-012a-1 | unit | `ToolRail.module.css` as text | `.tool` has `width: 40px`, `height: 40px`, `border-radius: var(--ez-radius-8)`, `background: transparent`, `color: var(--ez-slate-700)`; `.tool:hover` has `background: var(--ez-hover)`; the rule `.tool[aria-pressed='true'], .tool[aria-pressed='true']:hover` has `background: var(--ez-cobalt)` and `color: var(--ez-surface)` and comes after `.tool:hover`; `.tip` has `display: none`, `position: absolute`, `left: 52px`, `font-size: 12px`, `background: var(--ez-ink)`, `color: var(--ez-surface)`, `border-radius: var(--ez-radius-6)` and no `pointer-events`; the rule `.slot:hover .tip, .tool:focus-visible + .tip` has `display: flex`; exactly 2 rules have a selector containing `.tip`; `.key` has `font-family: var(--ez-font-mono)` and `color: var(--ez-slate-300)` | S03 `.rb`, `.rb:hover`, `.rbon`, `.rbon:hover`, `.tip`, key `#9aa3af` in `.mono`; 04 (cobalt active, white icon, dark tooltip; DM Mono for codes; colors); Q-0040 (c); 11 Accessibility (keyboard); section 3 |
| S1 part a Rail CSS uses tokens, file `frame-css.test.ts` | AC-EZD-012a-1 | unit | `ToolRail.module.css` as text; spawn `node scripts/conventions/check.mjs .` from the repo root | contains `var(--ez-rail-width)`, `var(--ez-cobalt)`, `var(--ez-ink)`, `var(--ez-radius-6)`; `.rail`'s first declaration is `composes: card from './card.module.css'`; does not match `/border-radius:\s*6px/`; contains none of `56px`, `248px`, `336px`, `30px`, `60px`; check exits 0 (C10) | Parent S1 (ToolRail clauses); 04 Frame tokens (EZD-010a rows 28–36); C10; EZD-011a card module; Q-0040 (c) |
| U7 Tooltip radius token in both files (title starts `EZD-012a done when:`), file `frame-css.test.ts` | AC-EZD-012a-2 | unit | `:root` block of `app/src/styles/tokens.css`; `TOKENS` | `tokens.css` declares `--ez-radius-6: 6px` exactly once; `TOKENS` has exactly one entry with name `--ez-radius-6`, equal to `{ name: '--ez-radius-6', value: '6px', group: 'radius' }`. No count or position asserted | Q-0040 (c); S03 `.tip` `border-radius:6px`; EZD-010a Step 2 (screen tickets append board-cited tokens) |
| Gate | all | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-012a` | exit 0: typecheck, lint, test, build, test:e2e; EZD-010a T1/T2, EZD-010b T8, EZD-011b H9, EZD-026d catalog tests still pass unedited | CLAUDE.md rule 12 |

## 5. Visual checklist
None. No page renders the rail in this part; EZD-012c's `/dev/shell/rail` and its checklist (desktop 1600 × 1000 against S03) cover it, so EZD-016a is not a dependency here.

## 6. Proposed wording
None. `Tools` is the S03 board's `<nav aria-label="Tools">`; `Select`, `Cabinets`, `Help` are 04 Tool rail table names; shortcuts `V`, `C`, `?` are 04's default keys.

## 7. Security review
security-review: no (no table, auth, permission, data access, money or API; a presentational client component).
Reviewers needed: code-reviewer yes · calc-auditor no (no calculations, model dimensions or scaling) · ui-verifier no (section 5 empty; EZD-012c) · security-reviewer no.

## 8. Complexity and model recommendation
medium: a typed client component that EZD-012b/c, EZD-014 and EZD-230 extend, a CSS-only tooltip whose selectors the tests pin, a new token and three icons through a script pipeline; no data, permissions, money or auth, but not clearly low (PROCESS.md section 4). test-author `claude-sonnet-5-5`, builder `claude-sonnet-5-5`; code-reviewer `claude-opus-5-5`.

## 9. Dependencies
- Ticket row: EZD-010a (tokens, C10), EZD-010b (`Icon`, `icons:fetch` / `icons:build`), EZD-011a (`card.module.css`, `index.ts`), EZD-026c (`useT`), EZD-026d (`MessagesProvider`, `catalogFor`, `en`, `MessageKey`), EZD-004a, EZD-004b (the app Vitest global setup reads the local Supabase env). All done (STATUS.md).
- Missing from the row (done; say so): EZD-010c (`--ez-font-mono` from `fonts.ts`, used by `.key`); EZD-000 and EZD-001 (`scripts/conventions/check.mjs`, app package and Vitest config; transitive through EZD-010a).
- Not a dependency: EZD-016a (no browser test or visual checklist in this part).
- Dependents: EZD-012b (`EmptyEditor` renders `<ToolRail top={[]} bottom={[]} activeId={null} …/>`), EZD-012c (`SampleRail`, B4–B6), then EZD-014 (44 px iPad targets change `.tool` size), EZD-230 (registry, key bindings, "More tools" flyout Q-0038 (b), per-user order Q-0122 (a)), EZD-222 (Help, key handling).
- Risks: the three glyph names must exist at `ICON_COMMIT` (else stop, V12); the pressed rule must stay after `.tool:hover` or the active tool loses cobalt on hover; any `overflow: hidden` on the rail or `pointer-events: none` on `.tip` breaks EZD-012c B6; renaming a `data-*` hook breaks EZD-012b/c and EZD-032. Performance: no listeners and a CSS tooltip keep the rail at zero React commits during a pan (EZD-017). `oklch()` cobalt has no fallback (Q-0026 (a), Q-0013 (a) floor).

## 10. Open questions
None.
