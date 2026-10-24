# 01 · Projects

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** List every project the user can see, filter and search them, and start a new project from an EZ Binder job, from scratch, or from a file. This is a separate page, not part of the editor shell.

**Entry points:**

- App home after sign-in.
- "Back to projects" from the editor project switcher (header project name menu).
- From EZ Binder: the "EZ Contractor Binder" back link is the return path; EZ Binder can also open this page through shared sign-on.
- Notification links that target a project open that project in the editor, not this page.

**Permissions:**

- View projects: required to see the page and any card. Users scoped to specific projects (Foreman and Crew presets, and clients) see only their projects.
- Create projects: required to see the New project button and all three menu items.
- Delete projects: required for Archive/Delete on a card (not in mockup).
- Manage users and settings: required to see the Company settings button.
- See company costs and See sell prices: no money data on this page.

**Layout:**

- Header card (not the editor shell): wordmark, page title "Projects", "EZ Contractor Binder" back link, search field, notifications button, company settings button, user avatar.
- Title row: H1 "Projects", status filter tabs, sort button, New project split button with menu.
- Project grid: 4 columns of project cards.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Wordmark "ez draft" | Header, left | No action on this page | Static |
| "EZ Contractor Binder" back link | Header, after title | Opens EZ Binder in the same tab, signed in (shared sign-on) | Shown only when the tenant has EZ Binder connected. Opens EZ Binder home |
| Search field | Header, center-right | Filters the grid as you type by client, address or project name | Placeholder "Search client, address or project". Case-insensitive. Combines with the active status tab. Clear by deleting text or Esc |
| Keyboard "/" | Global on page | Focuses the search field | Ignored when focus is already in a text input. Hint chip "/" shown in the field |
| Notifications button | Header | Opens notification list (every kind listed under Notifications in section 3) | Amber dot when unread items exist. aria-label states the count ("Notifications, 3 new"). Clicking an item opens the related project and screen and marks it read |
| Company settings button (gear) | Header | Opens Settings screen | Hidden without Manage users and settings |
| User avatar (initials) | Header, right | Opens account menu: language (English/Spanish, per user), sign out (not in mockup) | Language is a per-user setting (Round 18) |
| Status tab "All" | Title row | Shows all projects. Every status tab shows its count | Default on load. Active tab highlighted |
| Status tab "Draft" | Title row | Filters to status Draft |  |
| Status tab "Client review" | Title row | Filters to status Client review |  |
| Status tab "Permit submitted" | Title row | Filters to status Permit submitted |  |
| Status tab "Approved" | Title row | Filters to status Approved |  |
| Status tab "In build" | Title row | Filters to status In build |  |
| Sort button ("Last edited") | Title row, right | Opens sort menu: Last edited (default), Name, Client, Status, Open items (not in mockup, options beyond Last edited) | Button label shows current sort |
| New project button | Title row, right | Opens the New project menu | Hidden without Create projects |
| Menu item "From an EZ Binder job" | New project menu | Opens New project wizard with an EZ Binder job picker first; client, address and job number prefill | Requires EZ Binder link. Sets project.ezbinder\_job\_id |
| Menu item "Standalone" | New project menu | Opens New project wizard with empty fields |  |
| Menu item "Start from a file" | New project menu | Opens New project wizard with input source preset to "From a file" and the file drop step. Step 1 includes the optional EZ Binder job picker | Accepts Polycam DXF + GLB, PDF, DXF. DWG prompts for DXF (see wizard) |
| Esc / click outside | New project menu open | Closes the menu |  |
| Project card | Grid | Opens the project in the Plan editor (03) | Whole card is one link. Opens view-only with lock banner if another user holds the edit lock |
| Card thumbnail | Card top | Part of card link | Thumbnail of current plan |
| Card status pill | Card, top right | None (display) | Colors per status: Draft grey, Client review blue, Permit submitted amber, Approved green, In build black |
| Card open-items indicator | Card, bottom right | None (display) | "N to review" amber dot, or "Nothing to review" grey |
| Card overflow menu: Rename, Set status, Archive, Delete (not in mockup) | Card, on hover | Rename inline; Set status picks one of the five statuses; Archive hides from default list; Delete asks to confirm by typing the project name | Delete requires Delete projects and is offered only before any version has been sent. After a send, only Archive (sent versions are permanent). Items the user lacks permission for are hidden |
| Drag a file onto the page (not in mockup) | Anywhere on grid | Starts "Start from a file" with that file | Requires Create projects |

**New project wizard (modal or full page; not in mockup):**

