# Reuse map · phases 22–32 (66 tickets)

Source: open-source reuse unit, 2026-10-28 (vault/handoff/OPEN_SOURCE_REUSE.md; summary report R-033 (vault/research/R-033.md)). Verdicts by the copy criteria in that report. `reference` = read the named file while planning, copy nothing; `none` = build as planned. Pinned SHAs: microsoft/maker.js 53bb7f64; pascalorg/editor fec1d14b; vagran/dxf-viewer d601f94f; HexNinja555/opentakeoff 2cac7a43; nfe-electrical-toolkit c2485a70; pnnl/ruleset-checking-tool 977e8c9c.

Result: 0 port, 8 reference, 58 none. Spec read: S13 (full), S10 (full), 08 Exports, 12 RCP row.

| Ticket | Phase | Title | Verdict | Repo and files | Coverage | Why |
|---|---|---|---|---|---|---|
| EZD-729 | 22 | Plumbing locations | none | — | — | title |
| EZD-730 | 22 | Plumbing diagram and calculations | none | — | — | title |
| EZD-731 | 23 | Mechanical layout | none | — | — | title |
| EZD-732 | 23 | Mechanical calculations | none | — | — | title |
| EZD-733 | 24 | Tile layout | none | — | — | title (tile grid: gap search found nothing) |
| EZD-701 | 25 | Sheet model and default set | none | — | — | S13 Decisions 1; no sheet candidate |
| EZD-702a | 25 | Sheets screen | none | — | — | S13 Layout (UI) |
| EZD-702b | 25 | Sheet renderer | none | — | — | S13 Layout, Controls "Sheet canvas"; no candidate |
| EZD-703 | 25 | Viewports and scales | none | — | — | S13 Controls, Rail: Viewport; no candidate |
| EZD-704 | 25 | Sheet annotation tools | none | — | — | S13 Controls rail tools; no candidate |
| EZD-705 | 25 | Print rules | none | — | — | S13 Validation, 08 Exports; maker.js toPDF has no print rules |
| EZD-706 | 25 | Symbol key | none | — | — | S13 Rail: Symbol key; no permissive symbol SVGs found |
| EZD-726 | 25 | Sheet sets | none | — | — | title |
| EZD-707 | 26 | Elevations sheet | none | — | — | title |
| EZD-708a | 26 | A6.0 RCP sheet | none | — | — | S13 Decisions 1; no candidate |
| EZD-708b | 26 | E1.0 electrical plan | reference | nfe-electrical-toolkit placement.py | little | 12 Acceptance RCP row; wall length minus door gaps; Python, metric |
| EZD-708c | 26 | E2.0 panel schedule and load calc | reference | RadloffBot/panelwright app.js (MIT, e08d7066) serviceLoad22082, autoBalance | little | structure only; every number comes from vault/spec/code-rules.json (rule 13) |
| EZD-709 | 26 | Title block settings | none | — | — | title |
| EZD-710 | 26 | Title block on sheets | none | — | — | title |
| EZD-711 | 26 | Property appraiser import | none | — | — | title |
| EZD-712 | 27 | Submittal profiles | none | — | — | title |
| EZD-713 | 27 | Department profile settings | none | — | — | title |
| EZD-714 | 27 | Notes library | none | — | — | title |
| EZD-715 | 27 | PDF export job | reference | maker.js core/pdf.ts toPDF | little | 08 Exports Permit set: vector PDF, bookmarks, unlocked; toPDF shows only inches→72 pt |
| EZD-716 | 27 | Issue checklist | reference | pnnl rule_base.py (result shape) | little | S13 Validation and checklist; spec 09c engine already defined |
| EZD-717 | 27 | Issue Rev 0 and Rev N | none | — | — | title |
| EZD-721 | 27 | Export menu | none | — | — | title |
| EZD-722 | 27 | Sheets states | none | — | — | title |
| EZD-728 | 27 | Cover sheet A0.0 | none | — | — | S13 Decisions 1; no candidate |
| EZD-718 | 28 | Revision clouds and log | none | — | — | gap search: no JS cloud or delta candidate (ezdxf.revcloud is Python) |
| EZD-719 | 28 | Send set to client | none | — | — | title |
| EZD-720 | 28 | Client set content | none | — | — | title |
| EZD-723 | 28 | Download one page at a time | none | — | — | title |
| EZD-724 | 28 | Dismissible dimension warning | none | — | — | S13 Validation; no candidate |
| EZD-725 | 28 | Accepted warnings in the issue log | none | — | — | S13 Controls; no candidate |
| EZD-727 | 28 | Submittal profile enforcement at issue | none | — | — | title |
| EZD-735 | 28 | Scope PDF | none | — | — | title |
| EZD-736 | 28 | Export and issue acknowledgement | none | — | — | title |
| EZD-738 | 28 | Plumbing, mechanical and tile sheets | none | — | — | title |
| EZD-801 | 29 | Detail data and editor shell | none | — | — | S10 Layout |
| EZD-802 | 29 | New detail dialog | none | — | — | S10 Decisions 10 |
| EZD-803 | 29 | Drawing tools | reference | pascal snap.ts, corner-snap.ts | little | S10 Tool: Line (snap, typed length and angle) |
| EZD-804 | 29 | Line roles and hatches | reference | vagran/dxf-viewer HatchCalculator.js, Pattern.js (MPL-2.0, dependency only) | some | S10 Hatch swatches Wood/Steel/Gypsum/CMU plus custom; needs Josh's yes on the dependency |
| EZD-805 | 29 | Annotation tools | reference | pascal floorplan-annotation-layout.ts | little | S10 Tools Dimension and Leader |
| EZD-806 | 29 | Parts | none | — | — | S10 Part row |
| EZD-807 | 29 | Scale and NTS | none | — | — | S10 Scale toggle; Decisions 2 |
| EZD-808 | 29 | Steps and layers | none | — | — | S10 Steps |
| EZD-817 | 29 | Detail libraries in Settings | none | — | — | title |
| EZD-809 | 30 | Legibility warnings | reference | opentakeoff geometry.js distToSeg | little | S10 Validation leader check; tolerance is a Defaults setting (S10 Decisions 8) |
| EZD-810 | 30 | Place on sheet | none | — | — | S10 Place on sheet |
| EZD-811 | 30 | Cut from model and callouts | none | — | — | title |
| EZD-812 | 30 | Underlay start | none | — | — | title |
| EZD-813 | 30 | Extrude to 3D | none | — | — | S10 Extrude to 3D; no candidate |
| EZD-814 | 30 | Detail library and countertop link | none | — | — | title |
| EZD-815 | 30 | Detail PDF export | reference | maker.js core/pdf.ts toPDF | little | 08 Exports Detail row |
| EZD-816 | 30 | Freehand pen | none | — | — | S10 Freehand pen; no shape-recognition candidate |
| EZD-1601 | 31 | Catalog drawer | none | — | — | title |
| EZD-1602 | 31 | Place from catalog | none | — | — | title |
| EZD-1603 | 31 | Add product: link | none | — | — | title |
| EZD-1604 | 31 | Add product: paste text and screenshot | none | — | — | title |
| EZD-1605 | 31 | Field confirmation | none | — | — | title |
| EZD-1606 | 31 | Save and place | none | — | — | title |
| EZD-1610 | 31 | Catalog states | none | — | — | title |
| EZD-1616 | 31 | Catalog on the standard rail | none | — | — | title |
| EZD-1607 | 32 | Item detail | none | — | — | title |
| EZD-1608 | 32 | Price snapshots and refresh | none | — | — | title |

Spec vs candidate conflicts:
1. EZD-715, EZD-815: maker.js toPDF gives none of the 08 Exports permit-set rules (bookmarks, unlocked, sheet sizes, stamp areas).
2. EZD-804: S10 hatch set is Wood/Steel/Gypsum/CMU plus library hatches; dxf-viewer patterns are DXF-based and MPL-2.0 (dependency only).
3. EZD-809: S10 Decisions 8 makes the leader tolerance a Defaults setting; distToSeg must take it as input.
4. EZD-708b: placement.py is metric; our dimensions are fractions to 1/16".
5. EZD-716: spec 09c already defines the check engine; json-rules-engine would duplicate it.
