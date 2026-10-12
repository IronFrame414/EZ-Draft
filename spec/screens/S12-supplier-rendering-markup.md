# 12 · Supplier rendering markup

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Tie a supplier's kitchen rendering, PDF drawings and 2020 order report to the plan's cabinet boxes: tag each cabinet in the rendering with its code, link it to a box, compare against the order report, and resolve mismatches. Also covers supplier PDF and 2020 order-report import.

**Entry points:**

- Left rail Supplier markup tool (icon photo\_library).
- Import of supplier files (Round 20) from the import flow (screen 02) or the Upload button here.
- Mismatch count in the "N to review" pill.

**Permissions:**

- View: View projects.
- Upload: Upload references. Tag, link, Read codes: Add markup, plus edit lock.
- Update plan to match: Edit model, plus edit lock.
- Keep plan, flag to supplier: Flag to supplier.
- Order line prices, if shown: See company costs.

**Layout:** Standard editor shell, with these differences: rail shows Supplier markup active and omits Fixtures; status bar has no Existing/Proposed toggle and shows View, Source, Tags, Phase (read-only), zoom.

- Left panel: Supplier files list with Upload; source note; tag filter; tag list; linked/flagged counts.
- Canvas split: tool bar and hint; rendering card (left); plan card with linked boxes (right).
- Inspector: tag header; linked box card; 2020 report vs plan comparison; mismatches list; info note; mismatch actions.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Supplier markup rail button | Left rail | Opens this screen. |  |
| Upload | Left panel header | Uploads supplier files: rendering images, PDF plans/elevations, DXF, order report. | DWG prompts for DXF. 3D DWG needs the converter (deferred). |
| File row | Left panel | Click opens the file: image in the rendering card; DXF elevations; order report summary. Shows name, type, summary (e.g. "15 tags", "22 lines read", "Elevations A–D · 4 layers"). | Active file highlighted. |
| Source note | Left panel | "\[Supplier\] · received \<date>. Codes read from the order report, positions from the rendering." | Static. |
| Tag filter chip: All / Flagged (n) | Left panel | Filters tag list. |  |
| Tag row | Left panel | Click selects the tag in rendering, plan box, and inspector. Shows code, location, link or error icon. | Flagged rows amber. |
| Linked / flagged counts | Left panel footer | "13 linked · 2 flagged". |  |
| Tool: Tag | Canvas tool bar | Click a cabinet in the rendering, type its code or size; tag created. | Hint: "Click a cabinet, type its code, then click its box in the plan". |
| Tool: Link | Canvas tool bar | Click a tag, then a box in the plan to link. |  |
| Tool: Read codes | Canvas tool bar | AI reads codes and positions; results shown as suggested tags to confirm. | AI never edits silently. |
| Tool: Compare | Canvas tool bar | Shows tag vs order report vs plan differences. |  |
| Tags on / Off | Rendering card header | Shows or hides tags on the image. |  |
| Fit | Rendering card header | Fits image to card. |  |
| Rendering canvas: click tag | Rendering card | Selects tag. |  |
| Rendering canvas: click untagged cabinet (Tag tool) | Rendering card | Opens code entry at that point. |  |
| Amber "Not in plan" tag | Rendering card | Marks a code with no plan box. | Selecting it shows a dashed ghost box in the plan. |
| View chips: Persp 1, Persp 2, Persp 3, Elev A, Elev B | Rendering card footer | Switch the view within the supplier file. |  |
| Opacity | Rendering card footer | Image opacity (100%). | Slider 0–100%, rendering image only. |
| Plan card box click | Plan card | Selects box; with Link tool, completes a link. | Linked boxes tinted; mismatch amber; ghost dashed. |
| Mismatch callout on plan | Plan card | Shows "2020: B21 / plan: B18 + F3". |  |
| Plan legend | Plan card footer | Linked to a tag; Mismatch or missing; Wall cabinet above; Appliance, not tagged. | Static. |
| Linked box card open (open\_in\_new) | Inspector | Opens the box in the plan editor / cabinet inspector. |  |
| Comparison table: Code, Width, Face, Finish, Order line | Inspector | 2020 report vs Plan with check per row. | Mismatch rows marked. |
| Mismatch row | Inspector, Mismatches list | Selects the mismatch. | Selected state highlighted. |
| Update plan to match | Inspector (primary) | Replaces plan box(es) with the supplier code and size. | Requires edit lock. Recompute run total vs wall length. |
| Keep plan, flag to supplier | Inspector | Keeps plan; sends a note to the supplier with the plan box and field measure. | Emailed to the supplier contact on the supplier file, with a Copy link button. |
| Suggested catalog matches (not in mockup) | Inspector or panel | AI suggests catalog items from the rendering (door style, color, counter, hardware) to confirm. | Round 20: rendering is a style and finish reference, not geometry. |
| Supplier PDF import (not in mockup) | Upload flow | Vector PDF parsed for walls, cabinet runs, dims; cabinet labels set size and type; plan and elevations cross-checked; result goes to Import review with confidence colors. | Scanned PDF: trace-assist only, lower confidence. |
| Order report import (not in mockup as a flow) | Upload flow | Reads codes, sizes, finishes and order line numbers; lines become the reference for tags. | Round 20: most reliable input. |

