# EZD-010b · Icon sprite and Icon component

- **ACs:** AC-EZD-010b-1 (icons:build turns icons.json into the committed sprite and IconName list and gives the same bytes on every run, it fails on a missing, repeated or unsorted name, and the Icon component draws a sprite symbol) (`vault/spec/acceptance-criteria.md` line 42).
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen yet. The app now has an icon component that draws from one small cached sprite file, and adding an icon takes one command.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

This part is planned from `vault/plans/EZD-010.md`: the Split proposal Part EZD-010b (lines 27–36), Re-validation findings V1–V14 (lines 52–67), Approach Step 4 (lines 186–207) and the icon parts of Step 7 (lines 230–249), plus Tests T8, T9, T10, T12 and T13 (lines 305–310). Q-0155 applied the split. Every interface name and test ID from the parent is kept. Refinements made here are all "how" (CLAUDE.md rule 3), and new test cases are marked "added by this plan":
- **B1:** where the pinned commit is recorded (Step 3).
- **B2:** the exact source-SVG and name rules (Step 2).
- **B3:** a failed run writes nothing (Step 2).
- **B4:** the sprite must not contain the text `Material Symbols`, so that EZD-010c T7 passes (Step 2).
- **B5:** the JSX setting in `app/vitest.config.ts`, confirmed on the pinned Vite (Step 6).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 23):
- **Scope:** Icons as an SVG sprite of the Material Symbols actually used (no icon font file): committed source SVGs and licence, icons.json list, icons:build and icons:fetch scripts, generated app/public/icons/sprite.svg and IconName list, Icon component; architecture icon bullets. Split from EZD-010 (Q-0155); plan Part EZD-010b.
- **Done when:** icons:build turns icons.json into the committed sprite and IconName list and gives the same bytes on every run, it fails on a missing, repeated or unsorted name, and the Icon component draws a sprite symbol.
- **Depends on:** EZD-010a, EZD-001, EZD-004a, EZD-004b.
- **Spec ref:** App shell · Frame and visual system.

