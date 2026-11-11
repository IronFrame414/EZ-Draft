# Glossary addendum · Phase 7

Added by spec-check 7 (Q-0695). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00g.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Invite | A pending membership with a 7-day link and 6-digit code, accepted by the invitee. | `membership.status = invited`, `invite` | S15 Invite user; Q-0216; Q-0695 |
| Invite code | The 6-digit number the invitee types on the sign-in page to accept an invite. | derived from `invite` (Q-0695) | Q-0216 |
| Users page switch | The one switch that opens Settings → Users and allows every write on it. Replaces "Manage users and settings". | `settings_users` | Q-0210; catalog.ts |
| Modified | A user whose ticked switches differ from their role's defaults. | computed | S15 Role select |
| Custom role | A role the company makes, with its own default switches. | `role` with no preset | S15 D6 |
| Deactivated | A member who keeps their rows but cannot sign in until reactivated. | `membership.status = deactivated` | 03c; Q-0695 |
| Remove | Deleting a member: their switches, listed projects, invite and AI key go; their name stays on the event log. | delete `membership` | S15 More menu; Q-0695 |
| Event log | The audit row written for permission, invite, lock, approval, issue and delete events. | `event_log` | 03c; 11 Operations; Q-0695 |
| Last active | When the member's last signed-in request was seen, to the nearest 15 minutes. | `membership.last_active_at` | S15 Row cells; Q-0695 |
| Project access | All projects, or only Listed projects. | `membership.scope`, `membership_project` | S15 D13; 00b |
