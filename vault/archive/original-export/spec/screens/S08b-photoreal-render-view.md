# 08b · Photoreal render view

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Review one finished render at full size, compare it with the before photo and the model, pin comments, mark areas to fix, and approve it for the client.

**Entry points:**

- Renders list row on Render setup (08).
- Filmstrip thumbnail on this screen.
- Notification "Photoreal render finished".
- "N to review" pill in the header (renders needing review).

**Permissions:**

- View render, metadata, comments: View projects.
- Add comment pin: View projects. No edit lock needed.
- Mark area to fix, Fix marked area, Regenerate: the render permission for the tier used (Run fast renders / Run standard renders / Run photoreal renders).
- Approve, Reject: Approve renders. Mark client-ready, Hide from client: Mark client-ready.
- Send image to client: Send to client.
- Download: Export.
- Cost value: See company costs.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell header only. Differences:

- No tool rail, no left panel, no status bar.
- Main area: large render card with overlays: view mode segment (top left), zoom and tools bar (top right), comment pins and popover, "AI rendering · For illustration; drawings govern" label, caption (render code, name, pixel size).
- Filmstrip under the render: thumbnails of renders in the project plus New render.
- Inspector (right): title, code, version and tier, status pill; metadata; Selections; Comments; client visibility note; Approve / Mark client-ready, Reject, Fix marked area, Regenerate, Send image with Copy link.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Render / Before / Split / Model segment | Render card, top left overlay | Render: the image. Before: the site photo. Split: draggable before/after slider. Model: the 3D model from the same camera. | Before and Split disabled if no site photo. |
| Split slider handle (in Split mode) | Render card | Drag to compare. | Same slider used in client deliverables. |
| Zoom out / Zoom in | Top right overlay | Zoom by step; percentage shown. |  |
| Zoom % | Top right overlay | Shows zoom level. Click resets to 100%. |  |
| Scroll / pinch / drag | Render card | Zoom and pan when zoomed in. |  |
| Add comment pin | Top right overlay | Next click on the image drops a numbered pin and opens a comment box. | Pins numbered in order. Internal pins are never shown to the client. |
| Comment pin | On image | Click opens popover: author, time, text. Client pins from the share link show in a second color with the client's name. |  |
| Mark area to fix | Top right overlay | Paint a mask on the image for a targeted fix. | Render permission. |
| Download | Top right overlay | Downloads the full-resolution image with the "For illustration; drawings govern" label burned in. | Export; hidden without it. |
| Full screen | Top right overlay | Shows the render full screen. Esc exits. |  |
| Filmstrip thumbnail | Under render | Opens that render. Label shows code and version (e.g. "K-01 · v3"). | Current render highlighted. |
| New render | Filmstrip, last tile | Opens Render setup (08) with a new setup. | Render permission. |
| Status pill ("Needs review") | Inspector header | Needs review, Approved, Client-ready, Rejected, Model changed, Outdated, Hidden. |  |
| Metadata rows | Inspector | Model version, option, style preset, instruction, generated (time, user), cost in dollars. | Read only. Cost hidden without See company costs. |
| Selections block | Inspector | Items not modeled in render: countertop edge with profile drawing and check, cabinets, quartz, hardware, grout. | Read only. Same list goes beside the render in client deliverables. |
| Comment list item | Inspector, Comments | Click highlights and scrolls to the pin. |  |
| Resolve / delete comment (not in mockup) | Inspector, comment item | Mark resolved or delete. | Author or Edit model. |
| Client visibility note | Inspector | "Hidden from client until client-ready". | Changes to "Visible to client" after Mark client-ready. |
| Approve (mockup "Approve for client") | Inspector, primary | Step 1: marks the render approved. The button then becomes Mark client-ready. | Approve renders. |
| Mark client-ready | Inspector, primary after Approve | Step 2: the render can appear on the share link and selections PDF. | Mark client-ready. Disabled while a "Model changed" choice is pending. |
| Reject (not in mockup) | Inspector | Marks the render rejected; stays hidden. | Approve renders. |
| Model changed choice (not in mockup) | Inspector banner, when the badge is set | Keep as-is / Mark outdated / Hide from client until re-rendered, for this render. | Mark client-ready. |
| Hide from client (not in mockup) | Inspector menu | Removes a client-ready render from the client page. | Mark client-ready. |
| Fix marked area | Inspector | Runs a targeted regenerate on the masked area with optional instruction. Creates a new version. Shows estimated $ cost. | Enabled only when a mask exists. |
| Regenerate | Inspector | Reruns with the same settings, or opens settings to tweak. New version. | Render permission. |
| Compare to previous (not in mockup) | Render card segment | Side-by-side with the previous version of the same render. | Round 12. |
| Send image (not in mockup) | Inspector | Emails the image to the client. | Send to client. Only for client-ready renders. |
| Copy link (not in mockup) | Inspector, next to Send image | Copies a link to the image. | Send to client. Only for client-ready renders. |
| Keyboard: Esc | Global | Exit full screen or cancel pin/mask mode. |  |

