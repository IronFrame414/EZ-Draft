# Assumptions: EZD-105b

Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.

## Settled

Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-105b | The plan names `app/src/components/settings/users/UserMoreMenu.tsx` and puts the Password section in `UserInspector`; on this branch the More menu is the inline `moreMenu` in `UsersPanel.tsx` and the inspector's blocks are in `InspectorBody` | "Set password" added to the inline menu after Edit; the Password section added to `InspectorBody` after Project access and before the switches (an optional `onSetPassword` prop). Opening either does not change the selection, so no unsaved-edits prompt | vault/plans/EZD-105b.md Build steps 13, 14; UsersPanel.tsx |
| EZD-105b | Not-found code: the plan names a new `user_not_found` / `error.user_not_found` | Reused the existing `member_not_found` / `error.member_not_found` ("This person is no longer in this company."), which the other Users page routes answer and the panel already knows; the database message stays `user_not_found` (P0002) | plan Decided "Message keys"; server/users/members.ts |
| EZD-105b | Return shape of `owner_password_target` and `record_member_password_set` | `jsonb` objects parsed with zod (the sibling member functions' shape) instead of `returns table`; the record also answers the actor's email for the email's sent-by (EZD-389) | 20261113140003 deactivate_member; server/email/types.ts sentBy |
| EZD-105b | Dialog component tests (plan C1-C4) | The app has no DOM test environment (vitest `environment: 'node'`, no jsdom); the dialog, menu item and inspector section are tested in the browser (app/e2e/settings-users-password.spec.ts B1-B3) instead of adding a dependency | app/vitest.config; CLAUDE.md rule 7 |
| EZD-105b | Wording for Josh (no board shows Set password, Q-0696): menu item, inspector button and confirm button | "Set password"; inspector label "Password" | Q-0096 P10; plan section 6 |
| EZD-105b | Wording for Josh: dialog | Title "Set a password for {name}"; body "EZ Draft makes a new 16-character password for {name}. They are signed out on every device and get an email that their password was set."; pending "Setting password…"; shown title "New password for {name}"; help "Copy it now and give it to {name}. You won't see it again."; buttons "Copy", "Done", "Cancel"; toasts "Password copied", "Couldn't copy. Select the password and copy it."; lines "We couldn't email {name}. Tell them their password was changed.", "Couldn't set the password. Try again.", "You're offline. Connect to set a password." | plan section 6 |
| EZD-105b | Wording for Josh: the member's email | Subject "A new password was set for your EZ Draft account"; body "{actor} set a new password for your EZ Draft account ({email}) and signed you out on every device. Ask {actor} for the new password. If you weren't expecting this, contact your company right away."; button "Open EZ Draft" | plan section 6; Q-0096 P5 |
| EZD-105b | Wording for Josh: refusal | "You can't set a password for this person." (es "No puedes poner una contraseña para esta persona.") | plan section 6 |

## Open

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
