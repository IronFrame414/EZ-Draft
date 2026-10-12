# 08 · Render setup

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Set up and run an AI render. The user picks the camera angle first, then directs the render (style and changes), picks a tier, and generates. Results are compared, approved and marked client-ready before reaching the client.

**Entry points:**

- Render tab in the header.
- Render A/B/C on the 3D inspector (07).
- New render tile in the Render view filmstrip (08b).
- Renders list row "v3 · in setup".
- iPad on site: fast render button (not in mockup).

**Permissions:**

- View setup, saved renders and compare: View projects.
- Generate with Fast tier: Run fast renders.
- Generate with Standard tier: Run standard renders.
- Generate with Photoreal tier: Run photoreal renders.
- Upload a site photo: any of the three render permissions.
- Approve a render: Approve renders. Mark it client-ready: Mark client-ready. Who holds each is set per role.
- Keep / mark outdated / hide on a "Model changed" render: Mark client-ready.
- No edit lock is needed to run, approve or review renders.
- Controls a user lacks permission for are hidden.

**Layout:** Standard editor shell, with these differences:

- Tool rail: standard rail plus the code Check button.
- Left panel: "Angle · Pick the camera first"; Saved views grid (thumbnails); "Or use": Model view (orbit), Current 3D camera (Use), Site photo drop zone, previously uploaded photos; footer "Render spend this month" in dollars against the company allowance.
- Canvas: step bar (1 Angle, 2 Style, 3 Generate); preview area with before/after split (orbitable when the source is Model view); labels ("Before · site photo", "After · style preview", "For illustration; drawings govern"); Renders list for this angle (status pills).
- Inspector (Step 2): Style presets, the four ways to direct the render, Quality tiers, Selections (not visible in render), approval note, Generate button with estimated dollar cost.
- Status bar adds Angle (with lens), Style, Tier, Model version and option, render spend.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Step bar: Angle / Style / Generate | Canvas top | Shows progress. Click a done step to go back to it. | Step 1 shows check and chosen angle name when done. Steps 2 and 3 locked until an angle is chosen. |
| Saved view tile | Left panel, Saved views | Picks that camera\_view as the angle. Check mark on chosen tile. | Required first step. |
| Model view (orbit) (not in mockup) | Left panel, Or use | Makes the preview area an orbitable model view (same controls as 07). Orbit, then press Use this angle. | Round 17/18. |
| Save angle (not in mockup) | Preview area, in Model view | Saves the current orbit angle as a named view. | Edit model. |
| Current 3D camera · Use | Left panel, Or use | Uses the camera from the 3D tab as the angle (shows mode, angle, room). | No save prompt; use Save angle to keep it. |
| Site photo drop zone / browse | Left panel, Or use | Upload JPG or HEIC. The photo fixes the angle. | Any render permission. Stores a source\_file (photo). No alignment step required. |
| Uploaded photo row (e.g. IMG\_2041.HEIC) | Left panel | Pick an existing site photo as source. Shows date and use ("used as Before"). |  |
| Align to model (not in mockup) | Preview area, when the source is a site photo | Optional camera match: user drags 4 photo corners to model corners so geometry and placement stay exact. | Optional. Photo + text instruction renders without it. |
| Split handle | Preview | Drag left/right to compare Before (site photo or existing) and After (style preview). | Before side hidden when source is a model view with no photo. |
| Style preset tiles: Daylight, Golden, Airy, Evening | Inspector, Step 2 | Sets a lighting/mood preset, sent as a starting instruction. | One selected. Lighting does not need to match reality (Round 6). |
| Direct: From model (not in mockup) | Inspector, Step 2 | Render whatever is placed in the model (current option and finishes). | Default method. |
| Direct: Tap surface (not in mockup) | Inspector, Step 2; tap in preview | Tap a surface in the preview, pick a catalog finish. |  |
| Direct: Type instruction (not in mockup) | Inspector, Step 2 | Free-text instruction (e.g. "warm afternoon light"). | Asking for more images in the text may produce more than one image. |
| Direct: Paint mask (not in mockup) | Inspector, Step 2; paint in preview | Paint the area to change; brush size and erase. |  |
| Quality: Fast | Inspector, Quality | "Quick check · \~30 s", estimated $ cost. | Run fast renders. Mockup label "Draft". |
| Quality: Standard | Inspector, Quality | "Client review · 2K · \~2 min", estimated $ cost. | Run standard renders. Selected in mockup. |
| Quality: Photoreal | Inspector, Quality | "Sheets R1.0 · 4K · \~6 min", estimated $ cost. | Run photoreal renders. Mockup label "Presentation". Runs on the local GPU render worker when online, cloud API otherwise. |
| Selections list | Inspector | Shows selections not visible in render: countertop edge (with client choice date), cabinet finish, hardware, grout (open). | Read only. Listed in the box beside the rendering for client deliverables. |
| Approval note | Inspector | "Approve, then Mark client-ready, before it appears on the client page." | Read only. |
| Generate · \[$ estimate\] | Inspector, primary | Queues the render job with angle, model version, option, style, direction inputs, tier. One image per run unless the instruction asks for more. | Disabled until an angle is chosen. Hidden without the tier's permission. No spending block. |
| Renders list row | Canvas, Renders | Opens the render in Render view (08b). Row shows thumbnail, name, tier, date, status pill (Needs review, Approved, Rejected, Client-ready, Model changed, Outdated, Hidden). |  |
| "v3 · in setup" row | Canvas, Renders | Current setup draft. |  |
| Compare to previous (not in mockup) | Canvas or 08b | Side-by-side with the previous render of the same angle. | Round 12. |
| Rerun with tweak (not in mockup here) | Canvas or 08b | Copies settings into a new setup with an edited instruction. | Mockup 08b has "Regenerate". |
| "Model changed" badge (not in mockup) | Renders list row and 08b | Shown when an object or finish visible in the render's camera view changes after approval; also adds a review pill item. Choose per render: Keep as-is / Mark outdated / Hide from client until re-rendered. | Mark client-ready. Not a save-time prompt. |
| Render spend | Left panel footer, status bar | Dollars spent against the company allowance. | Read only. Allowance auto-refills when used up and notifies the owner. |
| Check | Left tool rail | Runs code checks (see 06). | Run code check. |
| Existing / Proposed toggle | Status bar | Standard shell. | Render uses Proposed. |

