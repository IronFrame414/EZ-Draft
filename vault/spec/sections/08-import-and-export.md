## Import and export

Originals are always stored unchanged; imports only create model objects after you accept them in Import review, and DXF references keep 100% of the source drawing.

**Imports**

| Source | Format | What the app does | Fidelity and limits |
| --- | --- | --- | --- |
| Polycam Space scan | Layered DXF floor plan | Walls, openings, rooms detected by layer → Import review | About 0.5" tolerance; needs Polycam Business |
| Polycam mesh | GLB / GLTF | Toggleable 3D underlay; ceiling heights can be read from it | Reference only, never model data |
| Existing plan | Vector PDF | Scale by two points + typed distance; wall lines auto-detected → Import review | Trace-assist for anything not detected |
| Existing plan | Scanned PDF / image | Underlay for tracing | Trace only |
| Supplier kitchen drawings | Vector PDF | Walls, runs, dimensions; cabinet labels (W3030, B24…) set size and type; plan and elevations cross-checked → Import review | Scanned PDFs: trace-assist, lower confidence |
| Supplier 2020 order report | PDF / CSV / text | Exact SKUs and sizes; most reliable cabinet input | Format to confirm with a real sample |
| Supplier 2020 drawings | DXF | Full-fidelity reference, convert runs | DWG prompts for a DXF in v1 |
| Supplier rendering | PNG / JPG | Style and finish reference; cabinet tags linked to plan boxes (rendering markup); AI suggests catalog matches | Never a geometry source |
| Architect drawings | DXF (model and paper space) | Full-fidelity reference: all linework, layers, blocks, hatches, text, dims, layouts; convert all, some layers or none | GPU rendering with layer loading for large files |
| Revised architect DXF | DXF | New version of the same reference; diff of changes and affected markups/objects | — |
| Any DWG | DWG | Not opened in v1: the app asks for a DXF re-save | Paid ODA converter deferred |
| Product page | URL | Server reads page; AI fills name, brand, model, dims, finish, price, lead time, category | Retail sites may block; fallback below |
| Product fallback | Pasted text, image, screenshot | AI reads fields | User confirms every field |
| Property appraiser | URL / pasted text / screenshot | Parcel, owner, legal, year built, living area | User confirms |
| Panel label / directory | Photo | AI reads brand, rating, spaces, circuit list | User confirms |
| Site photos | JPG / HEIC | Attached to rooms; render source; field pins | — |
| Laser | Keyboard-mode text | Types into the focused length field | Laser model must support keyboard mode |

**Exports**

| Output | Format | Contents and rules | Permission |
| --- | --- | --- | --- |
| Permit set | One vector PDF per set; supporting docs separate | True scale; stamped permit sets 24×36 (ARCH D), 11×17 for client and field copies (Round 25); one bookmark per sheet; blank stamp area; not password-locked; markup allowed in Bluebeam and Acrobat; scale bar and check dimension on each sheet | Issue permit sets / Issue revisions |
| File name | — | Address + description, e.g. "336 Golfview Rd buildingplans"; the version stays in the file name by default (Round 25), and a profile can switch to same-name-as-original; naming template, file split and flattening set per submittal profile | — |
| CAD | DXF | Model and sheets as DXF | Export |
| Markup back to architect | PDF overlay or DXF layer | Markup layer only | Export |
| 3D for EZ Binder | GLB (compressed) | Lightweight for `<model-viewer>` | Export |
| iPhone AR | USDZ | AR Quick Look | Export |
| Takeoff | CSV | Lines by room and trade with waste | Export; prices only with See company costs |
| Cabinet schedule / order | CSV and on sheets | Code, qty, finish, notes | Export |
| Countertop schedule | On sheets, CSV | Piece, material, thickness, area, edge profile, edge length. Internal and client documents only, never in permit sets | Export |
| Selections PDF | PDF, branded | Approved render per room, product list with photos (no prices), signature page; optional allowance summary with prices | Send to client |
| Field pack | PDF + offline cache | Per-room pages, tasks, in user's language | View projects |
| Single render | PNG / JPG | With "For illustration; drawings govern" label | Export |
| Detail | On sheet A5.0 and as PDF | Print preview at 24×36, 11×17, phone | Export |

### Department submittal rules (checked Oct 11, 2026)

One combined PDF per set stays the default (Round 24), but it only works as-is for Broward County BCD and, with changes, Fort Lauderdale, West Palm Beach and Coral Springs. Palm Beach County and Boca Raton require one PDF per sheet, and every department that addresses resubmittals requires the corrected file to keep its original name. EZ Draft therefore makes file split, naming, flattening, stamp box and resubmittal mode settings of each submittal profile (decided by Claude from this research).

