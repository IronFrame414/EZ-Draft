# Handoff · 2026-10-29 · build EZD-266 (duplicate)
- EZD-266 was already merged as 7eb76cb1 and was on develop; its STATUS row had been reset to ready (commits 4c728898 and 03588fcd), so preflight passed.
- This unit built nothing: it removed the fresh empty worktree and branch t/EZD-266 and set the row back to done (commit 7eb76cb1, tests 1482).
- Checked: node --test scripts/process/ledger-lock.test.mjs passes 30/30 on develop.
- Open: find out which write set EZD-266 back to ready (the questions unit set it ready, per the previous handoff). The same reset may have hit other done tickets.
- Next unit: node vault/tools/next_ticket.mjs --next-unit