**Data shown:**

- Saved camera views (camera\_view) with thumbnails; current 3D camera; site photos (source\_file, type photo) with date and usage.
- Preview: before (site photo) and after (style preview) split.
- Renders for this angle: version, style, tier, date, status.
- Style presets; tiers with time, resolution, estimated dollar cost (per-tier price from settings).
- Selections not modeled in render (selection\_set items: edge profile, cabinet finish, hardware, grout) with source (client chose, open).
- Status bar: angle name and lens (35mm), style, tier and resolution, model version and option, render spend.
- Each render record (render): project, model\_version\_id, tier, inputs (angle, photo, alignment if any, style preset, instruction, mask, finishes), output path, cost in dollars.

**States:**

- No angle chosen: steps 2 and 3 locked, Generate disabled, left panel prompt "Pick the camera first".
- No saved views and no photos: left panel shows "Save a view in 3D or add a site photo".
- Photo uploading: progress; optional Align to model.
- Render pending (queued / running): row shows progress and estimated time; editor stays usable.
- Render finished: notification (in-app and email for photoreal); row status "Needs review".
- Render failed: row shows error and Retry; not counted against the allowance.
- Approved / client-ready / model changed / outdated / hidden: status pill on row.
- Locked / view-only: renders run normally; no edit lock needed.
- Offline: setup viewable; Generate disabled.
- Permission-denied: tiers and actions the user lacks are hidden.
- Allowance used up: allowance auto-refills and the owner is notified; Generate stays enabled.

**Validation & warnings:**

- Angle required before Generate.
- A site-photo render keeps the photo's angle; to change angle, switch source to a model view.
- Exact items must hold: room geometry, product look, placement and size. Model-view renders use the 3D guide image for placement. Site-photo renders hold exact placement only when aligned to the model; unaligned photo + text renders are approximate.
- Every render labeled "For illustration; drawings govern".
- Two-step approval: Approve, then Mark client-ready. Only client-ready renders reach the share link.
- AI never edits the drawing.

**Events emitted:**

- render.requested (new), render.completed (new), render.failed (new).
- render.approved (new), render.client\_ready (new).
- render.model\_changed (new), render.outdated (new), render.hidden\_from\_client (new).
- render\_allowance.refilled (new), with owner notification.
- camera\_view.saved (new) when saving an angle.
- Notification "photoreal render finished".

**Decisions:**

1. Tiers are Fast, Standard and Photoreal, costed in dollars. There is no hard limit: a company allowance in settings auto-refills when used up and notifies the owner. Mockup credits and the Draft/Presentation labels are replaced. (Round 24)
2. The Standard tier needs Run standard renders. (Round 24)
3. The four ways to direct a render (from model, tap surface, type, paint mask) live in Step 2. (Round 24)
4. Style presets stay in Step 2 and are sent as a starting instruction. (Claude)
5. Camera matching is optional. A photo plus text instruction renders with no alignment step; "Align to model" is available for exact placement. (Round 24)
6. "Model view (orbit)" in the left panel turns the preview into an orbitable view, with Use this angle and Save angle. (Claude)
7. Approval is two steps: Approve, then Mark client-ready. A Reject action is added in 08b. (Round 24 + Claude)
8. Approving needs Approve renders, and client-ready needs Mark client-ready; both are set per role. (Round 24)
9. A "Model changed" badge appears only when an object or finish visible in the render's camera view changes. It shows as a badge plus a review pill, not a save-time prompt. Keep, outdated or hide is chosen per render. (Round 24)
10. Running renders does not need the edit lock. (Round 24)
11. Failed renders are not counted against the allowance. (Claude)
12. Uploading a site photo needs any of the three render permissions. (Claude)