**Data shown:**

- Supplier files: name, type, received date, supplier name, summary counts, resolution (2400 x 2400), file views.
- Tags: code, location, linked box id, status (linked/flagged), file view.
- Order report lines: line no, code, width, face, finish.
- Plan boxes: run, box index, code, W x D x H, finish, face, fillers, scribe; model version.
- Field measure (e.g. 117 1/2") and scribe note.

**States:**

- Empty: no supplier files; prompt to upload (not in mockup).
- Loading: progress bar with lines read while reading the order report or codes.
- Error: DWG uploaded, prompt for DXF; proprietary 2020 file uploaded, prompt for DXF/DWG, 3D export and order report (Round 20).
- Mismatch present: amber tags and boxes.
- Not in plan: amber tag, dashed ghost.
- All linked: no flags.
- View-only (lock elsewhere): tagging and Update plan disabled.
- Offline: Read codes and Flag disabled with a "Needs connection" note.

**Validation & warnings:**

- Tag code must match a cabinet code in the library or a typed size (W x H x D).
- Rendering alone gives no reliable dimensions; sizes come from codes or order report.
- Plan vs report compare on code, width, face, finish.
- Run width vs wall length mismatch flagged (Round 21).
- Scribe note when a filler is used.

**Events emitted:**

- supplier\_file.imported (new)
- supplier\_tag.linked (new)
- supplier\_mismatch.flagged (new)
- takeoff.updated when Update plan to match changes boxes

**Decisions:**

1. Flag to supplier sends an email to the supplier contact stored on the supplier file (source\_file.supplier\_name and supplier\_contact\_email), with a Copy link button; the flag is logged on the tag. (Claude)
2. Order report accepted as PDF, CSV or plain text. Lines are read by text extraction plus AI and shown in Import review for the user to confirm. Waiting on: a sample 2020 order report from the supplier to confirm the parser.
3. Read codes: AI proposes tags from labels in the rendering matched to order report lines; they show as dashed suggested tags and each needs Confirm. (Claude)
4. A click is enough to place a tag; dragging an outline is optional. (Claude)
5. With no tag selected, the inspector shows "Suggested finishes": AI-matched catalog items (door style, color, counter, hardware), each with Confirm or Skip. (Claude)
6. Flagging needs the Flag to supplier permission (Round 24).
7. Opacity is a 0–100% slider for the rendering image only; no overlay on the 3D view. (Claude)
8. Waiting on: a sample 2020 export (DXF plan/elevations and order report) from the supplier.
9. Neither source wins automatically. A difference shows as a mismatch until the user picks Update plan to match or Keep plan, flag to supplier. (Claude)
