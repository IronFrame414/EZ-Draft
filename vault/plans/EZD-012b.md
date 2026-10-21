# EZD-012b · Shell: frame, status bar and empty editor

- **ACs:** AC-EZD-012b-1, AC-EZD-012b-2, AC-EZD-012b-3, AC-EZD-012b-4 (`vault/spec/acceptance-criteria.md` lines 71–74)
- **Complexity:** medium (section 8)
- **User-visible result:** nothing on screen yet; the empty Studio editor (frame, empty rail, empty left panel and inspector cards, grid canvas, empty status bar) exists as one component that EZD-012c's `/dev/shell` and EZD-032's build-gate test show.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: ready

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 36):
- **Scope:** Plan vault/plans/EZD-012.md Part EZD-012b: EditorFrame, StatusBar, StatusItem, EmptyEditor and their CSS (left panel 248, inspector 336, status bar 30, canvas with 32 px grid), the two panel keys in en.ts, shell index.ts exports, the Editor shell subsection of docs/architecture.md. Split from EZD-012 (Q-0239).
- **Done when:** EmptyEditor renders the frame regions in order (header slot as the root's first child, then the body with rail, left panel, canvas and inspector, then the status bar) with labelled panels and no text outside the header slot; StatusBar renders its start and end groups; the shell CSS takes every 04 frame size from its token; the docs describe the shell.
- **Depends on:** EZD-012a, EZD-011a, EZD-010a, EZD-026c, EZD-026d, EZD-000, EZD-004a, EZD-004b
- **Spec ref:** App shell · Frame, Tool rail, Status bar

Source plan: P12 = vault/plans/EZD-012.md (Split proposal Part EZD-012b; findings V1–V14; Approach Steps 1, 3, 4, 5, 7). This plan applies P12 to the v2 template; no P12 value changes. Exact markup and CSS are in section 3.

Steps:
1. **Frame** `EditorFrame.tsx` + `EditorFrame.module.css` (P12 Step 1; 04 Frame and visual system). `'use client'` (02 Named tools: editor is a client-only shell). Root `div` holds the header slot unwrapped (HeaderCard owns height 60 and margin 16 16 0, EZD-011a contract), then the body (rail, left `<aside>`, canvas `<main>`, inspector `<aside>`), then the status-bar slot. Panel `aria-label`s are message keys through `useT()` (R26 R17). Rail, left panel and inspector compose `card.module.css` (EZD-011a). Grid is the root's CSS background (04 "canvas `#f6f7f9` with 32 px grid `#e6e9ed`"; S03 root `div`, 1 px lines). Left panel stretches to body height (P12 Level-1 answer: 15 of 16 boards; S03 alone uses `align-items: flex-start`). Every region is border-box so 04 sizes are outer sizes (P12 Level-1 answer).
2. **Status bar** `StatusBar.tsx` (exports `StatusBar`, `StatusItem`) + `StatusBar.module.css` (P12 Step 3; 04 Status bar; S03 `<footer>`, `.sl`, `.sv`). Start group takes the free space (S03 `flex: 1` spacer before Cursor and zoom). No items in Phase 0: each readout is its own ticket (EZD-214, EZD-219, EZD-126, EZD-315; disclaimer line EZD-136, Q-0229).
3. **Empty editor** `EmptyEditor.tsx` (P12 Step 4). `'use client'`. `EditorFrame` with `ToolRail` (EZD-012a) given empty `top` / `bottom`, `activeId` `null`; empty panels, canvas and `StatusBar`. Empty because no tool feature exists in Phase 0 (P12 Level-1 answer; EZD-230 row "Tools whose feature is not built yet … not shown on the rail"). Empty arrays and the no-op `onSelect` are module constants so the rail gets stable props (11 rule 4; *planner's choice*).
4. **Messages** append to `en.ts` after EZD-012a's `office.shell.tools`: `office.shell.left_panel` = `Left panel`, `office.shell.inspector` = `Inspector` (P12 Step 5; section 6). No `es` entry (`office` is not in `SPANISH_NAMESPACES`; R26 R17; docs `### Messages and language (t())`).
5. **Barrel** `index.ts` appends `EditorFrame`, `StatusBar`, `StatusItem`, `EmptyEditor` and type `EditorFrameProps` (docs `### Shell header (EZD-011)`: index re-exports the shell parts; P12 V4).
6. **Docs** `docs/architecture.md`: subsection `### Editor shell (EZD-012)` after the last `### Shell header (EZD-011)` bullet, before `## Server-only data access and can()`; one Machine checks row (P12 Step 7, V11; section 3). No `##` heading added (EZD-000 T5). No dependency row (none added).
7. Prettier on the hand-written files (docs Tests). No pointer, scroll or resize listener anywhere (11 rule 4; EZD-017 counts React commits during a pan).

Deviation from P12 recorded here: P12 Step 1's module-wide `*` `box-sizing` rule is replaced by `box-sizing: border-box` on each region class (frame, body, panels, status bar; EZD-012a's `.rail` and EZD-011a's `.header` already set it). Same boxes; avoids a universal selector in a CSS module (*planner's choice*, CLAUDE.md rule 3).

Files:

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/components/shell/EditorFrame.tsx` | New | builder | Step 1 |
| `app/src/components/shell/EditorFrame.module.css` | New | builder | Step 1 |
| `app/src/components/shell/StatusBar.tsx` | New | builder | Step 2 |
| `app/src/components/shell/StatusBar.module.css` | New | builder | Step 2 |
| `app/src/components/shell/EmptyEditor.tsx` | New | builder | Step 3 |
| `app/src/server/messages/catalogs/en.ts` | Change (append 2 keys) | builder | Step 4 |
| `app/src/components/shell/index.ts` | Change (append) | builder | Step 5 |
| `docs/architecture.md` | Change | builder | Step 6 |
| `app/src/components/shell/EditorFrame.test.tsx` | New | test-author | U3 |
| `app/src/components/shell/StatusBar.test.tsx` | New | test-author | U4 |
| `app/src/components/shell/frame-css.test.ts` | Change (EZD-012a creates it; add own top-level `describe`) | test-author | S1 part b |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (append) | test-author | D1 |
| `ToolRail.*`, `rail-types.ts`, `card.module.css`, `HeaderCard.*`, `tokens.css`, `tokens.ts`, `globals.css`, `layout.tsx`, `es.ts`, icon files, `app/src/app/dev/**`, `package.json` files, `vault/**` | Not touched | — | Owned by EZD-012a, EZD-011a, EZD-010a–c, EZD-026d, EZD-012c |

Write permissions (L-002): builder paths are under `app/src/`, `docs/` (allowed by `.claude/hooks/guard-paths.mjs` builder rule); test paths match `isTest` (`.test.tsx`, `.test.ts`, `__tests__/`).

Data: none. No tables, migrations, RLS, `schema_version` or money fields.

## 2. Sources

- Spec `vault/spec/sections/04-app-shell-and-global-ui.md`: opening paragraph (one fixed shell: header card, tool rail, left panel, canvas, inspector, status bar); **Frame and visual system** (1600 × 1000 reference; header 60, margin 16; body padding 16, gap 16; rail 56; left panel 248; inspector 336; status bar 30; colors, canvas `#f6f7f9` with 32 px grid `#e6e9ed`; DM Mono for numbers; radii; card shadow); **Tool rail** (rail on every editor tab); **Left panel and inspector** (left panel content changes with the tool, so its label is a prop); **Status bar** (items, owned by later tickets).
- Spec `02-product-overview.md` Named tools (client-only editor shell; CSS modules on the design tokens), via `docs/architecture.md` Named tools. `11-non-functional-requirements.md` rule 4 (no React render per pointer move), Accessibility (labels), via P12 Sources read.
- Decisions `vault/spec/decisions/04-app-shell-and-global-ui.md`: Q-0026 (a) (oklch tokens, no fallback); Q-0038 (b) and Q-0122 (a) ("More tools" flyout and per-user order are EZD-230's; rail props unchanged, P12 V7); Q-0039 (c) (no product route in Phase 0; EZD-032 opens `/dev/shell`); Q-0229 (disclaimer line in the editor status bar, built by EZD-136 in Phase 1, P12 V7). R26 R17 (office English, every string through `t()`), `13b-round-26.md`.
- Questions: Q-0239 (EZD-012 split into a, b, c).
- Plans (interface contracts only, `outline.mjs --section 3`): EZD-012a (`ToolRail`, `data-shell-region="rail"`, `office.shell.tools`, `frame-css.test.ts`); EZD-011a (`card.module.css` `.card`, `HeaderCard` `.header` with height, margin, `flex: none`, border-box). P12 Split proposal, findings V1–V14 and Approach Steps 1, 3, 4, 5, 7 (the ticket row names it as this part's source).
- Code read 2026-10-20 on develop 8f110e4: `app/src/styles/tokens.css` lines 6–40 (frame tokens `--ez-header-height` … `--ez-grid-size`, `--ez-canvas`, `--ez-canvas-grid`, `--ez-surface`, `--ez-border`, `--ez-radius-8`, `--ez-slate-500`, `--ez-slate-300`, `--ez-ink`); `app/src/components/shell/index.ts`, `card.module.css`, `EditorHeader.tsx` (`'use client'`, `useT` from `../../lib/messages`), `EditorHeader.test.tsx` (`renderToStaticMarkup` in `MessagesProvider` with `catalogFor('office','en')`), `shell-css.test.ts` (`squash` / `block` helpers); `app/src/server/messages/catalog.ts` (`MessageKey`); `scripts/conventions/__tests__/architecture-doc.test.mjs` (EZD-011a H15 pattern); `app/vitest.config.ts` (`environment: 'node'`).
- Mockup (Studio only): `vault/mockups/S03Plan.png`, `html/project/S03Plan.dc.html`: root `div` grid; body `padding: 16px; gap: 16px`; `.card`; `<aside aria-label="Inspector">`; left `<aside aria-label="Layers">` (Select's content; other boards "Cabinet library" S04, "Reference layers" S11, "Views and layers" S07); `<footer>` `height 30; margin 0 16px 16px; gap 20px; padding 0 16px; border 1px #dfe2e6; radius 8; 12px; #5e6672; DM Mono`, items `gap: 6px`, `.sl` `#9aa3af`, `.sv` `#14171c`, `flex: 1` spacer. Sample values ("1/2\"", "100%") are not used (KNOWN-LIMITS 5).
- Research: no report covers this ticket.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| export / type | `EditorFrameProps` (`EditorFrame.tsx`) | `{ header?: ReactNode; rail: ReactNode; leftPanel?: ReactNode; leftPanelLabel: MessageKey; canvas?: ReactNode; inspector?: ReactNode; inspectorLabel: MessageKey; statusBar: ReactNode }`; `MessageKey` type-only from `../../server/messages/catalog` |
| export | `EditorFrame(props: EditorFrameProps)` | `'use client'` first line; named export |
| markup | `EditorFrame` | `<div class=frame data-shell-region="frame">{header}<div class=body data-shell-region="body">{rail}<aside class=leftPanel data-shell-region="left-panel" aria-label={t(leftPanelLabel)}>{leftPanel}</aside><main class=canvas data-shell-region="canvas">{canvas}</main><aside class=inspector data-shell-region="inspector" aria-label={t(inspectorLabel)}>{inspector}</aside></div>{statusBar}</div>`. `header` is the root's first child with no wrapper; there is no `data-shell-region="header"`. No event listener |
| CSS | `EditorFrame.module.css` (selectors exact) | `.frame`: `box-sizing: border-box; position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--ez-ink); background-color: var(--ez-canvas); background-image: linear-gradient(var(--ez-canvas-grid) 1px, transparent 1px), linear-gradient(90deg, var(--ez-canvas-grid) 1px, transparent 1px); background-size: var(--ez-grid-size) var(--ez-grid-size)`. `.body`: `box-sizing: border-box; flex: 1; min-height: 0; display: flex; align-items: stretch; padding: var(--ez-body-padding); gap: var(--ez-body-gap)`. `.leftPanel`: first `composes: card from './card.module.css'`; then `box-sizing: border-box; flex: none; width: var(--ez-left-panel-width); overflow: hidden; display: flex; flex-direction: column`. `.inspector`: same with `width: var(--ez-inspector-width)`. `.canvas`: `box-sizing: border-box; flex: 1; min-width: 0; position: relative`. No rule names `--ez-header-height` or `--ez-header-margin` |
| export | `StatusBar(props: { start?: ReactNode; end?: ReactNode })` (`StatusBar.tsx`) | `'use client'` first line. `<footer class=bar data-shell-region="status-bar"><div class=start data-status="start">{start}</div><div class=end data-status="end">{end}</div></footer>`; both groups always render |
| export | `StatusItem(props: { label: MessageKey; children?: ReactNode })` (`StatusBar.tsx`) | `<div class=item data-status-item=""><span class=label data-status-label="">{t(label)}</span><span class=value data-status-value="">{children}</span></div>` |
| CSS | `StatusBar.module.css` (selectors exact) | `.bar`: `box-sizing: border-box; flex: none; height: var(--ez-status-bar-height); margin: 0 var(--ez-body-padding) var(--ez-body-padding); display: flex; align-items: center; gap: 20px; padding: 0 16px; background: var(--ez-surface); border: 1px solid var(--ez-border); border-radius: var(--ez-radius-8); font-size: 12px; color: var(--ez-slate-500); font-family: var(--ez-font-mono)`; no `box-shadow`. `.start`: `flex: 1; min-width: 0; display: flex; align-items: center; gap: 20px`. `.end`: `display: flex; align-items: center; gap: 20px`. `.item`: `display: flex; align-items: center; gap: 6px`. `.label`: `color: var(--ez-slate-300)`. `.value`: `color: var(--ez-ink)` |
| export | `EmptyEditor({ header }: { header?: ReactNode })` (`EmptyEditor.tsx`) | `'use client'` first line. Renders `<EditorFrame header={header} rail={<ToolRail top={NO_ENTRIES} bottom={NO_TOOLS} activeId={null} onSelect={noop} />} leftPanelLabel="office.shell.left_panel" inspectorLabel="office.shell.inspector" statusBar={<StatusBar />} />` with module-level constants |
| messages | `en` | `office.shell.left_panel` = `Left panel`; `office.shell.inspector` = `Inspector`; none in `es` |
| barrel | `app/src/components/shell/index.ts` | appends `EditorFrame`, `StatusBar`, `StatusItem`, `EmptyEditor`; type `EditorFrameProps` |
| data-* | — | `data-shell-region` = `frame`, `body`, `left-panel`, `canvas`, `inspector`, `status-bar` (plus EZD-012a's `rail`); `data-status` = `start`, `end`; `data-status-item`, `data-status-label`, `data-status-value`. EZD-012c B1–B3, EZD-014 and EZD-032 select on these; do not rename |
| docs | `docs/architecture.md` `### Editor shell (EZD-012)` | After `### Shell header (EZD-011)`, before `## Server-only data access and can()`. Bullets: files and exports above plus EZD-012a's `ToolRail`, `rail-types.ts`; client components using `useT()` with `office.` keys; the `data-shell-region` names; header slot unwrapped, `HeaderCard` owns height and margin; sizes are border-box 04 sizes from the frame tokens; grid is CSS on the frame root until EZD-207 decides how its WebGL grid meets it; rail entries are props, EZD-230 owns the tool list, the "More tools" flyout and per-user order (Q-0038 (b), Q-0122 (a)), tools appear only when their feature exists; tooltip is CSS only (EZD-012a); status bar readouts that change per pointer move write through a ref, never React state (11 rule 4); the disclaimer line goes in the status bar (EZD-136, Q-0229); no pointer, scroll or resize listener in the shell |
| docs row | `## Machine checks` | `\| — \| Shell CSS takes the 04 frame sizes and the tooltip radius from tokens \| app/src/components/shell/frame-css.test.ts (S1, U7) \| EZD-012a, EZD-012b \|` |
| test titles | Vitest top-level `describe('EZD-012b …')`; node:test `test('EZD-012b D1 …')` | C9; phase 0 grep lists `012b` (docs Test scope; P12 V10). `frame-css.test.ts` keeps EZD-012a's `describe` and adds `describe('EZD-012b frame CSS', …)` |

Consistency: EZD-012a's `ToolRail` props and `data-shell-region="rail"` are used as its contract states; EZD-011a's `HeaderCard` is never imported here (EZD-012c passes it); EZD-012c's `/dev/shell` renders `<EmptyEditor header={<HeaderCard />} />` (P12 Part c contract).

## 4. Tests

Vitest in `@ezdraft/app`, `node` environment, `renderToStaticMarkup` inside `<MessagesProvider language="en" messages={catalogFor('office', 'en')}>` (EditorHeader.test.tsx pattern). CSS read as text with the `squash` / `block` helpers of `shell-css.test.ts` (copied or re-declared in the file; never imported from another ticket's test). Assertions match attributes, order and counts; text only for the two section 6 / board strings.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| U3 (a) Frame regions (**Done when**). Title `EZD-012b done when: EmptyEditor renders the frame regions in order with labelled panels and no text outside the header slot` | AC-EZD-012b-1 | unit | `EmptyEditor` with `header={<p data-x="1" />}` | The `data-shell-region` values in markup order are exactly `frame`, `body`, `rail`, `left-panel`, `canvas`, `inspector`, `status-bar`; the frame's opening tag is followed directly by `<p data-x="1"`; no `data-shell-region="header"`; `left-panel` is on an `<aside` with `aria-label="Left panel"`; `canvas` on a `<main`; `inspector` on an `<aside` with `aria-label="Inspector"`; `status-bar` on a `<footer`; 0 `data-rail-tool`, 0 `data-status-item`; the markup with the `<p …></p>` removed and all tags stripped is the empty string | Section 3 markup; 04 opening paragraph (region order); section 6 and S03 `aria-label="Inspector"`; P12 Level-1 answer (empty in Phase 0) |
| U3 (b) Frame slots | AC-EZD-012b-1 | unit | `EditorFrame` with `rail={<nav data-r="1" />}`, `leftPanel={<i data-l="1" />}`, `canvas={<i data-c="1" />}`, `inspector={<i data-i="1" />}`, `statusBar={<footer data-s="1" />}`, labels `office.shell.left_panel`, `office.shell.inspector` | Each `data-*` element appears once, inside its region in this order: `data-r` after the body's opening tag and before `left-panel`; `data-l` inside `left-panel`; `data-c` inside `canvas`; `data-i` inside `inspector`; `data-s` after the body's closing `</div>` and before the frame's closing tag | Section 3 markup |
| U3 (c) Client components and barrel | AC-EZD-012b-1 | unit | Source text of `EditorFrame.tsx`, `StatusBar.tsx`, `EmptyEditor.tsx`; `import * as shell from './index'` | Each file's first statement is `'use client';`; `shell.EditorFrame`, `shell.EmptyEditor`, `shell.StatusBar`, `shell.StatusItem` are the same functions as the direct imports | 02 Named tools (client-only editor shell); Step 5 |
| U4 (a) Status bar groups | AC-EZD-012b-2 | unit | `StatusBar` with `start={<StatusItem label="office.shell.tools">1</StatusItem>}`, `end={<span data-y="1" />}` | One `<footer` with `data-shell-region="status-bar"`; inside it `data-status="start"` then `data-status="end"`; the start group holds one `data-status-item` whose `data-status-label` text is `Tools` and `data-status-value` text is `1`; the end group holds the `data-y` element | Section 3; P12 Step 3 and U4 (label reuses EZD-012a's `office.shell.tools` = `Tools`) |
| U4 (b) Empty status bar | AC-EZD-012b-2 | unit | `StatusBar` with no props | `<footer` with both `data-status="start"` and `data-status="end"` present and empty (no child element, no text) | Section 3 ("both groups always render"); P12 Level-1 answer |
| S1 part b Frame CSS uses the tokens | AC-EZD-012b-3 | unit | `EditorFrame.module.css`, `StatusBar.module.css` as text | `EditorFrame.module.css` contains `var(--ez-body-padding)`, `var(--ez-body-gap)`, `var(--ez-left-panel-width)`, `var(--ez-inspector-width)`, `var(--ez-canvas)`, `var(--ez-canvas-grid)`, `var(--ez-grid-size)`, and `composes: card from` naming `card.module.css`; it does not contain `--ez-header-height` or `--ez-header-margin`. `StatusBar.module.css` contains `var(--ez-status-bar-height)` and `var(--ez-font-mono)`. Neither file contains the literal `56px`, `248px`, `336px`, `30px` or `60px`. `node scripts/conventions/check.mjs .` exits 0 (C10) | 04 Frame and visual system; frame tokens in `tokens.css` lines 30–38 (EZD-010a); EZD-011a contract (`HeaderCard` owns header height and margin, so the frame names neither); docs Machine checks C10; P12 S1 |
| D1 Docs | AC-EZD-012b-4 | unit (node:test) | `docs/architecture.md` | (a) the `##` headings equal `REQUIRED_HEADINGS` in order; (b) a line exactly `### Editor shell (EZD-012)` after `### Shell header (EZD-011)` and before `## Server-only data access and can()`; (c) that subsection contains `EditorFrame`, `StatusBar`, `StatusItem`, `EmptyEditor`, `data-shell-region` and `EZD-230`; (d) a Machine checks row whose Check contains `frame-css.test.ts` and whose Built by contains `EZD-012b`; (e) `node scripts/conventions/check.mjs <root>` exits 0 | Step 6; section 3 docs rows; EZD-000 T5; P12 V11 and D1; EZD-011a H15 pattern |
| Gate | all | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-012b` | Exit 0 (`typecheck`, `lint`, `test`, `build`, `test:e2e`) | CLAUDE.md rule 12 |

Smoke: no. Every "does not / never" rule in sections 1 and 3 has a test row (L-012): no header wrapper or region (U3 (a)); no text outside the header slot (U3 (a)); no header tokens in the frame CSS and no literal frame sizes (S1 part b); empty groups still render (U4 (b)). "No event listener" is review (no listener exists to test in static markup; EZD-017 measures later).

## 5. Visual checklist

None. This part adds components and no page; the visual checklist, the S03 comparison and the 1600 × 1000 frame boxes are EZD-012c's (P12 Part c, B1–B3). So EZD-016a is not a dependency of this part.

## 6. Proposed wording

| Where | Text |
| --- | --- |
| `office.shell.left_panel`: screen-reader name of the empty left panel (`<aside aria-label>`) | Left panel |

Source: 04 heading "Left panel and inspector". Not on a board: each board labels the left panel by its content ("Layers" S03, "Cabinet library" S04, "Views and layers" S07, "Reference layers" S11), which later tickets pass through `leftPanelLabel`; the empty Phase 0 panel has no content (P12 V14, corrected: S03's left panel is labelled "Layers", not unlabelled; the value is unchanged). `Inspector` is on the boards (S03 `aria-label="Inspector"`), so it is not listed.

## 7. Security review

security-review: no. No tables, auth, permissions, data access, money or API; components only.
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, model dimensions or scaling) · ui-verifier no (section 5 none; EZD-012c) · security-reviewer no.

## 8. Complexity and model recommendation

Medium: a flex frame whose border-box sizes EZD-012c, EZD-014 and EZD-032 measure exactly, plus the docs subsection, built on existing CSS-module and `renderToStaticMarkup` patterns with no data, permissions, money or auth (PROCESS.md section 4; P12 Part b). Test-author Sonnet 5.5, builder Sonnet 5.5, code-reviewer Opus 5.5.

## 9. Dependencies

- From the row: EZD-012a (`ToolRail`, `office.shell.tools`, creates `frame-css.test.ts`; **planned, not built**: this part builds after it), EZD-011a (`card.module.css`, `index.ts`, docs `### Shell header (EZD-011)`), EZD-010a (frame and color tokens, C10), EZD-026c, EZD-026d (`useT`, `MessagesProvider`, `catalogFor`, `MessageKey`, `en`), EZD-000 (`architecture-doc.test.mjs`, `REQUIRED_HEADINGS`), EZD-004a, EZD-004b (gate's local stack). Done except EZD-012a.
- Missing from the row: **EZD-010c** (`--ez-font-mono` from `fonts.ts` on `<html>`, used by the status bar; done); EZD-010b and EZD-001 come in through EZD-012a and EZD-010a. EZD-016a is not needed (no visual checklist; section 5).
- Later tickets that use this contract: EZD-012c (`/dev/shell`), EZD-032 (build gate, `[data-shell-region=frame] > header`), EZD-014 (device layouts), EZD-017 (empty-shell performance), EZD-120b (editor route), EZD-213, EZD-218, EZD-219, EZD-214, EZD-126, EZD-315, EZD-221 (slot fillers), EZD-136 (status bar disclaimer, Q-0229; its `depends_on` lacks EZD-012, P12 V7, orchestrator's ledger to check).
- Risks: a deviation in EZD-012a's `ToolRail` markup or in its `frame-css.test.ts` would need this plan re-validated (Stage 3 step 1). `position: fixed` on the frame covers the viewport, so a page that renders the frame shows nothing else (intended; P12 V4). Status bar readouts added later must write per-move text through refs or EZD-017 fails (written into docs). The CSS grid will not line up with EZD-207's WebGL grid; EZD-207 decides (P12 Risks). Narrow viewports: canvas has `min-width: 0`; layouts are EZD-014's.

## 10. Open questions

None.
