## App shell and global UI

Every editor screen uses one fixed shell: header card, tool rail, left panel, canvas, inspector and status bar. Most work happens on this one screen; Plan, 3D, Sheets and Render are tabs of it, not separate pages. The only separate pages are Projects, Settings, the phone field pack and the client link.

**Frame and visual system (Studio)**

- Desktop frame 1600 × 1000 reference. Header card 60 px, margin 16. Body padding 16, gap 16. Tool rail 56 px. Left panel 248 px. Inspector 336 px. Status bar 30 px.
- Colors: cobalt `oklch(0.55 0.17 262)` (primary, selection), cobalt text `oklch(0.45 0.17 262)`, cobalt tint `#eef1ff`, ink `#14171c`, slate 700/500/400/300 `#3b424d` `#5e6672` `#7a828e` `#9aa3af`, border `#dfe2e6`, divider `#eef0f3`, hover `#f2f4f7`, canvas `#f6f7f9` with 32 px grid `#e6e9ed`, surface `#fff`.
- Status colors: demo / error red `oklch(0.6 0.19 28)`; review amber `oklch(0.72 0.16 65)` on `oklch(0.96 0.04 80)`; approved green `oklch(0.42 0.12 150)` on `oklch(0.95 0.05 150)`.
- Type: Instrument Sans 400/500/600 for UI; DM Mono for every measurement, code and number; Material Symbols Outlined icons, shipped as an SVG sprite of the icons used (the mockups load the icon font; the app does not).
- Radii 5/7/8/10/12/999. Card shadow `0 1px 2px rgba(20,30,50,.05), 0 8px 24px rgba(20,30,50,.07)`; floating bars `0 6px 20px rgba(20,30,50,.08)`.

**Header card (left to right)**

| Control | Action |
| --- | --- |
| ezdraft wordmark | Goes to Projects |
| Project name + chevron | Opens project switcher (recent projects, search) |
| Subtitle | Client · version · save state ("Saved just now", "Saving…", "Offline, 3 changes queued") |
| Plan / 3D / Sheets / Render tabs | Switch the canvas view. Active tab has cobalt text and a 2 px inset bottom border. Selection carries across tabs. |
| "N to review" pill (amber) | Opens a review list: renders needing approval, unreviewed translations, field conflicts, field measurements, client comments, open code warnings, orphan flags. Hidden when N = 0. |
| Share | Opens share-link panel (create, copy, renew, expire, scope) |
| Export | Opens export menu (section 7) |
| Issue set (primary) | Opens the issue checklist on the Sheets tab. Hidden without *Issue permit sets* or *Issue revisions*. |

Also in the header (Round 24): **Stop editing**, shown only to the lock holder, saves and releases the lock. **Version label**: "Version N" for client sends before permit, "Rev N" after the first permit issue. Every Send dialog in the app has a **Copy link** button beside Send.

**Tool rail**

The rail sits on the left of every editor tab. The active tool is a cobalt button with a white icon; hovering shows a dark tooltip with name and shortcut.

| Tool | Default key | Opens / does | Shown on |
| --- | --- | --- | --- |
| Select | V | Click picks the smallest object; repeated clicks cycle outward (outlet → cabinet → wall). Box select, Shift-click add. | Every editor tab and mode rail |
| Move | M | Drag selection with live distances; type a distance | Plan, 3D (switches to Plan) |
| Wall | W | Single-wall (click, type length, turn) | Plan, 3D (switches to Plan) |
| Room rectangle | R | Click a corner, drag or type width and depth; makes four walls and a room | Plan, 3D (switches to Plan) |
| Door | D | Place on a wall: type offset from a corner or drag with live distances both sides | Plan, 3D (switches to Plan) |
| Window | N | Same placement as doors | Plan, 3D (switches to Plan) |
| Cabinets | C | Cabinet library in left panel; run elevation view (04) | Plan, 3D (switches to Plan) |
| Countertops | K | Trace cabinets, draw outline, seam, cutout (04b) | Plan, 3D (switches to Plan) |
| Fixtures | F | Plumbing fixtures, appliances, custom tile showers, grab-bar blocking | Plan, 3D (switches to Plan) |
| Electrical | E | Devices, circuits, load calc (06) | Plan, 3D (switches to Plan) |
| Ceiling | G | Switches canvas to RCP (05) | Plan, 3D (switches to Plan) |
| Catalog | P | Opens the catalog drawer over the canvas (09) | Plan, 3D, Render |
| Dimension | L | Linear and angular dimensions | Plan, 3D (switches to Plan) |
| Text | T | Text and keynotes | Plan, Sheets |
| Sketch | S | Freehand markup on a markup layer | Plan |
| Detail callout | X | Place a callout; opens the Detail editor (10) | Plan, Sheets |
| Revision cloud | Q | Draw a cloud and delta tag manually | Plan, Sheets |
| Reference | Shift+R | Reference DXF mode (11) | Plan |
| Markup | Shift+M | Markup tools on a reference (11) | Plan (reference mode) |
| Supplier markup | Shift+S | Supplier rendering markup (12) | Plan |
| Measure | Shift+L | Distance between two points; no model change | Every editor tab |
| Check | Shift+C | Runs the code check for the whole project (Run code check) | Every editor tab |
| Help | ? | Shortcuts and help | Every editor tab |

