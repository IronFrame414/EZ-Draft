# Mockups

The 22 Studio boards, exported Oct 11, 2026 from the EZ Draft design canvas. These are the only mockups used. The 16 boards on the Polished, Refined and Layout C pages of the canvas are superseded and are not in this folder.

- `png/`: each board rendered at its design size (desktop boards 1600 × 1000 at 1.5× pixel density, phone boards 390 × 844 at 3×). QA compares against these.
- `source/`: the board HTML. Builders read these for exact colors, spacing, fonts and class names. They are design-canvas components, not standalone pages: each needs `support.js` beside it and loads Instrument Sans, DM Mono and Material Symbols Outlined from Google Fonts. Serve the folder over http to view one.

Sample data in a board (names, prices, code edition shown in a status bar) is illustration, not a decision. When a mockup and a spec decision disagree, the spec wins.

| Screen | Board | Image | Source | Size | Spec file |
| --- | --- | --- | --- | --- | --- |
| S01 | 01 · Projects | png/S01Projects.png | source/S01Projects.dc.html | 1600 × 1000 | spec/screens/S01-projects.md |
| S02 | 02 · Import review | png/S02Import.png | source/S02Import.dc.html | 1600 × 1000 | spec/screens/S02-import-review.md |
| S03 | 03 · Plan | png/S03Plan.png | source/S03Plan.dc.html | 1600 × 1000 | spec/screens/S03-plan-editor.md |
| S04 | 04 · Cabinet run + elevation | png/S04Cabinets.png | source/S04Cabinets.dc.html | 1600 × 1000 | spec/screens/S04-cabinet-run-elevation.md |
| S04b | 04b · Countertops: overhangs + edge | png/S04bCountertops.png | source/S04bCountertops.dc.html | 1600 × 1000 | spec/screens/S04b-countertops.md |
| S05 | 05 · Ceiling plan (RCP) | png/S05Ceiling.png | source/S05Ceiling.dc.html | 1600 × 1000 | spec/screens/S05-ceiling-plan-rcp.md |
| S06 | 06 · Electrical + edit lock | png/S06Electrical.png | source/S06Electrical.dc.html | 1600 × 1000 | spec/screens/S06-electrical-edit-lock.md |
| S07 | 07 · 3D | png/S07ThreeD.png | source/S07ThreeD.dc.html | 1600 × 1000 | spec/screens/S07-3d-view.md |
| S08 | 08 · Render setup | png/S08Render.png | source/S08Render.dc.html | 1600 × 1000 | spec/screens/S08-render-setup.md |
| S08b | 08b · Photoreal render view | png/S08bRenderView.png | source/S08bRenderView.dc.html | 1600 × 1000 | spec/screens/S08b-photoreal-render-view.md |
| S09 | 09 · Catalog + add product | png/S09Catalog.png | source/S09Catalog.dc.html | 1600 × 1000 | spec/screens/S09-catalog-add-product.md |
| S10 | 10 · Detail editor | png/S10Detail.png | source/S10Detail.dc.html | 1600 × 1000 | spec/screens/S10-detail-editor.md |
| S11 | 11 · Architect DXF + markup | png/S11Reference.png | source/S11Reference.dc.html | 1600 × 1000 | spec/screens/S11-architect-dxf-reference-markup.md |
| S12 | 12 · Supplier rendering markup | png/S12RenderMarkup.png | source/S12RenderMarkup.dc.html | 1600 × 1000 | spec/screens/S12-supplier-rendering-markup.md |
| S13 | 13 · Sheets, key + issue | png/S13Sheets.png | source/S13Sheets.dc.html | 1600 × 1000 | spec/screens/S13-sheets-key-issue.md |
| S14 | 14 · Change order hand-off | png/S14ChangeOrder.png | source/S14ChangeOrder.dc.html | 1600 × 1000 | spec/screens/S14-change-order-hand-off.md |
| S15 | 15 · Settings: users + permissions | png/S15Settings.png | source/S15Settings.dc.html | 1600 × 1000 | spec/screens/S15-settings-users-permissions.md |
| S16 | 16 · Settings: translation review | png/S16Translations.png | source/S16Translations.dc.html | 1600 × 1000 | spec/screens/S16-translation-review.md |
| S17 | 17 · Field pack (phone, EN user) | png/S17Field.png | source/S17Field.dc.html | 390 × 844 | spec/screens/S17-field-pack-phone.md |
| S17b | 17b · Field measure (phone) | png/S17bFieldMeasure.png | source/S17bFieldMeasure.dc.html | 390 × 844 | spec/screens/S17b-field-measure-phone.md |
| S18 | 18 · Client approval (phone) | png/S18Client.png | source/S18Client.dc.html | 390 × 844 | spec/screens/S18-client-approval-phone.md |
| S18b | 18b · Client edge choice (phone) | png/S18bClientEdge.png | source/S18bClientEdge.dc.html | 390 × 844 | spec/screens/S18b-client-edge-choice-phone.md |

**Screens with no mockup** (built from the spec's Layout and Controls text with the Studio shell components, rule 6):

- Takeoff (not in mockup) (spec/screens/X-takeoff.md)
- Revisions / version history (not in mockup) (spec/screens/X-revisions-version-history.md)
- Field measurements review (not in mockup) (spec/screens/X-field-measurements-review.md)
- Field tasks (not in mockup) (spec/screens/X-field-tasks.md)
- 15a · Settings: Company (spec/screens/S15a-settings-company.md)
- 15b · Settings: Title block (spec/screens/S15b-settings-title-block.md)
- 15c · Settings: Sheet presets (submittal profiles) (spec/screens/S15c-settings-sheet-presets-submittal-profiles.md)
- 15d · Settings: Defaults (spec/screens/S15d-settings-defaults.md)
- 15e · Settings: Catalog (spec/screens/S15e-settings-catalog.md)
- 15f · Settings: Render models (spec/screens/S15f-settings-render-models.md)
- 15g · Settings: Code edition (spec/screens/S15g-settings-code-edition.md)
- 15h · Settings: Libraries (spec/screens/S15h-settings-libraries.md)
- New project wizard (described inside S01) and the phone 3D viewer (described inside S07)
