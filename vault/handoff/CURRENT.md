# Handoff · 2026-10-29 · build EZD-250

- Phase and stage: see vault/PROGRESS.md
- Why the session ended: unit complete
- Completed: EZD-250 done, merged fe81ba48 (1408 tests, gate PASS, code-reviewer and security-reviewer PASS after round 3)
- Josh action: after this merge run `node scripts/launchd/install.mjs install` once (plan D17) so the launcher picks up its new code
- Fix tickets added from review (ready): EZD-260 (guards resolve symlinks), EZD-261 (plan_lint rejects bare-folder node --test)
- Note: vault/plans/EZD-250.md is ~45,180 characters, over the 45,000 split line; plan lint has no size check
- Models: test-author opus/high, builder fable/high (round 3), reviewers opus/fable high
- Deviations (accepted): grants.mjs need rule, grantNotices stricter unreadable check, watchdog lone-copy fallback, repair unit hold text
- needs-josh-confirm wording: W6, W7 (plan section 6)
- Blocked: EZD-154 (Q-0418), EZD-248 (Q-0421) unchanged
- Next: EZD-173 needs re-validation (its ledger lock should wrap applyQueue, plan section 9 risks)
