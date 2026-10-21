# EZD-012c · Shell: test pages and Done-when browser test

- **ACs:** AC-EZD-012c-1, AC-EZD-012c-2, AC-EZD-012c-3 (`vault/spec/acceptance-criteria.md` lines 75–77)
- **Complexity:** medium (section 8)
- **User-visible result:** on a preview build, `/dev/shell` shows the empty Studio editor frame (header, rail, left panel, grid canvas, inspector, status bar) at the spec sizes, and `/dev/shell/rail` shows three sample tools with the cobalt active tool and a dark tooltip with name and shortcut on hover or keyboard focus. Neither page exists in production.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 · Status: planned

Source short forms: `P12` = vault/plans/EZD-012.md (Split proposal Part EZD-012c, Re-validation findings V1–V14, Step 1 frame-box table, Step 6, Tests B1–B7, U5, U6); `P12a` / `P12b` = vault/plans/EZD-012a.md / EZD-012b.md section 3; `04` = vault/spec/sections/04-app-shell-and-global-ui.md; `D04` = vault/spec/decisions/04-app-shell-and-global-ui.md; `S03` = vault/mockups/S03Plan.png + html/project/S03Plan.dc.html; `arch` = docs/architecture.md.

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 37):
- **Scope:** Plan vault/plans/EZD-012.md Part EZD-012c: the /dev/shell and /dev/shell/rail test pages (page.tsx, rail/page.tsx, rail/SampleRail.tsx) and the browser and page tests. Original scope: tool rail 56 px with dark tooltip (name + shortcut), left panel 248, inspector 336, status bar 30, canvas with 32 px grid. Split into EZD-012a, EZD-012b, EZD-012c (Q-0239); plan Part EZD-012c.
- **Done when:** Empty editor at 1600 × 1000 matches the frame sizes. On /dev/shell/rail the active tool is a cobalt button and hovering or focusing a tool shows its dark tooltip with name and shortcut. Both pages are not found in production.
- **Depends on:** EZD-012a, EZD-012b, EZD-011a, EZD-016a, EZD-010c, EZD-016d, EZD-007d, EZD-026d, EZD-004a, EZD-004b
- **Spec ref:** App shell · Frame, Tool rail, Status bar

