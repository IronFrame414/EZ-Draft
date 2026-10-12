### 09 · Catalog + add product

**Purpose:** Browse the tenant's product catalog, place products on the plan, and add new products by link, pasted text or screenshot, with AI-filled fields the user confirms. Holds per-project price snapshots and the price refresh check.

**Entry points:**

- Left rail Catalog tool (P). The Catalog button (icon inventory\_2) sits on the standard rail (Plan, 3D, Render tabs) between Ceiling and Dimension and opens this drawer over the canvas (Claude).
- Plan doc: catalog drawer in the right panel; catalog opens on the main screen (Layout C decision).
- Add product card opens from the catalog drawer's "Add product" button.
- Round 20: supplier rendering AI suggestions open matching catalog items (see screen 12).

**Permissions:**

- View catalog drawer: View projects.
- Cost: See company costs. Sell price, markup and allowance amounts: See sell prices. Without the matching permission, those price fields and the "$\[ \]" values are hidden.
- Add product, edit fields, Save to company library, Refresh prices: Edit catalog.
- Drag a product onto the plan, Add and place: Edit model, plus holding the project edit lock.

**Layout:** Standard editor shell, with these differences: rail shows Catalog (P) active; status bar adds Catalog count and In project count.

- Catalog drawer (card over the left side of the canvas): header, category nav column, search + filter bar, product grid, footer line.
- Canvas: plan, dimmed behind the drawer.
- Add product card: floats over the right side of the canvas (replaces the inspector while open).
- Status bar: View Existing/Proposed toggle, Catalog count, In project count, Scale, zoom.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Catalog rail button (P) | Left rail | Opens/closes the catalog drawer. | Shortcut P. Pressed state while drawer open. |
| Add product | Drawer header | Opens the Add product card with Link mode selected. | Requires Edit catalog; hidden without it. |
| Close catalog (x) | Drawer header | Closes the drawer; canvas returns to normal brightness. | Esc also closes (not in mockup). |
| Category row (Cabinets, Plumbing fixtures, Lighting, Appliances, Tile, Hardware) | Drawer, category nav | Filters grid to that category; row shows item count. | One active at a time. Also Countertops, Paint, Windows and doors (not in mockup). |
| Collection row: In this project | Category nav | Shows items placed in or snapshotted to this project. | Count = items in project. |
| Collection row: Recently added | Category nav | Shows items added most recently. | Last 30 days; the window is a setting under Defaults (Decision 11). |
| Collection row: Standard spec | Category nav | Shows items flagged as company standard spec. | Flagged with a star toggle on the item detail (Edit catalog; Decision 11). |
| Search input | Grid header | Filters grid by text; result count shown at right ("8 results"). | Searches within the active category. |
| Filter chip: All | Grid header | Clears sub-filters. | Default on. |
| Filter chips: Sinks, Faucets, Disposals | Grid header | Filter by sub-category. | Chips change with the active category. |
| Filter chip: Lead time under 2 wk | Grid header | Shows items whose lead time is under 2 weeks. | Uses the lead time field. |
| Product card | Grid | Click: opens item detail/edit (not in mockup). Shows thumbnail, name, brand + finish, size, price or "In plan" tag. | Price shown only with See sell prices. "In plan" tag when item is placed in this project. |
| Product card drag | Grid to canvas | Drag onto plan places the item. Size snaps to the nearest cabinet or wall. | Requires Edit model and edit lock. New object takes the phase from the status-bar toggle. |
| Pending product card | Grid | Shows spinner, "Reading \[supplier\] page", and the product being read. | Appears while an AI read runs; replaced by the new card when saved. |
| Grid footer | Drawer bottom | Shows "\<category> · N of M shown" and "Prices internal · contractor only". | Static text. |
| Add product close (x) | Add product card header | Closes the card; discards unsaved fields. | Confirm before discard if fields were edited (not in mockup). |
| Mode toggle: Link | Add product card | Shows Product page URL field. | Default mode. |
| Mode toggle: Paste text | Add product card | Shows a text area for pasted page text (not in mockup); AI reads fields from it. | Fallback when the page cannot be read. |
| Mode toggle: Screenshot | Add product card | Shows upload / paste-image target (not in mockup); AI reads name, size, price from the image. | Plan doc: uploaded image or pasted image. |
| Product page URL field | Add product card | Paste URL; server fetches page; AI extracts fields. Status line shows "Reading page... done", fields filled count, elapsed time. | On block or failure, show error and the fallback chips (Round 7). |
| Image found on page | Add product card | Shows the found image; used as catalog thumbnail. | Note: "3D uses a generic \[type\] at these dimensions." |
| Field row: Name, Brand, Model, W x D x H, Finish, Price, Lead time, Category | Add product card | Each value is editable inline (not shown as inputs in mockup). | Every field must be confirmed by the user before save (plan doc). Confidence dot per field. |
| Confidence dot | End of each field row | Hover shows reason (e.g. "Check: depth read as spout reach", "Low confidence: from banner, not spec table"). | Green = read from spec table, amber = check, red = guess. Legend below the fields. |
| Field rows: SKU, Cost, Sell price, Markup, Supplier, Rough-in, Cutout size, Spec sheet PDF, Allowance category, Texture/photo for rendering, Source URL (not in mockup) | Add product card | Editable fields required by the plan doc (Round 7, data model). | Cost visible only with See company costs; sell and markup only with See sell prices. Spec sheet PDF is a file upload. |
| Field rows for appliances: electrical rating (volts, amps), gas, water, drain utility points (not in mockup) | Add product card, Appliances category | Feed load calc and utility scope. | Round 15: load calc reads ratings from catalog specs first, then standard defaults. |
| Chip: Paste text | "Page didn't read right?" row | Switches to Paste text mode, keeps the URL as source. | Fallback (Round 7). |
| Chip: Upload screenshot | "Page didn't read right?" row | Opens file picker for a screenshot; AI reads it. | Fallback (Round 7). |
| Checkbox: Save to company library | Add product card footer | When on, item saves to the tenant catalog. Default on. | When off, item is saved to this project only. |
| Add to catalog | Add product card footer | Saves the item; card closes; item appears in grid. | Disabled until all fields are confirmed. |
| Add and place | Add product card footer (primary) | Saves the item and starts placement on the plan at the cursor. | Requires Edit model and edit lock in addition to Edit catalog. |
| Refresh prices (not in mockup) | Item detail and "In this project" collection | Re-checks the product source; shows a change list (price change, discontinued) before anything updates. User accepts or rejects each change. | Round 15. Updates the project snapshot only after acceptance. |
| Price snapshot indicator (not in mockup) | Product card / item detail in project context | Shows the snapshotted project price and snapshot date. | Round 15: prices are snapshotted per project. |
| Existing / Proposed toggle | Status bar | Sets default status for newly placed objects. | Standard. |
| Zoom readout | Status bar right | Shows zoom (100%). | Standard. |

