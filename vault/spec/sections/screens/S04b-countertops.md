### 04b · Countertops

**Purpose:** Create countertop pieces over the cabinets, set overhang per edge, place seams and cutouts, choose or offer the edge profile, and feed the countertop plan, edge detail and top schedule. These outputs are for internal and client use only and are not part of the permit drawings (Round 24).

**Entry points:**

- Countertops (K) tool on the rail.
- Countertop tile in the 03 inspector Client selections.
- Edge-profile choice made by the client (notification).
- Support notice links back from the detail.

**Permissions:**

- View projects: view pieces, overhangs, profiles.
- Edit model: Trace cabinets, Draw outline, Seam, Cutout, overhang and profile edits. Requires the edit lock.
- See sell prices: price differences in the offered list, shown as a total for this top.
- Send to client: "Edit offered edges" publishing to the client portal.
- Manage users and settings: "Change in company settings" for default overhangs and support limit.

**Layout:**

- Standard editor shell, Countertops (K) active. Status bar adds Exposed edge (lf) and Increment; no Existing/Proposed toggle in mockup.
- Left panel: tabs Pieces / Edges / Material; Pieces list; Material; Default overhangs; footer totals.
- Canvas: tool bar card (Trace cabinets, Draw outline, Seam, Cutout), hint text, edge-profile status pill; countertop plan over dashed cabinets; legend.
- Inspector: piece header; Overhang by side diagram; preset chips; support notice; seats; Edge profile; offered list; Edit offered edges; Top schedule.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Pieces | Left panel | Lists pieces | Default |
| Tab: Edges | Left panel | Lists edges by piece with overhang and exposed/wall/splash (not in mockup) |  |
| Tab: Material | Left panel | Material, thickness and backsplash settings (not in mockup) |  |
| Piece row (A Back wall, B Left return, C Island) | Left panel | Selects the piece; canvas and inspector sync | Shows label, name, size, "seating" tag |
| Material swatch row ("Quartz · 3 cm") | Left panel | Opens catalog picker (category counter) |  |
| Backsplash row ("4" · same") | Left panel | Edit height and material |  |
| Behind range row ("Full height") | Left panel | Edit behind-range splash |  |
| Default overhangs rows | Left panel | Display: Standard 1 1/2", Seating counter height 12", Seating bar 10", Against wall 0 + splash | From company settings |
| "Change in company settings" link | Left panel | Opens Settings at countertop defaults | Requires Manage users and settings |
| Footer totals | Left panel | Display: pieces, seams, total sq ft |  |
| Trace cabinets | Canvas tool bar | Creates tops automatically from cabinet runs with default overhangs | Disabled when no cabinets |
| Draw outline | Canvas tool bar | Click points to draw a custom top shape; typed lengths | Snaps as in 03 |
| Seam | Canvas tool bar | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C) |
| Cutout | Canvas tool bar | Place a sink or cooktop cutout; link to the fixture/appliance cutout size from catalog |  |
| Click edge | Canvas | Selects that edge; inspector highlights the side | Hint: "Click any edge, then pick its overhang" |
| Overhang chip on edge | Canvas | Click to type a value | Seating overhang shows as filled chip |
| Click piece | Canvas | Selects piece |  |
| Drag outline vertex (not in mockup) | Canvas | Reshape custom outline |  |
| Edge profile status pill ("Edge profile: client choosing") | Canvas header | Scrolls inspector to Edge profile | Shows Open, Chosen states |
| Overhang inputs Front / Left / Right / Back | Inspector diagram | Type value per side | Active side has blue border; label shows "seating" when seating overhang |
| Preset chip Flush 0 | Inspector | Sets selected edge to 0 |  |
| Preset chip Standard 1 1/2 | Inspector | Sets 1 1/2" |  |
| Preset chip Bar 10 | Inspector | Sets 10" |  |
| Preset chip Seating 12 | Inspector | Sets 12" |  |
| Preset chip Wall + splash | Inspector | Sets 0 with backsplash | Edge becomes wall edge, no profile |
| Support notice "Open detail" | Inspector | Opens the detail (e.g. D-3) in the detail editor | Shown when seating overhang exceeds limit |
| Seats row | Inspector | Display seat count and spacing |  |
| Edge profile card | Inspector | Pick profile from library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom | Applied to exposed edges only |
| Offered profile rows | Inspector | Display offered profiles with the price difference as a total for this top (price per lf × exposed edge length) | Price hidden without See sell prices |
| Edit offered edges | Inspector footer | Choose which profiles the client sees and enter the price difference per lf; the client sees the total | Requires Send to client; hidden otherwise |
| Top schedule | Inspector footer | Opens schedule: material, thickness, area, edge length. Internal and client only; not on permit sheets |  |
| Delete / Backspace | Global | Deletes selected piece, seam or cutout |  |
| Undo / redo, Esc | Global | As in 03 |  |

**Data shown:**

- Pieces: label, name, size, sq ft, material, thickness, overhangs per side, seams, cutouts, exposed edge length.
- Defaults from company settings; client profile choice and status.

**States:**

- No cabinets: Trace cabinets disabled with hint.
- Edge profile open (client choosing), chosen, or not offered.
- Support notice shown.
- Loading, error, offline, locked/view-only, permission-denied: as in 03.

**Validation & warnings:**

- Seating overhang past company limit: brackets added to a detail and notice shown.
- Seating typical 6"–12", regular 1"–2" (Round 23).

**Events emitted:**

- takeoff.updated (countertop lf and sf).
- edge\_profile.offered (new); edge\_profile.chosen (new) when the client chooses. Choosing is not approval: selection.approved fires only when the client signs.

**Decisions:**

- The seating-overhang support limit is a company setting under Defaults, entered by the owner (Round 24).
- The offered list shows only the profiles ticked in Edit offered edges. The full library (eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom) is available there. (Claude)
- The Edges tab lists every edge of each piece with its overhang, type (exposed, wall or splash) and length; clicking a row selects the edge. The Material tab holds material, thickness, backsplash height and material, and behind-range splash. (Claude)
- The rail in 04b is the full standard rail, with Sketch, Detail callout and Check included. (Claude)
