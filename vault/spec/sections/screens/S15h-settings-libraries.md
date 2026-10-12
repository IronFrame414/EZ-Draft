### 15h · Settings: Libraries

**Purpose:** Company libraries reused across projects: notes, symbols and abbreviations, details, hatches, reusable parts, and field task templates.

**Entry points:** Settings nav "Libraries". "Save to company library" on the Catalog and Detail screens adds items here.

**Permissions:** Manage users and settings to edit libraries. Edit field tasks may also edit field task templates. Without either, the section is hidden. Library content placed in projects is visible with View projects.

**Layout:** Settings shell. Main card with tabs: Notes, Symbols + abbreviations, Details, Hatches, Parts, Saved groups, Field task templates. Inspector for the selected item. Saved groups made in the Plan editor (Save as group) are listed here to rename or delete (Claude).

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tab: Notes | Main | General notes and code notes, grouped by project type (kitchen, bath, whole-home). | Plan Feature spec 4. |
| Add note / Edit / Delete | Notes tab | Manage note text. | Permit sheets are English only; English notes also enter the translation queue (16) for field pack use. |
| Tab: Symbols + abbreviations | Main | Full symbol and abbreviation library (walls by status, doors, windows, plumbing, electrical, low voltage, HVAC, ceiling items, markers, revision delta, keynotes, material hatches). | Read-only system set; abbreviations may be added (Claude). |
| Tab: Details | Main | Company detail library; starter set (shower pan / curb / niche, tile transitions and thresholds, cabinet and countertop sections, wall types). | Plan Rounds 4, 19. Open launches the Detail editor (S10). |
| Detail row: Open / Duplicate / Delete | Details tab |  | Editing a library detail does not change copies already placed in projects. |
| Tab: Hatches | Main | Standard material set plus custom hatches. | Standard set read-only; custom editable. |
| Tab: Parts | Main | Reusable parts (studs, blocking, anchors, threaded rod, mesh sleeve, LED channel, brackets, fasteners) with name and size. | Plan Round 19. Editable. |
| Tab: Field task templates | Main | One template per room type (kitchen, bath, laundry, other) built from a default trade sequence: demo → rough-in → inspection → drywall → finish. Add, rename, delete, reorder phases. | Plan Round 14. |
| Drag handle on phase row | Field task templates | Reorders phases. |  |
| Search | Main header | Filters the current tab. |  |

**Data shown:** notes library, symbol and abbreviation library, detail records (scale/NTS, library link), hatches, parts, task templates.

**States:** empty per tab, loading, error, offline read-only.

**Validation & warnings:** Deleting a library item used in projects shows how many projects hold copies; copies stay unchanged.

**Events emitted:** library.item\_created (new), library.item\_updated (new), library.item\_deleted (new).

**Decisions:**

1. Tabs as listed. Symbols and standard hatches are a read-only system set; notes, details, custom hatches, parts, abbreviations and task templates are editable (Claude).
2. Field task templates are per room type, each starting from one default trade sequence (Claude).