### Step 1: icon style and the first icon
- **Spec:** 04 Type says "Material Symbols Outlined icons, shipped as an SVG sprite of the icons used (the mockups load the icon font; the app does not)" (`vault/spec/sections/04-app-shell-and-global-ui.md` line 10). 11 Performance rule 8 says "an SVG sprite of the icons actually used instead of the Material Symbols font file" (`11-non-functional-requirements.md` line 32).
- **Weight and grade from the boards:** weight 400, grade 0. Every Studio board styles `.ms` with `font-weight:normal` (EZD-010.md Sources line 90, V9). The boards are used here under tickets README rule 5.
- **Fill:** FILL 0 by default. FILL 1 is used on S17 boards only and is available as `<name>-fill`.
- **Optical size:** 20. Board icons are 17–23 px, and 20 is the nearest size published as SVG (EZD-010.md Step 4, planner's choice; kept).
- **Source:** `github.com/google/material-design-icons`, folder `symbols/web/<name>/materialsymbolsoutlined/`, Apache-2.0.
  - `<name>.svg` comes from `<name>_20px.svg`.
  - `<name>-fill.svg` comes from `<name>_fill1_20px.svg`.
  - Checked 2026-10-19: `expand_more_20px.svg` and `expand_more_fill1_20px.svg` both return HTTP 200. The 20 px file is exactly `<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20"><path d="M480-333 240-573l51-51 189 189 189-189 51 51-240 240Z"/></svg>`. The repository's `LICENSE` is the Apache License 2.0 (11,357 bytes) and contains neither "Material Symbols" nor "googleapis".
- **`icons.json` is seeded with `["expand_more"]`.** This is the chevron next to the project name (04 Header card line 18 "Project name + chevron"; `S03Plan.dc.html` uses `expand_more`, V9). EZD-011 draws it at 18 px (vault/plans/EZD-011.md line 139). Later tickets add their own icons: EZD-012 adds `arrow_selector_tool`, `help` and `kitchen`; EZD-014 adds `share` and `download` (Q-0098); EZD-015 adds `close`, `cloud_off` and `error`.

### Step 2: `app/scripts/icons-build.mjs` (CLI; Node 22 built-ins only, no network, no dependency)
- **Usage:** `node app/scripts/icons-build.mjs [--src <dir>] [--list <file>] [--sprite <file>] [--names <file>]`.
  - The defaults are resolved relative to the script file, not the working directory, so the script behaves the same from the root and from `app/` (planner's choice). They are `../src/components/icon/svg/`, `../src/components/icon/icons.json`, `../public/icons/sprite.svg` and `../src/components/icon/icon-names.generated.ts`.
  - An unknown flag, or a flag with no value, fails.
- **Checks.** Every failure exits 1 and writes one line per problem to stderr, naming the icon or file.
  - (a) The list file is not a JSON array of strings.
  - (b) A name does not match `^[a-z0-9_]+(-fill)?$` (B2: Material Symbols names are lower case, digits and `_`).
  - (c) A name appears more than once (repeated).
  - (d) The list is not in strictly ascending order by JavaScript string comparison (unsorted; for example `a` < `a-fill` < `b`).
  - (e) `<src>/<name>.svg` does not exist (missing).
  - (f) A source file is not exactly one root `<svg …>` that has a `viewBox="…"` attribute and contains only one or more `<path d="…"/>` elements, with nothing but whitespace between tags and no attribute on `<path>` other than `d` (B2). An optional `<?xml …?>` prolog is allowed. This keeps `<style>`, `<script>`, `<text>`, `fill` and anything else out of the sprite.
  - Source files that are not in the list are ignored.
- **B3:** if any check fails, the script writes neither output file.
- **Sprite output.** UTF-8, `\n` line endings, ending with a newline:
  - line 1: `<svg xmlns="http://www.w3.org/2000/svg">`;
  - line 2: one comment, `<!-- Generated by app/scripts/icons-build.mjs from icons.json; do not edit. Icons from github.com/google/material-design-icons, Apache-2.0 (app/src/components/icon/svg/LICENSE). -->`;
  - then one line per listed name, in list order: `<symbol id="<name>" viewBox="<source viewBox>">` + `<path d="<d>"/>` for each source path in source order + `</symbol>`;
  - last line: `</svg>`.
  - The `<symbol>` has no `width`, `height` or `fill` attribute.
  - **B4:** no text in the file says "Material Symbols", because EZD-010c T7 walks `app/public/` and fails on that text (EZD-010.md T7 line 304).
- **Names output:**

  ```
  // Generated by app/scripts/icons-build.mjs from icons.json; do not edit.
  export const ICON_NAMES = [
    '<name>',
    …
  ] as const;
  export type IconName = (typeof ICON_NAMES)[number];
  ```

  It uses single quotes, two-space indent and `\n` line endings, and ends with a newline.
- **Byte-stable:** the output depends only on the list and the source files, so the same inputs give the same bytes on every run. There is no timestamp, no absolute path and no ordering by the file system.

### Step 3: `app/scripts/icons-fetch.mjs` (developers only; uses the network)
- **Usage:** `node app/scripts/icons-fetch.mjs <name>…`.
- **Pinned commit (B1).** The script holds one line, `export const ICON_COMMIT = '<40 lower-case hex>';`. The commit to pin is `49d4db35df873165d6bd6ba09b063c7dafbac2f4`, the head of `master` on 2026-10-19 (api.github.com, read 2026-10-19; commit date 2026-10-09).
  - The commit lives in this script and in `docs/architecture.md`, not in the sprite. The parent put it in the sprite comment, but here the build script stays independent of the fetch script.
  - T12 part b (d) checks that the docs and the script hold the same commit.
- **What it downloads.**
  - For each name it downloads `https://raw.githubusercontent.com/google/material-design-icons/<ICON_COMMIT>/symbols/web/<base>/materialsymbolsoutlined/<base>_20px.svg`, where `<base>` is the name without `-fill`.
  - For a `-fill` name it downloads `…/<base>_fill1_20px.svg` instead. There is no fallback to another size (EZD-010.md Step 4).
  - It writes each file to `app/src/components/icon/svg/<name>.svg` unchanged.
  - It writes `svg/LICENSE` from `<ICON_COMMIT>/LICENSE` when that file is absent.
- **Failures.** A name that fails the Step 2 (b) pattern, or any response that is not 200, exits 1 naming the icon. Nothing is written until every download has succeeded.
- **Who runs it.** It is never run by tests, the gate or CI (EZD-010.md Step 4). It uses the global `fetch` of Node 22, so no package is added.
- **This ticket's run.** The builder runs it once for `expand_more`, which writes `svg/expand_more.svg` and `svg/LICENSE`.

### Step 4: `Icon` component
- **File:** `app/src/components/icon/Icon.tsx`. It has no `'use client'` and no state, so it works in server and client components and adds no client JavaScript of its own (11 Budgets).
- **Markup:** `export function Icon({ name, size }: { name: IconName; size: number })` renders `<svg width={size} height={size} aria-hidden="true" focusable="false" fill="currentColor"><use href={`/icons/sprite.svg#${name}`} /></svg>` (EZD-010.md Step 4).
- **Size:** required, because the spec sets no default icon size.
- **Decorative only.** The button around the icon carries the label and tooltip (11 Accessibility line 93: "All icon buttons have labels and tooltips"). EZD-011, 012, 014 and 015 call it as `<Icon name=… size=… />` (their plans, read 2026-10-19).
- **Why a separate sprite file.** The sprite is served from `app/public/icons/sprite.svg` at `/icons/sprite.svg` (Next.js `public/`), so the browser downloads and caches it once (11 rule 13; EZD-013 caches static files).
- **B4 applies here too:** no comment in `Icon.tsx` or the names file says "Material Symbols".

### Step 5: package scripts, Prettier, docs
- **`app/package.json` `scripts`:** add `"icons:build": "node scripts/icons-build.mjs"` and `"icons:fetch": "node scripts/icons-fetch.mjs"`. No dependency changes.
- **`.prettierignore`:** append `# EZD-010b: generated by app/scripts/icons-build.mjs (vault/plans/EZD-010b.md Step 5).`, then the two lines `app/src/components/icon/icon-names.generated.ts` and `app/public/icons/`. Generated files are not reformatted, because T8 compares bytes (V7). `app/scripts/` stays formatted, since the root `scripts/*` lines are anchored (V7).
- **`docs/architecture.md`** (same commit; only `###` content, so EZD-000 T5's 13 `##` headings hold, V6):
  - **`## Folder layout` code block:** under `app/`, three new lines:
    - `  src/components/icon/    Icon.tsx, icons.json (sorted list of icons used), svg/ (committed sources + LICENSE), icon-names.generated.ts (EZD-010b)`;
    - `  public/icons/sprite.svg the generated icon sprite, served at /icons/sprite.svg (EZD-010b)`;
    - `  scripts/                icons-build.mjs, icons-fetch.mjs: the icon pipeline, run by hand (EZD-010b; not the root scripts/)`.
  - **`### Design tokens, fonts and icons`** (created by EZD-010a): append icon bullets.
    - The source: `github.com/google/material-design-icons`, folder `symbols/web/<name>/materialsymbolsoutlined/`, pinned commit `<ICON_COMMIT>`, Apache-2.0.
    - The style: Outlined, weight 400, grade 0, optical size 20; FILL 0, with `<name>-fill` for FILL 1.
    - How to add an icon: run `pnpm --filter @ezdraft/app icons:fetch <name>`, add the name to `icons.json` in sorted order, run `pnpm --filter @ezdraft/app icons:build`, then commit the SVG, the sprite and the names file. T8 fails otherwise.
    - `Icon` is decorative, so the button carries the label and tooltip (11 Accessibility).
    - Never load the icon font, and never write the words "Material Symbols" in `app/src/` or `app/public/` (EZD-010c T7).
  - **`## Machine checks`:** add one row: `| — | Icon sprite and names file match icons.json; icons:build is byte-stable and refuses missing, repeated or unsorted names | app/src/components/icon/icons.test.ts (T8, T9) | EZD-010b |`.
  - **`## Dependencies`:** no row is added, because no package is added (`fetch`, `node:fs` and `node:path` are built in).

### Step 6: `app/vitest.config.ts` JSX transform (test-author; B5, V3)
- This is the first `.tsx` test (T10).
- **Probe.** On 2026-10-19 the planner ran Vitest 5.0.5 / Vite 8.3.4 from `app/node_modules` in a scratch folder outside the repository, since deleted. With a tsconfig of `"jsx": "preserve"` (as `app/tsconfig.json`), the `.tsx` test failed with "Failed to parse source for import analysis … make sure to not set jsx to preserve". With the top-level config key `oxc: { jsx: { runtime: 'automatic' } }` it passed. `renderToStaticMarkup` (react-dom 19.3.1) then printed `<svg width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><use href="/icons/sprite.svg#expand_more"></use></svg>` for the Step 4 component.
- **Change.** The test-author adds `oxc: { jsx: { runtime: 'automatic' } }` at the top level of `defineConfig({...})`, beside `test`, and keeps every existing key (V3).
- **Not touched:** `app/tsconfig.json` (Next.js needs `preserve`) and `eslint.config.mjs` (V2).

### Files

**Size.** 7 code files, 5 data and generated files, and 4 test-author files plus fixtures. That is the size the parent's Split proposal set for this part (EZD-010.md line 32) and Q-0155 applied. B1 avoids the extra shared module the parent's sprite-comment commit would have needed. There are 4 test IDs plus the gate.

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/src/components/icon/Icon.tsx` | New | builder | Step 4 |
| `app/scripts/icons-build.mjs` | New | builder | Step 2 |
| `app/scripts/icons-fetch.mjs` | New | builder | Step 3 |
| `app/package.json` | Change | builder | Step 5 scripts |
| `.prettierignore` | Change (extend EZD-001/004a/010a) | builder | Step 5 |
| `docs/architecture.md` | Change | builder | Step 5 |
| `app/src/components/icon/icons.json` | New | builder | `["expand_more"]` (Step 1) |
| `app/src/components/icon/svg/expand_more.svg`, `svg/LICENSE` | New (fetched) | builder | Step 3 run |
| `app/src/components/icon/icon-names.generated.ts`, `app/public/icons/sprite.svg` | New (generated) | builder | `icons:build` output |
| `app/src/components/icon/icons.test.ts`, `__fixtures__/svg/{a,a-fill,b,bad}.svg` | New | test-author | T8, T9 |
| `app/src/components/icon/Icon.test.tsx` | New | test-author | T10 |
| `scripts/conventions/__tests__/architecture-doc.test.mjs` | Change (add cases) | test-author | T12 part b |
| `app/vitest.config.ts` | Change | test-author | Step 6 |
| `app/tsconfig.json`, `eslint.config.mjs`, `scripts/conventions/check.mjs`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | V2, V3; Josh- or orchestrator-owned |

**Write rules** (lesson L-002; V8; `.claude/hooks/guard-paths.mjs` lines 15–17 and 74–84):
- Builder paths are under `app/`, `docs/architecture.md` and `.prettierignore`. None is a test path, and none is in the line 83 deny list. `app/scripts/` is not the root `scripts/`.
- Test-author paths are `*.test.ts(x)`, `__fixtures__/`, `__tests__/` and `vitest.config.ts`, all matched by `isTest`.

**Data:** none. No tables, columns, migrations, RLS, `schema_version` or money fields (03 Data model: nothing on icons, grep 2026-10-19).

## 2. Sources
- **Spec:**
  - `vault/spec/sections/04-app-shell-and-global-ui.md`, Frame and visual system, Type (line 10), and Header card (line 18, chevron).
  - `11-non-functional-requirements.md`, Performance rules 8 (line 32) and 13 (line 37), Budgets (no client JS added), Accessibility (line 93).
  - `03-data-model.md`: nothing touched.
  - `02-product-overview.md` Named tools: no new tool.
- **Decisions** (`vault/spec/decisions/04-app-shell-and-global-ui.md`):
  - Q-0098 names icons that later tickets add (`share`, `download`; EZD-014).
  - No decision changes the icon style.
  - Q-0155 (`vault/questions/QUESTIONS.md` line 164) applied the split.
- **Non-goals, glossary:** nothing on icons or sprites (grep 2026-10-19).
- **Mockups:** none for this ticket (`tickets.json` `mockups: []`; no screen). The Studio boards are used only for the style details in Step 1 (V9, tickets README rule 5). `vault/KNOWN-LIMITS.md` item 5: sample data is not a decision.
- **Parent plan:** `vault/plans/EZD-010.md`: Split proposal Part EZD-010b, V1–V14, Approach Step 4, Step 7, T7–T10, T12, T13. `vault/plans/EZD-010a.md` Step 4 creates `### Design tokens, fonts and icons`.
- **Dependent plans checked for the contract:** EZD-011 line 139, EZD-012 lines 78 and 116, EZD-014 lines 115–121, EZD-015 lines 213, 283 and 391–392.
- **Code read on develop (7f281c1) on 2026-10-19:** `app/vitest.config.ts`, `app/package.json`, `app/tsconfig.json`, `.prettierignore`, `.claude/hooks/guard-paths.mjs`, `scripts/conventions/__tests__/architecture-doc.test.mjs` (`readArch` line 16, `REQUIRED_HEADINGS` line 83, T5 line 170), and `docs/architecture.md`. `app/src/components/`, `app/public/` and `app/scripts/` do not exist yet.
- **Outside checks, 2026-10-19:** the raw GitHub file and LICENSE checks in Step 1, the commit lookup in Step 3, and the Vite probe in Step 6.
- **Research:** no R-NNN report covers this ticket.

## 3. Interface contract
These are the parent's names, unchanged. EZD-010c, 011, 012, 014 and 015 cite them.

| Kind | Name or path | Details |
| --- | --- | --- |
| export | `Icon` from `app/src/components/icon/Icon.tsx` | `export function Icon({ name, size }: { name: IconName; size: number })`; named export only, no `'use client'`; markup exactly as in Step 4 (attribute order `width`, `height`, `aria-hidden`, `focusable`, `fill`) |
| file / exports | `app/src/components/icon/icon-names.generated.ts` | `export const ICON_NAMES = [...] as const;` and `export type IconName = (typeof ICON_NAMES)[number];`; format as in Step 2 |
| file | `app/src/components/icon/icons.json` | JSON array of names matching `^[a-z0-9_]+(-fill)?$`, strictly ascending, no repeats; seeded `["expand_more"]` |
| folder | `app/src/components/icon/svg/` | `<name>.svg` per listed name, plus `LICENSE` (Apache-2.0) |
| file / route | `app/public/icons/sprite.svg`, served at `/icons/sprite.svg` | One `<symbol id="<name>" viewBox="0 -960 960 960">` per listed name, in list order; format as in Step 2 |
| CLI | `node app/scripts/icons-build.mjs [--src <dir>] [--list <file>] [--sprite <file>] [--names <file>]` | Defaults as in Step 2; exit 0 on success; exit 1 with problems on stderr naming the icon or file, writing nothing |
| CLI / const | `node app/scripts/icons-fetch.mjs <name>…`; line `export const ICON_COMMIT = '<40 hex>';` | Step 3; network; never run by tests or the gate |
| package scripts | `app/package.json` `icons:build` = `node scripts/icons-build.mjs`, `icons:fetch` = `node scripts/icons-fetch.mjs` | Run as `pnpm --filter @ezdraft/app icons:<x>` |
| config | `app/vitest.config.ts` top-level `oxc: { jsx: { runtime: 'automatic' } }` | Step 6; every existing key kept |
| docs | `docs/architecture.md` icon bullets, folder lines, Machine checks row | Step 5; names `ICON_COMMIT`'s value |

## 4. Tests
**Rules for the Vitest tests (T8–T10):**
- They run in `@ezdraft/app` (`environment: 'node'`), in top-level `describe`s whose titles start `EZD-010b` (check C9; the phase-0 grep matches `EZD-010b`, V2).
- They import by relative path (there is no `@/` alias in Vitest, V2).
- They spawn the build script with `process.execPath` and a path resolved relative to the test file, and write outputs to a fresh `fs.mkdtemp(os.tmpdir())` folder.
- The app global setup needs the local stack up (V3).

**T12 part b** is `node:test` cases added to `architecture-doc.test.mjs`, with titles starting `EZD-010b`, using `readArch()`.

**Matching:** tests match on exit codes, names in the output and bytes, never on message wording.

**smoke:** no.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T8 Sprite is current and clean. Title: `EZD-010b done when: icons:build turns icons.json into the committed sprite and IconName list` | AC-EZD-010b-1 | unit | `node app/scripts/icons-build.mjs --sprite <tmp>/sprite.svg --names <tmp>/names.ts` (default `--src` / `--list`) | (a) Exit 0. (b) `<tmp>/sprite.svg` is byte-equal to `app/public/icons/sprite.svg`, and `<tmp>/names.ts` is byte-equal to `icon-names.generated.ts`. (c) The ids of the committed sprite's `<symbol` elements equal the `icons.json` list exactly (same names, same order, no extras), the list includes `expand_more`, and every symbol has `viewBox="0 -960 960 960"`. (d) The sprite contains no `<style`, `<script`, `<text`, `font-family`, `@font-face` or `fill=`, and no `width=` or `height=` anywhere. Added by this plan: (e) the sprite contains no `Material Symbols` (case-insensitive; B4), and its first comment contains `google/material-design-icons` and `Apache-2.0`. (f) `app/package.json` `scripts["icons:build"]` = `node scripts/icons-build.mjs` and `scripts["icons:fetch"]` = `node scripts/icons-fetch.mjs`. No total count is asserted, so later tickets add icons without editing this test | `icons.json` (Step 1); viewBox of the Google source (Step 1, checked 2026-10-19); 11 rule 8; EZD-010.md T8; B4 from EZD-010.md T7; Step 5 |
| T9 Build script rules | AC-EZD-010b-1 | unit | Fixtures `__fixtures__/svg/`: `a.svg`, `a-fill.svg`, `b.svg`, each `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M0 0h1"/></svg>` with distinct `d`; `bad.svg` = the same with a `<circle r="1"/>` added. Lists written to `<tmp>`: (1) `["a","a-fill"]`; (2) `["a","zz_missing"]`; (3) `["a","a"]`; (4) `["b","a"]`; added by this plan: (5) `["a","bad"]`; (6) `["A"]` | (1) Exit 0; symbols `a` then `a-fill`; each symbol's `<path d=…>` equals its fixture's; the names file has `ICON_NAMES` = `a`, `a-fill` in that order (any quote style); `b` is not in the sprite; a second run into a second tmp folder gives byte-equal sprite and names files. (2) Exit 1; stderr contains `zz_missing`. (3) Exit 1; stderr contains `a`. (4) Exit 1. (5) Exit 1; stderr contains `bad`. (6) Exit 1; stderr contains `A`. Cases (2)–(6) (B3): the `--sprite` and `--names` paths do not exist afterwards | Step 2; EZD-010.md T9 |
| T10 Icon component | AC-EZD-010b-1 | unit (`Icon.test.tsx`) | `renderToStaticMarkup(<Icon name="expand_more" size={20} />)`; `size={18}` | (a) The markup is exactly `<svg width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><use href="/icons/sprite.svg#expand_more"></use></svg>`. (b) With `size={18}`, `width="18"` and `height="18"`. Added by this plan: (c) one line `// @ts-expect-error` above `<Icon name="not_an_icon" size={20} />` (checked by `tsc --noEmit` in the gate's typecheck, which covers app test files, V2 (4)) | Step 4; Step 6 probe output (react-dom 19.3.1); 11 Accessibility (no text: the label is on the button); EZD-011 line 139 (18 px) |
| T12 part b Docs updated | — (CLAUDE.md rule 7, conventions recorded in the same commit) | unit (node:test) | `docs/architecture.md`; `app/scripts/icons-fetch.mjs` as text; `.prettierignore` | (a) The `##` headings equal `REQUIRED_HEADINGS` (13, same order). (b) The text contains `icons.json`, `icons:build` and `icons:fetch`. (c) The `ID \| Rule \| Check \| Built by` table has a row whose Check cell contains `icons.test.ts` and whose Built by is `EZD-010b`. Added by this plan: (d) the 40-hex value in the `export const ICON_COMMIT = '…';` line of `icons-fetch.mjs` (exactly one such line) appears in `docs/architecture.md`. (e) `.prettierignore` has the lines `app/src/components/icon/icon-names.generated.ts` and `app/public/icons/`. (f) `node scripts/conventions/check.mjs <repo root>` exits 0 | EZD-000 T5 and V6; Step 5; B1; V7 |
| T13 Gate on a clean tree | AC-EZD-010b-1 | gate (orchestrator) | `node scripts/gate.mjs .claude/worktrees/EZD-010b` | Exit 0: `typecheck` (including `Icon.test.tsx` and the generated names file), `lint` (including `app/scripts/*.mjs`, V2), `test`, `build` | CLAUDE.md rule 12 |

**AC-EZD-010b-1 by clause:**
- "turns icons.json into the committed sprite and IconName list": T8 (a)–(c).
- "same bytes on every run": T8 (b) and T9 (1).
- "fails on a missing, repeated or unsorted name": T9 (2)–(4).
- "Icon component draws a sprite symbol": T10 (a).

## 5. Visual checklist
None. No screen changes: `mockups: []`, and nothing renders `Icon` until EZD-010c's dev page and EZD-011's header. EZD-016a is not a dependency (V12: it depends on EZD-007, which depends on EZD-010). The icon is first checked on screen against S03 by EZD-011's ui-verifier.

## 6. Proposed wording
None. The script messages and the sprite comment are developer text, not user-visible. `Icon` renders no text.

## 7. Security review
security-review: no (no auth, permissions, data access, money, API or migrations). The fetch script downloads only from a pinned commit, by a developer's hand. The build's source rule (Step 2 (f)) and T8 (d) keep scripts and styles out of the served sprite.
Reviewers needed: code-reviewer always · calc-auditor no (no calculations, dimensions or scaling) · ui-verifier no (section 5 empty) · security-reviewer no.

## 8. Complexity and model recommendation
medium. This is a new build-time pipeline with byte-stable generated outputs that five later tickets rerun, plus the first `.tsx` test setup. There are no data, permissions, money or auth, so it is not high (PROCESS.md section 4). Test-author `claude-sonnet-5-5`, builder `claude-sonnet-5-5`; code-reviewer Opus 5.5.

## 9. Dependencies
**From the ticket row:**
- **EZD-010a** (planned, not built; it builds first): creates `### Design tokens, fonts and icons`, which Step 5 appends to, and adds its own `.prettierignore` line.
- **EZD-001** (done): the app package, `.prettierignore`, `app/vitest.config.ts`, `app/tsconfig.json` including `**/*.tsx`, the ESLint config that accepts Node globals in `app/scripts/`, and C9.
- **EZD-004a** (done): the gate's `pnpm db:up`.
- **EZD-004b** (done): the Vitest global setup, which needs the local stack.

**Missing from the row** (said here; all done):
- **EZD-000**: `docs/architecture.md`, `architecture-doc.test.mjs` (T12) and `check.mjs` (T12 (f)).
- **EZD-008a**: the `env` keys in `app/vitest.config.ts` that Step 6 keeps.

EZD-016a is not needed (section 5).

**Dependents:**
- EZD-010c uses `Icon` and `ICON_NAMES` in T3 (d), and its T7 is why B4 exists.
- EZD-011, 012, 014 and 015 add icons through `icons:fetch` and `icons:build`.
- EZD-013 uses `public/app-icons/`, kept apart from `public/icons/`.

**Risks:**
1. A later Google SVG with more than `<path d>` elements makes the build fail on purpose (Step 2 (f)). That ticket then raises a question rather than loosening the rule.
2. The sprite URL is fixed (`/icons/sprite.svg`), so after a deploy a browser or EZD-013's service worker may hold an old sprite. Next.js serves `public/` files with revalidation, and cache versioning is EZD-013's concern.
3. Optical size 20 at 21–23 px may look slightly thin. EZD-011 and EZD-012's ui-verifiers judge it against S03.
4. The `oxc` key is specific to Vite 8. A Vitest or Vite upgrade must keep `.tsx` tests compiling (T10 fails loudly if not).

No performance budget effect: `Icon` adds no client JavaScript, and the sprite is one small cached SVG.

## 10. Open questions
None. Every rule comes from 04 Type, 11 rule 8, the parent plan or a "how" choice recorded above (B1–B5) for the code-reviewer to confirm at plan review. The icon style and the first icon were settled in the parent (Step 1 sources).
