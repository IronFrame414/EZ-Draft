# 15d · Settings: Defaults

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Every threshold, tolerance, limit, waste factor and keyboard shortcut the app uses, entered by the owner as company settings (Round 24). Drawing, takeoff, field, electrical and history tools read these values.

**Entry points:** Settings nav "Defaults" (badge "ft-in"). "Change in settings" beside the tolerance on Import review (S02). "Change in company settings" under Default overhangs on Countertops (S04b). "Set in Defaults" links shown wherever a needed value is still empty.

**Permissions:** Manage users and settings. Section hidden without it. Per-project overrides are made on the project, not here.

**Layout:** Settings shell. Main card: groups Units, Increments, Tolerances, Countertops, Ceilings, Electrical, Baths, 3D, Details, Waste factors, Catalog, History + collaboration, Client, Integrations, Keyboard shortcuts. Each group is a form; Keyboard shortcuts is a table. (Not in mockup.)

**Controls:** (Section not in mockup; values cited from plan and other mockups. Values shown are the mockup or plan figures; the owner confirms or changes each.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Units (display) | Units | Imperial ft-in; fractions to 1/16". | Fixed in v1. |
| Dimension display: plans | Units | 1/2". | Plan Round 13. |
| Dimension display: details | Units | 1/16". | Plan Round 13. |
| iPad input mode (company default) | Units | Pencil-only or finger drawing. | Plan Round 3. Each user can override in My profile (Claude). |
| Cabinet auto-fill increment | Increments | 3". | Plan Round 21. |
| Countertop increment | Increments | 1/2". | S04b status bar; a setting (Claude). |
| Measurement tolerance | Tolerances | One value used for scan-vs-typed conflicts (S02 shows 1/2"), field measurements (S17 shows 1/8") and the 17b closure check. | Round 24: one tolerance setting. Owner sets the single value. |
| High-confidence cutoff (%) | Tolerances | Import items below it go to "To check" (S02). | Owner enters (Round 24). |
| Cabinet fit tolerance | Tolerances | Run total vs wall length after fillers and scribe (S04 fit chip). | Owner enters (Round 24). |
| Reference change tolerance | Tolerances | Geometry moved more than this counts as a change in the reference diff (S11). | Owner enters. |
| Leader snap tolerance | Tolerances | Leader end farther than this from linework triggers "Leader points to empty space" (S10). | Owner enters. |
| Field measure sanity range | Tolerances | Values outside it ask to confirm on 17b. | Default 0 to 200 ft (Claude). |
| Default overhang: Standard | Countertops | 1 1/2". | Plan Round 23; S04b. |
| Default overhang: Seating, counter height | Countertops | 12". | S04b. |
| Default overhang: Seating, bar | Countertops | 10". | S04b. |
| Default overhang: Against wall | Countertops | 0 + splash. | S04b. |
| Seating overhang support limit | Countertops | Overhang beyond this adds support brackets to a detail and shows a notice. | Owner enters (Round 24). Empty = support check off, with a "Set in Defaults" notice on S04b. |
| ACT minimum border | Ceilings | Smallest edge tile; balancing keeps borders at or above it (S05). | Default half a tile (plan Round 16). |
| Fan blade clearance | Ceilings | Minimum blade clearance to walls and beams (S05). | Owner enters (Round 24). |
| Light-level target per room type | Ceilings | Foot-candle target used by Auto-layout cans (S05). | Owner enters (Claude). |
| Load warning threshold (% of service) | Electrical | Service bar amber at or above it, red above 100% (S06). | Owner enters (Round 24). |
| Voltage-drop warning threshold (%) | Electrical | Electrical check warns when a circuit's estimated drop exceeds it. | Round 24 #37. Owner enters. |
| Device height notes default | Electrical | Off. | Round 24 #36: optional per device, off by default. |
| Bath clearances | Baths | Minimum clearances for toilet, lavatory, tub and shower and minimum shower size used by the bath clearance check. | Round 3. Owner enters. |
| Walk eye height | 3D | 5'-6". | S07 (Claude). |
| Detail scales offered | Details | 3/4", 1", 1 1/2", 3", 6" = 1'-0", full size, NTS. | S10 (Claude). |
| Waste factor per material | Waste factors, table | Row per material (tile, LVP, drywall, paint, trim, countertop) with % input. | Plan Round 7. Owner enters. Editable per project. |
| Pattern adjustment | Waste factors, table | Extra % per pattern: straight, diagonal, herringbone. | Plan Round 7. Owner enters. |
| Recently added window | Catalog | Items added within it show under Recently added (S09). | Default 30 days (Claude). |
| Working version auto-delete | History + collaboration | Unsent working versions auto-delete at 30 days; cleanup sheet first; unticked versions delete after 7 more days. | Round 24 #4. Values editable. |
| Edit lock auto-release | History + collaboration | 5 minutes after a Request edit with no answer. | Round 24 #17; does not pause offline. |
| Share link expiry | Client | 30 days; renewable. | Plan Round 14. |
| Share link reminder lead time | Client | Days before expiry for the share\_link.expiring reminder and the client banner. | Default 7 days (Claude). |
| Webhook retries and backoff | Integrations | Retry count and backoff for outbound webhooks. | Default 5 retries, exponential backoff (Claude). |
| Keyboard shortcuts table | Keyboard shortcuts | One row per command: every rail tool in the section 3 table, Pan, Look up, Walk movement (W/A/S/D and arrows, 3D only), Undo, Redo, Copy, Paste, Mirror, Align, Save, Plan / 3D / Sheets / Render tabs. Click a key cell, press the new key. | Countertop = K (Round 23). Defaults below; all editable (Round 24). |
| Reset to default map | Keyboard shortcuts header | Fills empty rows with the default map: V Select, M Move, W Wall, R Room rectangle, D Door, N Window, C Cabinets, K Countertops, F Fixtures, E Electrical, G Ceiling, P Catalog, L Dimension, T Text, S Sketch, X Detail callout, Q Revision cloud, Shift+R Reference, Shift+M Markup, Shift+S Supplier markup, Shift+L Measure, Shift+C Check, ? Help, H Pan, U Look up, 1 to 4 tabs, Ctrl/Cmd+Z Undo, Ctrl/Cmd+Shift+Z Redo, Ctrl/Cmd+C / V Copy / Paste, Ctrl/Cmd+S Save. | (Claude). Never overwrites a key already set. Keys are checked for collisions within the same view (Walk keys only apply in 3D Walk mode). |
| Reset shortcut (row) | Keyboard shortcuts | Clears that binding. |  |
| Save | Footer | Saves all defaults. | Disabled with no edits. |

**Data shown:** tenant default values listed above; shortcut bindings.

**States:** loading, error, offline read-only, empty value (row shows "Not set" and features that need it show "Set in Defaults").

**Validation & warnings:**

- Length inputs accept 12'6", 12' 6 1/2", 150", 12.5' (plan Round 3).
- Percent inputs 0 to 100.
- Seating support limit must be greater than the Standard overhang.
- A key already bound to another command shows "Already used by \<command>" and is not saved until one is changed.
- Browser-reserved keys (Ctrl/Cmd+W, Ctrl/Cmd+T, Ctrl/Cmd+N) are refused.

**Events emitted:** tenant.defaults\_updated (new).

**Decisions:**

1. One tolerance setting covers field measurements and scan-vs-typed conflicts (Round 24).
2. The seating overhang support limit is entered by the owner; until set, the support check is off and S04b shows "Set in Defaults" (Round 24, Claude).
3. Countertop increment is a setting (Claude).
4. Changed defaults apply to new projects; existing projects keep their values unless changed on the project (Claude).
5. iPad input mode has a company default here and a per-user override in My profile (Claude).
6. Waste factors are entered by the owner per material and pattern; empty values show "Set in Defaults" in takeoff (Round 24, Claude). This page holds every threshold, tolerance and limit other screens name, and the default key map matches the section 3 rail table with no collisions in the same view (Claude).
