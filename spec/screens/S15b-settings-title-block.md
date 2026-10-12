# 15b · Settings: Title block

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Edit the tenant title block used on every sheet.

**Entry points:** Settings nav "Title block". Sheets screen (S13) "Title block: Company standard" links here.

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: title block field toggles; live preview at 24x36 and 11x17. (Not in mockup.)

**Controls:** (Section not in mockup; content from plan Rounds 4 and 5, Feature spec 4 and Round 24.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Show company logo, license and contact (switch) | Main | Toggles the company block on the title block. | Plan Round 4: on/off option. |
| Project fields (display) | Main | Auto-filled fields: project address, parcel number, owner, code edition, scope of work, sheet number, sheet title, date. | Filled per project from project and property\_record. |
| Revision block (display) | Main | Columns: number, date, description. Pre-permit sends show "Version N"; permit issues show "Rev N". | Always on (Round 24 numbering). |
| Seal box (display) | Main | Blank seal/signature box for a design professional or electrical contractor. | Always present on permit sheets (Round 24: two blank areas). |
| Department approval stamp area (display) | Main | Blank area reserved on each sheet for the department's stamp. | Always present (Round 24). |
| Preview size toggle (24x36 / 11x17) | Main | Switches preview size. |  |
| Preview | Main | Renders the title block with sample project values. | Updates on change. |
| Save | Main footer | Saves tenant.title\_block. | Disabled with no edits. |

**Data shown:** tenant.title\_block config, logo, license, contact; sample project values in preview.

**States:** loading, error, offline read-only.

**Validation & warnings:** A permit set cannot issue until the title block is complete (plan Round 12). Missing tenant-level fields (company name, license) are listed here as warnings.

**Events emitted:** tenant.title\_block\_updated (new).

**Decisions:**

1. Layout is fixed; the user controls the company-block toggle only. All other fields fill from company and project data (Claude).
2. "Title block complete" = company name, license number, project address, parcel number, owner, scope of work and code edition all filled (Claude).
3. Seal box and department stamp area are always on every permit sheet; the submittal profile only records who signs (Round 24, Claude).