**Data shown:**

- Render image (render.output\_path), pixel size (2400 x 1600), render code and name (K-01, "Kitchen from family room"), version (3 of 3), tier.
- Render code: room letter plus a two-digit sequence per room (K-01, F-01, B-01), auto-assigned, editable, unique per project.
- Render record: model\_version\_id, option, style preset, instruction text, created by and at, cost in dollars.
- Before photo (source\_file) and model view from the same camera\_view.
- Selections from the approved/current selection\_set (edge profile, cabinets, quartz, hardware, grout).
- Comments: pin number, position, author, time, text, internal or client.
- Approval status (approved by, client-ready by) and client visibility.
- Filmstrip: other renders in the project grouped by code.

**States:**

- Loading: image placeholder with progress while full resolution loads.
- Render running: image area shows progress; actions disabled.
- Render failed: error with Retry.
- Needs review: hidden from client; Approve and Reject shown.
- Approved: hidden from client; Mark client-ready shown.
- Client-ready: visible to client; pill green.
- Rejected: hidden; Regenerate available.
- Model changed: an object or finish visible in this view changed; badge and banner with Keep as-is / Mark outdated / Hide from client.
- Locked / view-only: no effect; commenting, approving and rendering need no edit lock.
- Offline: cached image viewable; actions disabled.
- Permission-denied: controls the user lacks are hidden; cost hidden without See company costs.
- No site photo: Before and Split disabled.

**Validation & warnings:**

- Label "AI rendering · For illustration; drawings govern" always on the image and on downloads.
- Only approved, client-ready renders reach the share link.
- Comments flagged as geometry concerns (e.g. "Island reads too long. Plan is 75"") do not change the model; the drawing is the source of truth.
- Fix marked area requires a mask.

**Events emitted:**

- render.approved (new), render.rejected (new), render.client\_ready (new), render.hidden\_from\_client (new).
- render.comment\_created (new).
- render.requested (new) on Fix marked area or Regenerate.
- render.downloaded (new) on Download.
- render.sent (new) on Send image.

**Decisions:**

1. Cost shows in dollars from the render record's actual cost. The mockup credit values are placeholders. (Round 24)
2. A render record stores the Step 2 style preset and the instruction text. The inspector shows Style and Instruction rows; the separate "Light" row is dropped. (Claude)
3. Render code is the room letter plus a two-digit sequence per room. It is auto-assigned, editable and unique per project. (Claude)
4. Client pins from the share link show on the same render in a second color with the client's name. Internal pins are never shown to the client. (Claude)
5. Cost is shown only with See company costs, and hidden otherwise. (Round 24 + Claude)
6. Download needs Export, emits render.downloaded, and burns in the "For illustration; drawings govern" label. (Claude)
7. Send image (email) with Copy link beside it is on this screen, for client-ready renders only. (Round 24 + Claude)
8. Adding a comment pin needs only View projects and no edit lock. (Round 24 + Claude)
9. Approval is two steps: Approve, then Mark client-ready. (Round 24)
