# Glossary addendum · Phase 2

Added by spec-check 2 (Q-0403). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and `00b-glossary-phase-01.md`.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Notification | A message to one user about one item, shown in the bell list and sent by email with a link that opens the same item; no SMS. | `notification` (03c Tables; created by EZD-110) | 04 App shell · Notifications; S01 Notifications button; Q-0391 |
| Notification kind | One of the nine reasons a notification is sent (client approval or comment, field conflict, field measurements received, photoreal render finished, edit request, offline sync conflict, version cleanup due, render allowance refilled, new field pack issued). | `notification` kind (03c Tables) | 04 App shell · Notifications |
| Notification setting | A user's choice, per notification kind, of In app and Email, both on unless the user turns one off. | none yet (plan names it) | Q-0220; Q-0393 |
| Avatar menu | The menu under the user's initials in the header: My profile, Company settings, Sign out. | none | S15 Decision 12; board 01d |
| My profile | The dialog where a user changes their own language, iPad drawing input, password and notification settings. | none | S15 Decision 11; Q-0096 P6; Q-0392; boards 01e, 01f |
| iPad drawing input | Whether the user draws on an iPad with Pencil or finger (the default) or Pencil only. | `app_user.ipad_input_mode` (values `pencil`, `finger`; the plan maps them to the two choices) | 10 Permissions and settings (Input); Q-0392 |
| Project status | Where a project stands: Draft, Client review, Permit submitted, Approved, In build; Complete is added with Mark complete. | `project.status` | S01 Decisions; Q-0199; Q-0191 |
| Project type | Kitchen, Bath or Whole-home interior; sets the default project name "<Type> remodel". | `project.type` | S01 New project wizard |
| Scope of work | The written scope typed in the wizard; it prints in the title block. | `project.scope_of_work` | Q-0186; Q-0396 |
| Input source | What a new project starts from: Polycam scan, PDF, DXF, supplier kitchen PDF, field measure or blank. | none yet (plan names it) | Q-0189; Q-0398 |
| Working copy | The version label on a project card when nothing has been sent. | none | S01 Data shown |
| Entry point | A way to start a project from the New project button: Standalone now, Start from a file when it ships. | none | S01 Controls; Q-0398; Q-0410 |
| Status tab | One of the filters above the project cards (All and one per status), each with its count. | none | S01 Controls; Q-0402 |