**Data shown:**

- catalog\_item (tenant): category, brand, sku/model, dims, finish, price, lead time, supplier, texture\_path, source\_url, ai\_confidence per field; thumbnail image.
- Counts per category and collection; total products (status bar "426 products"); items placed in this project ("23 placed").
- Library name and sharing ("Worth Properties library · shared with 4 users").
- AI read result: fields filled count, elapsed seconds, confidence per field.
- Project price snapshot per item (Round 15) (not in mockup).

**States:**

- Empty catalog: category list with zero counts; prompt to Add product (not in mockup).
- Empty search: "0 results" (not in mockup).
- Loading: pending card in grid; status line "Reading page..." in Add product card.
- Read error / blocked site: fallback chips Paste text and Upload screenshot (Round 7).
- View-only (another user holds the edit lock): browse only; drag-to-place and Add and place disabled. Amber lock banner per Round 13.
- Permission denied: no Edit catalog hides Add product; no See company costs hides cost fields and no See sell prices hides sell and markup fields.
- Offline: browsing cached catalog; Add product and Refresh prices disabled with a "Needs connection" note.
- Price refresh results pending review (not in mockup).

**Validation & warnings:**

- AI never saves silently: each field shown for confirmation; Add is blocked until confirmed.
- Low-confidence fields marked red; check fields amber with reason on hover.
- Dimension fields accept the plan doc length formats (12'6", 12' 6 1/2", 150", 12.5'); fractions to 1/16".
- DWG not applicable here. Large retail sites may block reads; show fallback.
- Refresh: shows "price changed" and "discontinued" before update.
- Placement: size snaps to nearest cabinet or wall.

**Events emitted:**

- catalog\_item.created (new)
- catalog\_item.updated (new)
- catalog\_price.refreshed (new): item, old price, new price, discontinued flag, project id
- takeoff.updated when a placed item changes project quantities

**Decisions:**

1. Categories, in this order: Cabinets, Countertops, Tile, Plumbing fixtures, Lighting, Appliances, Hardware, Paint, Windows and doors (plan doc list). (Claude)
2. Three add modes: Link, Paste text, Screenshot. Screenshot accepts a file upload or a clipboard paste. (Claude)
3. Green fields count as confirmed when the user presses Add. Amber and red fields each need a tap (or an edit) before Add to catalog and Add and place enable. (Claude)
4. AI reads the page price into Cost. Sell price = Cost x (1 + markup). Default markup per category is set in Settings → Catalog (15e); it can be changed per item. (Claude)
5. With Save to company library unticked, the item is saved to this project only. (Claude)
6. The project price snapshot is taken when the item is first placed in the project or added to an option. (Claude)
7. Refresh is manual only: per item on the item detail, and "Refresh all" on the In this project collection. No scheduled refresh. (Claude)
8. Item detail uses the Add product card layout, filled in, with Refresh prices and Delete (Edit catalog). (Claude)
9. The page image is the default thumbnail and texture. A Texture/photo field allows upload of a different one. With none, 3D uses a generic material at the item's size. (Claude)
10. Offline: Add product and Refresh prices are disabled with a "Needs connection" note; browsing the cached catalog and placing items still work. (Claude)
11. Standard spec is a star toggle on the item detail (Edit catalog). Recently added = last 30 days; the window is a setting under Defaults. (Claude)
