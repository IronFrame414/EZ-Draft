# Questions for Josh from the 2026-11-27 audits

Sources: vault/plans/audit-security-2026-11-27.md (S), vault/plans/audit-a11y-ipad-2026-11-27.md (A). Code-only fixes are already queued as EZD-2002 to EZD-2007; these need your call because they change a rule, a look or wording.

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| 901 | Owner role (S4). Anyone who can manage users can give themselves the Owner role today, and an Owner can set other people's passwords. | A. Only an Owner can give or take away the Owner role. B. Keep it as it is. | A |
| 902 | Send to client (S2). The email links to a client page that is not built yet (EZD-1202, now near the front of the queue, about a day), so a client who clicks it sees a sign-in page. | A. Let EZD-1202 land; don't send to clients until then. B. Turn off Send to client now until it lands. | A |
| 903 | Field screens fail silently (A3-A6): a save the office refused, a Send that could not go, a task tick that did not store, or the sender not starting. | A. Show a short line on screen with Retry ("Not saved to the office. Retry"). B. Leave as is. | A |
| 904 | Field measure on a sideways iPad (A7): the drawing fills the screen, so the crew scrolls to the keypad for every wall. | A. Drawing on the left, keypad on the right on wide screens. B. Make the drawing shorter so both fit stacked. | A |
| 905 | Text boxes are 12-14 px, so iPhone Safari zooms in every time one is tapped (A8, A27). | A. Make typed text 16 px on touch screens only (desktop unchanged). B. Leave as is. | A |
| 906 | Some grey and red text is too light to read in sunlight or for weak eyes (A10, A31-A35): status labels, hints, error lines, the input outline. | A. Darken only text that must be read, one shade, and darken the input outline. B. Leave the board colours. | A |
| 907 | Pop-up messages at the bottom cover the field Tasks and Photo tabs (A15). | A. Lift them above the tab bar. B. Leave as is. | A |
| 908 | An iPad held upright gets the phone notice, which tells an iPad user to use "an iPad or a computer" (A17). | A. On an iPad, say "Turn your iPad sideways to edit," with links to Projects and the field pack. B. Let the editor run upright too. | A |
| 909 | On a 1024 px iPad the edit bar covers the inspector (A18). | A. Fold the left panel away on touch screens to make room. B. Let the edit bar wrap onto two lines. | A |

## Answers
