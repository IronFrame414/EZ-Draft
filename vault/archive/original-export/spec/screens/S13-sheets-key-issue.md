# 13 · Sheets, key + issue

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Review the auto-built plan set, edit sheet annotations, check the issue gates, choose output settings and submittal profile, and issue the permit set or a numbered revision.

**Entry points:**

- Header tab Sheets.
- Header Issue set button (opens this screen with the issue checklist).
- Checklist links from other screens; notifications.

**Permissions:**

- View: View projects.
- Edit sheets (viewports, clouds, keynotes, text, callouts, title block): Edit model, plus edit lock.
- Issue Rev 0 permit set: Issue permit sets.
- Issue Rev 1+: Issue revisions.
- Send set to client: Send to client.
- PDF export: Export.
- Title block company fields: Manage users and settings (tenant title block).
- Property appraiser import: Edit model. Check: Run code check.

**Layout:** Standard editor shell header; rail is replaced by Sheet tools; status bar has no Existing/Proposed toggle and shows Sheet, Size, Scale, Revision, zoom. Sheet rail adds Check.

- Left panel: set selector; sheet list grouped Architectural / Electrical / Renderings; Add sheet; legend.
- Canvas: tool bar (Sheet, Clouds); sheet label and position; prev/next + zoom; sheet preview; thumbnail strip at bottom.
- Inspector: Issue checklist; output settings; Revision log; Issue button.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Rail: Select (V) | Sheet rail | Select sheet objects. | Default. |
| Rail: Pan (H) | Sheet rail | Pan the sheet. |  |
| Rail: Viewport | Sheet rail | Add or edit a viewport; set scale per viewport. | Plans 1/4", elevations 1/2" default (plan doc); mockup sheet shows 3/4". |
| Rail: Revision cloud | Sheet rail | Manual cloud. | Clouds on changed objects are automatic. |
| Rail: Keynote | Sheet rail | Places keynote. |  |
| Rail: Text (T) | Sheet rail | Places text. |  |
| Rail: Callout | Sheet rail | Places a section / elevation / detail callout. |  |
| Rail: Title block | Sheet rail | Opens title block fields. | Fields per Round 4, plus code edition and scope of work. |
| Rail: Symbol key | Sheet rail | Places the auto key and sets placement for the set: On every sheet / On cover only. | Round 24 item 8. |
| Rail: Check (not in mockup) | Sheet rail | Runs the code check; results list opens in the inspector. | Round 24 item 35. Run code check permission. |
| Set selector | Left panel header | Switches between Permit set and Client set (sheet\_set records). Shows sheet count, size, revision. |  |
| Sheet row | Left panel | Opens sheet. Shows status dot, number, title, Δ tag, open items ("2 open"). | Dot: ready to issue / needs approval. |
| Add sheet | Left panel | Adds a sheet from a type picker (plan, elevation, details, schedule, renders, blank). |  |
| Tool: Sheet | Canvas tool bar | Sheet view. | Default. |
| Tool: Clouds (n) | Canvas tool bar | Highlights / lists clouds on this sheet. | Count shown. |
| Previous / Next sheet | Canvas top right | Moves through the set. | Zoom readout between (38%). |
| Sheet canvas | Canvas | Shows sheet at print layout with watermark "REV n DRAFT · NOT FOR CONSTRUCTION" while draft. | English only. |
| Thumbnail | Thumbnail strip | Opens sheet. | Active outlined; sheets with open items in amber. |
| Issue checklist row | Inspector | Shows gate or warning status with detail; link (Review / Open) to fix. | Green check, amber warning, red gate. |
| Sheet size toggle 24x36 / 11x17 | Inspector | Sets PDF sheet size. | Stamped permit sets export 24x36 (ARCH D); 11x17 is for client and field copies (Round 25). Paper sets print from the same PDF. |
| Title block readout | Inspector | "Company standard"; Edit link opens title block fields. |  |
| Output readout | Inspector | "PDF, 1 file per set". | Round 24 item 6. A Download one page at a time option is also offered (Round 25). |
| Submittal profile select (not in mockup) | Inspector | Picks department preset (every 15c field: file split, naming, revision naming, size, flatten, stamp box, resubmittal mode, minimum scale, who signs). | Rounds 4, 5. |
| Revision log row | Inspector | Rev (or Version), date, description or sheets, status (Issued/Draft). | Note line under draft rev. |
| Draft change order checkbox (not in mockup) | Inspector, above Issue | When ticked, screen 14 opens after issue so the CO can be sent with the revision. | Shown only with Create change orders. |
| Issue Rev n | Inspector footer (primary) | Runs the code check, generates the PDF, freezes the version, numbers the revision, updates revision blocks. Result shows the PDF link with Copy link. | Disabled while a gate is open. Hidden without Issue permit sets (Rev 0) or Issue revisions (Rev 1+). |
| Property appraiser import (not in mockup) | Title block tool or checklist row | Paste PAO link; app reads parcel number, owner, legal description, year built, living area for user to confirm. | Fallback: paste page text or screenshot. Year built sets pre-1978 lead flag. Edit model. |
| Code check accept-with-note (not in mockup) | Issue checklist | Lists open code warnings; each can be accepted with a note. | Round 5. |
| Send to client | Header Share | Sends the set to the client; numbered Version N before Rev 0, Rev N after. Email plus Copy link. | Send to client permission. Round 24 items 15, 26. |
| Keyboard V, H, T | Sheet rail | Tool shortcuts. | Editable under Defaults. |

