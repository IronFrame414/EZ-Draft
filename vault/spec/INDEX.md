# Spec index

The full spec is `spec.md`; do not load it whole. Read only the files `node vault/tools/next_ticket.mjs --reads <ticket> <role>` prints (S01–S22 = screen files below; boards in `vault/mockups/`).
Restructure (Q-0218, 2026-10-20): 03 and 09 moved word for word into area files of 20,000 characters or fewer, and the four "not in mockup" screens were renamed S19–S22; no text changed (check: `node --test scripts/spec/split.test.mjs`).
Section numbers in the spec text count from 1 = Product overview (`01-how-to-use-this-spec.md`), one less than the file numbers: "section 9" is `10-permissions-and-settings.md`, "section 10" is `11-non-functional-requirements.md` (prep C14).
Authority order: Josh's build answers in `decisions/<area>.md` (index: `decisions/INDEX.md`), then the spec's rounds (`decisions/13b-round-26.md` > Round 25 > Round 24 in `decisions/13a-rounds-24-25.md`) override everything else. Companions: `acceptance-criteria.md`, `glossary.md`, `non-goals.md`, `READINESS.md`, `SIGNOFF.md`.
Code rule catalog: `code-rules.json` (1,248 rules, source of truth for the code_rule seed) and `code-check-rules.md`.

- [Job stories (Round 1, Josh)](sections/00-job-stories.md) — how a job runs and what EZ Draft is for; Q-0177 to Q-0196
- [Glossary addendum, Phase 1](sections/00b-glossary-phase-01.md) — Phase 1 terms added to glossary.md; Q-0231
- [How to use this spec](sections/01-how-to-use-this-spec.md)
- [Product overview](sections/02-product-overview.md)
- [Data model](sections/03-data-model.md) — pointer; the text is in:
  - [03a · Intro, working copy and saves](sections/03a-working-copy-and-saves.md)
  - [03b · Architecture rules](sections/03b-architecture-rules.md)
  - [03c · Tables](sections/03c-tables.md)
  - [03d · Tables added in Rounds 24 and 25](sections/03d-tables-rounds-24-25.md)
  - [03e · Tables added in Round 26](sections/03e-tables-round-26.md)
  - [03f · Objects inside model_json](sections/03f-model-json-objects.md)
- [App shell and global UI](sections/04-app-shell-and-global-ui.md)
- [Screen-by-screen spec](sections/05-screen-by-screen-spec.md) — one file per screen:
  - [01 · Projects](sections/screens/S01-projects.md) — board S01Projects, S01bWizard
  - [02 · Import review](sections/screens/S02-import-review.md) — board S02Import
  - [03 · Plan editor](sections/screens/S03-plan-editor.md) — board S03Plan
  - [04 · Cabinet run + elevation](sections/screens/S04-cabinet-run-elevation.md) — board S04Cabinets
  - [04b · Countertops](sections/screens/S04b-countertops.md) — board S04bCountertops
  - [05 · Ceiling plan / RCP](sections/screens/S05-ceiling-plan-rcp.md) — board S05Ceiling
  - [06 · Electrical + edit lock](sections/screens/S06-electrical-edit-lock.md) — board S06Electrical
  - [07 · 3D view](sections/screens/S07-3d-view.md) — board S07ThreeD
  - [08 · Render setup](sections/screens/S08-render-setup.md) — board S08Render
  - [08b · Photoreal render view](sections/screens/S08b-photoreal-render-view.md) — board S08bRenderView
  - [09 · Catalog + add product](sections/screens/S09-catalog-add-product.md) — board S09Catalog
  - [10 · Detail editor](sections/screens/S10-detail-editor.md) — board S10Detail
  - [11 · Architect DXF reference + markup](sections/screens/S11-architect-dxf-reference-markup.md) — board S11Reference
  - [12 · Supplier rendering markup](sections/screens/S12-supplier-rendering-markup.md) — board S12RenderMarkup
  - [13 · Sheets, key + issue](sections/screens/S13-sheets-key-issue.md) — board S13Sheets
  - [14 · Change order hand-off](sections/screens/S14-change-order-hand-off.md) — board S14ChangeOrder
  - [19 · Takeoff](sections/screens/S19-takeoff.md) — board S19Takeoff (Q-0185; was X-takeoff-not-in-mockup.md)
  - [20 · Revisions / version history](sections/screens/S20-revisions-version-history.md) — board S20Versions (Q-0185; was X-revisions-version-history-not-in-mockup.md)
  - [21 · Field measurements review](sections/screens/S21-field-measurements-review.md) — board S21FieldMeasReview (Q-0185; was X-field-measurements-review-not-in-mockup.md)
  - [22 · Field tasks](sections/screens/S22-field-tasks.md) — board S22FieldTasks (Q-0185; was X-field-tasks-not-in-mockup.md)
  - [15 · Settings: Users + permissions](sections/screens/S15-settings-users-permissions.md) — board S15Settings
  - [15a · Settings: Company](sections/screens/S15a-settings-company.md) — board S15aCompany
  - [15b · Settings: Title block](sections/screens/S15b-settings-title-block.md) — board S15bTitleBlock
  - [15c · Settings: Sheet presets (submittal profiles)](sections/screens/S15c-settings-sheet-presets-submittal-profiles.md) — board S15cSubmittal
  - [15d · Settings: Defaults](sections/screens/S15d-settings-defaults.md) — board S15dDefaults
  - [15e · Settings: Catalog](sections/screens/S15e-settings-catalog.md) — board S15eCatalog
  - [15f · Settings: Render models](sections/screens/S15f-settings-render-models.md) — board S15fRender
  - [15g · Settings: Code edition](sections/screens/S15g-settings-code-edition.md) — board S15gCode
  - [15h · Settings: Libraries](sections/screens/S15h-settings-libraries.md) — board S15hLibraries
  - [16 · Translation review](sections/screens/S16-translation-review.md) — board S16Translations
  - [17 · Field pack (phone)](sections/screens/S17-field-pack-phone.md) — board S17Field, S17c3DPhone
  - [17b · Field measure (phone)](sections/screens/S17b-field-measure-phone.md) — board S17bFieldMeasure
  - [18 · Client approval (phone)](sections/screens/S18-client-approval-phone.md) — board S18Client
  - [18b · Client edge choice (phone)](sections/screens/S18b-client-edge-choice-phone.md) — board S18bClientEdge
- [Workflows](sections/06-workflows.md)
- [Hooks, events and integrations](sections/07-hooks-events-and-integrations.md)
- [Import and export](sections/08-import-and-export.md)
- [Calculations and rules](sections/09-calculations-and-rules.md) — pointer; the text is in:
  - [09a · Electrical load calculation](sections/09a-load-calc.md)
  - [09b · Electrical rules](sections/09b-electrical-rules.md)
  - [09c · Intro and code check engine](sections/09c-code-check-engine.md)
  - [09d · Building rules](sections/09d-building-rules.md)
  - [09e · Geometry and drafting](sections/09e-geometry-and-drafting.md)
  - [09f · Cabinets and countertops](sections/09f-cabinets-and-countertops.md)
  - [09g · Ceilings and lighting](sections/09g-ceilings-and-lighting.md)
  - [09h · Sheets and revisions](sections/09h-sheets-and-revisions.md)
  - [09i · Takeoff](sections/09i-takeoff.md)
- [Permissions and settings](sections/10-permissions-and-settings.md)
- [Non-functional requirements](sections/11-non-functional-requirements.md)
- [Build phases and acceptance tests](sections/12-build-phases-and-acceptance-tests.md)
- [Decisions and remaining items](sections/13-decisions-and-remaining-items.md)
