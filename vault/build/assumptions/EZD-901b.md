# Assumptions: EZD-901b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-901b | Where the reference draws, and order | In Plan, on its floor_id's floor only. It is drawn under every model batch (render order below the lowest model batch) and over the grid, at reference opacity (default 60%, board). Text and fills are separate meshes per layer | S11 Canvas; S03 Overlay "locked under the model"; board S11 "Reference 60%" |
| EZD-901b | "One draw call per layer" | One draw call per visible layer and kind (lines, fills, text), the same as EZD-207a's "one buffer per layer and kind". The test expects drawCalls equal to the sum over visible layers of the kinds in the fixture's expected JSON | 11 rule 4; docs/architecture.md Plan canvas Batches |
| EZD-901b | Zoom threshold for text and hatches (11 rule 5; no number in the spec) | Text and pattern-hatch lines are hidden below 25% zoom (`REFERENCE_DETAIL_MIN_ZOOM_PERCENT`); SOLID fills always show. This value is the agent's, not the spec's; the field check can change it | 11 rule 5; precedent findings-p40 "20 comments per link per hour" |
| EZD-901b | Loading and the worker | After the model is interactive, a worker from the EZD-235b pool fetches the signed links of visible layers, reads the chunks and hands the ArrayBuffers over (transfer). Hidden layers load only when shown. The reference code is a lazy chunk imported only when the project has a ready reference. The status bar reads "Loading layers {n} of {m}" while visible layers load and drops it when done. While a reference is converting, the editor watches its job (watchJob, no polling) and draws it when the job finishes | ticket row; 11 rules 3, 7, 11; EZD-922a lists the readout as a state to test (phase 42) |
| EZD-901b | "Cached on the device" (11 rule 5) | Layer files are kept in Cache Storage `ezdraft-reference`, keyed by reference_drawing id and file path (not the signed URL), so sign-out clears them (signOutOnDevice deletes every `ezdraft-` cache). They count toward device_cache_budget: after a write the page trims `ezdraft-reference` oldest first, never the open project's files. The service worker is unchanged (it caches same-origin requests only) | docs/architecture.md App-shell cache "Sign-out", "Cache budget"; 11 rule 5 |
| EZD-901b | Test numbers | AC-1: 50 ms long-task limit from the AC (scripts/perf/trace-tasks.mjs). AC-2: the reference chunk is not among requested chunks on a seeded project with no reference. AC-3: 901b adds a registry row for pan and zoom with the 150k reference in scripts/perf/registry.mjs; budgets come from 11 Budgets (desktop 16 ms is recorded as a trend; the gate counts React commits, draw calls and long tasks). AC-4 is Josh's field check, not a loop test | AC-EZD-901b-1..4; 11 Budgets, intro "In CI the gate is on countable things" |
| EZD-901b | Units readout | Status bar "Units" with "{unit name} · 1 unit = {length}" from the board ("inches · 1 unit = 1""). Unit names: inches, feet, millimeters, centimeters, meters; unitless reads "unitless · 1 unit = 1"" | board S11 status bar; S11 Data shown |
| EZD-901b, EZD-902, EZD-903, EZD-904, EZD-905, EZD-913, EZD-921 | Screens with no board (S11 "not in mockup" items, the S03 Architect DXF row) | Built from the written spec in the style of board S11 (and S03Plan for the overlay row), with no new boards. Listed for Josh as question 1; Q-0771 named only phases 28–37 | 05-screens.md#Q-0771; #Q-0760 precedent |
| EZD-901b, EZD-904 | Wording for Josh to confirm | Board text: "Layers", "Markup", "Files", "This project", "EZ model", "DXF layers", "{n} · {m} shown", "Converted", "Reference", "Units", "Layers", "File", "Reference is read only. Convert a layer to edit it." Ticket text: "Loading layers {n} of {m}". Proposed: menu "Isolate layer", "Show all", "Reset color", "Snap on", "Snap off" (S11 D7); "Opacity"; for screen readers "Show {layer}", "Hide {layer}", "Color of {layer}", "Layer options"; units "feet", "millimeters", "centimeters", "meters", "unitless"; "The drawing couldn't be shown. Try again." | CLAUDE.md rule 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
