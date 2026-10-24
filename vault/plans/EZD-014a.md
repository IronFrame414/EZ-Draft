# EZD-014a · Device layouts: device switch and phone layout

- **ACs:** AC-EZD-014a-1, AC-EZD-014a-2, AC-EZD-014a-3, AC-EZD-014a-4 (`vault/spec/acceptance-criteria.md` lines 80–83)
- **Complexity:** medium (section 8)
- **User-visible result:** on a phone (any window under 1024 px wide), `/dev/shell` shows the line "Editing is done on an iPad or a computer. Open this project there." instead of the editor; desktop and iPad are unchanged.
- Phase: 0 · Planned by: planner · Date: 2026-10-22 · Status: planned

Short IDs: **P14** = vault/plans/EZD-014.md (parent plan: Split proposal Part EZD-014a, findings V3, V5, V8, V12, V14, Approach Steps 1–4, Tests U1–U8, U11, L1); **02P** = 02-product-overview.md Platform; **11A** = 11-non-functional-requirements.md Accessibility and input; **11R4 / 11R7** = 11 Performance rules 4 / 7; **S17** = vault/mockups/S17Field.png + html/project/S17Field.dc.html; **ARCH** = docs/architecture.md.

## 1. What to build

Data: none (no tables, columns, migrations, RLS, `schema_version`, money).

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/src/lib/device/device-layout.ts` | New | `export const FULL_SHELL_MIN_WIDTH = 1024`; `export const PHONE_LAYOUT_QUERY = '(width < 1024px)'`; `export const DESKTOP_REFERENCE_WIDTH = 1600`; `export const COMPACT_HEADER_QUERY = '(width < 1600px)'`; `export const COARSE_POINTER_QUERY = '(any-pointer: coarse)'`; `export type DeviceLayout = 'full' \| 'phone'`; `export type MatchMedia = (query: string) => MediaQueryList`; `export function getDeviceLayout(matchMedia: MatchMedia): DeviceLayout`; `export function subscribeDeviceLayout(matchMedia: MatchMedia, onChange: () => void): () => void` | `app/src/lib/messages/language.ts` (plain module of constants and pure functions, no React, no directive) | `pnpm --filter @ezdraft/app exec vitest run src/lib/device` (U1) |
| 2 | `app/src/lib/device/useDeviceLayout.ts` | New | `export const deviceLayoutStore: { subscribe(onChange: () => void): () => void; getSnapshot(): DeviceLayout; getServerSnapshot(): DeviceLayout }`; `export function useDeviceLayout(): DeviceLayout` | none (first of its kind): a module-level store object passed to React's `useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)` | same command (U1 (d), (e)) |
| 3 | `app/src/components/phone/PhoneFrame.tsx` + `PhoneFrame.module.css` | New | `export type PhoneFrameProps = { header?: ReactNode; children?: ReactNode; footer?: ReactNode }`; `export function PhoneFrame({ header, children, footer }: PhoneFrameProps)` | `app/src/components/shell/HeaderCard.tsx` (server-safe, no directive, CSS module) | `pnpm --filter @ezdraft/app exec vitest run src/components/phone` (U4) |
| 4 | `app/src/components/phone/PhoneHeader.tsx` + `PhoneHeader.module.css` | New | `export type PhoneHeaderProps = { title: string; subtitle?: readonly ReactNode[]; start?: ReactNode; end?: ReactNode; below?: ReactNode }`; `export function PhoneHeader(props: PhoneHeaderProps)` | `EditorHeader.tsx` lines 42–68 (subtitle filter, `·` separators); no directive | same (U5) |
| 5 | `app/src/server/messages/catalogs/en.ts`, `es.ts` | Change | key `field.device.editor_on_phone` (section 3) | the existing `error.*` entries in both files | `pnpm --filter @ezdraft/app exec vitest run src/server/messages` and U11 |
| 6 | `app/src/components/phone/EditorPhoneNotice.tsx` + `EditorPhoneNotice.module.css` | New | `export type EditorPhoneNoticeProps = { title?: string; subtitle?: readonly ReactNode[] }`; `export function EditorPhoneNotice({ title, subtitle }: EditorPhoneNoticeProps)` | `app/src/components/shell/StatusBar.tsx` (`'use client'` first line, `const t = useT()`) | same (U6, U11) |
| 7 | `app/src/components/device/DeviceLayout.tsx` | New | `export type DeviceLayoutProps = { full: ReactNode; phone: ReactNode }`; `export function DeviceLayout({ full, phone }: DeviceLayoutProps)` | `app/src/components/shell/EmptyEditor.tsx` (`'use client'` first line, named export) | `pnpm --filter @ezdraft/app exec vitest run src/components/device` (U2) |
| 8 | `app/src/components/shell/EmptyEditor.tsx` | Change | `export function EmptyEditor({ header, phone }: { header?: ReactNode; phone?: ReactNode })` | its current body (EZD-012b) | U3; `pnpm --filter @ezdraft/app exec vitest run src/components/shell src/app/dev/shell` (EZD-012b U3, EZD-012c U6 unchanged) |
| 9 | `app/src/components/shell/EditorFrame.module.css` | Change | append the section 3 block, last in the file | none (first `@media` block in app CSS) | U8 part a; `frame-css.test.ts` S1 part b unchanged |
| 10 | — | — | — | — | `pnpm run typecheck`, `pnpm run lint`, `node scripts/gate.mjs .claude/worktrees/EZD-014a` |

Step details (markup and CSS exact in section 3):
- Step 1: `getDeviceLayout` calls `matchMedia(PHONE_LAYOUT_QUERY)` once and returns `'phone'` when `.matches`, else `'full'` (Q-0054 (a)). `subscribeDeviceLayout` calls `matchMedia(PHONE_LAYOUT_QUERY)` once, adds one listener with `list.addEventListener('change', handler)` where `handler = () => onChange()`, and returns `() => list.removeEventListener('change', handler)`. (11R4; P14 Step 1).
- Step 2: `const browserMatchMedia: MatchMedia = (q) => window.matchMedia(q)` at module level, used only inside the store functions. `subscribe = (onChange) => subscribeDeviceLayout(browserMatchMedia, onChange)`; `getSnapshot = () => getDeviceLayout(browserMatchMedia)`; `getServerSnapshot = () => 'full'`. `useDeviceLayout` returns `useSyncExternalStore(deviceLayoutStore.subscribe, deviceLayoutStore.getSnapshot, deviceLayoutStore.getServerSnapshot)`.
- Step 3: no `font-family`: it inherits `var(--ez-font-sans)` from `app/src/styles/globals.css` (EZD-010c), as `EditorFrame` does.
- Step 4: subtitle parts are filtered exactly as `EditorHeader.tsx` line 42–44 (drop `null`, `undefined`, booleans and `''`); the subtitle element renders only when at least one part remains; parts are joined by `<span aria-hidden="true"> · </span>` (S17 subtitle; ARCH Shell header). The top row renders only when `start` or `end` is not `undefined`/`null`.
- Step 5: en: insert the line after `'error.sign_in_failed'` and before `'office.header.wordmark_ez'`. es: append after `'error.sign_in_failed'` (today the last entry, es.ts line 34). `field` is in `SPANISH_NAMESPACES`, so `es`'s `satisfies Record<SpanishKey, Message>` fails typecheck without it (P14 V8; ARCH Messages "Adding a string").
- Step 6: renders `<PhoneFrame header={title ? <PhoneHeader title={title} subtitle={subtitle} /> : undefined}>` around the notice `<p>` (P14 Step 3; Q-0056 (a)).
- Step 7: `const layout = useDeviceLayout(); return <>{layout === 'phone' ? phone : full}</>;` (P14 Step 2). Do not import the `DeviceLayout` type into this file (name clash with the component).
- Step 8: body becomes `<DeviceLayout full={<EditorFrame header={header} rail={<ToolRail top={NO_ENTRIES} bottom={NO_TOOLS} activeId={null} onSelect={noop} />} leftPanelLabel="office.shell.left_panel" inspectorLabel="office.shell.inspector" statusBar={<StatusBar />} />} phone={phone ?? <EditorPhoneNotice />} />` (the `EditorFrame` element is today's, unchanged); imports `DeviceLayout` from `'../device/DeviceLayout'` and `EditorPhoneNotice` from `'../phone/EditorPhoneNotice'`. `'use client'` stays the first line; the module-level `NO_ENTRIES`, `NO_TOOLS`, `noop` stay (P14 Step 2).
- Step 9: hides the server-rendered shell under 1024 px until hydration swaps in the phone tree (P14 Step 2); `/dev/shell/rail` goes blank there, accepted (P14 V14).

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Breakpoint and query form | `(width < 1024px)` range syntax; full shell from 1024 px | Q-0054 (a); P14 Step 1; range syntax is inside the Q-0013 (a) browser floor |
| Constants for parts b, c | all five in `device-layout.ts` now | P14 Step 1; Q-0244 |
| Listener API | `MediaQueryList.addEventListener('change', …)`, never the deprecated `addListener`; never `window.addEventListener` | 11R4; Q-0013 (a) floor |
| Hook mechanism | `useSyncExternalStore` with a module-level store (stable identities, no resubscribe per render); server snapshot always `'full'`; `getSnapshot` calls `matchMedia` on every call, no cached list (it returns a string, so equal snapshots compare equal); no `typeof window` guard: React calls `getSnapshot` only in the browser | P14 Step 1, V5 |
| Directives | `'use client'` first line in `DeviceLayout.tsx` and `EditorPhoneNotice.tsx` only; `PhoneFrame.tsx`, `PhoneHeader.tsx`, `device-layout.ts`, `useDeviceLayout.ts` have none | EZD-012b U3 (c) pattern; HeaderCard.tsx |
| Barrel | none; import each file by path | CLAUDE.md rule 4 |
| Phone imports | phone files import nothing from `components/shell/` or `components/device/`, and no `three` / `@react-three` | 11R7; P14 U7 |
| Title element | `<h1>` with `margin: 0` (one heading per phone screen) | planner's choice (CLAUDE.md rule 3: how to build) |
| CSS values | exactly section 3: S17 values (12 px header bottom padding, not S17b/S17c's 10 px; title one line with ellipsis); the notice style has no board | P14 Step 3 |
| Tokens | colors only through `var(--ez-*)` (C10); sizes, padding and gaps in plain px (no spacing tokens exist) | ARCH C10; lessons L-013 |
| `data-*` attributes | written as `data-x=""` in JSX so markup reads `data-x=""` | EZD-012b markup (`data-status-item=""`) |
| Spanish text | exactly the section 6 text | Q-0030 (a) (agent-written, crew-checked at the field check) |
| Notice language | without a `phone` prop, `EditorPhoneNotice` reads the surrounding provider; `catalogFor('office','en')` holds every namespace except `dev` (read in `catalog.ts`, `language.ts` `NAMESPACES.office = 'all-but-dev'`), so it shows English; no existing test renders the default notice (server snapshot `'full'`) | P14 V8 |

### Do not touch
- Every existing test, notably `app/src/components/shell/EmptyEditor.test.tsx`, `frame-css.test.ts`, `app/src/app/dev/shell/page.test.tsx`, `app/src/server/messages/catalog.test.ts`, `message-keys.test.ts` (CLAUDE.md rule 5).
- `EditorFrame.tsx`, `ToolRail.*`, `HeaderButton.*`, `Wordmark.*`, `EditorHeader.*`, `StatusBar.*`, `app/src/components/shell/index.ts`, the existing rules in `EditorFrame.module.css` (P14 V5).
- `app/src/app/dev/shell/**`, `eslint.config.mjs`, `language.ts`, `catalog.ts`, `tokens.css`, `tokens.ts`, `globals.css`, any `package.json`.
- Part b and c files: `app/src/styles/touch.module.css`, `/dev/device`, `docs/architecture.md`, `app/test-harness/**`, `app/e2e/**` (Q-0244).

Ticket row (vault/tickets/phases/phase-00.md line 39): **Scope:** P14 Part EZD-014a (Steps 1–4), the files of the Build steps table; split from EZD-014 (Q-0244). **Done when:** the four AC texts in the header (acceptance-criteria.md lines 80–83, copied from this row). **Depends on:** section 9. **Spec ref:** Platform; Non-functional · Accessibility.

## 2. Sources
- Spec: 02P ("No full drafting on phone"); 11A; 11R4; 11R7; 11 Budgets (field pack 200 KB, no editor code); 04 opening paragraph (phone field pack is a separate page); 03 (nothing stored).
- Decisions: Q-0053, Q-0054 (a), Q-0013 (a) (vault/spec/decisions/02-product-overview.md); Q-0056 (a) (vault/spec/decisions/04-app-shell-and-global-ui.md); Q-0030 (a), R26 R17, R24 #40 (via ARCH Messages and language); Q-0244 (split; vault/questions/QUESTIONS.md line 253). Q-0055 (a), Q-0088, Q-0098 (a), Q-0245 are parts b and c.
- Mockup: S17 frame, `<header>`, title block, title and subtitle styles (section 3 CSS copies them). Its colors equal `tokens.css` `--ez-canvas`, `--ez-ink`, `--ez-surface`, `--ez-border`, `--ez-slate-500`. Sample data not used (KNOWN-LIMITS 5).
- Code: every file named in sections 1 and 4, plus `eslint-rules/no-literal-ui-string.mjs`, `app/vitest.config.ts`, `.claude/hooks/guard-paths.mjs` (each path is writable by its role, L-002).
- Plans: P14 (parent); EZD-012b section 3 (`EmptyEditor`, `EditorFrame`, `data-shell-region`).
- Research: no R-NNN report covers this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| export | `app/src/lib/device/device-layout.ts` | `FULL_SHELL_MIN_WIDTH` 1024, `PHONE_LAYOUT_QUERY` `'(width < 1024px)'`, `DESKTOP_REFERENCE_WIDTH` 1600, `COMPACT_HEADER_QUERY` `'(width < 1600px)'`, `COARSE_POINTER_QUERY` `'(any-pointer: coarse)'`; types `DeviceLayout`, `MatchMedia`; `getDeviceLayout(matchMedia)`, `subscribeDeviceLayout(matchMedia, onChange) → unsubscribe` (signatures section 1 row 1) |
| export | `app/src/lib/device/useDeviceLayout.ts` | `deviceLayoutStore` `{ subscribe, getSnapshot, getServerSnapshot }`; `useDeviceLayout(): DeviceLayout` |
| export / props | `app/src/components/device/DeviceLayout.tsx` | `DeviceLayout({ full, phone }: DeviceLayoutProps)`, `'use client'`; renders exactly one of `full` / `phone`, no wrapper element |
| export / props | `app/src/components/shell/EmptyEditor.tsx` | `EmptyEditor({ header?, phone? })`; `phone` defaults to `<EditorPhoneNotice />` |
| CSS | `EditorFrame.module.css` (appended, last in file) | `@media (width < 1024px) {` `.frame { display: none; }` `}` |
| markup | `PhoneFrame` | `<div class=frame data-phone-region="frame">{header}<main class=main data-phone-region="main">{children}</main>{footer}</div>` |
| CSS | `PhoneFrame.module.css` | `.frame { box-sizing: border-box; position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--ez-canvas); color: var(--ez-ink); }` `.main { flex: 1; min-height: 0; overflow: auto; position: relative; }` |
| markup | `PhoneHeader` | `<header class=header data-phone-region="header">` → [top row only with `start`/`end`: `<div class=top data-phone-header-top="">{start}<span class=spacer></span>{end}</div>`] → `<div class=titleBlock><h1 class=title data-phone-title="">{title}</h1>` [subtitle only with a part left: `<p class=subtitle data-phone-subtitle="">part<span aria-hidden="true"> · </span>part…</p>`] `</div>` → `{below}` → `</header>` |
| CSS | `PhoneHeader.module.css` | `.header { box-sizing: border-box; flex: none; padding: 12px 16px; background: var(--ez-surface); border-bottom: 1px solid var(--ez-border); display: flex; flex-direction: column; gap: 8px; }` `.top { display: flex; align-items: center; gap: 10px; }` `.spacer { flex: 1; }` `.titleBlock { display: flex; flex-direction: column; gap: 1px; min-width: 0; }` `.title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` `.subtitle { margin: 0; font-size: 12px; color: var(--ez-slate-500); }` |
| markup | `EditorPhoneNotice` | `'use client'`; `<PhoneFrame header={title ? <PhoneHeader title subtitle /> : undefined}><p class=notice data-phone-notice="">{t('field.device.editor_on_phone')}</p></PhoneFrame>` |
| CSS | `EditorPhoneNotice.module.css` | `.notice { margin: 0; padding: 16px; font-size: 15px; color: var(--ez-slate-700); }` |
| message key | `field.device.editor_on_phone` | en and es (section 6) |
| data-* | — | `data-phone-region` = `frame`, `header`, `main`; `data-phone-header-top`, `data-phone-title`, `data-phone-subtitle`, `data-phone-notice`. EZD-014c B2/B3 select on these; do not rename |
| test titles | top-level `describe('EZD-014a …')` in every file; node:test `describe('EZD-014a phone folder lint')` | C9; phase 0 grep lists `014a` (P14 V12) |

Consistency: EZD-012b's `EditorFrame` and `data-shell-region` and EZD-026c/d's `MessagesProvider`, `useT`, `catalogFor` are used as built; P14's names are kept (Q-0244).

## 4. Tests
Vitest (`environment: 'node'`, `renderToStaticMarkup`), components in a `MessagesProvider` from `catalogFor(...)` as `EmptyEditor.test.tsx` does. Class names are never asserted. Strings compare against the catalog value read in the test, except U11 (P14 Tests).

Files (test-author): `app/src/lib/device/device-layout.test.ts` (U1, U8a), `app/src/components/device/DeviceLayout.test.tsx` (U2, U3), `app/src/components/phone/PhoneFrame.test.tsx` (U4, U5, U6, U11), `app/src/components/phone/phone-imports.test.ts` (U7), `scripts/tooling/__tests__/messages-lint.test.mjs` (L1, appended as its own top-level `describe`).

Stub `fakeMatchMedia(width)`: returns a list whose `matches` is `width < N` for a query `(width < Npx)` (N parsed with `/^\(width < (\d+)px\)$/`), shape `{ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList`; the stub records each query and the lists it returned; U1 (c) takes the handler from `list.addEventListener.mock.calls[0][1]`.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| U1 (a) constants. Title `EZD-014a done when: getDeviceLayout returns phone below 1024 px and full from 1024 px` (covers (a)–(c)) | AC-1 | unit | the five constants | `1024`; `'(width < 1024px)'` and equal to `` `(width < ${FULL_SHELL_MIN_WIDTH}px)` ``; `1600`; `'(width < 1600px)'`; `'(any-pointer: coarse)'` | Q-0054 (a); 04 "Desktop frame 1600 × 1000 reference"; P14 Step 1 |
| U1 (b) layout by width | AC-1 | unit | `getDeviceLayout(fakeMatchMedia(w))` for w = 390, 1023, 1024, 1180, 1600 | `'phone'`, `'phone'`, `'full'`, `'full'`, `'full'`; each call queried exactly `['(width < 1024px)']` | Q-0054 (a); S17 (390); Q-0053 (1180) |
| U1 (c) one change listener | AC-1 | unit | `vi.stubGlobal('window', { addEventListener: spyW, removeEventListener: vi.fn() })`; `const off = subscribeDeviceLayout(mm, cb)`; call the handler passed to the list; then `off()` | list `addEventListener` called once with `'change'` and a function; calling that function calls `cb` once; `off()` calls `removeEventListener` once with `'change'` and the same function; `spyW` called 0 times | 11R4; P14 Step 1 |
| U1 (d) store | AC-1 | unit | `vi.stubGlobal('window', { matchMedia: fakeMatchMedia(w), addEventListener: spyW })` for w = 1023 and 1024 | `getSnapshot()` `'phone'` / `'full'`; `getServerSnapshot()` `'full'` for both; `subscribe(cb)` adds one `'change'` listener and its return removes it; `spyW` 0 calls | Q-0054 (a); P14 Step 1, V5 |
| U1 (e) no resize | AC-1 | unit | text of `device-layout.ts` and `useDeviceLayout.ts`, comments stripped | neither contains `resize` | 11R4 |
| U8 part a, phone hide rule | AC-1 | unit (in `device-layout.test.ts`) | `app/src/components/shell/EditorFrame.module.css` through `squash` (copy from `frame-css.test.ts`: comments stripped, whitespace collapsed) | `@media (width < 1024px)` occurs exactly once; the text matches `/@media \(width < 1024px\) \{ \.frame \{ display: none;? \} \}/`; its index is greater than the end index of the base rule found with `/(^\| )\.frame \{[^{}]*\}/` (no nested braces); `1024` equals `FULL_SHELL_MIN_WIDTH` | P14 V12; Q-0054 (a) |
| U2 server markup. Title `EZD-014a done when: DeviceLayout's server markup is the full tree with no wrapper` | AC-2 | unit | `renderToStaticMarkup(<DeviceLayout full={<i data-full="" />} phone={<i data-phone="" />} />)`; file text of `DeviceLayout.tsx` | output exactly `<i data-full=""></i>`; first non-comment line `'use client';` | P14 Step 2 |
| U3 EmptyEditor | AC-2 | unit | office provider (`catalogFor('office','en')`): `<EmptyEditor header={<p data-x="1" />} />` and `<EmptyEditor header={<p data-x="1" />} phone={<i data-phone-x="" />} />` | both: `data-shell-region` order `frame, body, rail, left-panel, canvas, inspector, status-bar`; matches `/^<div lang="en" style="display:contents"><div[^>]*data-shell-region="frame"[^>]*><p data-x="1"/`; 0 `data-phone-region`; 0 `data-phone-x`; 0 `data-phone-notice` | EZD-012b U3 (a) values; P14 Step 2, V5 |
| U4 PhoneFrame | AC-3 | unit | `<PhoneFrame header={<i data-h="" />} footer={<i data-f="" />}><i data-m="" /></PhoneFrame>`; again without `footer` | starts with a `<div` tag holding `data-phone-region="frame"`; index order: that tag < `data-h` < the `<main` tag holding `data-phone-region="main"` < `data-m` < `</main>` < `data-f`; exactly one `<main`; ends with `</div>`. Without footer: the text after `</main>` is exactly `</div>` | P14 Step 3 |
| U5 PhoneHeader | AC-3 | unit | (1) `title="P" subtitle={['A', null, '', 'B']}`; (2) (1) + `start={<i data-s="" />}`; (3) `title="P" end={<i data-e="" />}`; (4) `title="P" subtitle={[]}`; (5) `title="P" below={<i data-b="" />}` | (1) one `<header` tag with `data-phone-region="header"`; one `<h1` with `data-phone-title=""` whose text is `P`; `data-phone-subtitle` element text (tags stripped) `A · B`; exactly one `<span aria-hidden="true"> · </span>`; 0 `data-phone-header-top`. (2) `data-phone-header-top` present and `data-s` before `<h1`. (3) `data-phone-header-top` present, `data-e` before `<h1`. (4) 0 `data-phone-subtitle`. (5) `data-b` after `</h1>` and before `</header>` | P14 Step 3; S17 subtitle separator; EditorHeader filter |
| U6 notice. Title `EZD-014a done when: the phone notice renders the simple layout from the catalog in English and Spanish` | AC-3 | unit | `<EditorPhoneNotice title="P" />` in providers from `catalogFor('field','en')`, `catalogFor('field','es')`, and `{ ...catalogFor('field','en'), 'field.device.editor_on_phone': 'NOTICE-T' }`; then `<EditorPhoneNotice />` in the field `en` provider and in a `catalogFor('office','en')` provider | the `data-phone-notice` element's text equals the catalog's en value, the es value, `NOTICE-T` respectively; with title: exactly one `data-phone-region="header"`, one `data-phone-region="frame"`, one `<main`; every render: 0 `data-shell-region`, 0 `data-rail-tool`, 0 `data-status`, 0 `<aside`, 0 `<footer`, 0 `<nav`; without title: 0 `data-phone-region="header"` and 0 `<header`; in the office provider the notice text equals the en value | R26 R17; 02P; P14 Step 3, V8; AC-3 text |
| U11 catalog | AC-3 | unit | `en`, `es` from `catalogs/en.ts`, `es.ts` | `en['field.device.editor_on_phone']` exactly `Editing is done on an iPad or a computer. Open this project there.`; `es` value a string, non-empty after trim, not equal to the en value | Q-0056 (a); Q-0030 (a); R24 #40 |
| U7 no shell imports. Title `EZD-014a done when: phone components import no shell code` | AC-4 | unit | every non-test `.ts`, `.tsx`, `.css` file under `app/src/components/phone/`; specifiers from `/(?:from\s+\|import\s*\(\s*\|import\s+)['"]([^'"]+)['"]/g` (CSS: the `composes … from '…'` string; `\|` is the table escape for `|`) | at least the three files `PhoneFrame.tsx`, `PhoneHeader.tsx`, `EditorPhoneNotice.tsx` read; each specifier starting with `.` is resolved with `path.resolve(fileDir, spec)` and none lies inside `app/src/components/shell` or `app/src/components/device`; no specifier starts with `@/` (the app uses no alias, ARCH Events); no specifier equals `three` or starts `three/` or `@react-three/`; other bare specifiers (`react`) pass | 11R7; 11 Budgets (field pack has no editor or 3D code); P14 U7 |
| L1 phone lint. Title `EZD-014a done when: the phone folder passes the phone lint` | AC-4 | unit (node:test) | `new ESLint({ cwd: root }).lintFiles(['app/src/components/phone'])` (copy `EZD-026a L7`) | results include `PhoneFrame.tsx`, `PhoneHeader.tsx`, `EditorPhoneNotice.tsx`; 0 messages with ruleId `ezdraft/no-literal-ui-string`; total `errorCount` 0 | ARCH Messages and language "Lint"; `eslint.config.mjs` lines 39–52 |
| Gate | all | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-014a` | exit 0; EZD-012b U3 (a)–(c), EZD-012c U6, `frame-css.test.ts` S1, EZD-026d catalog tests pass unchanged | CLAUDE.md rule 12; P14 V5 |

smoke: no (part c owns the `@smoke` browser tests, Q-0244).

## 5. Visual checklist
None. The only screen change is `/dev/shell` below 1024 px, a developer page; its visual check and browser tests (B2, 390 × 844 against S17) are EZD-014c's (Q-0244), so EZD-016a is not a dependency here.

## 6. Proposed wording
| Where | Text |
| --- | --- |
| `field.device.editor_on_phone` en | `Editing is done on an iPad or a computer. Open this project there.` (approved, Q-0056 (a); not new) |
| `field.device.editor_on_phone` es | `La edición se hace en un iPad o una computadora. Abre este proyecto allí.` (agent-written per Q-0030 (a), same `tú` form as the existing es entries; a Spanish-speaking crew member checks it at the field check) |

## 7. Security review
security-review: no (no tables, auth, permissions, data access, money or API).
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no (section 5) · security-reviewer no.

## 8. Complexity and model recommendation
medium: a hydration-safe `useSyncExternalStore` switch wrapped around an existing component whose markup tests must stay green (P14 V5), a lint-covered folder and a Spanish string; no data, permissions, money or auth. test-author Sonnet 5.5, builder Sonnet 5.5, code-reviewer Opus 5.5 (P14 Split Part a; PROCESS.md section 4).

## 9. Dependencies
Row: EZD-012b (`EmptyEditor`, `EditorFrame`), EZD-026a (phone lint block), EZD-026c (`useT`, `MessagesProvider`), EZD-026d (`catalogFor`, `en`, `es`), EZD-010a (tokens), EZD-004a, EZD-004b (the Vitest global setup needs the local stack). All done (STATUS.md). Missing from the row: **EZD-010c** (`globals.css` body font the phone frame inherits; done). Not needed here: EZD-016a (no browser test in this part, section 5).

Dependents: EZD-014c (selects section 3's `data-*`), EZD-015, EZD-020 (U7), EZD-032, EZD-1013, EZD-1404, EZD-1202.

Risks:
- The client swap has no unit test in a `node` environment; U1 (d) proves the store, EZD-014c B5 the browser swap.
- On a phone the full tree hydrates once before the swap, so its mount effects run once; EZD-207 and EZD-120b must not start heavy work in a mount effect there (11R7).
- JavaScript failure on a phone leaves a blank screen; windows under 1024 px get the notice (P14 Risks; Q-0054 (a)).
- Performance: one `change` listener, no resize or pointer listener (11R4; EZD-017).

## 10. Open questions
None.