Other default keys: Pan H (Sheets), Look up U (3D), Plan / 3D / Sheets / Render tabs 1 to 4, Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Copy / Paste Ctrl/Cmd+C / V, Save Ctrl/Cmd+S. Mode rails (Ceiling, Detail, Reference, Supplier markup, Sheets) show their own tools plus Select, Check and Help.

Also on the rail of every editor tab, above Help: **Check** (run code check). It checks the whole project, not only electrical, and opens the warning list. Requires *Run code check*. Every tool's shortcut is set in company settings → Defaults.

Decided: every rail tool has a default key. The mockup letters V, M, W, D, C, K, E, L, T are kept; the other keys were chosen so no two commands in the same view share a key. All keys are editable in company settings → Defaults (Claude). Catalog sits on the standard rail (Plan, 3D, Render tabs) and opens as a drawer over the canvas (Claude).

**Left panel and inspector**

- The left panel changes with the active tool: layers and overlays (Select), library (Cabinets), pieces and materials (Countertops), circuits (Electrical), ceiling info and fixture schedule (Ceiling), layers (Reference).
- The inspector shows the selected object: title, sub-line (where it is), status pill (Existing / Demo / New), editable fields in DM Mono, and actions at the bottom. Multi-selection shows shared fields for bulk edit; mixed values show "Mixed".

**Status bar**

- View name, scale (e.g. 1/4" = 1'-0"), snap increment, cursor coordinates or tool hints, zoom %.
- Existing / Proposed segmented toggle: sets the default status for new objects. Each object can still be changed in the inspector.
- Screen-specific readouts, e.g. exposed countertop edge length in linear feet.

**Measurement entry**

- Every length field accepts `12'6"`, `12' 6 1/2"`, `150"`, `12.5'`; stores to 1/16".
- While drawing, typing a number opens an inline length box at the cursor; Enter commits, Tab moves to the angle.
- A laser in keyboard mode types into the focused field.
- Typed or laser values override scanned values; the app then lists every conflict created (section 8).

**Selection, undo and flags**

- Layer filter limits what can be selected. Saved groups (e.g. vanity + mirror + light) can be placed again.
- Undo / redo within the session (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z). Older changes come back through version history.
- Hosted items left off a wall (doors, windows, cabinets, devices) stay put and turn red: "Not on a wall". Open flags block issue.

**Edit lock (all editor tabs)**

1. The first person to open a project for editing holds the lock. Everyone else is view-only.
2. View-only users see an amber banner: "\[Name\] is editing since 9:42 AM · view only" with a **Request edit** button.
3. Request edit prompts the holder: Release or Keep. With no answer in 5 minutes, the holder's work is saved and the lock releases automatically.
4. When the lock is free, the banner turns green: "Available to edit", with a **Start editing** button.

   The free lock goes to anyone: the first person to press Start editing gets it (decided Oct 11).
5. The lock holds while the holder is offline. A Request edit still auto-releases after 5 minutes even if the holder is offline; when the holder reconnects, the app lists every conflict between their queued offline changes and later changes for them to resolve. There is no silent idle timeout.

**Notifications**

In-app bell and email (no SMS in v1), each email with a copyable link: client approval or comment, field conflict, field measurements received, photoreal render finished, edit request, offline sync conflicts, version cleanup due, render allowance refilled, new field pack issued (crew). Sent to the EZ Binder feed once integrated.
