# EZD-010c · Fonts, root layout and token test page

- **ACs:** AC-EZD-010c-1 (A token test page matches every spec value), AC-EZD-010c-2 (The fonts are self-hosted latin subsets wired into the root layout, the page returns not found in production, and no icon font or Google Fonts is loaded) (`vault/spec/acceptance-criteria.md` lines 43–44).
- **Complexity:** medium (section 8).
- **User-visible result:** every page of the app now shows Instrument Sans and DM Mono served from our own server, and `/dev/tokens` on a preview shows every spec color, radius, shadow, frame size, font weight and the first icon; on the live address that page is "not found".
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Planned from `vault/plans/EZD-010.md` (Split proposal Part EZD-010c lines 38–47; Re-validation findings V1–V14 lines 52–67; Approach Step 2 `globals.css` line 168, Step 3 lines 170–184, Step 5 lines 209–220, Step 7 lines 230–249; Tests T3–T7, T13 lines 300–310), applied by Q-0155. Every interface name and test ID of the parent is kept (T3, T4, T5, T6, T7, T13). Refinements made here are all "how" (CLAUDE.md rule 3); test cases they add are marked "added by this plan":
- **C1** font bytes pinned by SHA-256 (T5), checked by the planner on 2026-10-19 (section 2).
- **C2** the not-found marker of the pinned Next.js read from its source (T4).
- **C3** T7's text scan skips test files (its own file must name the banned strings) and states which files it reads.
- **C4** T12 part c, a docs check for this part's `docs/architecture.md` text (parts a and b each have one).
- **C5** the page is a synchronous server component with no props (T3, T4 call it directly).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 24):
- **Scope:** Instrument Sans and DM Mono self-hosted as latin subsets (next/font/local, committed woff2 and licences) wired into the root layout with tokens.css and globals.css; token test page /dev/tokens, not found in production; architecture font bullets. Split from EZD-010 (Q-0155); plan Part EZD-010c.
- **Done when:** A token test page matches every spec value. The fonts are self-hosted latin subsets wired into the root layout, the page returns not found in production, and no icon font or Google Fonts is loaded.
- **Depends on:** EZD-010a, EZD-010b, EZD-001, EZD-004a, EZD-004b.
- **Spec ref:** App shell · Frame and visual system.