Fields from the plan doc screen list: address, client, type, input source, units.

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| EZ Binder job picker | Step 1, EZ Binder path only | Search and pick a job; prefills client, address, job number | Only jobs the user can see in EZ Binder |
| Project name | Step 1 | Text | Required. Default "\<Type> remodel" (e.g. "Kitchen remodel"), editable |
| Address | Step 1 | Text | Required. Used for PDF file naming (Round 4) |
| Property appraiser link | Step 1 | Paste link; app reads parcel number, owner, legal description, year built, living area; user confirms each field | Optional. On read failure, offer "Paste page text" or "Paste screenshot" for AI extraction. Year built before 1978 sets the lead flag |
| Client | Step 1 | Name, email, phone | Picked from the customer list (syncs both ways with EZ Binder) or added new. Optional at creation; required before the first send. Email required. Every emailed link also has a Copy link button |
| Project type | Step 1 | Select: Kitchen, Bath, Whole-home interior | v1 types only |
| Input source | Step 2 | Choice: Polycam scan, PDF, DXF, Field measure (phone), Blank (template) | Preset to file choices when entered via "Start from a file". Field measure creates the project and sends the Foreman a link to 17b; the project opens on 02 Import review when the rooms arrive (Claude) |
| Template picker | Step 2, Blank only | Galley kitchen, L-kitchen, 5x8 bath, primary bath; editable dimensions | Dimension fields accept 12'6", 12' 6 1/2", 150", 12.5' |
| Units | Step 2 | Display only: Imperial | v1 is imperial only, fractions to 1/16" |
| Code edition | Step 2 | Select, defaults from tenant | Per-project setting |
| Submittal profile | Step 2 (not in plan screen list) | Select department profile | Optional; can set later |
| Back / Next / Create | Wizard footer | Navigate; Create makes the project and opens 02 (file) or 03 (blank) | Create disabled until required fields valid |
| Cancel | Wizard footer | Closes without creating | Confirm if fields were edited |

**Start from a file flow (not in mockup as its own screen):**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| File drop zone / Browse | Wizard step 2 | Upload one or more files | Polycam: DXF floor plan plus GLB/GLTF mesh. PDF: vector or scanned. DXF: supplier or architect drawing |
| DWG upload | Drop zone | Rejected with prompt: "Save this drawing as DXF and upload the DXF" | v1 accepts DXF only (Round 21) |
| File type tag per file | File list | Auto-detected: polycam\_dxf, polycam\_glb, pdf, supplier\_pdf, dxf, order\_report, photo, image (supplier rendering) | User can correct the tag |
| PDF: scale calibration | After upload, PDF only | Click two points on the page, type the real distance | Required before tracing. Stored in source\_file.scale\_calibration |
| PDF: detect type | After upload | Vector PDF: auto-detect walls (and cabinet labels for supplier kitchen PDFs). Scanned PDF: trace-only, lower confidence |  |
| DXF: conversion choice | After upload, DXF only | Convert all, convert some layers (layer checklist), or keep as reference only | Original kept at full fidelity as reference\_drawing (Round 22) |
| Supplier rendering images | After upload | Kept as style and finish reference; AI suggests catalog matches for confirmation | Never used as geometry |
| Continue to review | Footer | Queues the import job; opens 02 Import review when detection finishes | Progress shown; editor never blocked |
| Remove file | File list row | Removes the file before import |  |

**Data shown:**

- Per card: thumbnail (current plan), project name, status, client name, address, version label ("Working copy" when nothing has been sent; "Version N" = last version sent before permit; "Rev N" after permit issue), open items count. Source: project, model\_version, permit\_revision, open-item count (review queue).
- Status tab counts: count of projects per status, shown on every tab.
- Notification count: unread notifications for this user.

**States:**

- Empty (no projects): message plus New project button (if Create projects).
- Empty filter/search result: "No projects match" with clear-filter link.
- Loading: card skeletons (placeholder count 6).
- Error: inline banner "Projects could not load" with Retry.
- Offline: show cached projects that were opened on this device; New project disabled; banner "Offline".
- Permission-denied: user without View projects sees "You do not have access to projects"; New project hidden without Create projects.
- Import in progress: card shows "Importing" in place of the open-items indicator (not in mockup).
- Locked by another editor: card can show the editor's initials (not in mockup).

**Validation & warnings:**

- Wizard: name, address and type required; client optional at creation and required before the first send to a client; client email required.
- Length inputs accept the four formats; invalid input shows "Use 12'6", 12' 6 1/2", 150" or 12.5'".
- DWG upload: message to supply DXF.
- Property appraiser read failure: "Could not read this page. Paste the page text or a screenshot."
- Delete: type project name to confirm.

**Events emitted:**

- project.created (new): project id, source (ezbinder, standalone, file), ezbinder\_job\_id.
- import.started (new): project id, source\_file ids.
- project.deleted (new).

**Decisions:**

- Product name is EZ Draft, at ezdraft.ezcontractorbinder.com (Round 24).
- Status list is Draft, Client review, Permit submitted, Approved, In build. Draft on create; Client review on the first send to a client; Permit submitted when a permit set issues; Approved and In build set by the user from the card menu, which can also change any status manually. (Claude)
- Every status tab shows its count. (Claude)
- Sort options: Last edited (default), Name, Client, Status, Open items. (Claude)
- Default project name is "\<Type> remodel" (e.g. "Kitchen remodel"), editable. (Claude)
- Delete is offered only before any version has been sent; after a send the project can only be archived, because sent versions are permanent (Round 24). (Claude)
- No fourth menu item. Blank (template) is an input source in wizard step 2 for both "From an EZ Binder job" and "Standalone"; "Start from a file" presets the file source. (Claude)
- "Start from a file" step 1 includes the optional EZ Binder job picker. (Claude)
- The "EZ Contractor Binder" link opens EZ Binder home and shows only when EZ Binder is connected. (Claude)
- Client is optional at creation and required before the first send. Every client needs an email (Round 24). Clients come from the customer list, which syncs both ways with EZ Binder (Round 24).