**Data shown:**

- sheet: number, title, viewports, scale, status, Δ marks, open items.
- Sheet content: model views, symbol key ("SYMBOLS USED ON THIS SHEET"), general notes, keynotes, title block.
- Title block: logo, company, license CGC1541042, project, address, owner, PCN ("From property appraiser link"), revisions table (no, date, description), seal / signature box (3" x 3" clear), separate blank department approval stamp area, signature and date, drawn, checked, date, scale, sheet title, sheet number, revision, sheet x of y.
- permit\_revision: rev\_no, issued\_at, description, delta objects, status.
- Checklist results: property record, dimension status, load calc (NEC edition, service), renders pending, translations pending.

**States:**

- Draft: watermark; Draft badge.
- Ready to issue: all gates pass.
- Blocked: gate open; Issue disabled with reason.
- Issued: set locked as Rev 0; later changes gather into the next revision.
- Generating PDF: background job; Issue button shows progress until the PDF link appears.
- View-only (lock elsewhere): annotation tools disabled; viewing and printing preview allowed.
- Permission denied: controls the user lacks are hidden (no Issue permit sets / Issue revisions hides Issue).
- Offline: Issue disabled with a "Needs connection" note.
- Empty: default set listed with blank viewports and a note to draw or import first.

**Validation & warnings:**

- Issue gates (Round 12): code check reviewed (warnings fixed or noted), no red/orphan flags (e.g. "not on a wall"), title block complete.
- Issuing runs the code check automatically and lists open warnings.
- Non-blocking warnings: "All dimensions typed" (Round 24 item 10); renders awaiting approval; Spanish notes unreviewed (does not hold issue unless the company hold setting is on).
- PDF rules (Round 4, Round 24): one PDF file per set; supporting documents separate; not password-locked; markup and stamping allowed; file name from address + description (e.g. "336 Golfview Rd buildingplans"), with the version kept in the file name by default (a submittal profile can switch to same-name, Round 25); Download one page at a time also offered (Round 25); one bookmark per sheet; two blank areas on each sheet (seal box and department approval stamp); stamped permit sets 24x36 (ARCH D), 11x17 for client and field copies (Round 25).
- Every sheet gets a scale bar and a printed check dimension (not in mockup).
- Text and symbols print at fixed paper size at any scale.
- Permit sheets are English only.
- Electrical sheets note that the electrical contractor of record verifies the design; optional EC signature block kept.
- Numbering: pre-permit client sends are "Version N"; Rev 0 at permit issue; changes after that are gathered and numbered Rev 1, 2... when next sent to client or department; no cap. Changed objects clouded with delta tag automatically; revision block and log update on each sheet. A sent version is frozen.
- Key: only symbols and abbreviations actually used; updates when objects are added or removed; placement per set.
- Sheet numbering: decimal (A1.0 style), default set per Round 24.
- Countertop plan, edge detail and top schedule never appear in the Permit set.
- Title block: address, parcel number, owner, code edition, scope of work, revision block, seal box; logo, license, contact on/off.

**Events emitted:**

- plan\_set.issued: project id, rev no, PDF url, sheet list
- revision.created: rev no, changed objects, before/after images, quantity changes
- property\_record.imported (new)
- model.exported is not emitted here (PDF only)

**Decisions:**

1. Default set (Round 24): A0.0 Cover, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Elevations, A5.0 Details, A6.0 RCP, E1.0 Electrical, E2.0 Panel + load calc, R1.0 Finish schedule + renders. The mockup order is corrected to this.
2. Countertop plan, edge detail and top schedule are not in the permit set; they go in the Client set and internal documents only (Round 24 item 5).
3. "All dimensions typed" is a warning in the checklist, not a gate (Round 24 item 10). It dismisses with one click and clears when the set is issued (Round 25).
4. One PDF file per set (Round 24 item 6).
5. Two blank areas on every sheet: the seal box and a separate department approval stamp area (Round 24 item 7).
6. Code edition and scope of work print in the title block project box, under the address. (Claude)
7. Permit sheets are English only (Round 24 item 9). The language chip is removed from this screen.
8. Symbol key placement is chosen per set: "On every sheet" or "On cover only" (Round 24 item 8).
9. Property appraiser import needs Edit model. (Claude)
10. Two sets: Permit set and Client set (renders, finish schedule, countertop plan and top schedule, no stamp areas). (Claude)
11. A change order is user-initiated. The Issue step has a "Draft change order" option that opens screen 14 after the revision is issued; the CO can be sent together with the revision (Round 24 items 24, 25).
12. Issue (to department) and Send to client (Share) use the same send step. Before Rev 0 a client send is numbered "Version N"; Rev 0 and later sends are "Rev N" (Round 24 item 26). Every emailed send also shows Copy link.
