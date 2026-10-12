### 11 · Architect DXF reference + markup

**Purpose:** Show an uploaded architect DXF at full fidelity as a read-only reference, convert chosen layers into model objects, mark it up on a separate layer, compare reference versions, and send markup back.

**Entry points:**

- Left rail Reference tool (Shift+R) (icon layers).
- Left rail Markup tool (icon ink\_highlighter).
- Upload of a DXF on import (screen 02) or from the Files tab.
- New reference version received ("New rev" badge; "N to review" pill).

**Permissions:**

- View: View projects.
- Upload reference, upload new version, Accept/Keep revision: Upload references.
- Convert layer: Edit model; conversion goes through Import review.
- Add clouds, arrows, dims, text: Add markup, plus edit lock. Comments: Add markup, no lock needed.
- Show/hide and recolor layers, opacity: View projects (view state only).
- Export markup: Export.

**Layout:** Standard editor shell, with these differences: rail shows Reference (Shift+R) active and adds Markup; rail omits Text; status bar adds File, Units, Layers, Aligned.

- Left panel: Layers / Markup / Files tabs; "This project" layers; DXF layer list; selected-layer action box with Convert, options, opacity.
- Canvas: reference drawing in gray with model and markup over it; tool bar (Pick, Cloud, Comment, Convert); "Show Arch rev C changes" chip; read-only notice.
- Inspector: Reference version; Current vs Compared selects; change summary; Changes list; Keep / Accept buttons; Send markup back; Export markup.
- Status bar.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Reference rail button (Shift+R) | Left rail | Opens reference mode. | Shortcut Shift+R. |
| Markup rail button | Left rail | Opens markup tools / Markup tab. |  |
| Tab: Layers | Left panel | Layer list. | Default. |
| Tab: Markup | Left panel | List of clouds, comments, pins (not in mockup). |  |
| Tab: Files | Left panel | Reference files and versions; upload (not in mockup). |  |
| Layer row: EZ model | Left panel, This project | Eye toggles model visibility. Count of objects (62). |  |
| Layer row: Markup | Left panel, This project | Eye toggles markup layer. Shows "2 clouds · 3 pins". |  |
| DXF layer row | Left panel | Click selects the layer and shows the action box. Shows name, count, or "Converted" badge. | Header shows "24 · 9 shown". |
| Layer eye icon | DXF layer row | Shows / hides the layer. | Hidden rows dimmed with visibility\_off icon. |
| Layer swatch | DXF layer row | Recolors the layer (color picker not in mockup). | Display only; original file unchanged. |
| Convert layer | Action box | Sends recognized objects on the layer (walls, openings, rooms, cabinets) to Import review. Original layer stays as reference. | Converted layers show "Converted". Text explains result ("Converts to furniture blocks."). |
| Layer options (...) | Action box | Opens layer menu: Isolate layer, Show all, Reset color, Snap on/off. |  |
| Reference opacity slider | Action box | Sets reference opacity (60%). |  |
| Convert all / Convert none (not in mockup) | Action box or Files tab | Converts all recognized layers or none. | Round 22. |
| Tool: Pick | Canvas tool bar | Selects reference entities and markup. | Reference entities are read-only. |
| Tool: Cloud | Canvas tool bar | Draws a revision cloud on the markup layer. |  |
| Tool: Comment | Canvas tool bar | Places a numbered pin with a comment bubble (author, number, text). |  |
| Tool: Convert | Canvas tool bar | Click or box-select reference entities to convert. | Goes through Import review. |
| Markup tools: Arrow, Text, Dimension (not in mockup in tool bar) | Canvas tool bar | Markup on the markup layer. | Round 22. Dimension rail tool snaps to reference. |
| Measure (not in mockup) | Canvas | Measure on the reference. | Round 22. |
| Snap to reference | Canvas | Snap, measure and dimension on reference geometry. |  |
| Place objects on top | Canvas, with model tools | Cabinets, devices, details placed over the reference. | Requires Edit model. |
| Cut section / callout from reference (not in mockup) | Canvas | Starts a section or callout from reference linework. | Round 22. |
| Paper-space layout selector (not in mockup) | Canvas or Files tab | Shows DXF layouts (sheets) as drawn. | Round 22. |
| Chip: Show Arch rev C changes | Canvas top | Toggles change highlights (tags such as "MOVED 2"", "+ W4 ADDED", "− LAV"). | Label uses the current revision letter. |
| Comment pin | Canvas | Click opens the comment bubble. |  |
| Current select | Inspector | Picks the current reference version (Arch rev C · Oct 11). |  |
| Compared to select | Inspector | Picks the version to compare (Arch rev B · Sep 22). |  |
| Change summary | Inspector | "14 changes · 2 touch your markups · 1 touches a cabinet"; tags 5 added / 3 removed / 6 changed. |  |
| Change row | Inspector, Changes list | Click zooms to the change on canvas (not stated in mockup). Tag shows affected item (e.g. "Cabinet run B21–B24", "Markup 1"). | Sorted "Affects you first". |
| Show N more (text and dims) | Inspector | Expands remaining changes. |  |
| Keep Arch rev B | Inspector | Keeps the previous version as current. | New version is stored; change list stays available to accept later. |
| Accept Arch rev C | Inspector | Makes the new version current. | Markups and model objects on changed areas stay flagged. |
| Send markup back toggle: PDF overlay / DXF layer | Inspector | Chooses export format. | DXF exports to layer Z-MARKUP-WP. PDF overlay: red markups with a revision legend. |
| Export markup | Inspector footer (primary) | Runs export job; produces file for download or send. | Requires Export. |
| Upload new version (not in mockup) | Files tab | Uploads revised DXF as a new version of the same reference. | DWG upload prompts for a DXF (Round 21). |
| Existing / Proposed toggle | Status bar | Standard. |  |
| Aligned readout | Status bar | Shows alignment ("grid A1 · 0" offset"). | Set by two-point align in the Files tab; new versions inherit it. |
| Zoom | Canvas | Scroll / pinch zoom; readout 100%. |  |

**Data shown:**

- reference\_drawing: file name, source (architect), received date/time, versions (Rev letter, date), layer state (name, visible, color, count, converted), convert status, units ("inches · 1 unit = 1""), alignment.
- markup: clouds, comment pins (author, number, text), arrows, dims, text.
- Change list between two versions with affected markups and model objects.
- Title block text from the DXF displays as drawn.

**States:**

- Empty: no reference uploaded; prompt to upload DXF (not in mockup).
- Loading: GPU rendering with layer loading for large files (Round 22); progress not specified.
- Error: DWG uploaded, prompt for DXF. Unreadable file: error message with Upload again.
- New version received: "New rev" badge; changes listed.
- Read-only reference: "Reference is read only. Convert a layer to edit it."
- View-only (edit lock elsewhere): markup and convert disabled; comments still allowed.
- Permission denied: controls the user lacks are hidden (no Export hides Export markup).
- Offline: edits saved on device and synced (Round 13); upload and export need network.

**Validation & warnings:**

- Nothing in the reference is simplified or deleted.
- DWG: prompt for DXF in v1.
- On a new version: highlight what changed and which markups and model objects sit on changed areas.

**Events emitted:**

- reference.uploaded (new)
- reference.version\_uploaded
- reference.version\_accepted (new)
- reference.layer\_converted (new)
- markup.exported (new)

**Decisions:**

1. Keep Arch rev B stores the new version but leaves Arch rev B current; the change list stays available to accept later. Accept Arch rev C makes it current. Neither changes model objects; affected markups and objects are flagged for review. Reference DXF diff is v1 (Round 24). (Claude)
2. Alignment: on first upload the user picks two points on the reference and the matching two points on the model (or a grid point plus rotation). Offset and rotation fields sit in the Files tab. New versions inherit the alignment. (Claude)
3. A layout selector at the top of the canvas lists Model and each paper-space layout. (Claude)
4. Markup tool bar: Pick, Cloud, Comment, Arrow, Text, Dimension, Convert. (Claude)
5. Permissions (Round 24): uploading references, new versions and Keep/Accept need Upload references; markup needs Add markup; Convert needs Edit model.
6. Clouds, arrows, text and dimensions need the edit lock; comments do not (Round 24 item 16).
7. Layer options menu: Isolate layer, Show all, Reset color, Snap on/off. (Claude)
8. The PDF overlay includes the reference drawing in light gray under the red markup. (Claude)
9. A change is an entity added or removed, geometry moved more than the tolerance (a setting under Defaults), or a text or dimension value changed. Architect versions are labeled "Arch rev" plus the architect's letter (reference\_drawing.rev\_label) so they never read like permit "Rev N". (Claude)