Steps (builder, after the test-author's tests):
1. `app/src/app/dev/shell/page.tsx`: default export `Page()`, synchronous server component. First line of the body: `if (process.env.VERCEL_ENV === 'production') notFound();` (arch Folder layout `src/app/dev/<name>/`; EZD-010c pattern as in `app/src/app/dev/header/page.tsx`). Then `<MessagesProvider language="en" messages={catalogFor('office', 'en')}>` passed unchanged, no cast (arch Messages "Use"; R26 R17 office English), holding `<EmptyEditor header={<HeaderCard />} />` (P12 Step 6; P12 V4: empty `HeaderCard`, not `EditorHeader`; Q-0039 (c): EZD-032's build-gate test opens this page).
2. `app/src/app/dev/shell/rail/page.tsx`: same production guard and provider, holding `<SampleRail />` (P12 Step 6).
3. `app/src/app/dev/shell/rail/SampleRail.tsx`: `'use client'`; `const [activeId, setActiveId] = useState<string | null>('select')`; renders `EditorFrame` (P12b) with `header={<HeaderCard />}`, `rail={<ToolRail top={TOP} bottom={BOTTOM} activeId={activeId} onSelect={setActiveId} />}`, `leftPanelLabel="office.shell.left_panel"`, `inspectorLabel="office.shell.inspector"`, `statusBar={<StatusBar />}`. `TOP` and `BOTTOM` are module-level constants (contract below): Select V and Cabinets C with a separator between, Help ? at the foot (04 Tool rail table rows Select, Cabinets, Help; S03 rail; Select is S03's default tool; icons are S03's glyphs, README rule 5; P12 Step 6). No status item (P12 Step 6: no label exists for one yet).
4. No literal UI text in the three files: every visible string comes through the components' `t()` keys from EZD-012a/b (R26 R17; arch Messages; office files are checked by review, P12 V5).
5. Imports: shell parts from `../../../components/shell` (barrel; `../../../../components/shell` from `rail/`), messages as `app/src/app/dev/header/page.tsx` does. No new dependency, no CSS module, no docs change (`src/app/dev/<name>/` is already in arch Folder layout; P12 Part c Scope).
6. Run Prettier on the files written (arch Tests).

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/app/dev/shell/page.tsx` | New | builder | Done-when page (Step 1) |
| `app/src/app/dev/shell/rail/page.tsx` | New | builder | Rail page (Step 2) |
| `app/src/app/dev/shell/rail/SampleRail.tsx` | New | builder | Sample tools and active state (Step 3) |
| `app/src/app/dev/shell/page.test.tsx` | New | test-author | U5, U6, B7 |
| `app/e2e/shell-frame.spec.ts` | New | test-author | B1–B6 |

Not touched: every `app/src/components/shell/*` file, `en.ts`, `es.ts`, tokens, icons, `globals.css`, `layout.tsx`, `docs/architecture.md`, `package.json` files, Playwright and Vitest configs, `app/test-harness/**`, `scripts/**`, `ci.yml`, `vault/**`. Write rules (lesson L-002): `.claude/hooks/guard-paths.mjs` line 15–16 classes `app/e2e/…` and `*.test.tsx` as test files (test-author only) and the three page files as non-test (builder); same split as EZD-011c's `/dev/header`.

Data: none. No tables, migrations, RLS, `schema_version` or money fields.

## 2. Sources

- **Spec:** 04 Frame and visual system (1600 × 1000 reference; header 60, margin 16; body padding 16, gap 16; rail 56; left panel 248; inspector 336; status bar 30; colors incl. cobalt, ink, slate 300, border, surface, canvas `#f6f7f9` with 32 px grid `#e6e9ed`; DM Mono for numbers and codes; radii 8, 12; card shadow); 04 Tool rail (cobalt active button with white icon; dark tooltip with name and shortcut on hover; rows Select V, Cabinets C, Help ?); 04 Status bar (items all owned by later tickets, P12 Level-1 answers); 04 Left panel and inspector (contents owned by later tickets).
- **Decisions (D04):** Q-0026 (a) (`oklch()` only, no fallback); Q-0039 (c) (build-gate test signs in and opens `/dev/shell`; production shows sign-in until Phase 1); Q-0040 (c) (tooltip radius 6 px, board-cited token, EZD-012a); Q-0038 (b), Q-0122 (a) (More tools, tool order: EZD-230, not here; P12 V7); Q-0229 (disclaimer in the editor status bar: EZD-136, phase 1; the Phase 0 status bar stays empty, P12 V7). Others: R26 R17 (office English, one helper); Q-0013 (a) (browser floor); Q-0114 (4 Playwright workers); Q-0045 (a) (Playwright); Q-0239 (the split).
- **Plans:** P12 (Part EZD-012c, V1–V14, Step 1 frame boxes, Step 6, Tests B1–B7, U5, U6); P12a, P12b section 3 (contracts this plan uses as stated).
- **Architecture:** arch `## Folder layout` (`src/app/dev/<name>/`, `notFound()` in production), `### Messages and language (t())`, `### Shell header (EZD-011)`, `### Auth and session (EZD-007)` (`PUBLIC_PATHS` holds `/dev`, so no sign-in), `## Tests`, `### Browser tests (EZD-016a)` (desktop project 1600 × 1000, scale 1; untagged spec runs desktop only; specs import only from `app/test-harness/e2e/test.ts`), `### Test scope (Q-0006)` (C9 titles; phase 0 grep).
- **Existing code read:** `app/src/app/dev/header/page.tsx` and `page.test.tsx` (production guard; digest `NEXT_HTTP_ERROR_FALLBACK;404`); `app/e2e/shell-header.spec.ts` (probe-element color comparison); `app/test-harness/e2e/test.ts`; `app/src/components/shell/HeaderCard.tsx`, `index.ts`; `app/src/styles/tokens.css` (every token B2–B6 probes exists: `--ez-canvas`, `--ez-canvas-grid`, `--ez-grid-size`, `--ez-surface`, `--ez-border`, `--ez-shadow-card`, `--ez-cobalt`, `--ez-ink`, `--ez-slate-300`; `--ez-radius-6` arrives with EZD-012a; `--ez-font-mono` from `app/src/styles/fonts.ts`); `catalogs/en.ts`, `es.ts` (flat key objects `en`, `es`).
- **Mockup:** S03 (frame, `.card`, `<nav>`, `<aside>`, `<footer>`, `.rb`, `.rbon`, `.rs`, `.tip`; viewed 2026-10-20). Sample data on it is not a decision (KNOWN-LIMITS 5).
- **Research:** no R-NNN report covers this ticket.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| route | `/dev/shell` | `app/src/app/dev/shell/page.tsx`, `export default function Page()`, synchronous, no props. `VERCEL_ENV === 'production'` → `notFound()` (throws, digest `NEXT_HTTP_ERROR_FALLBACK;404`); else `<MessagesProvider language="en" messages={catalogFor('office', 'en')}><EmptyEditor header={<HeaderCard />} /></MessagesProvider>` |
| route | `/dev/shell/rail` | `app/src/app/dev/shell/rail/page.tsx`, `export default function Page()`, same guard and provider, child `<SampleRail />` |
| file / export | `app/src/app/dev/shell/rail/SampleRail.tsx` | `'use client'` first line; `export function SampleRail()`, no props; state `activeId` initial `'select'`; renders `EditorFrame` per P12b with `header={<HeaderCard />}`, the `ToolRail` of P12a, `leftPanelLabel="office.shell.left_panel"`, `inspectorLabel="office.shell.inspector"`, `statusBar={<StatusBar />}`; `onSelect` is the state setter |
| constants | `TOP` (module-level, not exported) | `[{ kind: 'tool', id: 'select', icon: 'arrow_selector_tool', label: 'office.tool.select', shortcut: 'V' }, { kind: 'separator' }, { kind: 'tool', id: 'cabinets', icon: 'kitchen', label: 'office.tool.cabinets', shortcut: 'C' }]` typed `RailEntry[]` |
| constants | `BOTTOM` (module-level, not exported) | `[{ kind: 'tool', id: 'help', icon: 'help', label: 'office.tool.help', shortcut: '?' }]` typed `RailTool[]` |
| used, not changed | P12a | `ToolRail`, `RailEntry`, `RailTool`; markup hooks `data-shell-region="rail"`, `data-rail="top" \| "bottom" \| "separator"`, `data-rail-tool="<id>"`, `data-rail-tooltip` (sibling right after its button), `aria-pressed`, `aria-keyshortcuts`, `aria-label`, `<kbd>`; keys `office.shell.tools` `Tools`, `office.tool.select` `Select`, `office.tool.cabinets` `Cabinets`, `office.tool.help` `Help` |
| used, not changed | P12b | `EditorFrame`, `EmptyEditor({ header })`, `StatusBar`; `data-shell-region` `frame`, `body`, `left-panel`, `canvas`, `inspector`, `status-bar`; header slot is the frame root's first child, unwrapped; keys `office.shell.left_panel` `Left panel`, `office.shell.inspector` `Inspector` |
| used, not changed | EZD-011a | `HeaderCard()` with no children renders one `<header>` (60 px, margin 16 16 0) |
| test file | `app/src/app/dev/shell/page.test.tsx` | Vitest, `node` env, `renderToStaticMarkup`; imports `Page from './page'`, `RailPage from './rail/page'`, `en` from `../../../server/messages/catalogs/en`, `es` from `…/catalogs/es`, `catalogFor`; one top-level `describe('EZD-012c shell test pages', …)` |
| test file | `app/e2e/shell-frame.spec.ts` | `import { test, expect } from '../test-harness/e2e/test'`; one top-level `test.describe('EZD-012c shell frame', …)`; no device tag (desktop project only, 1600 × 1000, scale 1); no `test.use` viewport; no sign-in; not `@smoke` (P12 V6, Part c) |
| selectors | spec | regions `[data-shell-region="<name>"]`; header `[data-shell-region="frame"] > header`; tools `[data-rail-tool="<id>"]`; a tool's tooltip `[data-rail-tool="<id>"] + [data-rail-tooltip]`; separator `[data-rail="separator"]` |
| helper (spec-local) | `probe(page, css)` | Inserts a `div` with the given `style` into `document.body`, reads `getComputedStyle`, removes it (as `app/e2e/shell-header.spec.ts`), so expected colors, shadows and fonts are the tokens' own computed values |
| helper (spec-local) | `pixel(page, png, x, y)` | Decodes a `page.screenshot()` PNG inside the page with `createImageBitmap(blob, { colorSpaceConversion: 'none' })` and an `OffscreenCanvas` `getImageData`, returns `#rrggbb`. No new dependency (CLAUDE.md rule 7) — *planner's choice* |

## 4. Tests

Written by the test-author before any code. Boxes from `locator.boundingBox()`, compared exactly (all whole pixels). The phase 0 grep lists `012c`, so every title starts `EZD-012c` (C9; P12 V10). Smoke: none (EZD-032 is phase 0's `@smoke` build-gate test).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| B1 Frame sizes. Title `EZD-012c done when: empty editor at 1600 × 1000 matches the frame sizes` | AC-EZD-012c-1 | browser | `/dev/shell` | `[data-shell-region=frame] > header` {x 16, y 16, w 1568, h 60}; `rail` {16, 92, 56, 846}; `left-panel` {88, 92, 248, 846}; `canvas` {352, 92, 880, 846}; `inspector` {1248, 92, 336, 846}; `status-bar` {16, 954, 1568, 30}; `document.documentElement.scrollWidth` 1600 and `scrollHeight` 1000 | 04 Frame (1600 × 1000; header 60, margin 16; body padding 16, gap 16; rail 56; left 248; inspector 336; status 30); status bar margin 0 16 16 from the 28 boards with a status bar; arithmetic P12 Step 1 frame-box table |
| B2 Grid | AC-EZD-012c-1 | browser | `/dev/shell`; `page.screenshot()` | frame root computed `background-size` `32px 32px`; `background-color` = probe `--ez-canvas`; pixel (384, 500) `#e6e9ed` (vertical line, 384 = 12 × 32); pixel (400, 500) `#f6f7f9` (both inside the canvas region 352–1232; 500 is not a multiple of 32) | 04 "canvas `#f6f7f9` with 32 px grid `#e6e9ed`"; 1 px lines from the frame origin: S03 root `div`; P12b `.frame` |
| B3 Card and status bar styles | AC-EZD-012c-1 | browser | `/dev/shell` | `rail`, `left-panel`, `inspector`: `background-color` = probe `--ez-surface`; `border-top-width` `1px`; `border-top-color` = probe `--ez-border`; `border-radius` `12px`; `box-shadow` = probe `--ez-shadow-card`. `status-bar`: `background-color` = probe `--ez-surface`; `border-top-width` `1px`, color = probe `--ez-border`; `border-radius` `8px`; `box-shadow` `none`; `font-size` `12px`; `font-family` = probe `--ez-font-mono` | 04 colors, radii 8 and 12, card shadow, Type (DM Mono); S03 `.card`, `<footer>`; P12b `.bar` |
| B4 Rail buttons | AC-EZD-012c-2 | browser | `/dev/shell/rail` | 3 `[data-rail-tool]`, each 40 × 40, DOM order `select`, `cabinets`, `help`; `select` at x 24, y 103; `help` at x 24, y 887 (938 − 1 − 10 − 40); one `[data-rail=separator]`, 24 × 1, between `select` and `cabinets` in DOM order; `aria-keyshortcuts` `V`, `C`, `?`; `aria-label` `Select`, `Cabinets`, `Help` | S03 `.rb` 40 × 40, rail `padding: 10px 0`, 1 px card border, `.rs` 24 × 1, spacer before the bottom group (P12a `.rail`, `.tool`, `.separator`, `.top`); rail box from B1; 04 Tool rail rows; P12a keys |
| B5 Active tool | AC-EZD-012c-2 | browser | `/dev/shell/rail`; then click `cabinets` | Before: `select` `aria-pressed="true"`, `background-color` = probe `--ez-cobalt`, `color` = probe `--ez-surface`; `cabinets`, `help` `aria-pressed="false"`, `background-color` `rgba(0, 0, 0, 0)`. After the click: `cabinets` pressed with background = probe `--ez-cobalt`; `select` `aria-pressed="false"` with `rgba(0, 0, 0, 0)` | 04 "The active tool is a cobalt button with a white icon"; S03 Select default, `.rbon`, `.rbon:hover`; P12a pressed rule |
| B6 Tooltip on hover and focus | AC-EZD-012c-2 | browser | `/dev/shell/rail`: (a) no pointer yet; (b) hover `cabinets`; (c) `page.mouse.move(800, 500)`; (d) press Tab until `help` has focus (at most 5 presses) | (a) `cabinets` tooltip hidden. (b) visible; text contains `Cabinets` and `C`; box x 76; box vertical center = button vertical center ± 1 px; `background-color` = probe `--ez-ink`; `color` = probe `--ez-surface`; `font-size` `12px`; `border-radius` `6px`; its `kbd` `color` = probe `--ez-slate-300`, `font-family` = probe `--ez-font-mono`; `document.elementFromPoint` at the tooltip's center is the tooltip or inside it (drawn above the left panel). (c) hidden. (d) `help` tooltip visible with `Help` and `?`; `cabinets` tooltip hidden | 04 "hovering shows a dark tooltip with name and shortcut"; S03 `.tip` (`left: 52px` from the button at x 24 → 76; `top: 50%`; `#14171c`; 12 px; radius 6; key `#9aa3af` in `.mono`); Q-0040 (c); keyboard focus: P12a `.tool:focus-visible + .tip` (11 Accessibility) |
| B7 Not found in production | AC-EZD-012c-3 | unit | `vi.stubEnv('VERCEL_ENV', 'production')`; call `Page()` and `RailPage()` | each throws an error whose `digest` is `NEXT_HTTP_ERROR_FALLBACK;404` | arch Folder layout (`notFound()` when production); EZD-011c H10 (a) pattern |
| U6 Pages render outside production | AC-EZD-012c-1 | unit | `VERCEL_ENV` unset; `renderToStaticMarkup(<Page />)` and `renderToStaticMarkup(<RailPage />)` | `/dev/shell`: contains `data-shell-region="frame"`; exactly one `<header`, and it comes before `data-shell-region="body"`; 0 `data-rail-tool`. `/dev/shell/rail`: exactly one `<header`; 3 `data-rail-tool`; `aria-pressed="true"` exactly once, on `data-rail-tool="select"` | P12 Step 6, U6; P12 Level-1 answer (empty rail in Phase 0, EZD-230 row); Step 3 `TOP`, `BOTTOM`, initial `'select'` |
| U5 Shell strings | AC-EZD-012c-2 | unit | `catalogFor('office', 'en')`; `Object.keys(es)` | `office.shell.tools` `Tools`, `office.tool.select` `Select`, `office.tool.cabinets` `Cabinets`, `office.tool.help` `Help`, `office.shell.left_panel` `Left panel`, `office.shell.inspector` `Inspector`; none of the six in `es` | P12 Step 5 / U5; P12a, P12b messages rows; R26 R17; `SPANISH_NAMESPACES` (arch Messages) |
| Gate | all | gate | `node scripts/gate.mjs .claude/worktrees/EZD-012c` | exit 0: `typecheck`, `lint`, `test`, `build`, `test:e2e` | CLAUDE.md rule 12; arch `### CI` |

AC map: AC-1 → B1 (Done-when title), B2, B3, U6; AC-2 → B4, B5, B6, U5; AC-3 → B7. Each AC sentence is a check, no note-only AC (KNOWN-LIMITS, Phase 0 ACs).

## 5. Visual checklist

Viewport: desktop 1600 × 1000 (arch `### Browser tests (EZD-016a)`). Pages `/dev/shell` and `/dev/shell/rail` against S03.

| Element | State | Mockup |
| --- | --- | --- |
| Grid canvas `#f6f7f9` with 1 px `#e6e9ed` lines every 32 px, behind the whole frame | empty | S03 root `div` |
| Header card 60 px, 16 px from top and sides | empty | S03 `<header>` (`.card`) |
| Rail 56 px, left panel 248 px, inspector 336 px: white cards, 1 px border, radius 12, card shadow, full body height | empty | S03 `.card`, `<nav>`, `<aside>` |
| Status bar 30 px: white, 1 px border, radius 8, no shadow, 16 px from sides and bottom | empty | S03 `<footer>` |
| Rail buttons 40 × 40, Help pinned at the foot, 24 × 1 separator | filled (`/dev/shell/rail`) | S03 `.rb`, `.rs` |
| Active tool cobalt with white icon; others slate with hover tint | filled; hover; after clicking Cabinets | S03 `.rbon`, `.rb:hover` |
| Dark tooltip right of the button: name plus mono shortcut in light slate, radius 6, above the left panel | hover; keyboard focus | S03 `.tip` |

Not findings (P12 Part c): empty rail, panels, status bar and canvas on `/dev/shell` (Level-1 answers); panels 2 px narrower and status bar 2 px shorter than the board (spec sizes are border-box); left panel full height (15 of 16 boards); sample tools and header contents differ from the board (KNOWN-LIMITS 5). No loading, error or no-permission state: the pages load no data and check no permission.

## 6. Proposed wording

None. The pages add no text; every visible string is an EZD-012a/b key ("Tools", "Select", "Cabinets", "Help", "Left panel", "Inspector"), approved with those plans.

## 7. Security review

security-review: no. Developer pages that load no data, check no permission and are not found in production (B7); `/dev` is already public (EZD-007d `PUBLIC_PATHS`).
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, model dimensions or scaling) · ui-verifier yes (section 5) · security-reviewer no.

## 8. Complexity and model recommendation

Medium: only three small page files, but the Done when rests on exact browser layout, computed-style and screenshot-pixel checks in the harness, as in EZD-011c. test-author Sonnet 5.5, builder Sonnet 5.5, ui-verifier Sonnet 5.5, code-reviewer Opus 5.5 (P12 Part c; PROCESS.md section 4).

## 9. Dependencies

- From the row: EZD-012a (`ToolRail`, rail types, four keys, `--ez-radius-6`, three icons) and EZD-012b (`EditorFrame`, `EmptyEditor`, `StatusBar`, two keys): both `planned`, not built; this ticket builds after them (P12 order a → b → c). EZD-011a (`HeaderCard`), EZD-016a (`test.ts`), EZD-016d (desktop project, web server), EZD-010c (dev-page pattern, fonts), EZD-007d (`/dev` public), EZD-026d (`catalogFor`, `en`, `es`), EZD-004a, EZD-004b: done.
- **Missing from the row:** EZD-026c (`MessagesProvider` from `app/src/lib/messages`, imported directly by both pages; done). Transitive only, not added: EZD-010b (`Icon`, through EZD-012a), EZD-016c and EZD-008a (seed and outbox the global setup checks, through EZD-016d).
- If EZD-012a or EZD-012b records a deviation from its contract (markup hooks, CSS values, keys), this plan is re-validated before its build (Stage 3 step 1).
- Dependents: EZD-032 (opens `/dev/shell`, counts `[data-shell-region=frame] > header`), EZD-014, EZD-017, EZD-013, EZD-027: they rely on the route `/dev/shell` and the B1 boxes; do not rename.
- Risks: (1) B2 reads exact screenshot pixels; if Chromium's screenshot or the in-page decode shifts a channel, the test-author or builder reports it as a failure rather than adding a tolerance (CLAUDE.md rule 16). (2) B6 (d) relies on Tab reaching the rail first; the empty `HeaderCard` has no focusable element, so the order is `select`, `cabinets`, `help`. (3) Performance: the pages add no listeners; EZD-017 later measures the shell.

## 10. Open questions

None.
