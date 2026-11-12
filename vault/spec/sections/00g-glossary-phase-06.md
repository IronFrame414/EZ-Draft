# Glossary addendum · Phase 6

Added by spec-check 6 (Q-0664, gap 19). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00f.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Phase view | The Existing or Proposed choice in the status bar's View control; sets the status of new objects and what is shown. Saved per project. | `phase_default` | S03 Controls — status bar; Q-0664 |
| Layer | A group of objects in the Layers tab (a Phase row, an Overlay or Rooms) that can be shown, hidden or locked. | none yet (EZD-218 plan names it) | S03 Controls — left panel |
| Overlay | A layer for a kind of object drawn over the plan: Electrical, Ceiling, Dimensions, Architect DXF. | none yet | S03 Controls — left panel |
| Eye | The show/hide toggle on a layer row; overrides the phase view's display. | none yet | S03 Decisions |
| Layer lock | The lock icon on a layer row; a locked layer's objects cannot be selected (the layer filter). | none yet | S03 Decisions |
| Auto dimension | A dimension the editor places and keeps up to date: overall (outer extents of all walls) or room (inside width and depth). | none yet (EZD-216 plan names it) | S03 rail Dimension; Q-0664 |
| Dimension override | Text typed over a dimension in place of its measured value. | none yet | S03 rail Dimension |
| Leader | The line from a text note to the thing it points at. | none yet | S03 rail Text |
| Paper size | The printed height of text; text keeps it at every zoom and scale. | none yet | S03 rail Text; Q-0664 |
| Display scale | The plan scale chosen in the Scale popover; sets what 100% zoom means. Not the sheet scale. | none yet | S03 Controls — status bar; Q-0664 |
| Snap settings | The snap toggles (endpoints, midpoints, 90/45°, wall faces) and the increment, set in the Snap popover for this device session. | none yet | S03 Controls — status bar; Q-0664 |
| Plan thumbnail | The 440 × 256 WebP image of the plan made at a checkpoint and shown on the project card. | `thumbnail_path` | S01 Card thumbnail; 03c project |
| Version preview | The same image stored on the version it was made for. | `preview_path` | 03c model_version; R24 #4 |
| Benchmark run | One run of the benchmark page, stored with frame times, memory, device and app version. | `benchmark_run` | 03e; Q-0664 |
| Derived value | A value computed from the model (room area, auto dimension), cached by the objects it reads and recomputed only when one changes and a view asks for it. | none yet (EZD-235 plan names it) | 11 rule 2 |
| Worker pool | The Web Workers that run heavy derived work off the main thread. | none yet | 11 rule 3 |
| Floor switcher | The control that picks which floor the canvas shows. | none yet (EZD-6001 plan names it) | Q-0509; Q-0664 |
| System status | The Settings page for the owner showing job failures, webhook failures, the last off-site backup and the last restore drill. | `settings_system_status` | 11 Operations; Q-0225 |
