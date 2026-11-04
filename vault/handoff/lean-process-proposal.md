# Proposal: a leaner build process (for Josh, 2026-11-04)

Full numbers: vault/research/lean-process-analysis-2026-11-04.md.

## Short answer
Yes, it would go faster, and it would not need less checking of the app. The delays do not come from checking the app. They come from the build machine working on itself.

## What the numbers show (last 17 days)
- 270 tickets merged. Only **111 changed the app**. The other **159 (59%) changed the build machine**: its launcher, its guards, its sandbox and its bookkeeping.
- 193 new tickets were added. Only **28 were new app features** and about 30 were real app fixes. About **115 (60%) were the machine fixing itself**. This is the "a dozen done, two dozen added" you are feeling.
- You answered or confirmed about **400 questions**, roughly 25 a day. About 4 in 10 were about the machine, not your product.
- The new debt list grew to 86 rows in 4 days. **56 of the 77 still open are about the machine.**
- The launcher stopped once for usage limits in 12 days. Its real stops were its own paperwork (41 ledger failures from one missing step), pauses for repairs to itself, and waits for you to approve changes to itself.

**Why it keeps growing:** every finding must become work, and every security-type finding must "close the whole class". On the machine's own safety guards the class never closes: each round finds a new spelling (EZD-316 had 14 findings in round 4, EZD-154 was built 13 times). The safety system also won't let unattended agents edit their own guards, so each of those tickets stops the launcher and often needs a patch from you.

## The lean rule set
**Kept exactly as today (app quality):** tests written first by a separate agent. The gate must be green. Code review on every ticket, plus security review on logins, permissions, money and data between companies. Screen checks against the mockups. The phase audit and your punch list. The secret-file guards. You own product, scope, wording and money.

**Changed:**
1. **Build machine frozen.** No new machine tickets, unless the launcher can't run at all or secrets or app data are exposed. Each one still needs your yes.
2. **Machine findings become notes, not work.** App findings work as today: fix now, or a fix ticket at the front of the line. A rough edge in the machine that didn't fail the gate gets one line in a notes file, with no deadline and never blocking.
3. **"Close the whole class" only for the app.** It stays for app security and data. For the agents' own shell guards, fix what's found and stop there.
4. **Your daily list is product only.** Agents settle machine questions themselves. You confirm only agent answers that touch product, wording, money or security. Lesson approval moves to the agents; you still see the lessons in the phase PR.
5. **No plan size limits** and no waiver questions. Each ticket still has to fit in one session.
6. **Three small paperwork fixes:**
   - the plan step updates the ticket list itself
   - the questions step runs once per real change
   - one bookkeeping commit per unit

**The ten unfrozen machine tickets:**
- **Finish EZD-279 and EZD-280.** Both are secret protection.
- **Shrink EZD-154** to removing the leftover builder permission.
- **Drop EZD-265, 268, 269, 270, 271, 272 and 274.** The rule changes above replace them, or the problem showed up once or never.

## What changes first
1. Today: stop starting machine tickets. Finish EZD-330, which turns develop green again, then EZD-279.
2. One interactive session, about 1 to 2 hours with the launcher paused (that pause needs your yes): rewrite CLAUDE.md's rules to about a page, add a short "lean" section to PROCESS.md, and make the three skill fixes. Text only, no launcher code. If the safety system blocks an edit, you apply one patch file.
3. After a week, compare product merges per day (6.5 today) and your daily question count against these numbers.

## Cost and risks
- **Cost:** one session, one launcher pause, possibly one patch for you. The machine stops getting better. It already merges about 16 tickets a day.
- **Risk:** a rough edge in the machine left as a note causes a real stop later. If that happens it counts as a defect under today's rule, because it failed the gate, and gets fixed.
- **Risk:** you no longer see agent answers about the machine, so a wrong one could go unnoticed. You still see every answer about the product.
- **Not known yet:** how much faster the app gets built. Freed lane time moves to product, but the size of the gain will only show in week one.

## Your call
**Approve**, **change** (say which items) or **reject**. Nothing has been changed yet.
