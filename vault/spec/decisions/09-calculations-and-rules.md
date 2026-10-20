# Decisions · Calculations and code rules

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0001 | 2026-10-11 | No NEC book. Proceed with the current code rules; unverified rules keep their "not yet verified" tag in the app. |
| Q-0179 | 2026-10-20 | Yes. v1 adds plumbing sheets (supply and drain locations, plumbing diagrams such as riser or isometric, plumbing calculations if the department needs them), mechanical sheets and calculations, and a tile layout sheet that needs client sign-off. Plumbing and mechanical rules and calculations are researched before Round 3 and checked there. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0180 | 2026-10-20 | Yes, for every department. Example (Boca Raton rejection): the scope listed electrical the client had removed and the drawings had no electrical. Scope and drawings must agree both ways. Rule details in Round 3. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0181 | 2026-10-20 | Load calculation for a panel change, a service change or new circuits. Common loads are data: every new account gets a default set, and the user can add new ones and edit existing ones in Settings. Values in Round 3. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0182 | 2026-10-20 | A seal box is always available on permit drawings. Minor structural items (for example moving a wall) can be drawn; EZ Draft builds no structural calculations. (Round 1; vault/spec/sections/00-job-stories.md) |
