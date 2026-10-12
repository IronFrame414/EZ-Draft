# 18 · Client approval (phone)

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Client-facing share link page where the homeowner views renderings and plans, compares options, pins comments, makes selections, verifies, signs and approves. Approval covers the sent version, which is frozen permanently.

**Entry points:**

- Share link emailed by the contractor (Send to client); the send dialog also shows "Copy link" (Round 24). No SMS in v1.
- Later: inside the EZ Binder client portal (v2).

**Permissions:**

- Contractor side: Send to client creates, sends and renews the link. Only renders that are Approved and then Marked client-ready (two-step) appear here.
- Client: anyone with the link can view, comment and choose options; signing requires email verification against the customer profile (Round 24). No editing. Clients never see internal costs.

**Layout:** Phone 390x844. Not the editor shell.

- Header: company name ("WORTH PROPERTIES"), project name ("Hendricks kitchen"), right: "Design approval", "Version 3 · Oct 11" (pre-permit) or "Rev N · date" (after permit); menu button.
- Page tabs: Design, Plans.
- Render card: image with before/after slider and comment pins; Compare button; comment list below.
- Selections card.
- Option group ("Ceiling beams · Choose one") with A/B/C cards.
- Disclaimer line.
- Signature card: email verification, printed name, signature pad, open-items note.
- Footer: Comment, Approve.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Menu button | Header right | Download selections PDF; Help ("Contact \[Company\]"). |  |
| Page tab: Design | Below header | Renders, selections, options, signature (shown). | Default. |
| Page tab: Plans | Below header | Read-only viewer of the sheets the contractor shared in this send; pinch zoom; tap to pin a comment. | (Claude). |
| Render gallery swipe / dots | Render | Switches between client-ready renders (one per room or angle). |  |
| Before/after slider handle | Render | Drag left/right to reveal before (site photo) vs after (render). | Labels "Before" and "After". |
| Render image: tap (comment mode) | Render | Drops a numbered pin and opens a comment input. | Plan Round 8. |
| Compare | Render card | Opens side-by-side view of options A/B/C on the same angle; tap one to select it. | Plan Feature spec 10 (Claude: button placement). |
| Comment pin (numbered) | Render | Tap scrolls to and highlights its comment. |  |
| Comment list item | Below render | Pin number, author ("You", "Josh"), text; Reply. | Clients can reply in a thread (Claude). |
| Selections row: Countertop edge | Selections card | Opens edge choice (S18b). | Card note "Not all shown in render". |
| Selections row: Cabinet / Hardware / others | Selections card | Opens that selection's choice page (same pattern as S18b). | Open rows show "Choose"; chosen rows show the choice. |
| Option card A / B / C | Ceiling beams | Selects one option; border + check badge, `aria-pressed`. Render switches to that option's client-ready render; if none, shows the option thumbnail with "No rendering for this option". |  |
| "For illustration; drawings govern." | Below options | Display. | Always visible. |
| Verify email input + Verify | Signature card | Client enters the email on their customer profile; match unlocks the signature pad. | Round 24 #32. Mismatch: "That email doesn't match our records. Contact \[Company\]." |
| Printed name input | Signature card | Client types full name. | Required (Round 24 #34). |
| Signature pad | Signature card | Finger signature. Caption: "\[Client name\] · Oct 11, 2026 · approving Version 3 with option B". | Locked until email verified. |
| Clear | Signature card | Clears the signature. |  |
| Open items note | Signature card | "Still open: Hardware" when some selections are not chosen; "You can approve now and choose these later." | Client may sign with some selections open (Round 24). |
| Comment | Footer | Enters comment mode (next tap on image or plan drops a pin). |  |
| Approve | Footer, primary | Records approval (verified email, signature, printed name, date, IP, chosen options), freezes the version, emits selection.approved, shows confirmation with Download selections PDF. | Enabled when email verified, printed name and signature present, and at least one selection chosen. Choosing alone is never approval (Round 24). |

**Data shown:**

- share\_link: project, scope, expires\_at.
- Client-ready renders, before photo, sent version label.
- design\_option choices (A/B/C) and selection items; chosen and open items.
- Shared sheets (Plans tab).
- Comments with pin positions and replies.
- Approval record after signing.

**States:**

- Active link: normal.
- Expiring soon (7 days or less): banner "This link expires in n days." (Claude).
- Expired: "This link has expired. Ask \[Company\] to renew it." Contractor renews for 30 days.
- Not verified: signature pad locked.
- Approved: read-only; shows signer, date, approved options and still-open items; Approve hidden; selections PDF available.
- New version sent: link shows the new version for a new signature; the earlier approval stays on record.
- Render outdated or hidden: hidden renders are removed until re-rendered.
- Loading, error, offline ("Connect to approve").

**Validation & warnings:**

- Email must match the customer profile (case-insensitive).
- Printed name and signature required.
- One option per option group.
- No prices except the edge profile price difference shown as a total (S18b).

**Events emitted:**

- selection.approved (includes chosen and open items)
- client.commented: pin location, text, render or sheet id.
- client.verified (new)
- selection.option\_chosen (new)
- share\_link.viewed (new); share\_link.expired (new); share\_link.renewed (new)
- Notifications to contractor: client approval or comment (in-app and email).

**Decisions:**

1. Client may approve with some selections still open (listed on the signature card and in the approval record); Approve needs verification, printed name, signature and at least one choice; Choose alone is not approval (Round 24, Claude for the one-choice minimum).
2. Printed name is required with the signature (Round 24).
3. Viewing needs only the link; signing needs the client to enter the email on their customer profile (Round 24).
4. Pre-permit sends are labeled "Version N"; permit issues "Rev N" (Round 24).
5. Selecting an option swaps to its client-ready render; Compare opens a side-by-side view (Claude).
6. Selections PDF downloads from the header menu and from the approval confirmation (Claude).
7. Clients can reply to comments in a thread (Claude).
8. Plans is a second page tab showing the shared sheets read-only, with comment pins (Claude).
