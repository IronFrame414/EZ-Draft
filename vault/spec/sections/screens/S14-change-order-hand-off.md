### 14 · Change order hand-off

**Purpose:** Build a change order draft from a revision's changes (before/after images, scope text, line items, schedule impact) and send it to EZ Binder, where the client approves and signs.

**Entry points:**

- Issuing a revision with "Draft change order" ticked (screen 13).
- Revision log or revision history "Create CO" (plan doc Revisions screen).
- Dialog opens over the plan editor; background shows the changed run with "Changed since Rev 1" chip.

**Permissions:**

- Open, edit, Save draft, Send: Create change orders.
- Cost delta column: See company costs. Total, overhead and profit: See sell prices.
- Approve images: Create change orders.

**Layout:** Modal dialog over the standard editor shell (cabinet tool active in the background; background inspector shows the changed run with Rev badge and Length / Depth / To run inputs). Status bar shows View, Phase (read-only), Scale, zoom; no Existing/Proposed toggle.

- Dialog header: icon, title, CO draft source line, Draft badge, Close.
- Left column: Before and after images, image actions, Scope of change text.
- Right column: Line items with total; Schedule impact; Linked job; Triggered by revision.
- Footer: info line, Save draft, Send to EZ Binder.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Close (x) | Dialog header | Closes dialog; unsaved edits prompt (not in mockup). |  |
| Before image (Rev n, Issued date) | Left column | Shows plan of the issued revision. "Needs approval" badge. |  |
| After image (Rev n+1, Draft) | Left column | Shows changed plan; removed items red dashed, new position highlighted. "Needs approval" badge. |  |
| Per-image approve (not in mockup) | Each image | Approves one image for inclusion. | Round 9: each image must be approved before it is included. |
| Use a render instead | Image actions | Replaces an image with an approved render (picker not in mockup). | Only approved renders. |
| Approve images | Image actions | Approves images for inclusion; badges clear. | Send blocked until images are approved or removed. |
| Scope of change text area | Left column | AI-drafted scope; fully editable. | "Client sees this text in EZ Binder." |
| Add line | Line items header | Adds a line item row. |  |
| Line item row: Item, Qty, Unit, Cost delta | Line items | Editable fields. Units: ea, sf, ls, hr, %. | Quantities prefilled from the model change; every cost delta typed by the user. |
| Total change | Line items footer | Sum of cost deltas. | See company costs. |
| Schedule impact (days + text) with edit | Right column | Typed by user; shows completion date change. | Round 9: typed by you. |
| Linked job (open\_in\_new) | Right column | Opens the EZ Binder job. | Uses project.ezbinder\_job\_id. |
| Triggered by revision (chevron) | Right column | Opens the revision with changed sheets (e.g. A2.0, A4.0, A6.0, E1.0). |  |
| Save draft | Footer | Saves CO draft locally. |  |
| Send to EZ Binder | Footer (primary) | Sends the CO draft to EZ Binder; sets change\_order\_draft status Sent and stores ezbinder\_co\_id. The only way a CO reaches EZ Binder. | Disabled until images approved; needs network. |

**Data shown:**

- permit\_revision (from and to), changed objects, changed sheets.
- Before/after images.
- Scope text (AI draft).
- Line items: item, qty, unit, cost delta; total.
- Schedule impact: days, reason, completion date before and after.
- EZ Binder job name and number.
- change\_order\_draft status (Draft).

**States:**

- Draft (new).
- Images awaiting approval.
- Sending / sent (not in mockup).
- Error sending (not in mockup).
- Approved in EZ Binder: inbound API marks CO approved and locks the matching revision (not in mockup).
- Permission denied: no Create change orders hides entry points; no See company costs hides the cost column and no See sell prices hides overhead, profit and the total.
- Offline: Save draft works; Send disabled with a "Needs connection" note.

**Validation & warnings:**

- Every image must be approved before inclusion.
- All text stays editable.
- Info line: "Sends as a CO draft. Client approval and signature happen in EZ Binder."

**Events emitted:**

- revision.created (records the revision only; does not create a CO)
- change\_order.sent (new): co draft, revision ids, images, scope, line items, schedule impact
- Inbound: change order approved (EZ Binder) -> revision locked

**Decisions:**

1. A CO reaches EZ Binder only when Send to EZ Binder is pressed; revision.created does not create a CO (Round 24 item 25).
2. A CO can be drafted and sent together with its revision (Round 24 item 24). When opened before the revision is sent, the After image is labeled with the revision that will be issued.
3. Each image has its own Approve; "Approve images" approves both at once. (Claude)
4. Cost deltas, overhead and profit, and schedule impact are typed by the user (Round 24 item 25). Quantities are prefilled from the model change and stay editable.
5. Client approval and signature happen in EZ Binder; the CO draft carries no client approval. When EZ Binder marks the CO approved, the matching revision locks. (Claude)
6. Save draft stores the CO in EZ Draft only; nothing goes to EZ Binder until Send. (Claude)