| Department | Portal | Key PDF rules | Differs from EZ Draft default | Source |
| --- | --- | --- | --- | --- |
| Palm Beach County Building Division | ePZB Building portal | Drawings one file per page; 10 MB max per file; name 80 characters max; digitally signed with trusted CA if applicable; resubmittals keep the original file name | One file per sheet; 10 MB limit; no rev suffix. Stamp space, sheet size, flattening: not stated | [EPZB Building Portal FAQs](https://pbc.gov/iPZB.Building/Docs/EPZB%20Building%20Portal%20FAQs.pdf) |
| West Palm Beach | EPL / Civic Access | One digitally signed PDF per consultant; not locked; drawing names ALL CAPS \~30 characters, description + responsible person; resubmittal keeps original name, extension allowed; revisions upload changed sheets only | Per-consultant file; different naming; suffix only appended to the original name; changed sheets only | [EPL File Preparation](https://www.wpb.org/files/assets/city/v/1/development-services/documents/epl/epl-file-preparation.pdf) |
| Boca Raton | Boca ePlans | Vector PDF required; layers must be flattened; multi-page drawing files rejected; names by sheet number (A-101); corrections use the exact same name; revised areas clouded; transmittal on resubmittal | One file per sheet; flattened; sheet-number naming; no rev suffix | [Boca ePlans Applicant User Guide](https://www.myboca.us/DocumentCenter/View/34304/Boca-ePlans-Applicant-User-Guide), [Naming Conventions](https://www.myboca.us/DocumentCenter/View/39849/Naming-Conventions) |
| Broward County BCD (unincorporated) | Broward ePermits OneStop | Signed and sealed each page with verifiable e-signature; one file per trade labeled by trade; 99 MB max; no password protection; plans at least 3/16" = 1' (electrical 1/4" = 1' under 5,000 sf) | Closest to default; trade-label naming; revision naming rule not confirmed; minimum scale may fail on 11x17 | [BCD ePermit User Guide](https://www.broward.org/Building/Documents/Building%20Code%20Division%20Building%20Permitting%20ePermit%20User%20Guide.pdf) |
| Fort Lauderdale | LauderBuild Plan Room | No encryption; all layers flattened incl. seals; annotations removed; max 24x36; 6"w × 2"h stamp space top-left on every sheet; multi-page PDFs need TOC and bookmarks; names like BLD-PLANS-A; resubmittals same name, changed sheets only; third-party CA signature, any change after signing voids it | Fixed stamp box size and place; flatten; different naming; no rev suffix; changed sheets only | [LauderBuild](https://www.fortlauderdale.gov/Government/Departments/Development-Services/LauderBuild), [Naming Standards](https://www.fortlauderdale.gov/files/assets/public/v/1/development-services/documents/lpr_naming_v21.pdf), [Digital Signature Policy](https://www.fortlauderdale.gov/files/assets/public/v/2/development-services/documents/lpr_dsp_v42.pdf) |
| Coral Springs | eTrakit | One layer, no embedded objects; not locked; separate PDF per discipline named by type; corrections are a full discipline set with the same name; delta clouds; narrative/errata file; first page signed with third-party CA | Flatten; per-discipline naming; no rev suffix; narrative file needed | [Naming Requirements](https://www.coralsprings.gov/Government/Departments/Building/Online-Permitting-eTrakit/Naming-Requirements) |

**Submittal profile settings added**

1. File split: combined set (default) / per discipline or consultant / one PDF per sheet, with a per-file size limit (PBC 10 MB).
2. Download options: one PDF per set (default) or one page at a time. File names keep the version by default (Round 25); users rename locally when a department wants the original name. A profile can switch to same-name-as-original with the revision ID only in the title and revision blocks.
3. Naming template per profile (address + description default; Fort Lauderdale `BLD-PLANS-A`, Boca sheet number, West Palm Beach ALL CAPS ≤ 30 characters, Coral Springs discipline name, PBC ≤ 80 characters). Characters / ? < > \\ : \* | " , # and double or trailing spaces are stripped.
4. Flatten on export (single layer, no annotations), run before signing.
5. Stamp box position and size per profile (Fort Lauderdale 6" × 2" top-left); default stays the current reserved area.
6. Not password-locked; markup allowed (all departments agree).
7. Bookmarks for combined files; optional TOC sheet (Fort Lauderdale).
8. Resubmittal mode: changed sheets only, or full discipline set plus a narrative/errata PDF; transmittal option (Boca).
9. Minimum-scale check per profile (Broward 3/16" = 1'); flags 11x17 layouts below it.
10. Export unsigned, leaving the seal box, so the professional signs last with a third-party certificate.

Full-size sheets: stamped permit sets export at 24×36 (ARCH D), the standard full-size blueprint sheet for residential work. It fits every department checked (Fort Lauderdale max 24×36, Boca Raton max 36×42). 11×17 stays available for client and field copies. Larger sizes (30×42, 36×48) are not needed for remodels (Round 25).

Not confirmed: PBC stamp space, sheet size, flattening and bookmarks; West Palm Beach naming reference sheet (image-only); Broward BCD revision naming. No department requires a scale bar or check dimension; EZ Draft keeps them.
