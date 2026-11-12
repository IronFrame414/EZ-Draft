# Phase 7 · for Josh (spec-check 7, 2026-11-11)

Phase 7: users, roles, project access and the event log. The spec check found 18 gaps. Agents settled 17 under your standing rule (CLAUDE.md rule 3); the security-reviewer checked every permission and sign-in answer. They are recorded as Q-0695 in the decisions files. No question waits for you; EZD-105 and EZD-107 wait for the boards.

## 1. Decisions needed

None. Q-0696 is answered (Josh 2026-11-11, chat): the Cowork session draws the five boards from vault/questions/design-brief-2026-11-11.md. EZD-105 and EZD-107 wait for the approved boards.

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

## 3. Added after your sign-off (round 2, Q-0706)

- **Copy link on a pending invite** shows only to whoever last sent it and to Owners, matching your Q-0216. Anyone else with the Users page switch can press Resend, which makes them the sender.
- **Last active wording:** "Now", "12 min ago", "3 hr ago" (same day), "Yesterday" (the previous calendar day), then the date.
- Deactivate, reactivate, remove and switch changes are each written to the event log.

## 4. Agent answers to confirm (questions unit, 2026-11-11)

Confirm or override each. Nothing waits on these.

- **Q-0721 (EZD-105):** Cancel invite never ships without the fix that stops it signing someone out of another company; the fix moves into the first invite ticket. Source: security-reviewer, Q-0695 row 62.
- **Q-0731 (EZD-105b):** An Owner can set a password only for an active member with a confirmed account who is not an Owner or Users-page holder, not themself, and not in another company. Those people use "Forgot password". Source: security-reviewer, Q-0094, Q-0096.
- **Q-0733 (EZD-105b):** Set password first asks "Set a password for {name}", then shows the password once. Source: phase-auditor, Q-0096.
- **Q-0724 (EZD-106):** Remove asks in the shared confirm dialog naming the person; Deactivate acts at once (Reactivate undoes it). Source: phase-auditor.
- **Q-0725 (EZD-106):** The footer "Unsaved: n change(s) from <Role> preset" counts pending edits (each changed switch, plus one for role, plus one for language). Source: phase-auditor, S15.
- **Q-0735 (EZD-109):** Autosaves write no event-log row; a room-closure override does. Source: security-reviewer, spec 11 Security.
- **Q-0719 (EZD-104):** The costs info note ("Company costs are hidden everywhere...") appears under the users table now. English only (the office screens have no Spanish). Source: phase-auditor, S15 board.
- **Q-0718, Q-0720, Q-0722, Q-0729, Q-0730, Q-0732, Q-0734:** order and ownership only (event log is built first by EZD-109; the invite More menu comes with the invite ticket). Build-system and architecture, not listed for confirmation.
