# Decisions · Permissions, users, sign-in and language

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0014 | 2026-10-11 | Round 26 R2 is done: two permissions, See company costs and See sell prices. |
| Q-0029 | 2026-10-12 | (a): new users default to English; the inviter or the user switches to Spanish in settings. |
| Q-0030 | 2026-10-12 | (a): each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15). |
| Q-0043 | 2026-10-12 | (a): one active company per person in v1; inviting someone already active elsewhere is refused. |
| Q-0046 | 2026-10-12 | (a): the planner's draft wording in vault/plans/EZD-007.md. |
| Q-0047 | 2026-10-12 | (b): English / Español switch on the sign-in page, remembered on the device; the sign-in email carries both languages, English first. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0048 | 2026-10-12 | (a): stay signed in until sign-out, deactivation, or 400 days unused. |
| Q-0049 | 2026-10-12 | (b): emailed sign-in link and code valid 15 minutes. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0050 | 2026-10-12 | (b): a person with a valid (unexpired, not cancelled) pending invite may sign in from the sign-in page; that accepts the invite. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0090 | 2026-10-12 | Passwords too: people can sign in with email and password as well as by emailed link or 6-digit code. The owner (Manage users) can set a password for a crew member and hand it over, like EZ Binder. Overrides "no passwords" in the EZD-007 row. Invites still generate a copy link for the inviter. |
| Q-0091 | 2026-10-12 | Sign-in page is password first: email and password boxes with "Sign in"; "Email me a sign-in link instead" underneath; "Forgot password? Email me a code". Wrong password: "Email or password is wrong." |
| Q-0092 | 2026-10-12 | Reset-requested email (no link): "Someone asked to reset your EZ Draft password. Open EZ Draft and choose 'Email me a code' to sign in. If this wasn't you, ignore this email." |
| Q-0093 | 2026-10-12 | No bot check on sign-in for now; revisit before other companies join. |
| Q-0099 | 2026-10-12 | A person with valid invites from several companies who signs in gets the most recent invite accepted; the others stay pending. |
| Q-0100 | 2026-10-12 | "You're signed out. Sign in again to continue." and the sign-in spam hint "Not in your inbox? Check your spam or junk folder." |
| Q-0101 | 2026-10-12 | Sign-in throttle messages: "Too many wrong passwords. Use 'Forgot password? Email me a code', or try again in 15 minutes." / "Too many wrong codes. Try again in 15 minutes." / "Too many sign-in emails. Try again in an hour." / "Too many sign-in tries from this network. Try again in 15 minutes." |
| Q-0102 | 2026-10-12 | Recovery email subject "EZ Draft password reset requested"; confirmation-code email subject "Your EZ Draft confirmation code", body "Type this code in EZ Draft to confirm it's you: {code}. If you didn't ask for this, ignore this email." |
