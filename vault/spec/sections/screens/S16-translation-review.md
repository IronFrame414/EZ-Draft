### 16 · Translation review

**Purpose:** Review queue for AI-drafted Spanish translations of sheet notes, keynotes and field tasks across all projects. Spanish is for in-app viewing and the field pack; permit sheets are English only. Approving or editing a phrase updates it everywhere it is used, except in sets already sent.

**Entry points:**

- Settings nav "Translations" (badge = unreviewed count).
- Sheets screen (S13) issue checklist "Spanish notes review pending · Open".
- In-app and email notification to the reviewer when new phrases arrive (Claude).

**Permissions:**

- View and act (Approve, Edit, Reject, Approve all, Glossary edits): Approve translations. Without it the section is hidden.
- Translation settings card (Hold issue switch, Reviewer select): Manage users and settings; hidden without it.

**Layout:** Settings shell (see 15) with Translations active in the nav; nav footer card "How Spanish sets work". Main card: title, status segmented control, type chips, project filter, Glossary button, table, footer with count and bulk approve. Right column 360px: selected translation card (top), translation settings card (bottom). Status bar: Pair, Unreviewed, Approved, Glossary, Hold issue, location.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Segmented: Unreviewed (count) | Main header | Shows unreviewed phrases. | Default tab. |
| Segmented: Approved (count) | Main header | Shows approved phrases. | Approved phrases can be edited; an edit saves as approved. |
| Chip: All types | Filter row | Clears type filter. | Default on. |
| Chip: Sheet notes (count) | Filter row | Filters to sheet notes. | Counts reflect the current status tab. |
| Chip: Keynotes (count) | Filter row | Filters to keynotes. |  |
| Chip: Field tasks (count) | Filter row | Filters to field tasks. |  |
| Project filter button | Filter row | Opens project picker; first option "All projects" (default). Shows current filter ("Kitchen remodel · Hendricks"). |  |
| Glossary button | Filter row | Opens the glossary dialog: EN → ES term pairs (186 terms) with search, add, edit, delete, and "keep in English" flag (e.g. GFCI). | Approve translations. Changes apply to future drafts and warnings. |
| Table row | Table | Click selects and loads the right card. Selected: tint + left accent bar. | Columns: Type (label + where used), English source, Spanish draft, Status. |
| Row Type cell | Table | Type label (Keynote 12, Sheet note, Field task) and location (sheet numbers, detail id, or field pack tab). |  |
| Row warning "Not in glossary: \<term>" | Spanish draft cell | Amber: a construction term in the source has no glossary entry; term highlighted. Click "Add to glossary" adds the pair from the draft. | Excludes the row from "Approve all with no warnings". |
| Row warning "Glossary mismatch: \<term>" | Spanish draft cell | Amber: the source term has a glossary entry but the draft uses a different word. | Same exclusion. |
| Row warning "Numbers differ" | Spanish draft cell | Amber: a number, dimension or unit in the source (34 1/2", 2700K, 120V 15A) is missing or changed in the draft. | Same exclusion. |
| Row Status pill | Table | Unreviewed (amber) or Approved (green). The row open in the card also shows a blue "Reviewing" marker. | Stored statuses: Unreviewed, Approved. |
| Showing n of m | Footer | Display. | List loads more on scroll, 50 rows per page (Claude). |
| Approve all with no warnings (count) | Footer | Confirm dialog "Approve n phrases?"; then approves every unreviewed phrase in the current filter with no warnings. |  |
| Previous / Next (chevrons) | Card header | Moves to the previous / next row in the current filter. | Disabled at ends. Keys Up / Down. |
| Card header | Card | Phrase label ("Keynote 12") and usage ("Used on E1.0, A4.0 · 2 places"); each usage links to the sheet or field pack spot. |  |
| EN source box | Card | Read-only source with glossary terms highlighted. |  |
| ES draft box | Card | Spanish text with glossary terms highlighted; editable after Edit or Reject. |  |
| Glossary terms list | Card | Each matched term: EN → ES with check, or "kept" for terms left in English. | Display. |
| Drafted / Reviewer meta | Card | "Drafted: EZ Draft · Oct 11, 9:14 AM"; "Reviewer: \[Name\] · Foreman"; after approval "Approved by \[Name\] · \<time>". |  |
| Reject | Card footer | Clears the AI draft and opens the ES box empty for manual entry; Save approves the typed text. | Round 24 #39. |
| Edit | Card footer | Makes the ES box editable with the draft; Save approves the edited text. | Editing = approving (Round 24 #41). |
| Approve | Card footer, primary | Sets status Approved, records approver and time, updates every unsent use, advances to the next row. | Key A. |
| Hold issue until translations are approved (switch) | Settings card | On: a set cannot issue while any phrase used in it is unreviewed. Off: sets issue now. Helper: "Spanish users always see Spanish, reviewed or not." | Default off. Only holds set issue (Round 24 #40). |
| Reviewer select | Settings card | Chooses who is notified of new phrases. | Any user with Approve translations can review (Claude). |
| Keyboard: Up / Down, A (approve), E (edit), R (reject) | Table / card | As named. | Bindings editable in 15d (Claude). |

**Data shown:**

- translation: phrase (EN), Spanish text, status (Unreviewed / Approved), approver and time, drafted time, type, usage list (sheet numbers, detail ids, field pack location), glossary matches, warnings.
- Counts per status and type; glossary term count.
- Hold issue setting state.

**States:**

- Empty (Unreviewed): "All translations reviewed."
- Loading: table skeleton.
- Error: save fails; card keeps edits with Retry.
- Editing / manual entry: ES box has focus border and caret; footer shows Cancel and Save.
- Offline: read-only.
- No permission: section hidden; a typed URL redirects to Projects.

**Validation & warnings:**

- Glossary and number checks as in the warning rows above.
- Spanish text cannot be empty on Save or Approve.

**Events emitted:**

- translation.approved (new): phrase id, text, approver, uses updated.
- translation.edited (new) (also approves)
- translation.rejected (new)
- translation.bulk\_approved (new)
- glossary.updated (new)
- translation.settings\_updated (new)
- Approval writes event\_log.

**Decisions:**

1. Stored statuses are Unreviewed and Approved; "Reviewing" is only the selected-row marker; mockup "Draft" pills read "Unreviewed" (Claude).
2. Reject clears the AI draft and opens manual entry; saving approves the typed text (Round 24).
3. Spanish users always see Spanish, reviewed or not, never English or blanks; the switch only holds set issue (Round 24).
4. The Reviewer select only picks who is notified; anyone with Approve translations can review (Claude).
5. The glossary is edited in the Glossary dialog by users with Approve translations. "Not in glossary" means a source term has no entry; "Glossary mismatch" means the entry exists but the draft differs (Claude).
6. Editing an approved phrase keeps it Approved and updates unsent uses; sets already sent do not change (Round 24).
7. Translation changes never create a revision; permit sheets are English only (Round 24).
8. Permit sheets are English only; Spanish is for in-app viewing, the field pack and field pack PDFs (Round 24).
9. Numbers, dimensions and units are checked; a difference is a warning, not a block (Claude).
