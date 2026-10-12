### 15c · Settings: Sheet presets (submittal profiles)

**Purpose:** Saved presets per building department for anything that differs between departments, so a new rule is a setting, not code.

**Entry points:** Settings nav "Sheet presets". Project settings "Submittal profile" select links here.

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: list of profiles (one per department). Inspector: selected profile fields. (Not in mockup.)

**Controls:** (Section not in mockup; content from plan Rounds 4 and 5 and Round 24.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Profile list row | Main | Selects profile (e.g. Palm Beach County, PBC municipality, Broward). | One profile marked Default. |
| Set as default (row menu) | Main | Makes the profile the company default for new projects. |  |
| New profile | Main header | Creates a profile copied from the default. | Name required, unique. |
| Duplicate / Delete (row menu) | Main | Copies or removes a profile. | A profile used by a sent set cannot be deleted; it can be archived. |
| Department name input | Inspector | Profile name. | Required. |
| Submittal type select | Inspector | Electronic, Paper. | Plan Round 4. |
| Permit sheet size | Inspector | 24x36 (ARCH D) for stamped permit sets. | Round 25. 11x17 is offered only for client and field sets, never on a permit profile (Claude). |
| File split select | Inspector | Combined set (default) / per discipline or consultant / one PDF per sheet. | Round 25; section 7. |
| Max file size (MB) | Inspector | Per-file size limit; a file over it is split further, or issue warns when it cannot be. | Empty = no limit. PBC 10 MB. |
| File naming pattern input | Inspector | Tokens: {address}, {description}, {rev}, {date}, {sheet}, {discipline}. Default "{address} {description}" e.g. "336 Golfview Rd buildingplans" with the version kept in the name. | Characters / ? < > \\ : \* \| " , # and double or trailing spaces are stripped; length limit per profile (PBC 80, West Palm Beach ALL CAPS 30). |
| Revision naming select | Inspector | Version in file name (default) / Same name as original (revision ID only in the title and revision blocks). | Round 25. |
| Flatten on export (switch) | Inspector | Single layer, no annotations; runs before signing. | Off by default; on for Boca Raton, Fort Lauderdale, Coral Springs. |
| Stamp box size and position | Inspector | Size and position of the reserved department stamp area. | Default 3" x 3", bottom right above the title block (Claude). Fort Lauderdale 6" x 2" top left. |
| Bookmarks / TOC sheet | Inspector | One bookmark per sheet in combined files (on); optional TOC sheet. | Fort Lauderdale needs the TOC. |
| Resubmittal mode select | Inspector | Changed sheets only / Full discipline set plus narrative (errata) PDF; transmittal on or off. | Section 7. |
| Minimum scale check | Inspector | Smallest plan scale the department accepts (e.g. 3/16" = 1'-0"). | The issue checklist warns when a viewport is below it. |
| Export unsigned (switch) | Inspector | Leaves the seal box empty so the professional signs last with a third-party certificate. | On by default when the signer is not None (Claude). |
| Output (display) | Inspector | "Vector PDF, not password-locked; markup and stamping allowed." | Round 24; section 7. |
| Required notes (multi-select from notes library) | Inspector | Notes added to sets for this department. | Links to 15h. |
| Electrical signature requirement select | Inspector | None, Electrical contractor, Architect. | Plan Round 5. Departments accept the GC load calc; the optional EC signature block stays (Round 24). |
| Save | Inspector footer | Saves submittal\_profile. | Disabled with no edits. |

**Data shown:** submittal\_profile: every field in the controls table above (department, submittal type, permit size, file split, max file size, naming pattern, revision naming, flatten, stamp box, bookmarks/TOC, resubmittal mode, minimum scale, export unsigned, signature requirement, required notes).

**States:** empty (only the default profile), loading, error, offline read-only.

**Validation & warnings:** File name pattern must produce a valid file name and must include {address}; warning if it omits {rev} while the profile is not set to same-name-as-original.

**Events emitted:** submittal\_profile.created (new), submittal\_profile.updated (new), submittal\_profile.deleted (new).

**Decisions:**

1. "Sheet presets" holds submittal profiles only; viewport and scale presets are not part of v1 (Claude).
2. Each project picks a profile in project settings (defaults to the company default); it can be changed at issue on the Sheets screen (Claude).
3. Naming tokens are {address}, {description}, {rev}, {date}, {sheet}, {discipline} (Claude). Permit profiles are fixed at 24x36; 11x17 is for client and field sets only (Round 25, Claude).
