### Field measurements review (not in mockup)

**Purpose:** Office reviews field-verified measurements sent by the Foreman and approves or rejects each before it changes the model (Round 24 item 29). (not in mockup)

**Entry points:** Notification when a measurement arrives (in-app and email with Copy link); "N to review" pill; Field measurements item in the left panel on the Plan view. (not in mockup)

**Permissions:** View the list: View projects. Approve or reject: Approve field measurements, plus edit lock (approving changes the model). Controls the user lacks are hidden. (not in mockup)

**Layout:** Left panel list of pending measurements; canvas shows the plan with the measured object highlighted and both values dimensioned; inspector with detail, photo and actions. (not in mockup; needs a mockup before build)

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Measurement row (not in mockup) | Left panel | Selects it; plan zooms to the object. Shows room, object, field value, model value, difference, Foreman, time. | Within tolerance: green; outside: amber. |
| Filter: Pending / Approved / Rejected (not in mockup) | Left panel top | Filters the list. | Default Pending. (Claude) |
| Photo (not in mockup) | Inspector | Opens the attached photo full size. |  |
| Approve (not in mockup) | Inspector (primary) | Updates the model with the field value; then lists every conflict the change creates (Round 12) for the user to resolve. | Edit lock. |
| Reject with note (not in mockup) | Inspector | Keeps the model value; note goes back to the Foreman's field pack. | Note required. (Claude) |
| Open in plan (not in mockup) | Inspector | Opens the object in the plan editor. |  |

**Data shown:** (not in mockup) measurement value as sent, model value, difference, object and room, Foreman, time sent, photo, note, the version the phone was viewing when it was taken.

**States:** (not in mockup) empty ("No measurements to review"); pending; approved; rejected; stale (taken against an older revision, flagged as a conflict on reconnect, Round 24 item 31).

**Validation & warnings:** (not in mockup) one tolerance setting (under Defaults) covers field measurements and scan-vs-typed conflicts (Round 24 item 30); stale measurements show a warning and still allow Approve or Reject; field conflicts (Flag conflict) are a separate list, not measurements (Round 24 item 28).

**Events emitted:** field.measurement\_submitted; field.measurement\_approved; field.measurement\_rejected.

**Decisions:**

1. One row per measurement; approving several at once is not offered, so each model change is checked for conflicts on its own. (Claude)
2. Rejected measurements notify the Foreman with the note. (Claude)
3. Needs a mockup before build. (Claude)
