## Permissions and settings

Permissions are per user from day one: Settings → Users → each user has a checklist. Role presets only pre-tick boxes; any box can be changed per person. Every control in section 4 names the permission that gates it. A control the user lacks is hidden (decided Oct 11).

**Permission checklist and preset defaults**

✓ = ticked by the preset, — = not ticked. Clients are not a preset; they act through the share link. Foreman and Crew defaults for Add markup, Edit field tasks, Check off tasks, Photo notes and Flag conflict were set by Claude (Round 24).

| Permission | Owner | Designer | Foreman | Crew |
| --- | --- | --- | --- | --- |
| View projects | ✓ | ✓ | ✓ (own jobs) | ✓ (own jobs) |
| Create projects | ✓ | ✓ | — | — |
| Edit model | ✓ | ✓ | — | — |
| Delete projects | ✓ | — | — | — |
| Run fast renders | ✓ | ✓ | ✓ | — |
| Run standard renders | ✓ | ✓ | — | — |
| Run photoreal renders | ✓ | ✓ | — | — |
| Approve renders | ✓ | ✓ | — | — |
| Mark client-ready | ✓ | ✓ | — | — |
| See company costs | ✓ | ✓ | ✓ | ✓ |
| See sell prices | ✓ | ✓ | — | — |
| Edit catalog | ✓ | ✓ | — | — |
| Issue permit sets | ✓ | — | — | — |
| Issue revisions | ✓ | — | — | — |
| Send to client | ✓ | ✓ | — | — |
| Create change orders | ✓ | ✓ | — | — |
| Approve field measurements | ✓ | ✓ | — | — |
| Export (PDF / DXF / GLB / CSV) | ✓ | ✓ | ✓ | — |
| Approve translations | ✓ | ✓ | ✓ | — |
| Run code check | ✓ | ✓ | — | — |
| Upload references | ✓ | ✓ | — | — |
| Add markup | ✓ | ✓ | ✓ | — |
| Flag to supplier | ✓ | ✓ | — | — |
| Edit field tasks | ✓ | ✓ | ✓ | — |
| Check off tasks | ✓ | ✓ | ✓ | ✓ |
| Photo notes | ✓ | ✓ | ✓ | ✓ |
| Flag conflict | ✓ | ✓ | ✓ | ✓ |
| Send field measurement | ✓ | ✓ | ✓ | — |
| Manage users and settings | ✓ | — | — | — |

Owners can add unlimited custom roles, each with its own default checklist. No user limit in v1.

**Company settings**

| Area | Settings |
| --- | --- |
| Company | Name, logo, license number, contact, address |
| Users + permissions | Invite, role preset, permission checklist, language (English / Español), project scope, deactivate |
| Title block | Fields, logo/license/contact on/off, seal box, revision block layout |
| Sheet presets / submittal profiles | Per department: file naming, permit sheet size 24×36 (11×17 only for client and field sets), required notes, who signs (none, EC, architect), file split, naming template, flatten, stamp box size and position, resubmittal mode, minimum scale |
| Defaults | Everything on 15d: units display, precision, increments, the one measurement tolerance, high-confidence cutoff, fit, reference and leader tolerances, overhang presets and support limit, ACT border, fan clearance, light-level targets, load and voltage-drop thresholds, bath clearances, walk eye height, detail scales, waste factors, recently-added window, version cleanup, lock release, share-link expiry and reminder, webhook retries, keyboard shortcuts |
| Code | Default code edition (2023 NEC / FBC 9th ed.) |
| Catalog | Categories, allowance categories, markup per category, edge profile library (price per LF is entered per top in 04b) |
| Libraries | Symbols and abbreviations, notes (general and code notes per project type), details, hatches, reusable parts, saved groups |
| Render | Model per tier (Fast, Standard, Photoreal), cost per render in dollars, render allowance with auto-refill, local GPU worker (preferred) on/off |
| Translations | Reviewer, "Hold issue until translations are approved" (off by default) |
| Field | Trade-sequence template per room (demo → rough-in → inspection → drywall → finish) |
| Input | iPad drawing: Pencil only or finger |
| Notifications | In-app and email for everyone, each email with a Copy link; no per-user notification settings in v1 |
| Billing | Hidden for tenant 1 in v1 (v2) |
