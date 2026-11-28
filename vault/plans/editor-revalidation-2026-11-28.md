# Editor plans re-validated against the registry layout (EZD-1921, 2026-11-28)

AC-EZD-1921-2; editor consolidation plan section 7 (last guard rail) and section 9 step 7. Run on `develop` 9b453d799,
after EZD-1913c merged. The layout is in `docs/architecture.md` `### Editor features (EZD-1921)`.

Method: every `vault/plans/*.md` that names `ProjectEditor.tsx`, `InspectorPanel.tsx`, `LeftPanel.tsx`,
`DrawingTools.tsx` or `rcp.ts` (67 files), less the tickets in `vault/build/state.json` `done` (1,214), leaves 17.
No existing plan was edited (builders add only new files under `vault/plans`).

| Plan | State | Finding | Action |
| --- | --- | --- | --- |
| EZD-1914 | building (lane 2) | Written for the new layout (`ceiling/tools/<one file per tool>`). Its "Files" line and its footprint list `ceiling/tools/index.generated.ts`; allowed, since EZD-1914 makes that folder (the folder's own ticket lists its index). | None. |
| EZD-1915 | open | `inspector/kinds/*` is the new folder; it still names `InspectorPanel.tsx`, which it shrinks. Matches the layout. It adds the folder's `TARGETS` entry in `app/tools/gen-registry.mjs`, so it must not run beside another ticket that adds one. | None. Its footprint is not predicted yet; it must hold `app/tools/gen-registry.mjs`, which is not a shared file. |
| EZD-1916 | open | `layers/sections/*`, shrinks `LeftPanel.tsx`. Matches. Same `gen-registry.mjs` note. | None. |
| EZD-1917 | open | `ceiling/draw/*`, `rcp.ts` keeps its exports. Matches. Same `gen-registry.mjs` note. | None. |
| EZD-1918 | open | Splits `DrawingTools.tsx` into `DrawingRail.tsx`, `DrawingLayer.tsx`, `tools/parts/*`; no registry folder, no index. Matches. | None. |
| EZD-207, 208, 210, 211, 213, 221, 5603, 5604 | parent ids | No ticket of their own; built through their lettered parts (all in `state.json` `done` on 9b453d799). | None. |
| audit-2026-11-23, editor-consolidation-2026-11-23, split-EZD-120b | not tickets | Reports and a split note, not build plans. | None. |
| EZD-1921 | this ticket | — | — |

EZD-1919, EZD-1920 and EZD-1922 have plans that name none of the five files.

Loop items found (tooling, so for the overseer session as a patch, not a builder):

1. `vault/build/config.json` `shared_files` does not list the generated indexes yet (consolidation plan section 9,
   "Loop config ... after EZD-1910"). Until it does, two tickets that each add a feature file both hold
   `features/index.generated.ts` and wait on each other.
2. The footprint prompt in `scripts/loop.mjs` (`footprintPrompt`) asks for "every ... generated file", so a predicted
   footprint for a ticket that adds a feature file will name the folder's `index.generated.ts`. Item 1 makes that
   harmless; otherwise the prompt should say not to list `index.generated.ts` except for the ticket that makes the
   folder.
