# Debt list

Small findings that are not defects (CLAUDE.md rule 17; D3 (a) and P2 (a), Josh 2026-11-01). One row per finding. Severity `gate` is fixed before the next merge, `medium` before the phase gate, `low` within two phases. A row is closed with the commit that fixed it. Debt about the debt list, the launcher or the lanes is not added here; it goes to the maintenance list for Josh. This file moves into the records database when that lands (REMEDIATION-PLAN item 2.10).

| ID | Severity | Where | What | Found by | Phase | Deadline | Closed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-001 | low | app Settings save | No "saving" state on Save; the footer says "Unsaved" for about 2 seconds (L11) | audit walkthrough 2026-11-01 | 1 | phase 3 gate | |
| D-002 | low | app Customers table | Below about 1,280 px wide the edit button is cut off (L12) | audit walkthrough 2026-11-01 | 1 | phase 3 gate | |
