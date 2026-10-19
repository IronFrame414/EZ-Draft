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
| Q-0002 | 2026-10-18 | R14, R18 and R24 kept as written; R21 settled by Q-0016. R17 changed: Spanish is not the default for anyone (Q-0029 stands); each user can switch their own interface language to Spanish (My profile, S15 item 11) and the owner can switch it for another user (S15 Language toggle). Scope of the switch (crew phone screens only, or the whole app): Q-0121. |
| Q-0096 | 2026-10-18 | Phase 1 password choices, every recommendation: P2 no forced password change at first sign-in; P3 owner-set passwords are generated only, 16 characters shown once with Copy; P4 the owner may set any member's password without Manage users and settings; P5 the member is emailed when their password is set or changed (wording at Phase 1 Stage 2); P6 "Change password" in My profile; P7 an owner-set password signs the member out on every device; P10 "Set password" in the S15 row More menu plus an inspector button. |
| Q-0121 | 2026-10-18 | (a): the Spanish interface switch covers the field pack and the other crew phone screens only; the office editor, Projects, Settings and the client link stay English in v1. Never the default (Q-0029). Self-switch in My profile (S15 item 11), owner switch in S15. |
| Q-0094 | 2026-10-18 | Override of the security-reviewer: minimum password length 8 characters (not 15). Maximum 72 bytes, no character-type rules, breached-password check on, weak-pattern refusal, throttle, recovery, guard and session rules stand. |