### Step 1: font files (11 Performance rule 8; 04 Type)
- Copy unchanged from the npm packages `@fontsource/instrument-sans@5.3.0` and `@fontsource/dm-mono@5.3.0` (both OFL-1.1; 5.3.0 is still the newest on 2026-10-19, `npm view`) into `app/src/styles/fonts/` (EZD-010.md Step 3, planner's choice: committed files, no npm dependency, build works offline):
  - `instrument-sans-latin-400-normal.woff2`, `instrument-sans-latin-500-normal.woff2`, `instrument-sans-latin-600-normal.woff2` (weights from 04 Type "Instrument Sans 400/500/600", `vault/spec/sections/04-app-shell-and-global-ui.md` line 10);
  - `dm-mono-latin-400-normal.woff2`, `dm-mono-latin-500-normal.woff2` (04 names DM Mono with no weight; all 36 Studio boards load `DM+Mono:wght@400;500`, tickets README rule 5, EZD-010.md V9);
  - `LICENSE-instrument-sans.txt` and `LICENSE-dm-mono.txt` = each package's `LICENSE` file unchanged.
- How the builder gets them: `npm pack @fontsource/instrument-sans@5.3.0 @fontsource/dm-mono@5.3.0` in a new empty temp folder outside the repository, extract there, copy `package/files/<name>` and `package/LICENSE`; run nothing from inside the extracted folder. T5 checks the bytes (SHA-256 in section 4), so a wrong file fails.
- Why the latin subset (11 rule 8 "subsets"): its `unicode-range` (`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`, the package's `400.css`, read 2026-10-19) covers ASCII (measurement entry `12' 6 1/2"`, 04 Measurement entry), U+00A0–00FF (Spanish á é í ó ú ü ñ ¿ ¡ for crew screens, R26 R17; · × °) and U+2000–206F (… ′ ″).

### Step 2: `app/src/styles/fonts.ts` (`next/font/local`, built into Next.js, no package)
- `export const instrumentSans = localFont({ src: [ { path: './fonts/instrument-sans-latin-400-normal.woff2', weight: '400', style: 'normal' }, …500…, …600… ], variable: '--ez-font-sans', display: 'swap', fallback: ['sans-serif'] });`
- `export const dmMono = localFont({ src: [ …dm-mono 400…, …500… ], variable: '--ez-font-mono', display: 'swap', fallback: ['monospace'] });`
- `display: 'swap'` and the fallbacks follow the boards (`display=swap`; `'Instrument Sans', sans-serif` / `'DM Mono', monospace`; EZD-010.md Sources lines 89, 92). Every other option keeps the `next/font` default (including `preload`). Both calls are module-level `const`s (a `next/font` requirement).
- Nothing loads from `fonts.googleapis.com` or `fonts.gstatic.com`; `next/font/google` is not used (it would make `next build` reach Google; 11 rule 8 "self-hosted"; EZD-010.md Step 3).

### Step 3: `app/src/styles/globals.css` and the root layout
- `globals.css` (new): `body { font-family: var(--ez-font-sans); }` (04 Type "Instrument Sans … for UI"). Nothing else in this part; EZD-011 adds the body margin (vault/plans/EZD-011.md lines 93, 297), so T6 checks for the rule, not that it is the only one.
- `app/src/app/layout.tsx` (EZD-001's file, extended; current text read 2026-10-19, V4): add `import '../styles/tokens.css';` then `import '../styles/globals.css';` and `import { instrumentSans, dmMono } from '../styles/fonts';` (relative paths, V2 (6)); change `<html lang="en">` to `<html lang="en" className={`${instrumentSans.variable} ${dmMono.variable}`}>`. `metadata.title` stays `'EZ Draft'` and `lang="en"` stays (EZD-001; R26 R17 office side English).
- `tokens.css` is EZD-010a's (contract: one `:root` block of `--ez-*` variables); this is the first file that imports it.

### Step 4: token test page `/dev/tokens` (Done when)
- `app/src/app/dev/tokens/page.tsx`, served at `/dev/tokens` (EZD-010.md Step 5, planner's choice; the `app/src/app/dev/<name>/` convention later used by EZD-007 line 165, EZD-009 line 164, EZD-011 line 212, EZD-012 line 113, EZD-026a line 20). `export default function Page()`: synchronous server component, no props, no `'use client'` (C5; no client JavaScript of its own, 11 Budgets).
- First statement: `if (process.env.VERCEL_ENV === 'production') notFound();` (`notFound` from `next/navigation`). `VERCEL_ENV`, not `NODE_ENV`, because EZD-016a's browser tests run `next start` with `NODE_ENV=production` and must still reach dev pages (EZD-008a line 51). Production builds come only from `main` and are promoted as built (EZD-023b plan line 111), so the build-time prerender with `VERCEL_ENV=production` already yields the 404.
- Content, rendered from `TOKENS` (EZD-010a, `app/src/styles/tokens.ts`) and `ICON_NAMES` (EZD-010b, `app/src/components/icon/icon-names.generated.ts`):
  - **One element per `TOKENS` entry** with `data-token="<name>"` and `data-value="<value>"` (in that attribute order), the name and value as visible text, and a sample using the variable in its `style` prop: `color`/`status` → `background: var(<name>)`; for `--ez-amber` and `--ez-green` also a text sample `color: var(<name>)` on `background: var(<name>-tint)`; `radius` → `borderRadius: var(<name>)`; `shadow` → `boxShadow: var(<name>)`; `frame` → `height: var(<name>)` for `--ez-header-height` and `--ez-status-bar-height`, `width: var(<name>)` for the other seven.
  - **Five type specimens**, each one element with `data-font` and `data-weight` and `style` `fontFamily: 'var(--ez-font-sans)'` or `'var(--ez-font-mono)'` plus `fontWeight`: sans 400, 500, 600; mono 400, 500. Text: `0123456789 12' 6 1/2" · á é í ó ú ü ñ ¿ ¡ × ° …` (fixed developer text, EZD-010.md Step 5).
  - **One element per `ICON_NAMES` entry** with `data-icon="<name>"`, containing `<Icon name={name} size={20} />` (EZD-010b `Icon`) and the name.
- Layout classes in `page.module.css`, which uses `var(--ez-*)` only, no literal colors (check C10, EZD-010a). Literal values in the TSX `style` props are only `var(...)` strings.
- Text on the page does not go through `t()`: EZD-026a is not built, office side is English (R26 R17), and its lint covers phone and field-pack entry points only (EZD-010.md Step 5).

### Step 5: `docs/architecture.md` (same commit; only `###`-level content, EZD-000 T5's 13 `##` headings hold, V6)
- `## Folder layout` code block: extend EZD-010a's `src/styles/` line to also name `globals.css` (body font), `fonts.ts` (`next/font/local`) and `fonts/` (committed latin woff2 + OFL licences) (EZD-010c); add under `src/app/` a line `  src/app/dev/<name>/      developer test pages; notFound() when VERCEL_ENV is production (EZD-010c)`.
- `### Design tokens, fonts and icons` (created by EZD-010a, icon bullets by EZD-010b): append font bullets: files copied unchanged from `@fontsource/instrument-sans` and `@fontsource/dm-mono` 5.3.0 (not installed as packages), OFL-1.1, licences next to them; Instrument Sans 400/500/600 for UI, DM Mono 400/500 for measurements, code and numbers; why the latin subset (Step 1); loaded with `next/font/local` in `app/src/styles/fonts.ts` as `--ez-font-sans` / `--ez-font-mono`, set on `<html>` by the root layout; never load Google Fonts (`next/font/google`, `fonts.googleapis.com`, `fonts.gstatic.com`) or the icon font.
- `## Machine checks`: one row `| — | No icon font, no Google Fonts reference; woff2 files only in app/src/styles/fonts/ | app/src/styles/no-icon-font.test.ts (T7) | EZD-010c |`.
- `## Dependencies`: no row (no package added; `next/font/local` ships with `next`).

### Files
Size: 6 builder code/doc files + 7 font and licence files + 5 test-author files; 6 test IDs plus the gate. This is the size the parent Split proposal set for this part (EZD-010.md line 43, plus C4's one test file) and Q-0155 applied.

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/styles/fonts/instrument-sans-latin-{400,500,600}-normal.woff2`, `dm-mono-latin-{400,500}-normal.woff2` | New (copied) | builder | Step 1 |
| `app/src/styles/fonts/LICENSE-instrument-sans.txt`, `LICENSE-dm-mono.txt` | New (copied) | builder | Step 1 |
| `app/src/styles/fonts.ts` | New | builder | Step 2 |
| `app/src/styles/globals.css` | New | builder | Step 3 |
| `app/src/app/layout.tsx` | Change (extend EZD-001) | builder | Step 3 |
| `app/src/app/dev/tokens/page.tsx`, `page.module.css` | New | builder | Step 4 |
| `docs/architecture.md` | Change | builder | Step 5 |
| `app/src/app/dev/tokens/page.test.tsx` | New | test-author | T3, T4 |
| `app/src/styles/fonts.test.ts` | New | test-author | T5 |
| `app/src/app/layout.test.tsx` | New | test-author | T6 |
| `app/src/styles/no-icon-font.test.ts` | New | test-author | T7 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add cases) | test-author | T12 part c |
| `app/vitest.config.ts` (unless Risk 4 needs `test.css`: test-author, every key kept), `app/tsconfig.json`, `eslint.config.mjs`, `app/package.json`, `.prettierignore`, `tokens.css`, `tokens.ts`, `Icon.tsx`, sprite, `scripts/**` other than the test above, `CLAUDE.md`, `vault/**` | Not touched | — | JSX transform already set by EZD-010b (its Step 6); no lint, package or Prettier change; parts a/b own their files |

Write rules (lesson L-002; V8; `.claude/hooks/guard-paths.mjs`): builder paths are under `app/` or `docs/architecture.md`, none a test path; test-author paths are `*.test.ts(x)` or under `__tests__/`. Prettier: the builder formats `.ts`, `.tsx`, `.css` it writes; the woff2 and `.txt` licence files are not formatted (copied bytes, T5).

Data: none. No tables, columns, migrations, RLS, `schema_version` or money fields (03 Data model has nothing on fonts or styles; grep 2026-10-19).

## 2. Sources
- Spec: `vault/spec/sections/04-app-shell-and-global-ui.md` "Frame and visual system (Studio)" lines 7–11 (all values; Type line 10: Instrument Sans 400/500/600, DM Mono, icons not from the font). `11-non-functional-requirements.md` Performance rule 8 (self-hosted subsets, no icon font file), Budgets (no client JavaScript added), rule 7 (nothing heavy loaded). `03-data-model.md`: nothing touched. `02-product-overview.md` Named tools "CSS modules on the design tokens".
- Decisions: Q-0026 (a) and Q-0013 (a) (`vault/spec/decisions/04-app-shell-and-global-ui.md` line 7, `02-product-overview.md` line 9: `oklch()` values ship as written; the page shows them unchanged); R26 R17 (`13b-round-26.md`: office English, crew Spanish → latin subset covers Spanish); Q-0155 (`vault/questions/QUESTIONS.md` line 164: the split). Non-goals and glossary: nothing on fonts, tokens or dev pages (grep 2026-10-19).
- Process: `vault/tickets/README.md` rule 5 (boards settle DM Mono weights and `display=swap`); `vault/KNOWN-LIMITS.md` item 5.
- Plans: `vault/plans/EZD-010.md` (as listed above); `EZD-010a.md` section 3 (`tokens.css`, `TOKENS` type, `### Design tokens, fonts and icons`); `EZD-010b.md` section 3 (`Icon` markup, `ICON_NAMES`, sprite URL, `oxc` JSX key in `app/vitest.config.ts`) and Step 2 B4; dependents checked: EZD-007 lines 165–166, EZD-009 lines 148, 164, 251, EZD-011 lines 93, 212–214, 294, EZD-012 lines 113, 167, EZD-026a lines 20, 220, EZD-028 line 15.
- Code read on develop (a30a8a9) 2026-10-19: `app/src/app/layout.tsx`, `app/vitest.config.ts`, `app/package.json`, `app/next.config.ts`, `app/tsconfig.json`, `scripts/conventions/__tests__/architecture-doc.test.mjs` (`readArch` line 16, `REQUIRED_HEADINGS` line 83), `app/node_modules/next/dist/client/components/not-found.js` lines 25–29 (next 16.4.2: `notFound()` throws an `Error` whose `digest` is `NEXT_HTTP_ERROR_FALLBACK;404`; C2). `app/src/styles/`, `app/src/components/` do not exist yet (parts a and b build first).
- Outside check 2026-10-19 (C1): `npm view` both packages → 5.3.0, OFL-1.1; `npm pack` into `/tmp/ezd010c-fonts`: file sizes 16,860 / 17,232 / 17,408 / 14,820 / 14,988 bytes (same as EZD-010.md Sources line 95); first 4 bytes `wOF2`; SHA-256 values in T5; each `LICENSE` contains "SIL Open Font License" and none of `googleapis`, `gstatic`, `Material Symbols`, `next/font/google` (case-insensitive).
- Research: no R-NNN report covers this ticket.

## 3. Interface contract
Names are the parent's, unchanged (EZD-010.md line 42); EZD-011, 012, 015, 026a, 028 cite them.

| Kind | Name or path | Details |
| --- | --- | --- |
| exports | `instrumentSans`, `dmMono` from `app/src/styles/fonts.ts` | Results of `localFont(...)` (default import of `next/font/local`), arguments exactly as Step 2; no other export |
| file | `app/src/styles/globals.css` | Contains `body { font-family: var(--ez-font-sans); }`; later tickets may add rules |
| CSS variables | `--ez-font-sans`, `--ez-font-mono` | Defined by the `next/font` `variable` classes on `<html>` |
| export | default `RootLayout({ children }: { children: ReactNode })` and `metadata` from `app/src/app/layout.tsx` | Imports `../styles/tokens.css`, then `../styles/globals.css`; `<html lang="en" className={`${instrumentSans.variable} ${dmMono.variable}`}><body>{children}</body></html>`; `metadata.title === 'EZ Draft'` |
| route | `/dev/tokens` = default export `Page()` of `app/src/app/dev/tokens/page.tsx` | Synchronous, no props, server component; calls `notFound()` when `process.env.VERCEL_ENV === 'production'` (thrown error `digest` `NEXT_HTTP_ERROR_FALLBACK;404` on next 16.4.2) |
| attributes | `data-token`, `data-value` | One element per `TOKENS` entry, `data-token` before `data-value`; its sample's `style` holds `var(<name>)` |
| attributes | `data-font` (`sans` \| `mono`), `data-weight` (`400` \| `500` \| `600`) | Five elements as Step 4; `style` holds `var(--ez-font-sans)` or `var(--ez-font-mono)` |
| attributes | `data-icon` | One element per `ICON_NAMES` entry, containing `Icon` at size 20 |
| files | `app/src/styles/fonts/` | Exactly the 5 woff2 and 2 licence files of Step 1 |
| docs | `docs/architecture.md` font bullets, folder lines, Machine checks row | Step 5 |
| convention | `app/src/app/dev/<name>/` | Dev pages: `notFound()` when `VERCEL_ENV === 'production'`; tested as T4 |

## 4. Tests
Rules: T3–T7 are Vitest in `@ezdraft/app` (`environment: 'node'`), each file with a top-level `describe` whose title starts `EZD-010c` (check C9; the phase-0 grep matches `EZD-010c`, V2). Imports by relative path (no `@/` alias in Vitest, V2 (6)). React output from `renderToStaticMarkup` (`react-dom/server`). `.tsx` tests compile through EZD-010b's `oxc` JSX setting. Wherever `fonts.ts` is imported (T5, T6), `next/font/local` is replaced with a type-correct `vi.mock` whose default export records its argument and returns `{ className, variable, style }`; for T6 it returns `variable` `v-sans` for `--ez-font-sans` and `v-mono` for `--ez-font-mono`. Env changes use `vi.stubEnv` and are undone with `vi.unstubAllEnvs()`. The app global setup needs the local stack up (V3). T12 part c is `node:test` in `architecture-doc.test.mjs`, title starting `EZD-010c`, using `readArch()`. Tests match attributes, exit codes, bytes and digests, never message wording. smoke: no.

The 36 spec rows T3 (a) checks (04 Frame and visual system lines 7–11, as EZD-010a Step 1; hardcoded in the test, not read from `TOKENS`):

| # | Name | Value | # | Name | Value |
| --- | --- | --- | --- | --- | --- |
| 1 | `--ez-cobalt` | `oklch(0.55 0.17 262)` | 19 | `--ez-green-tint` | `oklch(0.95 0.05 150)` |
| 2 | `--ez-cobalt-text` | `oklch(0.45 0.17 262)` | 20 | `--ez-radius-5` | `5px` |
| 3 | `--ez-cobalt-tint` | `#eef1ff` | 21 | `--ez-radius-7` | `7px` |
| 4 | `--ez-ink` | `#14171c` | 22 | `--ez-radius-8` | `8px` |
| 5 | `--ez-slate-700` | `#3b424d` | 23 | `--ez-radius-10` | `10px` |
| 6 | `--ez-slate-500` | `#5e6672` | 24 | `--ez-radius-12` | `12px` |
| 7 | `--ez-slate-400` | `#7a828e` | 25 | `--ez-radius-999` | `999px` |
| 8 | `--ez-slate-300` | `#9aa3af` | 26 | `--ez-shadow-card` | `0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)` |
| 9 | `--ez-border` | `#dfe2e6` | 27 | `--ez-shadow-floating` | `0 6px 20px rgba(20,30,50,.08)` |
| 10 | `--ez-divider` | `#eef0f3` | 28 | `--ez-header-height` | `60px` |
| 11 | `--ez-hover` | `#f2f4f7` | 29 | `--ez-header-margin` | `16px` |
| 12 | `--ez-canvas` | `#f6f7f9` | 30 | `--ez-body-padding` | `16px` |
| 13 | `--ez-canvas-grid` | `#e6e9ed` | 31 | `--ez-body-gap` | `16px` |
| 14 | `--ez-surface` | `#fff` | 32 | `--ez-rail-width` | `56px` |
| 15 | `--ez-red` | `oklch(0.6 0.19 28)` | 33 | `--ez-left-panel-width` | `248px` |
| 16 | `--ez-amber` | `oklch(0.72 0.16 65)` | 34 | `--ez-inspector-width` | `336px` |
| 17 | `--ez-amber-tint` | `oklch(0.96 0.04 80)` | 35 | `--ez-status-bar-height` | `30px` |
| 18 | `--ez-green` | `oklch(0.42 0.12 150)` | 36 | `--ez-grid-size` | `32px` |

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T3 Token test page matches every spec value. Title: `EZD-010c done when: token test page matches every spec value` | AC-EZD-010c-1 | unit (`page.test.tsx`) | `renderToStaticMarkup(<Page />)` with `VERCEL_ENV` unset | (a) For each of the 36 rows, the markup matches `/<[^>]*data-token="NAME"[^>]*data-value="VALUE"/` (both regex-escaped; VALUE HTML-escaped as React escapes attributes). (b) For each of the 36, a `style="…"` attribute contains `var(NAME)`. (c) Exactly five elements carry `data-font`; their (`data-font`, `data-weight`) pairs are `sans`/`400`, `sans`/`500`, `sans`/`600`, `mono`/`400`, `mono`/`500`; each sans element's `style` contains `var(--ez-font-sans)` and each mono element's `var(--ez-font-mono)`. (d) An element with `data-icon="expand_more"` contains `<use href="/icons/sprite.svg#expand_more">`. No total token or icon count asserted (later tickets append) | 04 lines 7–11 (table above); 04 Type for (c) sans weights; DM Mono 400/500 from the 36 boards (README rule 5, V9); EZD-010b `icons.json` seed and `Icon` markup for (d) |
| T4 Token page hidden in production | AC-EZD-010c-2 | unit (`page.test.tsx`) | (a) `vi.stubEnv('VERCEL_ENV', 'production')`, call `Page()`; (b) added by this plan: `vi.stubEnv('VERCEL_ENV', 'preview')`, render | (a) Throws; the thrown value's `digest` equals `NEXT_HTTP_ERROR_FALLBACK;404`. (b) No throw; markup contains `data-token="--ez-cobalt"` | Step 4 (EZD-010.md Step 5, planner's choice); digest from next 16.4.2 `not-found.js` lines 25–29 (C2); preview must show the page (EZD-010.md user-visible result) |
| T5 Fonts are self-hosted latin subsets | AC-EZD-010c-2 | unit (`fonts.test.ts`) | Import `fonts.ts` with `next/font/local` mocked; read the recorded calls; read `app/src/styles/fonts/` | (a) Exactly 2 calls, in order. Call 1: `variable` `--ez-font-sans`, `display` `swap`, `fallback` `['sans-serif']`, `src` = 3 entries with `weight` `'400'`, `'500'`, `'600'`, each `style` `'normal'`. Call 2: `variable` `--ez-font-mono`, `display` `swap`, `fallback` `['monospace']`, `src` = 2 entries with `weight` `'400'`, `'500'`, `style` `'normal'`. (b) Every `path` starts `./fonts/`, ends `.woff2`, contains `-latin-`, and resolves relative to `fonts.ts` to an existing file whose first 4 bytes are ASCII `wOF2`. (c) The folder holds exactly the 7 files of Step 1. (d) SHA-256 (hex): `instrument-sans-latin-400-normal.woff2` `9a91efaa3599a6ef01b2f49e9ec670e3a2f39baeef09c73198f1052cf3bb0850`; `-500-` `9d3547da16d950d12a677c772a3ff9b69846e60e7dcd1b5efd540993f7286532`; `-600-` `efb770916eda95a0e31d80cccde9651d4e8617010b21220e9f227c4820d675da`; `dm-mono-latin-400-normal.woff2` `e1896b13b2b1bb112fac2f9571bd6c40e118746e77a4511edbf43fbb41bf3e1e`; `dm-mono-latin-500-normal.woff2` `9964608a849396bd00c4bfd7034afe03486469dcf20b4f6b8cbdfdd310369951`; `LICENSE-instrument-sans.txt` `c27a3c53c3beed7f5c26853afa15991478ff7145d3754a36b0382f84e10c0d03`; `LICENSE-dm-mono.txt` `d2766c396a8534cba53340f8af2037749b6a0a1dd3587348c917a70e779d2e32` (added by this plan, C1). (e) Each licence file contains `SIL Open Font License` | 04 Type; 11 rule 8; boards' `DM+Mono:wght@400;500`, `display=swap`, fallbacks (README rule 5; EZD-010.md Sources lines 89, 92); hashes from `npm pack` of the 5.3.0 packages, 2026-10-19 (section 2); OFL-1.1 |
| T6 Root layout wires tokens and fonts | AC-EZD-010c-2 | unit (`layout.test.tsx`) | `renderToStaticMarkup(RootLayout({ children: <p /> }))` with fonts mocked (`v-sans`, `v-mono`); `layout.tsx` and `globals.css` read as text | (a) `<html` has `lang="en"` and a `class` whose space-separated words include `v-sans` and `v-mono`; `<body>` contains `<p></p>`. (b) `metadata.title === 'EZ Draft'`. (c) In `layout.tsx` the import of `'../styles/tokens.css'` comes before the import of `'../styles/globals.css'`, and `fonts` is imported from `'../styles/fonts'`. (d) `globals.css` (comments stripped, whitespace collapsed) has a `body` rule whose `font-family` is `var(--ez-font-sans)` | 04 Type ("Instrument Sans … for UI"); EZD-001 (`lang="en"`, title; R26 R17); Step 3 |
| T7 No icon font, no Google Fonts | AC-EZD-010c-2 | unit (`no-icon-font.test.ts`) | Walk `app/src/` and `app/public/` (skip `node_modules`); read `app/package.json` and `app/next.config.ts` | (a) No file with extension `.woff`, `.woff2`, `.ttf`, `.otf` or `.eot` whose name contains `material` or `symbol` (case-insensitive). (b) No `.woff2` outside `app/src/styles/fonts/`. (c) No text file (extensions `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.css`, `.json`, `.svg`, `.html`, `.txt`, `.md`, `.webmanifest`, plus files with no extension such as `LICENSE`), excluding `*.test.ts`, `*.test.tsx`, `*.spec.ts` (C3), nor `app/next.config.ts`, contains `fonts.googleapis.com`, `fonts.gstatic.com`, `next/font/google` or `Material Symbols` (all case-insensitive). (d) No key in `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies` of `app/package.json` matches `/material-symbols\|material-icons/i` | 04 Type ("the mockups load the icon font; the app does not"); 11 rule 8; EZD-010b B4 (sprite and Icon never say "Material Symbols") |
| T12 part c Docs updated | — (CLAUDE.md rule 7: conventions recorded in the same commit) | unit (node:test) | `docs/architecture.md` | (a) The `##` headings equal `REQUIRED_HEADINGS` (13, same order). (b) The text contains `fonts.ts`, `@fontsource/instrument-sans`, `@fontsource/dm-mono`, `OFL-1.1`, `next/font/local` and `src/app/dev/<name>/`. (c) The `ID \| Rule \| Check \| Built by` table has a row whose Check cell contains `no-icon-font.test.ts` and whose Built by is `EZD-010c`. (d) `node scripts/conventions/check.mjs <repo root>` exits 0 | EZD-000 T5 and V6; Step 5 (C4) |
| T13 Gate on a clean tree | both | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-010c` | Exit 0: `typecheck` (test files included, V2 (4)), `lint` (C1–C10: `globals.css`, `page.module.css` hold no literal color), `test`, `build` (`next build` bundles the 5 woff2 files through `next/font/local` and prerenders `/dev/tokens`) | CLAUDE.md rule 12 |

AC-EZD-010c-2 by clause: "self-hosted latin subsets" T5; "wired into the root layout" T6; "returns not found in production" T4 (a); "no icon font or Google Fonts is loaded" T7 (and T5 (b): every font path is local).

## 5. Visual checklist
None. No product screen changes (`tickets.json` `mockups: []`; `/dev/tokens` is a developer page with no board; the only product page is EZD-001's placeholder, which only gains the font). EZD-016a cannot be a dependency (it depends on EZD-007, which depends on EZD-010; V12). Fonts are first checked on a real screen against S03 by EZD-011's ui-verifier (vault/plans/EZD-011.md line 309) and EZD-012's.

## 6. Proposed wording
None. The page's labels (token names and values) and the specimen line are fixed developer text on a page that is not found in production (EZD-010.md Step 5; same footing as EZD-026a line 110). The production 404 is Next.js's own page. No user-visible string is added to any product screen.

## 7. Security review
security-review: no (no auth, permissions, data access, money, API or migrations). The only gate is a developer page hidden in production, covered by T4.
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier no (section 5 empty) · security-reviewer no.

## 8. Complexity and model recommendation
medium: framework font loading, committed binary assets checked by hash, and a change to the root layout that every page uses, all following patterns parts a and b set; no data, permissions, money or auth (PROCESS.md section 4). test-author `claude-sonnet-5-5`, builder `claude-sonnet-5-5`; code-reviewer Opus 5.5.

## 9. Dependencies
- From the ticket row: **EZD-010a** (planned; builds first): `tokens.css`, `TOKENS`, `### Design tokens, fonts and icons`, C10. **EZD-010b** (planned; builds second): `Icon`, `ICON_NAMES`, the sprite at `/icons/sprite.svg`, the `oxc` JSX setting that lets `.test.tsx` compile, and B4 (no "Material Symbols" text) that T7 relies on. **EZD-001** (done): app package, `layout.tsx`, `app/vitest.config.ts`, `app/tsconfig.json` (includes test files), C9. **EZD-004a** (done): the gate's `db:up`. **EZD-004b** (done): the Vitest global setup that needs the local stack.
- Missing from the row (all done; context): **EZD-000** (`docs/architecture.md`, `architecture-doc.test.mjs`, `check.mjs`) and **EZD-008a** (`env` keys in `app/vitest.config.ts`, kept untouched). EZD-016a is not needed (section 5).
- Dependents: through `EZD-010`: EZD-007 (`/dev/**` public), EZD-009, 011, 012, 015, 026a (dev page convention, T4 pattern, `globals.css`), EZD-028 (reads the committed woff2 files; whether PDFKit uses them is that spike's call, EZD-010.md Risks).
- **Risks:** (1) About 81 KB of woff2 is preloaded on every page (sizes in section 2); not JavaScript, so the 11 Budgets do not count it; a later ticket can preload only the 400 weights if phone first paint suffers. (2) The production 404 reads `VERCEL_ENV` at build time (static prerender) as Vercel system variables are exposed by default; EZD-008a's production guard relies on the same variable at run time; if the project ever stops exposing system variables, both would treat production as non-production. (3) A Next.js upgrade may change the not-found digest; T4 then fails loudly and is updated from the new source. (4) Vitest CSS imports: `layout.tsx` and `page.tsx` import CSS files; Vitest's default CSS handling must accept them in the `node` environment (the test-author confirms on first run; if not, `test.css` in `app/vitest.config.ts` is the test-author's to set, keeping every key). No JavaScript bundle budget effect: no client component is added.

## 10. Open questions
None. Every value comes from 04 Frame and visual system, 11 rule 8, the boards under README rule 5 (as the parent recorded), the pinned Next.js source or the planner's `npm pack` check; C1–C5 are "how" choices (CLAUDE.md rule 3) for the code-reviewer to confirm at plan review.
