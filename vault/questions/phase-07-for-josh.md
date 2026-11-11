# Phase 7 · for Josh (spec-check 7, 2026-11-11)

Phase 7: users, roles, project access and the event log. The spec check found 18 gaps. Agents settled 17 under your standing rule (CLAUDE.md rule 3); the security-reviewer checked every permission and sign-in answer. They are recorded as Q-0695 in the decisions files. One design question waits for you. Phase 7 is ready for your sign-off. Only EZD-105 and EZD-107 wait on question 1.

## 1. Design question (answer by number)

1. **Q-0696 · Pictures for five Users-page pieces.** Board S15 has no picture of five things the spec describes: the Invite user dialog, the custom-role editor (click a role card, or New role), the Project access choice with its project picker, the Foreman picker in the New project dialog, and the Set password button.
   - (a) **Recommended:** draw boards for the two big pieces, the Invite user dialog and the role editor. Build the three small pieces from the spec text with the same parts as the other Settings pages. For My profile and notifications you chose to draw boards first (Q-0391); the small pieces match how the status bar popovers were handled (Q-0506).
   - (b) Build all five from the spec text with no new boards. You change them at the field check.
   - (c) Draw boards for all five first.
   - Holds up: EZD-105 and EZD-107 under (a); EZD-105, EZD-107, EZD-129 and EZD-105b under (c); nothing under (b).

## 2. Agent answers to confirm

Confirm or override each. Nothing waits on these.

- **37 switches, not 28 or 29.** The built list has 37: 27 feature switches plus one switch per Settings page, which replaced "Manage users and settings" (your Q-0210). Counters read "n / 37". Owner has 37, Designer 26, Foreman 11, Crew 4.
- **Who can change users.** Everything on the Users page needs the Users page switch. Whoever has it can change any user, themselves included, and give any switch. The last active person with the Users page switch can never lose it, be deactivated or be removed; the database itself refuses it. The one exception is Set password: per your Q-0096, the Owner can set a password without that switch.
- **Invites.** The link and the 6-digit code both last 7 days from the last send. Resend restarts the clock and makes a new link and code. Opening the link only shows an Accept button, so an email scanner cannot use it up. After 5 wrong codes the code locks until Resend, but the link still works. The code and link show again on the pending row to whoever last sent the invite and to Owners (your Q-0216).
- **Someone already working for another company** cannot be invited or reactivated. The message never says which company.
- **Deactivate** keeps everything and blocks sign-in; Reactivate brings them back. **Remove** deletes their switches, project list, invite and saved AI key for your company; their name stays on the event log. A removed person can be invited again.
- **Two fixes found in existing code**, built into EZD-105 and EZD-106. (1) Cancelling an invite or removing someone in one company must not sign them out of another company; today it would, although nothing can trigger it until phase 7. (2) Remove must also delete that person's saved AI key.
- **New invites default to their project list:** Owner and Designer see all projects; Foreman, Crew and any custom role see only listed projects. Changing someone between all and listed signs them out once so the change takes effect at once.
- **Event log.** Every permission, role, invite and access change writes its log row in the same step as the change: no change without a log. Each row records who, what, when and the IP address. Nobody can read it in the app yet; the reader comes with System status later.
- **New ticket EZD-105b, Owner-set password** (from your Q-0096): generated 16-character password shown once with Copy, signs the person out everywhere, emails them.
- **Last active** shows "Now", "12 min ago", "Yesterday" or a date, updated at most every 15 minutes.
- **Users page wording** follows your board where the thing still exists. Things removed since the board was drawn (Approve translations, Manage users and settings, the EZ Binder sync line) stay off until phase 35.

Worked examples: `vault/spec/sections/09n-users-and-invites-examples.md`. Glossary: `vault/spec/sections/00h-glossary-phase-07.md`.
