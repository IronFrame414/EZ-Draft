### 15e · Settings: Catalog

**Purpose:** Company catalog setup: categories, allowance categories, markup, suppliers and appliance rating defaults. The item list itself is the Catalog screen (S09).

**Entry points:** Settings nav "Catalog" (badge = item count).

**Permissions:** Manage users and settings for this section. Edit catalog to add or change items on S09. See sell prices to see markup fields and See company costs to see cost fields; without the permission those rows are hidden.

**Layout:** Settings shell. Main card: "Open catalog" link, then Categories, Allowance categories, Pricing, Suppliers, Appliance rating defaults. (Not in mockup.)

**Controls:** (Section not in mockup.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Open catalog | Main header | Opens the Catalog screen (S09) at tenant scope. | Shown with Edit catalog or View projects. |
| Categories list | Categories | Standard set: tile, cabinet, counter, plumbing fixture, lighting, appliance, hardware, paint, window/door. Add custom category. | Standard categories cannot be removed; custom ones can when unused (Claude). |
| Allowance categories | Allowance categories | Add, rename, remove allowance categories used by items and the selections PDF allowance add-on. | Plan Rounds 7, 14. |
| Default markup % | Pricing | One markup % per category (Claude). Sell price = cost x (1 + markup). | Plan Round 7. Hidden without See sell prices. |
| Suppliers list | Suppliers | Supplier name, contact, default lead time. Add, edit, archive. | Plan Round 7. |
| Appliance rating defaults | Appliance rating defaults | Fallback ratings (volts, amps or VA) per appliance type when a catalog item lacks specs. | Plan Round 15. Owner enters (Round 24). |
| Save | Footer | Saves catalog settings. | Disabled with no edits. |

**Data shown:** catalog\_item count, categories, allowance categories, suppliers, markup, appliance rating defaults.

**States:** loading, error, offline read-only. Cost rows hidden without See company costs; markup rows hidden without See sell prices.

**Validation & warnings:** Markup must be a number of 0 or more. Category and supplier names unique.

**Events emitted:** catalog.settings\_updated (new).

**Decisions:**

1. Settings → Catalog is a configuration page; the item list is S09, linked from here (Claude).
2. Standard categories are fixed; tenants may add custom categories (Claude).
3. Appliance rating defaults live in this section and are entered by the owner (Round 24, Claude). The edge profile library (eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom: name and section drawing) is managed here; the price per LF is entered per top in 04b Edit offered edges (Claude). Default markup is one % per category under Pricing; 09 reads it (Claude).
